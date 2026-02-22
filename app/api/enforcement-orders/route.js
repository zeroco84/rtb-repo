/**
 * API Route: /api/enforcement-orders
 * GET - List/search enforcement orders
 */

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const params = url.searchParams;

        const page = Math.max(1, parseInt(params.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '25')));
        const offset = (page - 1) * limit;
        const sortBy = params.get('sort_by') || 'order_date';
        const sortOrder = params.get('sort_order') || 'desc';
        const search = params.get('search') || '';
        const subject = params.get('subject') || '';
        const dateFrom = params.get('date_from') || '';
        const dateTo = params.get('date_to') || '';

        const supabase = createServiceClient();

        let query = supabase
            .from('enforcement_orders')
            .select('*', { count: 'exact' });

        // Search across heading, court_ref_no, prtb_no, applicant/respondent names
        if (search) {
            query = query.or(
                `heading.ilike.%${search}%,court_ref_no.ilike.%${search}%,prtb_no.ilike.%${search}%,applicant_name.ilike.%${search}%,respondent_name.ilike.%${search}%`
            );
        }

        // Subject filter
        if (subject) {
            query = query.ilike('subject', `%${subject}%`);
        }

        // Date range
        if (dateFrom) {
            query = query.gte('order_date', dateFrom);
        }
        if (dateTo) {
            query = query.lte('order_date', dateTo);
        }

        // Sort
        const ascending = sortOrder === 'asc';
        const validSortFields = ['order_date', 'court_ref_no', 'heading', 'subject', 'ai_compensation_amount'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'order_date';
        query = query.order(sortField, { ascending, nullsFirst: false });

        // Pagination
        query = query.range(offset, offset + limit - 1);

        const { data, count, error } = await query;

        if (error) {
            return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({
            enforcement_orders: data || [],
            total: count || 0,
            page,
            limit,
            total_pages: Math.ceil((count || 0) / limit),
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
