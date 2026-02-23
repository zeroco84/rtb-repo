#!/usr/bin/env node
/**
 * Turbo AI processing for enforcement orders.
 * 
 * Usage: node --env-file=.env.local scripts/turbo-ai-enforcement.mjs
 * Options:
 *   --concurrency=N  Parallel Gemini calls (default: 25)
 *   --limit=N        Max orders to process
 */

import { processEnforcementOrder } from '../lib/openai-service.js';
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
let startTime;

async function processOne(order) {
    try {
        const result = await processEnforcementOrder(order);
        await supabase.from('enforcement_orders').update(result).eq('id', order.id);
        processed++;
        const amt = result.ai_compensation_amount;
        const amtStr = amt === null ? '€null' : `€${amt}`;
        if (processed % 25 === 0 || processed === totalToProcess) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rpm = Math.round((processed / (elapsed / 60)) || 0);
            console.log(`[${processed}/${totalToProcess}] ${order.court_ref_no} → ${result.ai_outcome} ${amtStr} | ${rpm} RPM | ${elapsed}s`);
        }
    } catch (err) {
        failed++;
        console.error(`[FAIL] ${order.court_ref_no}: ${err.message}`);
        await supabase.from('enforcement_orders').update({
            ai_error: err.message,
            ai_processed_at: new Date().toISOString(),
        }).eq('id', order.id);
    }
}

async function main() {
    console.log(`🚀 Turbo Enforcement Order Processing — Concurrency: ${CONCURRENCY}`);
    console.log('');

    // Mark orders with no PDF
    await supabase.from('enforcement_orders').update({
        ai_processed_at: new Date().toISOString(),
        ai_error: 'No PDF available',
    }).is('ai_processed_at', null).is('pdf_url', null);

    // Fetch unprocessed orders
    const PAGE_SIZE = 1000;
    let allOrders = [];
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from('enforcement_orders')
            .select('id, court_ref_no, prtb_no, heading, subject, pdf_url')
            .is('ai_processed_at', null)
            .not('pdf_url', 'is', null)
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) { console.error('Fetch error:', error.message); break; }
        if (!data || data.length === 0) break;
        allOrders.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    if (LIMIT) allOrders = allOrders.slice(0, LIMIT);
    totalToProcess = allOrders.length;
    console.log(`Found ${totalToProcess} enforcement orders to process\n`);

    startTime = Date.now();

    for (let i = 0; i < allOrders.length; i += CONCURRENCY) {
        const chunk = allOrders.slice(i, i + CONCURRENCY);
        await Promise.allSettled(chunk.map(o => processOne(o)));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rpm = Math.round((processed / (elapsed / 60)) || 0);

    console.log('\n📊 Results:');
    console.log(`   ✅ Processed:  ${processed}`);
    console.log(`   ❌ Failed:     ${failed}`);
    console.log(`   ⏱️  Elapsed:   ${elapsed}s`);
    console.log(`   🚀 Avg RPM:    ${rpm}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
