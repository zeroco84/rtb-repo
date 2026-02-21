#!/usr/bin/env node
// Quick script to re-process a single dispute
import { processDispute } from '../lib/openai-service.js';
import { createClient } from '@supabase/supabase-js';

const DR_NO = process.argv[2] || '0522-77032';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: dispute } = await supabase.from('disputes').select('*').ilike('dr_no', `%${DR_NO}%`).single();
if (!dispute) { console.log('Not found:', DR_NO); process.exit(1); }

console.log(`Re-processing: ${dispute.dr_no}`);
console.log(`Old amount: €${parseFloat(dispute.ai_compensation_amount).toLocaleString()}`);

await supabase.from('disputes').update({ ai_processed_at: null }).eq('id', dispute.id);
const result = await processDispute(dispute);
await supabase.from('disputes').update(result).eq('id', dispute.id);
await supabase.rpc('recompute_party_awards');

console.log(`New amount: €${result.ai_compensation_amount.toLocaleString()}`);
console.log(`Summary: ${result.ai_summary}`);
console.log('Done.');
