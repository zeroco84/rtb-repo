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
 *   - 30 property profiles per LEA (BER × floor space × bedroom × type matrix)
 *
 * Rate limited to 3 seconds between requests.
 * Full Dublin scrape: 31 LEAs × 30 profiles = 930 queries (~47 minutes).
 */

import { createServiceClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { scrapeRentRegisterDublin, QUERY_MATRIX } from '@/lib/rent-register-scraper';

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
            estimated_queries: leaRefs.length * QUERY_MATRIX.length,
            estimated_duration_minutes: Math.ceil(leaRefs.length * QUERY_MATRIX.length * 3 / 60),
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

async function runRentRegisterScrape(supabase, leaRefs) {
    console.log(`[RentRegister] Starting scrape for ${leaRefs.length} Dublin LEAs`);
    let totalUpserted = 0;
    let totalSkipped = 0;

    for await (const batch of scrapeRentRegisterDublin({ leaRefs })) {
        const { results, lea, profile, batchId } = batch;
        const logKey = { osi_lea_id: lea.osi_lea_id, dwelling_type_code: profile.dwellingTypeCode, number_of_bedrooms: profile.bedrooms, ber: profile.ber, floor_space_sqm: profile.floorSpace };

        if (results.length === 0) {
            await supabase.from('rent_register_scrape_log').upsert(
                { local_authority_id: lea.local_authority_id, ...logKey, records_returned: 0, scraped_at: new Date().toISOString(), batch_id: batchId },
                { onConflict: 'osi_lea_id,dwelling_type_code,number_of_bedrooms,ber,floor_space_sqm' }
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

        const { error: upsertError } = await supabase
            .from('rent_register')
            .upsert(rows, { onConflict: 'rt_number', ignoreDuplicates: false });

        if (upsertError) {
            console.error(`[RentRegister] Upsert error for LEA ${lea.lea_name}:`, upsertError.message);
            totalSkipped += rows.length;
        } else {
            totalUpserted += rows.length;
        }

        await supabase.from('rent_register_scrape_log').upsert(
            { local_authority_id: lea.local_authority_id, ...logKey, records_returned: results.length, scraped_at: new Date().toISOString(), batch_id: batchId },
            { onConflict: 'osi_lea_id,dwelling_type_code,number_of_bedrooms,ber,floor_space_sqm' }
        );
    }

    console.log(`[RentRegister] Scrape complete. Upserted: ${totalUpserted}, Skipped: ${totalSkipped}`);
}
