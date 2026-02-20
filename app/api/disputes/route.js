/**
 * API Route: /api/disputes
 * Search and list disputes
 */

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const supabase = createServiceClient();
        const { searchParams } = new URL(request.url);

        const search = searchParams.get('search') || '';
        const disputeType = searchParams.get('dispute_type') || '';
        const dateFrom = searchParams.get('date_from') || '';
        const dateTo = searchParams.get('date_to') || '';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '25', 10);
        const sortBy = searchParams.get('sort_by') || 'dispute_date';
        const sortOrder = searchParams.get('sort_order') || 'desc';
        const offset = (page - 1) * limit;

        let query = supabase
            .from('disputes')
            .select('*', { count: 'exact' });

        // Full-text search across multiple fields
        if (search) {
            query = query.or(
                `heading.ilike.%${search}%,applicant_name.ilike.%${search}%,respondent_name.ilike.%${search}%,property_address.ilike.%${search}%,dr_no.ilike.%${search}%,tr_no.ilike.%${search}%`
            );
        }

        // Filter by dispute type
        if (disputeType) {
            query = query.eq('dispute_type', disputeType);
        }

        // Date range filter
        if (dateFrom) {
            query = query.gte('dispute_date', dateFrom);
        }
        if (dateTo) {
            query = query.lte('dispute_date', dateTo);
        }

        // Sort
        const ascending = sortOrder === 'asc';
        query = query.order(sortBy, { ascending, nullsFirst: false });

        // Pagination
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) throw error;

        return Response.json({
            disputes: data || [],
            total: count || 0,
            page,
            limit,
            total_pages: Math.ceil((count || 0) / limit),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
