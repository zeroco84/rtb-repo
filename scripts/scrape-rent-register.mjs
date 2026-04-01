/**
 * scripts/scrape-rent-register.mjs
 *
 * Runs a full national rent register scrape and upserts results into Supabase.
 * Can be run manually or triggered via the admin panel POST /api/scrape/rent-register.
 *
 * Usage:
 *   node scripts/scrape-rent-register.mjs              (all 166 national LEAs, ~83 mins)
 *   node scripts/scrape-rent-register.mjs --dry-run    (prints queries without saving)
 *   node scripts/scrape-rent-register.mjs --la 29      (single local authority only)
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeRentRegisterDublin, QUERY_MATRIX } from '../lib/rent-register-scraper.js';

// Load .env.local for local development — optional, not needed on Render
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: join(__dirname, '..', '.env.local') });
} catch { /* dotenv not installed — fine on Render where env vars are injected */ }

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const laFilter = args.includes('--la') ? parseInt(args[args.indexOf('--la') + 1]) : null;

async function main() {
    console.log('=== RTB Rent Register Scraper ===');
    if (isDryRun) console.log('DRY RUN — no data will be saved\n');
    if (laFilter) console.log(`Filtering to Local Authority ID: ${laFilter}\n`);

    // Load LEA refs — all national by default, or filtered by --la flag
    let leaQuery = supabase
        .from('rent_register_lea_ref')
        .select('*')
        .order('local_authority_id')
        .order('lea_name');

    if (laFilter) leaQuery = leaQuery.eq('local_authority_id', laFilter);

    const { data: leaRefs, error } = await leaQuery;

    if (error) { console.error('Failed to load LEA refs:', error.message); process.exit(1); }
    if (!leaRefs?.length) {
        console.error('No LEA refs found. Run: node scripts/seed-lea-ref.mjs');
        process.exit(1);
    }

    console.log(`Scraping ${leaRefs.length} LEAs × ${QUERY_MATRIX.length} profiles = ${leaRefs.length * QUERY_MATRIX.length} queries`);
    console.log(`Estimated time: ~${Math.ceil(leaRefs.length * QUERY_MATRIX.length * 3 / 60)} mins\n`);

    let totalUpserted = 0;
    let totalSkipped = 0;
    let totalQueries = 0;

    for await (const batch of scrapeRentRegisterDublin({ leaRefs,
        onProgress: ({ currentLea, profile, totalResults }) => {
            process.stdout.write(`\r[${totalQueries}] ${currentLea} | ${profile.dwellingTypeCode === 101 ? 'Apt' : 'House'} ${profile.bedrooms}bed ${profile.ber} ${profile.floorSpace}m² | ${totalResults} total`);
        }
    })) {
        const { results, lea, profile, batchId } = batch;
        totalQueries++;

        if (results.length === 0) {
            if (!isDryRun) {
                await supabase.from('rent_register_scrape_log').upsert({
                    local_authority_id: lea.local_authority_id,
                    osi_lea_id: lea.osi_lea_id,
                    dwelling_type_code: profile.dwellingTypeCode,
                    number_of_bedrooms: profile.bedrooms,
                    ber: profile.ber,
                    floor_space_sqm: profile.floorSpace,
                    records_returned: 0,
                    scraped_at: new Date().toISOString(),
                    batch_id: batchId,
                }, { onConflict: 'osi_lea_id,dwelling_type_code,number_of_bedrooms,ber,floor_space_sqm' });
            }
            continue;
        }

        if (isDryRun) {
            console.log(`\n[DRY] ${lea.lea_name} | ${profile.dwellingTypeCode === 101 ? 'Apt' : 'House'} ${profile.bedrooms}bed ${profile.ber} ${profile.floorSpace}m² → ${results.length} results`);
            results.slice(0, 2).forEach(r =>
                console.log(`  RT: ${r.rtNumber} | BER: ${r.ber} | ${r.floorSpace}m² | €${r.rentMonthCalc}/mo | score: ${r.score}`)
            );
            continue;
        }

        const rows = results.map(r => ({
            rt_number:            r.rtNumber,
            local_authority:      r.localAuthority,
            local_authority_id:   lea.local_authority_id,
            local_electoral_area: r.localElectoralArea,
            osi_lea_id:           lea.osi_lea_id,
            electoral_district:   r.eD_Name || null,
            dwelling_type:        r.combinedDwellingType,
            dwelling_type_code:   profile.dwellingTypeCode,
            number_of_bedrooms:   r.numberOfBedrooms,
            number_of_bed_spaces: r.numberOfBedSpaces || null,
            floor_space_sqm:      r.floorSpace || null,
            ber:                  r.ber || null,
            rent_monthly:         r.rentMonthCalc,
            match_score:          r.score || null,
            scraped_at:           new Date().toISOString(),
            scrape_batch_id:      batchId,
        }));

        const { error: upsertErr } = await supabase
            .from('rent_register')
            .upsert(rows, { onConflict: 'rt_number', ignoreDuplicates: false });

        if (upsertErr) {
            console.error(`\nUpsert error for ${lea.lea_name}:`, upsertErr.message);
            totalSkipped += rows.length;
        } else {
            totalUpserted += rows.length;
        }

        await supabase.from('rent_register_scrape_log').upsert({
            local_authority_id: lea.local_authority_id,
            osi_lea_id: lea.osi_lea_id,
            dwelling_type_code: profile.dwellingTypeCode,
            number_of_bedrooms: profile.bedrooms,
            ber: profile.ber,
            floor_space_sqm: profile.floorSpace,
            records_returned: results.length,
            scraped_at: new Date().toISOString(),
            batch_id: batchId,
        }, { onConflict: 'osi_lea_id,dwelling_type_code,number_of_bedrooms,ber,floor_space_sqm' });
    }

    console.log(`\n\n=== Complete ===`);
    console.log(`Queries:  ${totalQueries}`);
    console.log(`Upserted: ${totalUpserted}`);
    console.log(`Skipped:  ${totalSkipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
