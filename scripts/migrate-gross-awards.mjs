#!/usr/bin/env node
// One-off migration: add gross_awards_received and recompute
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Step 1: Add column + update function via SQL editor instructions
// Supabase JS client can't run raw DDL, so we print instructions if needed
// But we CAN test if the column exists by trying to select it

console.log('Testing if gross_awards_received column exists...');
const { data: testData, error: testError } = await supabase
    .from('parties')
    .select('gross_awards_received')
    .limit(1);

if (testError && testError.message.includes('gross_awards_received')) {
    console.log('\n❌ Column gross_awards_received does not exist yet.');
    console.log('\nPlease run the following SQL in the Supabase SQL Editor:\n');
    console.log('-- Step 1: Add column');
    console.log('ALTER TABLE parties ADD COLUMN IF NOT EXISTS gross_awards_received DECIMAL(12,2) DEFAULT 0;');
    console.log('');
    console.log('-- Step 2: Update the function');
    console.log(`CREATE OR REPLACE FUNCTION recompute_party_awards()
RETURNS void AS $$
BEGIN
  UPDATE parties p SET
    net_awards_for = COALESCE((
      SELECT SUM(d.ai_compensation_amount)
      FROM dispute_parties dp
      JOIN disputes d ON d.id = dp.dispute_id
      WHERE dp.party_id = p.id
        AND dp.role = 'Applicant'
        AND d.ai_compensation_amount > 0
        AND d.ai_outcome IN ('Upheld', 'Partially Upheld')
    ), 0),
    net_awards_against = COALESCE((
      SELECT SUM(d.ai_compensation_amount)
      FROM dispute_parties dp
      JOIN disputes d ON d.id = dp.dispute_id
      WHERE dp.party_id = p.id
        AND dp.role = 'Respondent'
        AND d.ai_compensation_amount > 0
        AND d.ai_outcome IN ('Upheld', 'Partially Upheld')
    ), 0),
    gross_awards_received = COALESCE((
      SELECT SUM(d.ai_compensation_amount)
      FROM dispute_parties dp
      JOIN disputes d ON d.id = dp.dispute_id
      WHERE dp.party_id = p.id
        AND dp.role = 'Applicant'
        AND d.ai_compensation_amount > 0
    ), 0);
  
  UPDATE parties SET net_awards = net_awards_against - net_awards_for;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);
    console.log('');
    console.log('-- Step 3: Recompute');
    console.log('SELECT recompute_party_awards();');
    console.log('\nThen re-run this script to verify.');
    process.exit(1);
}

console.log('✅ Column exists. Recomputing party awards...');
const { error: recomputeError } = await supabase.rpc('recompute_party_awards');
if (recomputeError) {
    console.error('❌ Recompute failed:', recomputeError.message);
    console.log('\nThe function may not be updated yet. Please run the SQL above in Supabase SQL Editor first.');
    process.exit(1);
}

// Verify
const { data: top } = await supabase
    .from('parties')
    .select('name, total_disputes, net_awards_for, gross_awards_received')
    .order('total_disputes', { ascending: false })
    .limit(5);

console.log('\n✅ Done! Top 5 parties by disputes:');
console.table(top.map(p => ({
    name: p.name,
    disputes: p.total_disputes,
    net_awards_for: `€${parseFloat(p.net_awards_for || 0).toLocaleString()}`,
    gross_awards_received: `€${parseFloat(p.gross_awards_received || 0).toLocaleString()}`,
})));
