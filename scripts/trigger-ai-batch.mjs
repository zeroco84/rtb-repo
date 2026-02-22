#!/usr/bin/env node
/**
 * Keeps triggering the server-side AI batch endpoint until all disputes are processed.
 * Run this locally, but all processing happens on the server.
 * 
 * Usage: node --env-file=.env.local scripts/trigger-ai-batch.mjs
 */

const BATCH_URL = 'https://actfairly.com/api/ai/batch';
const CRON_SECRET = process.env.CRON_SECRET || 'actfairly-cron-2026';
const PAUSE_BETWEEN_MS = 10000; // 10 seconds between triggers

async function trigger() {
    let round = 0;
    while (true) {
        round++;
        console.log(`\n[Round ${round}] Triggering server batch...`);

        try {
            const res = await fetch(BATCH_URL, {
                headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
                signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min timeout
            });
            const data = await res.json();

            console.log(`  Processed: ${data.total_processed}, Failed: ${data.total_failed}, Remaining: ${data.remaining}`);
            console.log(`  Time: ${Math.round(data.elapsed_ms / 1000)}s, Batches: ${data.batches}`);

            if (data.remaining === 0) {
                console.log('\n🎉 All disputes processed!');
                break;
            }

            if (data.total_processed === 0 && data.last_error) {
                console.log(`  ⚠️ Error: ${data.last_error}`);
                console.log('  Waiting 60s before retry...');
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }
        } catch (err) {
            console.log(`  ❌ Request failed: ${err.message}`);
            console.log('  Waiting 30s before retry...');
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }

        console.log(`  Pausing ${PAUSE_BETWEEN_MS / 1000}s before next round...`);
        await new Promise(r => setTimeout(r, PAUSE_BETWEEN_MS));
    }
}

trigger().catch(err => { console.error('Fatal:', err); process.exit(1); });
