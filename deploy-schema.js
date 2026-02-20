/**
 * Deploy schema via Supabase Management API
 * Uses the service_role key to create an exec function, then runs the schema through it
 */

const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://snxlzlkdnnxgixsuhuoo.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueGx6bGtkbm54Z2l4c3VodW9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYxMzUxMSwiZXhwIjoyMDg3MTg5NTExfQ.QCAlYpEDbFeKL3FXwQ6M2oSYE2E1vCwbYkNUHiCE2VY';

// Split SQL carefully handling dollar-quoted functions
function splitSQL(sql) {
    const stmts = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';

    for (const line of sql.split('\n')) {
        if (line.trim().startsWith('--') && !inDollarQuote) continue;
        current += line + '\n';

        const dollarMatches = line.match(/\$[a-zA-Z_]*\$/g);
        if (dollarMatches) {
            for (const tag of dollarMatches) {
                if (!inDollarQuote) { inDollarQuote = true; dollarTag = tag; }
                else if (tag === dollarTag) { inDollarQuote = false; dollarTag = ''; }
            }
        }

        if (!inDollarQuote && line.trim().endsWith(';')) {
            const stmt = current.trim();
            if (stmt && stmt !== ';') stmts.push(stmt);
            current = '';
        }
    }
    if (current.trim()) stmts.push(current.trim());
    return stmts;
}

async function execSQL(sql) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ sql_text: sql }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
    }
}

async function main() {
    console.log('🚀 Deploying RTB schema to Supabase...\n');

    // Step 1: Bootstrap — create the exec_sql function via a different RPC
    // We can't create it via RPC if it doesn't exist yet...
    // Instead, let's try creating tables directly via PostgREST

    // First check: can we talk to PostgREST at all?
    const healthRes = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    if (!healthRes.ok) {
        console.log('❌ Cannot reach Supabase REST API');
        process.exit(1);
    }
    console.log('✅ Supabase REST API is reachable\n');

    // The Supabase REST API itself uses PostgREST which cannot run DDL queries.
    // We need either:
    // 1. Direct pg connection (pooler) — failed due to tenant not found
    // 2. Supabase Management API — needs a personal access token
    // 3. Supabase Dashboard SQL Editor — manual
    // 4. supabase db push — needs login

    // Let's try the Supabase Management API with the service role key
    // (this won't work - it needs a personal access token, but let's try)
    console.log('Trying Supabase Management API...');
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'supabase', 'schema.sql'), 'utf-8');

    const mgmtRes = await fetch('https://api.supabase.com/v1/projects/snxlzlkdnnxgixsuhuoo/database/query', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: schemaSQL }),
    });

    if (mgmtRes.ok) {
        console.log('✅ Schema deployed via Management API!');
        return;
    }

    const mgmtError = await mgmtRes.text();
    console.log(`❌ Management API: ${mgmtRes.status} - ${mgmtError.substring(0, 100)}\n`);

    // All programmatic methods failed - provide clear instructions
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Schema needs to be deployed via the Supabase SQL Editor');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('The schema has been copied to your clipboard. Follow these steps:\n');

    // Copy to clipboard
    const { execSync } = require('child_process');
    execSync('cat supabase/schema.sql | pbcopy', { cwd: __dirname });
    console.log('✅ Schema SQL copied to clipboard!\n');

    console.log('1. Open: https://supabase.com/dashboard/project/snxlzlkdnnxgixsuhuoo/sql/new');
    console.log('2. Paste (Cmd+V) into the SQL editor');
    console.log('3. Click "Run" (or press Cmd+Enter)\n');
    console.log('📋 The schema creates 4 tables, indexes, RLS policies, and search functions.');
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
