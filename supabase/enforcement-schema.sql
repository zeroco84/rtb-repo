-- RTB Court Decisions & Enforcement Orders Schema
-- Run this AFTER the main schema.sql

-- ============================================
-- ENFORCEMENT_ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS enforcement_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  heading TEXT NOT NULL,                   -- Parties text, e.g. "Sean Nugent v Minika Paczkowska..."
  court_ref_no TEXT UNIQUE,                -- Court reference number, e.g. "2025/00070"
  prtb_no TEXT,                            -- PRTB/DR number, e.g. "DR0924-100040"
  order_date DATE,                         -- Date of the order
  subject TEXT,                            -- e.g. "Rent Arrears", "Overholding", "Deposit Retention"
  
  -- PDF
  pdf_url TEXT,                            -- Direct link to the PDF document
  pdf_label TEXT,                          -- Label text for the PDF link
  
  -- Parsed parties (from heading "X v Y")
  applicant_name TEXT,
  respondent_name TEXT,
  
  -- Link to existing dispute if PRTB number matches a DR number
  linked_dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  
  -- AI-enriched fields
  ai_summary TEXT,
  ai_outcome TEXT,                         -- e.g. "Enforcement Order Granted", "Withdrawn", etc.
  ai_compensation_amount DECIMAL(10,2),
  ai_cost_order DECIMAL(10,2),
  ai_property_address TEXT,
  ai_dispute_type TEXT,
  ai_processed_at TIMESTAMPTZ,
  ai_error TEXT,
  
  -- Metadata
  raw_html TEXT,                           -- Original HTML for re-processing
  source_page INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_eo_court_ref ON enforcement_orders(court_ref_no);
CREATE INDEX IF NOT EXISTS idx_eo_prtb_no ON enforcement_orders(prtb_no);
CREATE INDEX IF NOT EXISTS idx_eo_heading ON enforcement_orders USING gin(heading gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_eo_applicant ON enforcement_orders USING gin(applicant_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_eo_respondent ON enforcement_orders USING gin(respondent_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_eo_date ON enforcement_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_eo_subject ON enforcement_orders(subject);
CREATE INDEX IF NOT EXISTS idx_eo_linked_dispute ON enforcement_orders(linked_dispute_id);

-- ============================================
-- TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS enforcement_orders_updated_at ON enforcement_orders;
CREATE TRIGGER enforcement_orders_updated_at
  BEFORE UPDATE ON enforcement_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS — Public read, service role write
-- ============================================
ALTER TABLE enforcement_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for enforcement_orders" ON enforcement_orders;
CREATE POLICY "Public read access for enforcement_orders" ON enforcement_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role insert enforcement_orders" ON enforcement_orders;
CREATE POLICY "Service role insert enforcement_orders" ON enforcement_orders FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Service role update enforcement_orders" ON enforcement_orders;
CREATE POLICY "Service role update enforcement_orders" ON enforcement_orders FOR UPDATE USING (true);

-- Add source_type to scrape_jobs so we can track enforcement scrapes separately
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'disputes';

-- ============================================
-- ENFORCEMENT_PARTIES - Join table (mirrors dispute_parties)
-- Links enforcement orders to the shared parties table
-- ============================================
CREATE TABLE IF NOT EXISTS enforcement_parties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enforcement_order_id UUID REFERENCES enforcement_orders(id) ON DELETE CASCADE,
  party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
  role TEXT NOT NULL,          -- "Applicant" or "Respondent"
  party_type TEXT,             -- "Landlord" or "Tenant" (may be unknown for enforcement)

  UNIQUE(enforcement_order_id, party_id, role)
);

CREATE INDEX IF NOT EXISTS idx_ep_party_id ON enforcement_parties(party_id);
CREATE INDEX IF NOT EXISTS idx_ep_eo_id ON enforcement_parties(enforcement_order_id);

ALTER TABLE enforcement_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read enforcement_parties" ON enforcement_parties;
CREATE POLICY "Public read enforcement_parties" ON enforcement_parties FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service insert enforcement_parties" ON enforcement_parties;
CREATE POLICY "Service insert enforcement_parties" ON enforcement_parties FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Service update enforcement_parties" ON enforcement_parties;
CREATE POLICY "Service update enforcement_parties" ON enforcement_parties FOR UPDATE USING (true);

-- Add enforcement counts to parties table
ALTER TABLE parties ADD COLUMN IF NOT EXISTS total_enforcement_orders INTEGER DEFAULT 0;
