/**
 * GET /api/v1/disputes/:dr_no
 * Get a single dispute by DR number with full details
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
        const { dr_no } = await params;
        const supabase = createServiceClient();

        const { data: dispute, error: queryError } = await supabase
            .from('disputes')
            .select('*')
            .eq('dr_no', decodeURIComponent(dr_no))
            .single();

        if (queryError || !dispute) {
            return apiError('Dispute not found', 404);
        }

        // Get linked parties
        const { data: partyLinks } = await supabase
            .from('dispute_parties')
            .select('role, party_type, parties(id, name, party_type, total_disputes, net_awards_for, net_awards_against, net_awards)')
            .eq('dispute_id', dispute.id);

        const responseTime = Date.now() - start;
        await logApiUsage(user.id, '/api/v1/disputes/' + dr_no, 'GET', 200, responseTime);

        return apiSuccess({
            dr_no: dispute.dr_no,
            tr_no: dispute.tr_no,
            heading: dispute.heading,
            date: dispute.dispute_date,
            applicant: {
                name: dispute.applicant_name,
                role: dispute.applicant_role,
            },
            respondent: {
                name: dispute.respondent_name,
                role: dispute.respondent_role,
            },
            analysis: dispute.ai_processed_at ? {
                summary: dispute.ai_summary,
                outcome: dispute.ai_outcome,
                dispute_type: dispute.ai_dispute_type,
                compensation_amount: dispute.ai_compensation_amount,
                cost_order: dispute.ai_cost_order,
                property_address: dispute.ai_property_address,
                award_items: dispute.ai_award_items,
                amount_quote: dispute.ai_amount_quote,
                model_used: dispute.ai_model_used,
                processed_at: dispute.ai_processed_at,
            } : null,
            parties: (partyLinks || []).map(link => ({
                role: link.role,
                party_type: link.party_type,
                ...link.parties ? {
                    id: link.parties.id,
                    name: link.parties.name,
                    total_disputes: link.parties.total_disputes,
                    net_awards: {
                        for: parseFloat(link.parties.net_awards_for || 0),
                        against: parseFloat(link.parties.net_awards_against || 0),
                        net: parseFloat(link.parties.net_awards || 0),
                    },
                } : {},
            })),
            pdf_urls: (dispute.pdf_urls || []).map(p => p.url),
        });
    } catch (err) {
        return apiError('Internal server error: ' + err.message, 500);
    }
}
