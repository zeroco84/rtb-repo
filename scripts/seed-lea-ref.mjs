/**
 * scripts/seed-lea-ref.mjs
 *
 * Seeds all Dublin LEA reference data into rent_register_lea_ref.
 * All LEA IDs confirmed directly from RTB portal dropdowns on 2026-03-31.
 *
 * Only needs to be run once (or if RTB adds new LEAs).
 *
 * Usage:
 *   node scripts/seed-lea-ref.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// ALL DUBLIN LEA DATA
// Confirmed from RTB portal dropdowns on 2026-03-31
// Source: rtb.ie/rtb-rent-register/ — LA dropdown → LEA dropdown value attributes
// ============================================
const ALL_DUBLIN_LEAS = [

    // ── Dublin City County Council (LA ID: 29) ─────────────────────────────
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260420, lea_name: 'Ballymun - Finglas', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260421, lea_name: 'Cabra - Glasnevin', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260422, lea_name: 'Ballyfermot - Drimnagh', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260423, lea_name: 'Kimmage - Rathmines', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260424, lea_name: 'Pembroke', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260425, lea_name: 'South East Inner City', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260426, lea_name: 'North Inner City', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260427, lea_name: 'Clontarf', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260428, lea_name: 'Donaghmede', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260429, lea_name: 'Artane - Whitehall', is_dublin: true },
    { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL', osi_lea_id: 13260430, lea_name: 'South West Inner City', is_dublin: true },

    // ── Dún Laoghaire-Rathdown County Council (LA ID: 28) ─────────────────
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260405, lea_name: 'Stillorgan', is_dublin: true },
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260406, lea_name: 'Dundrum', is_dublin: true },
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260407, lea_name: 'Glencullen - Sandyford', is_dublin: true },
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260408, lea_name: 'Killiney - Shankill', is_dublin: true },
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260409, lea_name: 'Dún Laoghaire', is_dublin: true },
    { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL', osi_lea_id: 13260410, lea_name: 'Blackrock', is_dublin: true },

    // ── Fingal County Council (LA ID: 27) ─────────────────────────────────
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260400, lea_name: 'Rush - Lusk', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260401, lea_name: 'Swords', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260402, lea_name: 'Blanchardstown - Mulhuddart', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260403, lea_name: 'Castleknock', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260404, lea_name: 'Howth - Malahide', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260417, lea_name: 'Balbriggan', is_dublin: true },
    { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL', osi_lea_id: 13260418, lea_name: 'Ongar', is_dublin: true },

    // ── South Dublin County Council (LA ID: 26) ───────────────────────────
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260411, lea_name: 'Lucan', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260412, lea_name: 'Tallaght Central', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260413, lea_name: 'Rathfarnham - Templeogue', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260414, lea_name: 'Firhouse - Bohernabreena', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260415, lea_name: 'Tallaght South', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260416, lea_name: 'Clondalkin', is_dublin: true },
    { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL', osi_lea_id: 13260419, lea_name: 'Palmerstown - Fonthill', is_dublin: true },
];

async function main() {
    console.log('=== RTB Rent Register LEA Seed Script ===');
    console.log(`Seeding ${ALL_DUBLIN_LEAS.length} Dublin LEA records\n`);

    const { error } = await supabase
        .from('rent_register_lea_ref')
        .upsert(ALL_DUBLIN_LEAS, { onConflict: 'osi_lea_id' });

    if (error) {
        console.error('Upsert failed:', error.message);
        process.exit(1);
    }

    // Verify
    const { data: all } = await supabase
        .from('rent_register_lea_ref')
        .select('local_authority_name, lea_name, osi_lea_id')
        .eq('is_dublin', true)
        .order('local_authority_id')
        .order('lea_name');

    console.log(`✅ Seeded ${all?.length || 0} Dublin LEAs:\n`);

    let lastLa = null;
    for (const r of (all || [])) {
        if (r.local_authority_name !== lastLa) {
            console.log(`\n${r.local_authority_name}:`);
            lastLa = r.local_authority_name;
        }
        console.log(`  ${r.osi_lea_id}  ${r.lea_name}`);
    }

    console.log('\nDone. You can now run the rent register scraper:');
    console.log('  node scripts/scrape-rent-register.mjs --dry-run --la 29');
}

main().catch(err => { console.error(err); process.exit(1); });
