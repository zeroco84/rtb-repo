/**
 * API Route: /api/parties/[id]
 * Get a single party with their disputes
 */

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
    try {
        const supabase = createServiceClient();
        const { id } = await params;

        // Get party
        const { data: party, error: partyError } = await supabase
            .from('parties')
            .select('*')
            .eq('id', id)
            .single();

        if (partyError || !party) {
            return Response.json({ error: 'Party not found' }, { status: 404 });
        }

        // Get their disputes through the join table
        const { data: links } = await supabase
            .from('dispute_parties')
            .select(`
        role,
        party_type,
        disputes (
          id,
          heading,
          dr_no,
          tr_no,
          dispute_date,
          dispute_type,
          applicant_name,
          respondent_name,
          property_address,
          pdf_urls,
          ai_summary,
          dispute_value,
          awarded_amount
        )
      `)
            .eq('party_id', id)
            .order('disputes(dispute_date)', { ascending: false });

        const rawDisputes = (links || []).map(link => ({
            ...link.disputes,
            party_role: link.role,
            party_type: link.party_type,
        }));

        // Deduplicate: same date + same primary DR number = one case
        const caseMap = new Map();
        for (const d of rawDisputes) {
            const primaryDR = (d.dr_no || '').split(/\s+/)[0] || d.id;
            const caseKey = (d.dispute_date || 'no-date') + '|' + primaryDR;
            if (!caseMap.has(caseKey)) {
                caseMap.set(caseKey, d);
            } else {
                // Merge: combine PDF urls and keep the longer heading
                const existing = caseMap.get(caseKey);
                if (d.pdf_urls && d.pdf_urls.length > 0) {
                    existing.pdf_urls = [...(existing.pdf_urls || []), ...d.pdf_urls];
                }
                if (d.dr_no && d.dr_no.length > (existing.dr_no || '').length) {
                    existing.dr_no = d.dr_no;
                }
            }
        }
        const disputes = Array.from(caseMap.values());

        // Get their enforcement orders through the join table
        const { data: eoLinks } = await supabase
            .from('enforcement_parties')
            .select(`
                role,
                enforcement_orders (
                    id,
                    heading,
                    court_ref_no,
                    prtb_no,
                    order_date,
                    subject,
                    pdf_url,
                    pdf_label,
                    applicant_name,
                    respondent_name,
                    ai_summary,
                    ai_outcome,
                    ai_compensation_amount
                )
            `)
            .eq('party_id', id)
            .order('enforcement_orders(order_date)', { ascending: false });

        const enforcement_orders = (eoLinks || []).map(link => ({
            ...link.enforcement_orders,
            party_role: link.role,
        }));

        return Response.json({
            party,
            disputes,
            enforcement_orders,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
