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
