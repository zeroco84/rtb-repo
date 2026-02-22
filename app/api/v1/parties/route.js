/**
 * GET /api/v1/parties
 * Search and filter parties
 * 
 * Query parameters:
 *   q         - Search by name
 *   type      - Filter by party type (Landlord, Tenant)
 *   min_disputes - Minimum number of disputes
 *   has_awards   - If "true", only parties with net_awards != 0
 *   page      - Page number (default: 1)
 *   per_page  - Results per page (default: 25, max: 100)
 *   sort      - Sort field (name, disputes, awards)
 *   order     - Sort order (asc, desc)
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

        const page = Math.max(1, parseInt(params.get('page') || '1'));
        const perPage = Math.min(100, Math.max(1, parseInt(params.get('per_page') || '25')));
        const offset = (page - 1) * perPage;

        const supabase = createServiceClient();

        let query = supabase
            .from('parties')
            .select('id, name, party_type, total_disputes, total_as_applicant, total_as_respondent, net_awards_for, net_awards_against, net_awards', { count: 'exact' });

        // Name search
        const q = params.get('q');
        if (q) {
            query = query.ilike('name', `%${q}%`);
        }

        // Party type filter
        const type = params.get('type');
        if (type) {
            query = query.eq('party_type', type);
        }

        // Minimum disputes
        const minDisputes = params.get('min_disputes');
        if (minDisputes) {
            query = query.gte('total_disputes', parseInt(minDisputes));
        }

        // Has awards filter
        if (params.get('has_awards') === 'true') {
            query = query.or('net_awards_for.gt.0,net_awards_against.gt.0');
        }

        // Sorting
        const sort = params.get('sort') || 'disputes';
        const order = params.get('order') || 'desc';
        const ascending = order === 'asc';

        switch (sort) {
            case 'name':
                query = query.order('name', { ascending });
                break;
            case 'awards':
                query = query.order('net_awards_against', { ascending, nullsFirst: false });
                break;
            case 'disputes':
            default:
                query = query.order('total_disputes', { ascending, nullsFirst: false });
                break;
        }

        query = query.range(offset, offset + perPage - 1);

        const { data, count, error: queryError } = await query;

        if (queryError) {
            return apiError('Query failed: ' + queryError.message, 500);
        }

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/parties', 'GET', 200, responseTime);

        return apiSuccess(
            data.map(p => formatParty(p)),
            {
                page,
                per_page: perPage,
                total: count,
                total_pages: Math.ceil(count / perPage),
            }
        );
    } catch (err) {
        return apiError('Internal server error: ' + err.message, 500);
    }
}

function formatParty(p) {
    return {
        id: p.id,
        name: p.name,
        type: p.party_type,
        disputes: {
            total: p.total_disputes,
            as_applicant: p.total_as_applicant,
            as_respondent: p.total_as_respondent,
        },
        awards: {
            for: parseFloat(p.net_awards_for || 0),
            against: parseFloat(p.net_awards_against || 0),
            net: parseFloat(p.net_awards || 0),
        },
    };
}
