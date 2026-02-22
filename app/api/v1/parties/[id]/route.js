/**
 * GET /api/v1/parties/:id
 * Get party details with full dispute history
 */

import { createServiceClient } from '@/lib/supabase';
import { authenticateApiKey, logApiUsage, apiError, apiSuccess, corsHeaders } from '@/lib/api-auth';

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request, { params }) {
    const start = Date.now();
    const { user, error, status } = await authenticateApiKey(request);
    if (error) return apiError(error, status);

    try {
        const { id } = await params;
        const supabase = createServiceClient();

        // Get party
        const { data: party, error: partyError } = await supabase
            .from('parties')
            .select('*')
            .eq('id', id)
            .single();

        if (partyError || !party) {
            return apiError('Party not found', 404);
        }

        // Get their disputes
        const { data: links } = await supabase
            .from('dispute_parties')
            .select('role, party_type, disputes(dr_no, heading, dispute_date, ai_outcome, ai_dispute_type, ai_compensation_amount, ai_summary)')
            .eq('party_id', id)
            .order('disputes(dispute_date)', { ascending: false });

        // Get their enforcement orders
        const { data: eoLinks } = await supabase
            .from('enforcement_parties')
            .select('role, enforcement_orders(court_ref_no, heading, order_date, subject, ai_outcome, ai_summary, ai_compensation_amount)')
            .eq('party_id', id)
            .order('enforcement_orders(order_date)', { ascending: false });

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/parties/' + id, 'GET', 200, responseTime);

        return apiSuccess({
            id: party.id,
            name: party.name,
            type: party.party_type,
            disputes: {
                total: party.total_disputes,
                as_applicant: party.total_as_applicant,
                as_respondent: party.total_as_respondent,
            },
            enforcement_orders: party.total_enforcement_orders || 0,
            awards: {
                for: parseFloat(party.net_awards_for || 0),
                against: parseFloat(party.net_awards_against || 0),
                net: parseFloat(party.net_awards || 0),
            },
            dispute_history: (links || []).map(link => ({
                role: link.role,
                ...(link.disputes ? {
                    dr_no: link.disputes.dr_no,
                    heading: link.disputes.heading,
                    date: link.disputes.dispute_date,
                    outcome: link.disputes.ai_outcome,
                    dispute_type: link.disputes.ai_dispute_type,
                    compensation_amount: link.disputes.ai_compensation_amount,
                    summary: link.disputes.ai_summary,
                } : {}),
            })),
            enforcement_history: (eoLinks || []).map(link => ({
                role: link.role,
                ...(link.enforcement_orders ? {
                    court_ref_no: link.enforcement_orders.court_ref_no,
                    heading: link.enforcement_orders.heading,
                    date: link.enforcement_orders.order_date,
                    subject: link.enforcement_orders.subject,
                    outcome: link.enforcement_orders.ai_outcome,
                    summary: link.enforcement_orders.ai_summary,
                    compensation_amount: link.enforcement_orders.ai_compensation_amount,
                } : {}),
            })),
        });
    } catch (err) {
        return apiError('Internal server error: ' + err.message, 500);
    }
}
