-- AI Analysis columns for disputes table
-- Run this in the Supabase SQL Editor after the main schema

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_outcome TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_compensation_amount DECIMAL(10,2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_cost_order DECIMAL(10,2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_property_address TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_dispute_type TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS ai_error TEXT;

-- Index for finding unprocessed disputes
CREATE INDEX IF NOT EXISTS idx_disputes_ai_unprocessed 
ON disputes (ai_processed_at) 
WHERE ai_processed_at IS NULL AND pdf_urls IS NOT NULL;

-- Net award columns for parties (league table)
ALTER TABLE parties ADD COLUMN IF NOT EXISTS net_awards_for DECIMAL(12,2) DEFAULT 0;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS net_awards_against DECIMAL(12,2) DEFAULT 0;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS net_awards DECIMAL(12,2) DEFAULT 0;

-- Function to recompute net awards for all parties from AI-processed disputes
CREATE OR REPLACE FUNCTION recompute_party_awards()
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
    ), 0);
  
  UPDATE parties SET net_awards = net_awards_against - net_awards_for;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
