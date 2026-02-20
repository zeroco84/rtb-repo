/**
 * API Route: /api/parties
 * League table of repeat offenders
 */

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const supabase = createServiceClient();
        const { searchParams } = new URL(request.url);

        const search = searchParams.get('search') || '';
        const partyType = searchParams.get('party_type') || '';
        const minDisputes = parseInt(searchParams.get('min_disputes') || '1', 10);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '25', 10);
        const sortBy = searchParams.get('sort_by') || 'total_disputes';
        const sortOrder = searchParams.get('sort_order') || 'desc';
        const offset = (page - 1) * limit;

        let query = supabase
            .from('parties')
            .select('*', { count: 'exact' });

        // Search by name
        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        // Filter by party type
        if (partyType) {
            query = query.eq('party_type', partyType);
        }

        // Minimum disputes filter
        query = query.gte('total_disputes', minDisputes);

        // Sort
        const ascending = sortOrder === 'asc';
        query = query.order(sortBy, { ascending, nullsFirst: false });

        // Pagination
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) throw error;

        return Response.json({
            parties: data || [],
            total: count || 0,
            page,
            limit,
            total_pages: Math.ceil((count || 0) / limit),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
