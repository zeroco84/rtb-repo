/**
 * GET /api/v1/comparables
 *
 * Returns comparable rent register records for a given property.
 * Used to auto-populate Part C of Notice of Rent Review forms in Rentle.
 *
 * Query parameters:
 *   lea_id       - OSI LEA ID (integer, required) e.g. 13260427 = Clontarf
 *   bedrooms     - Number of bedrooms (integer, required)
 *   type         - Dwelling type code: 100=House, 101=Apartment (default: 101)
 *   ber          - BER rating filter e.g. B2 (optional)
 *   floor_space  - Floor space m² for ±20% proximity filter (optional)
 *   limit        - Max results to return (default: 10, max: 10)
 *
 * Example:
 *   GET /api/v1/comparables?lea_id=13260427&bedrooms=2&type=101&ber=B2&floor_space=75
 */

import { createServiceClient } from '@/lib/supabase';
import { authenticateApiKey, logApiUsage, apiError, apiSuccess, corsHeaders } from '@/lib/api-auth';

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request) {
    const start = Date.now();
    const { user, error, status } = await authenticateApiKey(request);
    if (error) return apiError(error, status);

    try {
        const url = new URL(request.url);
        const params = url.searchParams;

        const leaId = parseInt(params.get('lea_id'));
        const bedrooms = parseInt(params.get('bedrooms'));
        const dwellingTypeCode = parseInt(params.get('type') || '101');
        const berFilter = params.get('ber') || null;
        const floorSpace = params.get('floor_space') ? parseFloat(params.get('floor_space')) : null;
        const limit = Math.min(10, Math.max(1, parseInt(params.get('limit') || '10')));

        if (!leaId || isNaN(leaId)) return apiError('lea_id is required (integer)', 400);
        if (!bedrooms || isNaN(bedrooms)) return apiError('bedrooms is required (integer)', 400);
        if (![100, 101].includes(dwellingTypeCode)) {
            return apiError('type must be 100 (House) or 101 (Apartment / Flat)', 400);
        }

        const supabase = createServiceClient();

        let query = supabase
            .from('rent_register')
            .select([
                'rt_number',
                'local_electoral_area',
                'electoral_district',
                'dwelling_type',
                'number_of_bedrooms',
                'number_of_bed_spaces',
                'floor_space_sqm',
                'ber',
                'rent_monthly',
                'match_score',
                'scraped_at',
            ].join(', '))
            .eq('osi_lea_id', leaId)
            .eq('dwelling_type_code', dwellingTypeCode)
            .eq('number_of_bedrooms', bedrooms)
            .order('scraped_at', { ascending: false })
            .limit(limit);

        if (berFilter) {
            query = query.eq('ber', berFilter);
        }

        // Optional floor space proximity filter (±20%)
        if (floorSpace && !isNaN(floorSpace)) {
            query = query
                .gte('floor_space_sqm', Math.round(floorSpace * 0.8))
                .lte('floor_space_sqm', Math.round(floorSpace * 1.2));
        }

        const { data, error: queryError } = await query;
        if (queryError) return apiError('Query failed: ' + queryError.message, 500);

        // Get LEA name for response context
        const { data: leaRef } = await supabase
            .from('rent_register_lea_ref')
            .select('lea_name, local_authority_name')
            .eq('osi_lea_id', leaId)
            .single();

        // Warn if data is stale (older than 7 days)
        const stale = data.length === 0 || (
            new Date(data[data.length - 1].scraped_at) <
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/comparables', 'GET', 200, responseTime);

        return apiSuccess(data.map(formatComparable), {
            total: data.length,
            lea_id: leaId,
            lea_name: leaRef?.lea_name || null,
            local_authority: leaRef?.local_authority_name || null,
            filters: { bedrooms, dwelling_type_code: dwellingTypeCode, ber: berFilter, floor_space: floorSpace },
            stale,
        });

    } catch (err) {
        return apiError('Internal server error: ' + err.message, 500);
    }
}

function formatComparable(r) {
    return {
        rt_number: r.rt_number,            // Required for Part C of rent review form
        local_electoral_area: r.local_electoral_area,
        electoral_district: r.electoral_district,
        dwelling_type: r.dwelling_type,
        bedrooms: r.number_of_bedrooms,
        bed_spaces: r.number_of_bed_spaces,
        floor_space_sqm: r.floor_space_sqm,
        ber: r.ber,
        rent_monthly: r.rent_monthly,      // Required for Part C of rent review form
        match_score: r.match_score,
        scraped_at: r.scraped_at,
    };
}
