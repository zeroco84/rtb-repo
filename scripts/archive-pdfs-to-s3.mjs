#!/usr/bin/env node
/**
 * Archive all dispute PDFs to S3
 * Downloads from RTB website and uploads to private S3 bucket.
 * Skips files that already exist in S3.
 * 
 * Usage: node --env-file=.env.local scripts/archive-pdfs-to-s3.mjs
 * Options:
 *   --dry-run    Show what would be done without downloading/uploading
 *   --limit=N    Process only N disputes
 *   --concurrency=N  Number of parallel downloads (default: 10)
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.S3_BUCKET_NAME || 'rtb-dispute-pdfs-private';
const DOWNLOAD_TIMEOUT = 30000;

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]) : 10;

// Stats
let uploaded = 0;
let skipped = 0;
let failed = 0;
let alreadyExists = 0;

function s3KeyForPdf(drNo, pdfUrl) {
    // Create a clean key: disputes/DR1234-56789/determination.pdf
    const cleanDr = (drNo || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    // Extract filename from URL or use a hash
    const urlParts = new URL(pdfUrl);
    const filename = urlParts.pathname.split('/').pop() || 'document.pdf';
    return `disputes/${cleanDr}/${filename}`;
}

async function fileExistsInS3(key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
        throw err;
    }
}

async function downloadPdf(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 500) throw new Error('File too small, likely error page');

        return buffer;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

async function processDispute(dispute) {
    const pdfUrls = dispute.pdf_urls || [];
    if (pdfUrls.length === 0) {
        skipped++;
        return;
    }

    const s3Keys = [];

    for (const pdf of pdfUrls) {
        const url = pdf.url || pdf;
        if (!url || typeof url !== 'string') continue;

        const key = s3KeyForPdf(dispute.dr_no, url);

        if (dryRun) {
            console.log(`[DRY RUN] Would archive: ${dispute.dr_no} → s3://${BUCKET}/${key}`);
            s3Keys.push({ original_url: url, s3_key: key });
            continue;
        }

        try {
            // Check if already in S3
            const exists = await fileExistsInS3(key);
            if (exists) {
                alreadyExists++;
                s3Keys.push({ original_url: url, s3_key: key });
                continue;
            }

            // Download from RTB
            const buffer = await downloadPdf(url);

            // Upload to S3
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: 'application/pdf',
                Metadata: {
                    'dr-no': dispute.dr_no || '',
                    'source-url': url,
                },
            }));

            uploaded++;
            s3Keys.push({ original_url: url, s3_key: key });

            if (uploaded % 50 === 0) {
                console.log(`[Progress] Uploaded: ${uploaded} | Skipped: ${skipped} | Exists: ${alreadyExists} | Failed: ${failed}`);
            }
        } catch (err) {
            failed++;
            console.error(`[FAIL] ${dispute.dr_no} (${url}): ${err.message}`);
        }
    }

    // Update dispute with S3 keys
    if (s3Keys.length > 0 && !dryRun) {
        await supabase
            .from('disputes')
            .update({ s3_pdf_keys: s3Keys })
            .eq('id', dispute.id);
    }
}

// Main
async function main() {
    console.log(`📦 Archiving PDFs to s3://${BUCKET}/`);
    console.log(`   Concurrency: ${CONCURRENCY} | Limit: ${LIMIT || 'all'} | Dry run: ${dryRun}`);
    console.log('');

    // Test S3 access
    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: '__test_access__' }));
    } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
            console.log('✅ S3 access confirmed');
        } else if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
            console.error('❌ S3 access denied. Check your IAM policy and credentials.');
            process.exit(1);
        }
    }

    // Fetch and process in pages (Supabase returns max 1000 rows per query)
    const PAGE_SIZE = 1000;
    let offset = 0;
    let totalFound = 0;
    const startTime = Date.now();

    while (true) {
        let query = supabase
            .from('disputes')
            .select('id, dr_no, pdf_urls')
            .not('pdf_urls', 'is', null)
            .neq('pdf_urls', '[]')
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        const { data: disputes, error } = await query;

        if (error) {
            console.error('Failed to fetch disputes:', error.message);
            break;
        }

        if (!disputes || disputes.length === 0) break;

        totalFound += disputes.length;
        console.log(`[Page ${Math.floor(offset / PAGE_SIZE) + 1}] Fetched ${disputes.length} disputes (total: ${totalFound})`);

        // Process in concurrent chunks
        for (let i = 0; i < disputes.length; i += CONCURRENCY) {
            const chunk = disputes.slice(i, i + CONCURRENCY);
            await Promise.allSettled(chunk.map(d => processDispute(d)));
        }

        if (disputes.length < PAGE_SIZE) break; // Last page
        if (LIMIT && totalFound >= LIMIT) break;
        offset += PAGE_SIZE;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n📊 Results:');
    console.log(`   ✅ Uploaded:       ${uploaded}`);
    console.log(`   ⏭️  Already in S3:  ${alreadyExists}`);
    console.log(`   ⏭️  No PDFs:       ${skipped}`);
    console.log(`   ❌ Failed:         ${failed}`);
    console.log(`   ⏱️  Elapsed:       ${elapsed}s`);
    console.log(`   📁 Total in S3:    ${uploaded + alreadyExists}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
