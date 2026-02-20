-- RTB Dispute Database Schema - Admin Extension
-- Run this AFTER the main schema.sql

-- ============================================
-- ADMIN_SETTINGS TABLE - Store config like API keys
-- ============================================
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Insert default settings
INSERT INTO admin_settings (key, value, description, is_secret)
VALUES 
  ('openai_api_key', '', 'OpenAI API Key for dispute analysis', true),
  ('openai_model', 'gpt-4o-mini', 'OpenAI model to use', false),
  ('scrape_delay_ms', '1500', 'Delay between scrape requests (ms)', false),
  ('auto_sync_enabled', 'false', 'Enable daily auto-sync', false)
ON CONFLICT (key) DO NOTHING;

-- RLS for admin_settings (service role only)
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access for admin_settings" ON admin_settings FOR ALL USING (true) WITH CHECK (true);
