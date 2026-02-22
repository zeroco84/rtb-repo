-- API Users Schema
-- Run this in Supabase SQL Editor

-- API user accounts for gated API access
CREATE TABLE IF NOT EXISTS api_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT,
    company TEXT,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_hour INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    last_api_call_at TIMESTAMPTZ,
    total_api_calls INTEGER DEFAULT 0
);

-- Index for fast API key lookups
CREATE INDEX IF NOT EXISTS idx_api_users_api_key ON api_users(api_key);
CREATE INDEX IF NOT EXISTS idx_api_users_email ON api_users(email);

-- API usage log for future billing
CREATE TABLE IF NOT EXISTS api_usage_log (
    id BIGSERIAL PRIMARY KEY,
    api_user_id UUID REFERENCES api_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage_log(api_user_id, created_at DESC);

-- RLS policies
ALTER TABLE api_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on api_users"
    ON api_users FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on api_usage_log"
    ON api_usage_log FOR ALL
    USING (true) WITH CHECK (true);
