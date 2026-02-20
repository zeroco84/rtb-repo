-- RTB Dispute Database Schema
-- Run this in your Supabase SQL Editor to set up the tables

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- DISPUTES TABLE - Core record of each dispute
-- ============================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  heading TEXT NOT NULL,
  dr_no TEXT UNIQUE,          -- Dispute Reference Number (unique identifier from RTB)
  tr_no TEXT,                 -- Tribunal Reference Number
  dispute_date DATE,
  dispute_type TEXT,          -- e.g. "Rent Arrears", "Deposit Retention", etc.
  
  -- Parties
  applicant_name TEXT,
  applicant_role TEXT,        -- "Landlord" or "Tenant"
  respondent_name TEXT,
  respondent_role TEXT,       -- "Landlord" or "Tenant"
  
  -- Address info (extracted from heading or PDF)
  property_address TEXT,
  
  -- PDF Downloads
  pdf_urls JSONB DEFAULT '[]'::jsonb,
  
  -- AI-enriched fields
  ai_processed BOOLEAN DEFAULT FALSE,
  ai_summary TEXT,
  dispute_value DECIMAL(12,2),       -- Total monetary value in dispute
  unpaid_rent DECIMAL(12,2),
  claimed_compensation DECIMAL(12,2),
  awarded_amount DECIMAL(12,2),
  determination_details TEXT,
  
  -- Metadata
  raw_html TEXT,              -- Original HTML snippet for re-processing
  source_page INTEGER,        -- Which page was this scraped from
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PARTIES TABLE - Deduplicated people/entities
-- ============================================
CREATE TABLE IF NOT EXISTS parties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,  -- Lowercase, trimmed for deduplication
  party_type TEXT,                -- "Landlord", "Tenant", "Both", "Unknown"
  total_disputes INTEGER DEFAULT 0,
  total_as_applicant INTEGER DEFAULT 0,
  total_as_respondent INTEGER DEFAULT 0,
  total_dispute_value DECIMAL(12,2) DEFAULT 0,
  
  -- AI-enriched
  ai_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(normalized_name)
);

-- ============================================
-- DISPUTE_PARTIES - Join table
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_parties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  party_id UUID REFERENCES parties(id) ON DELETE CASCADE,
  role TEXT NOT NULL,          -- "Applicant" or "Respondent"
  party_type TEXT,             -- "Landlord" or "Tenant"
  
  UNIQUE(dispute_id, party_id, role)
);

-- ============================================
-- SCRAPE_JOBS TABLE - Track scraping progress
-- ============================================
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed
  total_pages INTEGER,
  current_page INTEGER DEFAULT 0,
  total_records INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for search performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_disputes_dr_no ON disputes(dr_no);
CREATE INDEX IF NOT EXISTS idx_disputes_heading ON disputes USING gin(heading gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_disputes_applicant ON disputes USING gin(applicant_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_disputes_respondent ON disputes USING gin(respondent_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_disputes_property_address ON disputes USING gin(property_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_disputes_dispute_type ON disputes(dispute_type);
CREATE INDEX IF NOT EXISTS idx_disputes_date ON disputes(dispute_date);
CREATE INDEX IF NOT EXISTS idx_disputes_ai_processed ON disputes(ai_processed);

CREATE INDEX IF NOT EXISTS idx_parties_name ON parties USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_parties_normalized ON parties(normalized_name);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type);
CREATE INDEX IF NOT EXISTS idx_parties_total_disputes ON parties(total_disputes DESC);

CREATE INDEX IF NOT EXISTS idx_dispute_parties_dispute ON dispute_parties(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_parties_party ON dispute_parties(party_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS disputes_updated_at ON disputes;
CREATE TRIGGER disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS parties_updated_at ON parties;
CREATE TRIGGER parties_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Full-text search function for disputes
CREATE OR REPLACE FUNCTION search_disputes(search_query TEXT, result_limit INTEGER DEFAULT 50, result_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  id UUID,
  heading TEXT,
  dr_no TEXT,
  tr_no TEXT,
  dispute_date DATE,
  dispute_type TEXT,
  applicant_name TEXT,
  applicant_role TEXT,
  respondent_name TEXT,
  respondent_role TEXT,
  property_address TEXT,
  pdf_urls JSONB,
  ai_summary TEXT,
  dispute_value DECIMAL,
  awarded_amount DECIMAL,
  created_at TIMESTAMPTZ,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.heading,
    d.dr_no,
    d.tr_no,
    d.dispute_date,
    d.dispute_type,
    d.applicant_name,
    d.applicant_role,
    d.respondent_name,
    d.respondent_role,
    d.property_address,
    d.pdf_urls,
    d.ai_summary,
    d.dispute_value,
    d.awarded_amount,
    d.created_at,
    GREATEST(
      similarity(COALESCE(d.heading, ''), search_query),
      similarity(COALESCE(d.applicant_name, ''), search_query),
      similarity(COALESCE(d.respondent_name, ''), search_query),
      similarity(COALESCE(d.property_address, ''), search_query),
      similarity(COALESCE(d.dr_no, ''), search_query)
    ) AS relevance
  FROM disputes d
  WHERE 
    d.heading ILIKE '%' || search_query || '%'
    OR d.applicant_name ILIKE '%' || search_query || '%'
    OR d.respondent_name ILIKE '%' || search_query || '%'
    OR d.property_address ILIKE '%' || search_query || '%'
    OR d.dr_no ILIKE '%' || search_query || '%'
    OR d.tr_no ILIKE '%' || search_query || '%'
  ORDER BY relevance DESC, d.dispute_date DESC NULLS LAST
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

-- League table view for repeat offenders
CREATE OR REPLACE VIEW league_table AS
SELECT 
  p.id,
  p.name,
  p.party_type,
  p.total_disputes,
  p.total_as_applicant,
  p.total_as_respondent,
  p.total_dispute_value,
  RANK() OVER (ORDER BY p.total_disputes DESC) AS overall_rank,
  CASE 
    WHEN p.party_type = 'Landlord' THEN RANK() OVER (PARTITION BY p.party_type ORDER BY p.total_disputes DESC)
    ELSE NULL 
  END AS landlord_rank,
  CASE 
    WHEN p.party_type = 'Tenant' THEN RANK() OVER (PARTITION BY p.party_type ORDER BY p.total_disputes DESC)
    ELSE NULL 
  END AS tenant_rank
FROM parties p
WHERE p.total_disputes > 0
ORDER BY p.total_disputes DESC;

-- Enable Row Level Security (public read access)
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read access for disputes" ON disputes FOR SELECT USING (true);
CREATE POLICY "Public read access for parties" ON parties FOR SELECT USING (true);
CREATE POLICY "Public read access for dispute_parties" ON dispute_parties FOR SELECT USING (true);
CREATE POLICY "Public read access for scrape_jobs" ON scrape_jobs FOR SELECT USING (true);

-- Service role write policies  
CREATE POLICY "Service role insert disputes" ON disputes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update disputes" ON disputes FOR UPDATE USING (true);
CREATE POLICY "Service role insert parties" ON parties FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update parties" ON parties FOR UPDATE USING (true);
CREATE POLICY "Service role insert dispute_parties" ON dispute_parties FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role insert scrape_jobs" ON scrape_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update scrape_jobs" ON scrape_jobs FOR UPDATE USING (true);
