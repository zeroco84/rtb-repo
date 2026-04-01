-- RTB Rent Register Schema
-- Stores comparable rent data scraped from rtb.ie/rtb-rent-register/
-- Run this in Supabase SQL Editor after schema.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- RENT REGISTER TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rent_register (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rt_number TEXT NOT NULL,
  local_authority TEXT NOT NULL,
  local_authority_id INTEGER NOT NULL,
  local_electoral_area TEXT NOT NULL,
  osi_lea_id BIGINT NOT NULL,
  electoral_district TEXT,
  dwelling_type TEXT NOT NULL,
  dwelling_type_code INTEGER NOT NULL,
  number_of_bedrooms INTEGER NOT NULL,
  number_of_bed_spaces INTEGER,
  floor_space_sqm DECIMAL(8,2),
  ber TEXT,
  rent_monthly DECIMAL(10,2) NOT NULL,
  match_score DECIMAL(5,2),
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scrape_batch_id UUID,
  CONSTRAINT rent_register_rt_unique UNIQUE (rt_number)
);

-- ============================================
-- SCRAPE COVERAGE LOG
-- ============================================
CREATE TABLE IF NOT EXISTS rent_register_scrape_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  local_authority_id INTEGER NOT NULL,
  osi_lea_id BIGINT NOT NULL,
  dwelling_type_code INTEGER NOT NULL,
  number_of_bedrooms INTEGER NOT NULL,
  records_returned INTEGER NOT NULL DEFAULT 0,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID NOT NULL,
  CONSTRAINT scrape_log_unique UNIQUE (local_authority_id, osi_lea_id, dwelling_type_code, number_of_bedrooms)
);

-- ============================================
-- LEA REFERENCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rent_register_lea_ref (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  local_authority_id INTEGER NOT NULL,
  local_authority_name TEXT NOT NULL,
  osi_lea_id BIGINT NOT NULL UNIQUE,
  lea_name TEXT NOT NULL,
  is_dublin BOOLEAN NOT NULL DEFAULT false
);

-- ============================================
-- LEA SEED DATA
-- All Dublin LEA IDs confirmed from RTB portal dropdowns on 2026-03-31
-- Source: rtb.ie/rtb-rent-register/ — four Dublin local authorities
-- ============================================
INSERT INTO rent_register_lea_ref (local_authority_id, local_authority_name, osi_lea_id, lea_name, is_dublin) VALUES
  -- Dublin City County Council (29) — 11 LEAs
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260420, 'Ballymun - Finglas', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260421, 'Cabra - Glasnevin', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260422, 'Ballyfermot - Drimnagh', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260423, 'Kimmage - Rathmines', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260424, 'Pembroke', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260425, 'South East Inner City', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260426, 'North Inner City', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260427, 'Clontarf', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260428, 'Donaghmede', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260429, 'Artane - Whitehall', true),
  (29, 'DUBLIN CITY COUNTY COUNCIL', 13260430, 'South West Inner City', true),
  -- Dún Laoghaire-Rathdown County Council (28) — 6 LEAs
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260405, 'Stillorgan', true),
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260406, 'Dundrum', true),
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260407, 'Glencullen - Sandyford', true),
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260408, 'Killiney - Shankill', true),
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260409, 'Dún Laoghaire', true),
  (28, 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', 13260410, 'Blackrock', true),
  -- Fingal County Council (27) — 7 LEAs
  (27, 'FINGAL COUNTY COUNCIL', 13260400, 'Rush - Lusk', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260401, 'Swords', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260402, 'Blanchardstown - Mulhuddart', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260403, 'Castleknock', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260404, 'Howth - Malahide', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260417, 'Balbriggan', true),
  (27, 'FINGAL COUNTY COUNCIL', 13260418, 'Ongar', true),
  -- South Dublin County Council (26) — 7 LEAs
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260411, 'Lucan', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260412, 'Tallaght Central', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260413, 'Rathfarnham - Templeogue', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260414, 'Firhouse - Bohernabreena', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260415, 'Tallaght South', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260416, 'Clondalkin', true),
  (26, 'SOUTH DUBLIN COUNTY COUNCIL', 13260419, 'Palmerstown - Fonthill', true)
ON CONFLICT (osi_lea_id) DO NOTHING;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rent_register_rt ON rent_register (rt_number);
CREATE INDEX IF NOT EXISTS idx_rent_register_lea ON rent_register (osi_lea_id);
CREATE INDEX IF NOT EXISTS idx_rent_register_la ON rent_register (local_authority_id);
CREATE INDEX IF NOT EXISTS idx_rent_register_bedrooms ON rent_register (number_of_bedrooms);
CREATE INDEX IF NOT EXISTS idx_rent_register_type ON rent_register (dwelling_type_code);
CREATE INDEX IF NOT EXISTS idx_rent_register_scraped ON rent_register (scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_rent_register_comparables
  ON rent_register (osi_lea_id, dwelling_type_code, number_of_bedrooms, scraped_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE rent_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_register_scrape_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_register_lea_ref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read rent_register" ON rent_register FOR SELECT USING (true);
CREATE POLICY "Public read scrape_log" ON rent_register_scrape_log FOR SELECT USING (true);
CREATE POLICY "Public read lea_ref" ON rent_register_lea_ref FOR SELECT USING (true);
CREATE POLICY "Service insert rent_register" ON rent_register FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update rent_register" ON rent_register FOR UPDATE USING (true);
CREATE POLICY "Service insert scrape_log" ON rent_register_scrape_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update scrape_log" ON rent_register_scrape_log FOR UPDATE USING (true);
CREATE POLICY "Service insert lea_ref" ON rent_register_lea_ref FOR INSERT WITH CHECK (true);
