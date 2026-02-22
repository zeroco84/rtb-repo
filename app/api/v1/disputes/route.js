/**
 * GET /api/v1/disputes
 * Search and filter disputes
 * 
 * Query parameters:
 *   q        - Full text search (matches heading, dr_no, applicant, respondent)
 *   name     - Search by party name (applicant or respondent)
 *   dr_no    - Filter by DR number
 *   outcome  - Filter by AI outcome (Upheld, Dismissed, etc.)
 *   type     - Filter by dispute type
 *   date_from - Filter by date (ISO format)
 *   date_to   - Filter by date (ISO format)
 *   min_award - Minimum compensation amount
 *   max_award - Maximum compensation amount
 *   page     - Page number (default: 1)
 *   per_page - Results per page (default: 25, max: 100)
 *   sort     - Sort field (date, award, name) 
 *   order    - Sort order (asc, desc)
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
            .from('disputes')
            .select('id, dr_no, tr_no, heading, dispute_date, applicant_name, applicant_role, respondent_name, respondent_role, ai_summary, ai_outcome, ai_dispute_type, ai_compensation_amount, ai_cost_order, ai_property_address, ai_processed_at, pdf_urls', { count: 'exact' });

        // Text search
        const q = params.get('q');
        if (q) {
            query = query.or(`heading.ilike.%${q}%,dr_no.ilike.%${q}%,applicant_name.ilike.%${q}%,respondent_name.ilike.%${q}%`);
        }

        // Party name search
        const name = params.get('name');
        if (name) {
            query = query.or(`applicant_name.ilike.%${name}%,respondent_name.ilike.%${name}%`);
        }

        // DR number filter
        const drNo = params.get('dr_no');
        if (drNo) {
            query = query.ilike('dr_no', `%${drNo}%`);
        }

        // Outcome filter
        const outcome = params.get('outcome');
        if (outcome) {
            query = query.eq('ai_outcome', outcome);
        }

        // Dispute type filter
        const type = params.get('type');
        if (type) {
            query = query.eq('ai_dispute_type', type);
        }

        // Date range
        const dateFrom = params.get('date_from');
        if (dateFrom) {
            query = query.gte('dispute_date', dateFrom);
        }
        const dateTo = params.get('date_to');
        if (dateTo) {
            query = query.lte('dispute_date', dateTo);
        }

        // Award amount range
        const minAward = params.get('min_award');
        if (minAward) {
            query = query.gte('ai_compensation_amount', parseInt(minAward));
        }
        const maxAward = params.get('max_award');
        if (maxAward) {
            query = query.lte('ai_compensation_amount', parseInt(maxAward));
        }

        // Sorting
        const sort = params.get('sort') || 'date';
        const order = params.get('order') || 'desc';
        const ascending = order === 'asc';

        switch (sort) {
            case 'award':
                query = query.order('ai_compensation_amount', { ascending, nullsFirst: false });
                break;
            case 'name':
                query = query.order('applicant_name', { ascending });
                break;
            case 'date':
            default:
                query = query.order('dispute_date', { ascending, nullsFirst: false });
                break;
        }

        // Pagination
        query = query.range(offset, offset + perPage - 1);

        const { data, count, error: queryError } = await query;

        if (queryError) {
            return apiError('Query failed: ' + queryError.message, 500);
        }

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/disputes', 'GET', 200, responseTime);

        return apiSuccess(
            data.map(d => formatDispute(d)),
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

function formatDispute(d) {
    return {
        dr_no: d.dr_no,
        tr_no: d.tr_no,
        heading: d.heading,
        date: d.dispute_date,
        applicant: {
            name: d.applicant_name,
            role: d.applicant_role,
        },
        respondent: {
            name: d.respondent_name,
            role: d.respondent_role,
        },
        analysis: d.ai_processed_at ? {
            summary: d.ai_summary,
            outcome: d.ai_outcome,
            dispute_type: d.ai_dispute_type,
            compensation_amount: d.ai_compensation_amount,
            cost_order: d.ai_cost_order,
            property_address: d.ai_property_address,
            processed_at: d.ai_processed_at,
        } : null,
        pdf_urls: (d.pdf_urls || []).map(p => p.url),
    };
}
