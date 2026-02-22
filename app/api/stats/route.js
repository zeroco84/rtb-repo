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
            .not('ai_processed_at', 'is', null);

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

        // Total awards by role type
        const { data: awardsByRole } = await supabase
            .from('disputes')
            .select('applicant_role, respondent_role, ai_compensation_amount, ai_outcome')
            .not('ai_processed_at', 'is', null)
            .gt('ai_compensation_amount', 0)
            .in('ai_outcome', ['Upheld', 'Partially Upheld']);

        let totalAwardsToLandlords = 0;
        let totalAwardsToTenants = 0;
        (awardsByRole || []).forEach(d => {
            const amount = parseFloat(d.ai_compensation_amount) || 0;
            // In upheld cases, the applicant wins the award
            if (d.applicant_role === 'Landlord') totalAwardsToLandlords += amount;
            else if (d.applicant_role === 'Tenant') totalAwardsToTenants += amount;
        });

        // Public vs Private landlord breakdown
        let publicLandlordDisputes = 0;
        let privateLandlordDisputes = 0;
        let publicLandlordCount = 0;
        let privateLandlordCount = 0;

        try {
            const fs = await import('fs');
            const path = await import('path');
            const ahbPath = path.join(process.cwd(), 'public', 'ahb-register.json');
            const ahbRaw = fs.readFileSync(ahbPath, 'utf8');
            const ahbNames = JSON.parse(ahbRaw);

            const AHB_KEYWORDS = [
                'housing', 'simon', 'respond', 'oaklee', 'tuath', 'cluid', 'novas',
                'cooperative housing', 'focus housing', 'iveagh', 'fold housing', 'circle voluntary',
                'sophia housing', 'apex housing', 'clanmil', 'cena', 'cabrhu', 'wheelchair',
                'cabhr', 'cill dara', 'shelter', 'homeless', 'steer housing',
            ];

            function normalizeAhb(name) {
                return (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    .replace(/\bclg\b/g, '').replace(/\blimited\b/g, '').replace(/\bltd\.?\b/g, '')
                    .replace(/\bdac\b/g, '').replace(/\bplc\b/g, '').replace(/\buc\b/g, '')
                    .replace(/\bco-operative\b/g, 'cooperative').replace(/\bco-op\b/g, 'cooperative')
                    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
                    .replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
            }

            const normalizedAhb = ahbNames.map(n => normalizeAhb(n));

            // Get top 25 landlords by dispute count
            const { data: topLandlordsList } = await supabase.from('parties')
                .select('name, total_disputes').eq('party_type', 'Landlord').gt('total_disputes', 0)
                .order('total_disputes', { ascending: false }).limit(25);
            const allLandlords = topLandlordsList || [];

            for (const landlord of allLandlords) {
                const norm = normalizeAhb(landlord.name);
                const ahbMatch = normalizedAhb.some(ahb => {
                    if (ahb.length < 6 || norm.length < 6) return false;
                    return norm.includes(ahb) || ahb.includes(norm);
                });
                const hasKeyword = AHB_KEYWORDS.some(kw => norm.includes(kw));

                if (ahbMatch && hasKeyword) {
                    publicLandlordCount++;
                    publicLandlordDisputes += landlord.total_disputes || 0;
                } else {
                    privateLandlordCount++;
                    privateLandlordDisputes += landlord.total_disputes || 0;
                }
            }
        } catch (ahbErr) {
            console.warn('AHB matching failed:', ahbErr.message);
        }

        // Enforcement order counts
        const { count: totalEnforcementOrders } = await supabase
            .from('enforcement_orders')
            .select('*', { count: 'exact', head: true });

        const { count: enforcementAiProcessed } = await supabase
            .from('enforcement_orders')
            .select('*', { count: 'exact', head: true })
            .not('ai_processed_at', 'is', null);

        // Enforcement orders by subject
        const { data: enforcementBySubject } = await supabase
            .from('enforcement_orders')
            .select('subject')
            .not('subject', 'is', null);

        const subjectCounts = {};
        (enforcementBySubject || []).forEach(e => {
            const s = e.subject || 'Unknown';
            subjectCounts[s] = (subjectCounts[s] || 0) + 1;
        });

        // Latest enforcement scrape job
        const { data: latestEnforcementJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('source_type', 'enforcement')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return Response.json({
            total_disputes: totalDisputes || 0,
            total_parties: totalParties || 0,
            repeat_offenders: repeatOffenders || 0,
            ai_processed: aiProcessed || 0,
            top_landlords: topLandlords || [],
            top_tenants: topTenants || [],
            latest_job: latestJob,
            disputes_by_year: yearCounts,
            total_awards_to_landlords: totalAwardsToLandlords,
            total_awards_to_tenants: totalAwardsToTenants,
            landlord_type: {
                public_count: publicLandlordCount,
                private_count: privateLandlordCount,
                public_disputes: publicLandlordDisputes,
                private_disputes: privateLandlordDisputes,
            },
            enforcement: {
                total: totalEnforcementOrders || 0,
                ai_processed: enforcementAiProcessed || 0,
                by_subject: subjectCounts,
                latest_job: latestEnforcementJob || null,
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
