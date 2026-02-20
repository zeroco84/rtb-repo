/**
 * API Route: /api/stats
 * Dashboard statistics
 */

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServiceClient();

        // Total disputes
        const { count: totalDisputes } = await supabase
            .from('disputes')
            .select('*', { count: 'exact', head: true });

        // Total parties
        const { count: totalParties } = await supabase
            .from('parties')
            .select('*', { count: 'exact', head: true });

        // Repeat offenders (more than 2 disputes)
        const { count: repeatOffenders } = await supabase
            .from('parties')
            .select('*', { count: 'exact', head: true })
            .gte('total_disputes', 3);

        // AI processed count
        const { count: aiProcessed } = await supabase
            .from('disputes')
            .select('*', { count: 'exact', head: true })
            .eq('ai_processed', true);

        // Top 5 repeat offenders - landlords
        const { data: topLandlords } = await supabase
            .from('parties')
            .select('id, name, total_disputes, total_dispute_value')
            .eq('party_type', 'Landlord')
            .order('total_disputes', { ascending: false })
            .limit(5);

        // Top 5 repeat offenders - tenants
        const { data: topTenants } = await supabase
            .from('parties')
            .select('id, name, total_disputes, total_dispute_value')
            .eq('party_type', 'Tenant')
            .order('total_disputes', { ascending: false })
            .limit(5);

        // Latest scrape job
        const { data: latestJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Disputes per year
        const { data: disputesByYear } = await supabase
            .from('disputes')
            .select('dispute_date')
            .not('dispute_date', 'is', null)
            .order('dispute_date', { ascending: true });

        const yearCounts = {};
        (disputesByYear || []).forEach(d => {
            if (d.dispute_date) {
                const year = new Date(d.dispute_date).getFullYear();
                yearCounts[year] = (yearCounts[year] || 0) + 1;
            }
        });

        return Response.json({
            total_disputes: totalDisputes || 0,
            total_parties: totalParties || 0,
            repeat_offenders: repeatOffenders || 0,
            ai_processed: aiProcessed || 0,
            top_landlords: topLandlords || [],
            top_tenants: topTenants || [],
            latest_job: latestJob,
            disputes_by_year: yearCounts,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
