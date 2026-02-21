#!/usr/bin/env node
/**
 * Re-process disputes with high award amounts (>€25,000) using improved prompt
 * These are most likely to have digit hallucination errors.
 * 
 * Usage: node --env-file=.env.local scripts/reverify-high-awards.mjs
 */

import { processDispute } from '../lib/openai-service.js';
import { createClient } from '@supabase/supabase-js';

const THRESHOLD = 25000;
const DELAY_MS = 1500;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    // Find all disputes with high awards
    const { data: disputes, error } = await supabase
        .from('disputes')
        .select('id, dr_no, heading, pdf_urls, ai_compensation_amount')
        .not('ai_processed_at', 'is', null)
        .gte('ai_compensation_amount', THRESHOLD)
        .order('ai_compensation_amount', { ascending: false });

    if (error) { console.error('Query error:', error.message); return; }

    console.log(`=== Re-verifying ${disputes.length} disputes with awards >= €${THRESHOLD.toLocaleString()} ===\n`);

    let changed = 0;
    let unchanged = 0;
    let zeroed = 0;

    for (let i = 0; i < disputes.length; i++) {
        const d = disputes[i];
        const oldAmount = parseFloat(d.ai_compensation_amount);
        console.log(`[${i + 1}/${disputes.length}] ${d.dr_no} — old: €${oldAmount.toLocaleString()}`);

        try {
            // Clear ai_processed_at so processDispute works
            await supabase.from('disputes').update({ ai_processed_at: null }).eq('id', d.id);

            const result = await processDispute(d);
            const newAmount = parseFloat(result.ai_compensation_amount) || 0;

            await supabase.from('disputes').update(result).eq('id', d.id);

            if (newAmount === 0 && oldAmount > 0) {
                zeroed++;
                console.log(`  → ZEROED (was €${oldAmount.toLocaleString()}, now €0 — low confidence)`);
            } else if (Math.abs(newAmount - oldAmount) > 1) {
                changed++;
                console.log(`  → CHANGED: €${oldAmount.toLocaleString()} → €${newAmount.toLocaleString()}`);
            } else {
                unchanged++;
                console.log(`  → OK: €${newAmount.toLocaleString()}`);
            }
        } catch (err) {
            console.error(`  → ERROR: ${err.message}`);
            // Restore ai_processed_at so it doesn't get lost
            await supabase.from('disputes').update({
                ai_processed_at: new Date().toISOString()
            }).eq('id', d.id);
        }

        if (i < disputes.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    // Recompute party awards
    try {
        await supabase.rpc('recompute_party_awards');
        console.log('\n[AI] Recomputed party net awards');
    } catch (err) {
        console.warn('[AI] Failed to recompute:', err.message);
    }

    console.log('\n=== COMPLETE ===');
    console.log(`Total re-verified: ${disputes.length}`);
    console.log(`Changed: ${changed}`);
    console.log(`Zeroed (low confidence): ${zeroed}`);
    console.log(`Unchanged: ${unchanged}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
