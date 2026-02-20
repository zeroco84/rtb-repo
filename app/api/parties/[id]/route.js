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

        const disputes = (links || []).map(link => ({
            ...link.disputes,
            party_role: link.role,
            party_type: link.party_type,
        }));

        return Response.json({
            party,
            disputes,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
