/**
 * API Route: /api/scrape/rent-register
 *
 * Admin-only endpoint to trigger a full scrape of the RTB Rent Register
 * for all Dublin Local Electoral Areas.
 *
 * GET  - Returns current scrape status and record count
 * POST - Starts a new Dublin rent register scrape
 *
 * This scrapes:
 *   - 4 Dublin local authorities (Dublin City, DLR, Fingal, South Dublin)
 *   - All LEAs within each authority
 *   - Dwelling types: House (100) and Apartment/Flat (101)
 *   - Bedroom counts: 1–5 (stops early if 0 results returned)
 *   - No BER/floor space filter (captures all 10 results per combination)
 *
 * Rate limited to 3 seconds between requests (respectful of RTB servers).
 * Full Dublin scrape takes approximately 10–15 minutes.
 */

import { createServiceClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { scrapeRentRegisterDublin } from '@/lib/rent-register-scraper';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServiceClient();

        const { count: recordCount } = await supabase
            .from('rent_register')
            .select('*', { count: 'exact', head: true });

        const { data: latestScrape } = await supabase
            .from('rent_register_scrape_log')
            .select('scraped_at, batch_id')
            .order('scraped_at', { ascending: false })
            .limit(1)
            .single();

        const { data: leaCount } = await supabase
            .from('rent_register_lea_ref')
            .select('*', { count: 'exact', head: true })
            .eq('is_dublin', true);

        return Response.json({
            total_records: recordCount || 0,
            last_scraped_at: latestScrape?.scraped_at || null,
            dublin_leas_configured: leaCount || 0,
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

export async function POST() {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const supabase = createServiceClient();

        // Load Dublin LEA refs from Supabase
        const { data: leaRefs, error: leaError } = await supabase
            .from('rent_register_lea_ref')
            .select('*')
            .eq('is_dublin', true)
            .order('local_authority_id')
            .order('lea_name');

        if (leaError) throw leaError;
        if (!leaRefs || leaRefs.length === 0) {
            return Response.json({
                error: 'No Dublin LEAs configured. Run the schema SQL and ensure rent_register_lea_ref is seeded.',
            }, { status: 400 });
        }

        // Run scrape in background
        runRentRegisterScrape(supabase, leaRefs).catch(err => {
            console.error('[RentRegister] Background scrape failed:', err);
        });

        return Response.json({
            message: 'Rent register scrape started',
            lea_count: leaRefs.length,
            estimated_queries: leaRefs.length * 2 * 4, // LEAs × dwelling types × avg bedrooms
            estimated_duration_minutes: Math.ceil((leaRefs.length * 2 * 4 * 3) / 60),
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

async function runRentRegisterScrape(supabase, leaRefs) {
    console.log(`[RentRegister] Starting scrape for ${leaRefs.length} Dublin LEAs`);
    let totalUpserted = 0;
    let totalSkipped = 0;

    for await (const batch of scrapeRentRegisterDublin({ leaRefs, maxBedrooms: 5 })) {
        const { results, lea, dwellingType, bedrooms, batchId } = batch;

        if (results.length === 0) {
            // Log zero result combinations so we know coverage
            await supabase.from('rent_register_scrape_log').upsert({
                local_authority_id: lea.local_authority_id,
                osi_lea_id: lea.osi_lea_id,
                dwelling_type_code: dwellingType.code,
                number_of_bedrooms: bedrooms,
                records_returned: 0,
                scraped_at: new Date().toISOString(),
                batch_id: batchId,
            }, { onConflict: 'local_authority_id,osi_lea_id,dwelling_type_code,number_of_bedrooms' });
            continue;
        }

        // Map API response fields to DB columns
        const rows = results.map(r => ({
            rt_number:            r.rtNumber,
            local_authority:      r.localAuthority,
            local_authority_id:   lea.local_authority_id,
            local_electoral_area: r.localElectoralArea,
            osi_lea_id:           lea.osi_lea_id,
            electoral_district:   r.eD_Name || null,
            dwelling_type:        r.combinedDwellingType,
            dwelling_type_code:   dwellingType.code,
            number_of_bedrooms:   r.numberOfBedrooms,
            number_of_bed_spaces: r.numberOfBedSpaces || null,
            floor_space_sqm:      r.floorSpace || null,
            ber:                  r.ber || null,
            rent_monthly:         r.rentMonthCalc,
            match_score:          r.score || null,
            scraped_at:           new Date().toISOString(),
            scrape_batch_id:      batchId,
        }));

        // Upsert — conflict on rt_number, update rent and scrape timestamp
        const { error: upsertError } = await supabase
            .from('rent_register')
            .upsert(rows, {
                onConflict: 'rt_number',
                ignoreDuplicates: false, // Update existing records with fresh rent data
            });

        if (upsertError) {
            console.error(`[RentRegister] Upsert error for LEA ${lea.lea_name}:`, upsertError.message);
            totalSkipped += rows.length;
        } else {
            totalUpserted += rows.length;
        }

        // Log scrape coverage
        await supabase.from('rent_register_scrape_log').upsert({
            local_authority_id: lea.local_authority_id,
            osi_lea_id: lea.osi_lea_id,
            dwelling_type_code: dwellingType.code,
            number_of_bedrooms: bedrooms,
            records_returned: results.length,
            scraped_at: new Date().toISOString(),
            batch_id: batchId,
        }, { onConflict: 'local_authority_id,osi_lea_id,dwelling_type_code,number_of_bedrooms' });

        console.log(`[RentRegister] ${lea.lea_name} | ${dwellingType.name} | ${bedrooms}bed → ${results.length} records`);
    }

    console.log(`[RentRegister] Scrape complete. Upserted: ${totalUpserted}, Skipped: ${totalSkipped}`);
}
