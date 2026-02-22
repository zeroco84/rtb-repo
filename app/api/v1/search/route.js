/**
 * GET /api/v1/search
 * Full-text search across disputes and parties
 * 
 * Query parameters:
 *   q - Search query (required)
 *   type - "disputes", "parties", or "all" (default: "all")
 *   limit - Max results per type (default: 10, max: 50)
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
        const q = url.searchParams.get('q');
        const type = url.searchParams.get('type') || 'all';
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10')));

        if (!q || q.trim().length < 2) {
            return apiError('Search query "q" must be at least 2 characters', 400);
        }

        const supabase = createServiceClient();
        const result = {};

        // Search disputes
        if (type === 'all' || type === 'disputes') {
            const { data: disputes } = await supabase
                .from('disputes')
                .select('dr_no, heading, dispute_date, applicant_name, respondent_name, ai_outcome, ai_compensation_amount, ai_dispute_type')
                .or(`heading.ilike.%${q}%,dr_no.ilike.%${q}%,applicant_name.ilike.%${q}%,respondent_name.ilike.%${q}%,ai_summary.ilike.%${q}%`)
                .order('dispute_date', { ascending: false })
                .limit(limit);

            result.disputes = (disputes || []).map(d => ({
                dr_no: d.dr_no,
                heading: d.heading,
                date: d.dispute_date,
                applicant: d.applicant_name,
                respondent: d.respondent_name,
                outcome: d.ai_outcome,
                compensation: d.ai_compensation_amount,
                type: d.ai_dispute_type,
            }));
        }

        // Search parties
        if (type === 'all' || type === 'parties') {
            const { data: parties } = await supabase
                .from('parties')
                .select('id, name, party_type, total_disputes, net_awards_against')
                .ilike('name', `%${q}%`)
                .order('total_disputes', { ascending: false })
                .limit(limit);

            result.parties = (parties || []).map(p => ({
                id: p.id,
                name: p.name,
                type: p.party_type,
                total_disputes: p.total_disputes,
                awards_against: parseFloat(p.net_awards_against || 0),
            }));
        }

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/search', 'GET', 200, responseTime);

        return apiSuccess(result, { query: q, type });
    } catch (err) {
        return apiError('Internal server error: ' + err.message, 500);
    }
}
