#!/usr/bin/env node
/**
 * One-off script: Process ALL unprocessed disputes through AI
 * Runs in batches of 20, loops until none remain.
 * 
 * Usage: node scripts/process-all-disputes.mjs
 */

import { processUnanalysedDisputes } from '../lib/openai-service.js';
import { createServiceClient } from '../lib/supabase.js';

const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES_MS = 3000; // 3 seconds between batches

async function getRemaining() {
    const supabase = createServiceClient();
    const { count } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true })
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null);
    return count || 0;
}

async function main() {
    console.log('=== AI Processing: All Unprocessed Disputes ===\n');

    let remaining = await getRemaining();
    let totalProcessed = 0;
    let totalFailed = 0;
    let batchNumber = 0;

    console.log(`Found ${remaining} unprocessed disputes with PDFs.\n`);

    if (remaining === 0) {
        console.log('Nothing to process. All disputes have been analysed.');
        return;
    }

    while (remaining > 0) {
        batchNumber++;
        console.log(`--- Batch ${batchNumber} (${remaining} remaining) ---`);

        try {
            const result = await processUnanalysedDisputes(BATCH_SIZE);

            totalProcessed += result.processed;
            totalFailed += result.failed;

            console.log(`  ✓ Processed: ${result.processed}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
            console.log(`  Running total: ${totalProcessed} processed, ${totalFailed} failed\n`);

            // If nothing was returned, we're done
            if (result.total === 0) {
                console.log('No more disputes to process.');
                break;
            }

            // Update remaining count
            remaining = await getRemaining();

            // Delay between batches
            if (remaining > 0) {
                console.log(`  Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
            }
        } catch (err) {
            console.error(`  ✗ Batch ${batchNumber} error:`, err.message);
            console.log('  Waiting 10s before retrying...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    console.log('\n=== COMPLETE ===');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total failed: ${totalFailed}`);
    console.log(`Remaining: ${await getRemaining()}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
