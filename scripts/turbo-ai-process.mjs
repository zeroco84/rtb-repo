#!/usr/bin/env node
/**
 * Turbo AI processing script — runs locally with high concurrency.
 * Bypasses the Next.js API route for faster batch processing.
 * 
 * Usage: node --env-file=.env.local scripts/turbo-ai-process.mjs
 * Options:
 *   --concurrency=N  Parallel Gemini calls (default: 25)
 *   --limit=N        Max disputes to process
 */

import { processDispute } from '../lib/openai-service.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
const limitArg = args.find(a => a.startsWith('--limit='));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]) : 25;
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;

let processed = 0;
let failed = 0;
let totalToProcess = 0;

async function processOne(dispute) {
    try {
        const result = await processDispute(dispute);
        await supabase.from('disputes').update(result).eq('id', dispute.id);
        processed++;
        const amt = result.ai_compensation_amount;
        const amtStr = amt === null ? '€null' : `€${amt}`;
        if (processed % 25 === 0 || processed === totalToProcess) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rpm = Math.round((processed / (elapsed / 60)) || 0);
            console.log(`[${processed}/${totalToProcess}] ${dispute.dr_no} → ${result.ai_outcome} ${amtStr} | ${rpm} RPM | ${elapsed}s`);
        }
    } catch (err) {
        failed++;
        console.error(`[FAIL] ${dispute.dr_no}: ${err.message}`);
        await supabase.from('disputes').update({
            ai_error: err.message,
            ai_processed_at: new Date().toISOString(),
        }).eq('id', dispute.id);
    }
}

let startTime;

async function main() {
    console.log(`🚀 Turbo AI Processing — Concurrency: ${CONCURRENCY}`);
    console.log('');

    // Fetch all unprocessed disputes
    const PAGE_SIZE = 1000;
    let allDisputes = [];
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from('disputes')
            .select('id, dr_no, heading, pdf_urls, s3_pdf_keys')
            .is('ai_processed_at', null)
            .not('pdf_urls', 'is', null)
            .neq('pdf_urls', '[]')
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) { console.error('Fetch error:', error.message); break; }
        if (!data || data.length === 0) break;
        allDisputes.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    if (LIMIT) allDisputes = allDisputes.slice(0, LIMIT);
    totalToProcess = allDisputes.length;
    console.log(`Found ${totalToProcess} disputes to process\n`);

    startTime = Date.now();

    // Process in concurrent chunks
    for (let i = 0; i < allDisputes.length; i += CONCURRENCY) {
        const chunk = allDisputes.slice(i, i + CONCURRENCY);
        await Promise.allSettled(chunk.map(d => processOne(d)));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rpm = Math.round((processed / (elapsed / 60)) || 0);

    console.log('\n📊 Results:');
    console.log(`   ✅ Processed:  ${processed}`);
    console.log(`   ❌ Failed:     ${failed}`);
    console.log(`   ⏱️  Elapsed:   ${elapsed}s`);
    console.log(`   🚀 Avg RPM:    ${rpm}`);

    // Recompute party awards
    if (processed > 0) {
        console.log('\nRecomputing party awards...');
        const { error } = await supabase.rpc('recompute_party_awards');
        if (error) console.error('Recompute failed:', error.message);
        else console.log('✅ Party awards recomputed');
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
