/**
 * API Route: /api/cron
 * Daily scheduled sync endpoint
 * This endpoint should be called by an external CRON service (e.g., GitHub Actions, cron-job.org)
 * 
 * Protected by a simple secret key in the Authorization header
 */

import { createServiceClient } from '@/lib/supabase';
import { scrapeAllDisputes } from '@/lib/rtb-scraper';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function upsertParty(supabase, name, partyType) {
    if (!name) return null;
    const normalized = normalizeName(name);
    if (!normalized) return null;

    const { data: existing } = await supabase
        .from('parties')
        .select('id')
        .eq('normalized_name', normalized)
        .single();

    if (existing) return existing.id;

    const { data: inserted, error } = await supabase
        .from('parties')
        .insert({ name, normalized_name: normalized, party_type: partyType || 'Unknown' })
        .select('id')
        .single();

    if (error) return null;
    return inserted?.id;
}

async function updatePartyCounts(supabase, partyId) {
    if (!partyId) return;
    const { data: links } = await supabase
        .from('dispute_parties')
        .select('role, disputes(dispute_date, dr_no)')
        .eq('party_id', partyId);

    if (!links) return;

    // Deduplicate: same date + overlapping DR number = one case
    const seen = new Set();
    let totalCases = 0;
    let asApplicant = 0;
    let asRespondent = 0;

    for (const link of links) {
        const d = link.disputes;
        if (!d) continue;
        // Create a case key from date + first DR number
        const primaryDR = (d.dr_no || '').split(/\s+/)[0] || 'unknown';
        const caseKey = (d.dispute_date || 'no-date') + '|' + primaryDR;

        if (!seen.has(caseKey)) {
            seen.add(caseKey);
            totalCases++;
        }
        // Role counts also deduplicated per case+role
        const roleKey = caseKey + '|' + link.role;
        if (link.role === 'Applicant' && !seen.has(roleKey)) {
            seen.add(roleKey);
            asApplicant++;
        }
        if (link.role === 'Respondent' && !seen.has(roleKey)) {
            seen.add(roleKey);
            asRespondent++;
        }
    }

    await supabase
        .from('parties')
        .update({
            total_disputes: totalCases,
            total_as_applicant: asApplicant,
            total_as_respondent: asRespondent,
        })
        .eq('id', partyId);
}

export async function GET(request) {
    // Simple auth check
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check for running jobs
    const { data: runningJob } = await supabase
        .from('scrape_jobs')
        .select('id')
        .eq('status', 'running')
        .single();

    if (runningJob) {
        return Response.json({ message: 'A sync is already running', skip: true });
    }

    // Create job
    const { data: job } = await supabase
        .from('scrape_jobs')
        .insert({ status: 'running', started_at: new Date().toISOString() })
        .select()
        .single();

    let totalRecords = 0, newRecords = 0, updatedRecords = 0;

    try {
        for await (const batch of scrapeAllDisputes()) {
            await supabase.from('scrape_jobs').update({
                total_pages: batch.totalPages,
                current_page: batch.page,
            }).eq('id', job.id);

            for (const record of batch.results) {
                totalRecords++;
                try {
                    if (record.dr_no) {
                        const { data: existing } = await supabase
                            .from('disputes')
                            .select('id')
                            .eq('dr_no', record.dr_no)
                            .single();

                        if (existing) {
                            updatedRecords++;
                            continue;
                        }
                    }

                    const { data: dispute } = await supabase
                        .from('disputes')
                        .insert({
                            heading: record.heading,
                            dr_no: record.dr_no,
                            tr_no: record.tr_no,
                            dispute_date: record.dispute_date,
                            applicant_name: record.applicant_name,
                            applicant_role: record.applicant_role,
                            respondent_name: record.respondent_name,
                            respondent_role: record.respondent_role,
                            pdf_urls: record.pdf_urls,
                            raw_html: record.raw_html,
                            source_page: batch.page,
                        })
                        .select('id')
                        .single();

                    if (dispute) {
                        newRecords++;
                        const applicantId = await upsertParty(supabase, record.applicant_name, record.applicant_role);
                        const respondentId = await upsertParty(supabase, record.respondent_name, record.respondent_role);

                        if (applicantId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id, party_id: applicantId,
                                role: 'Applicant', party_type: record.applicant_role,
                            }, { onConflict: 'dispute_id,party_id,role' });
                            await updatePartyCounts(supabase, applicantId);
                        }
                        if (respondentId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id, party_id: respondentId,
                                role: 'Respondent', party_type: record.respondent_role,
                            }, { onConflict: 'dispute_id,party_id,role' });
                            await updatePartyCounts(supabase, respondentId);
                        }
                    }
                } catch (e) {
                    // Skip individual record errors
                }
            }

            await supabase.from('scrape_jobs').update({
                total_records: totalRecords,
                new_records: newRecords,
                updated_records: updatedRecords,
            }).eq('id', job.id);
        }

        await supabase.from('scrape_jobs').update({
            status: 'completed', total_records: totalRecords,
            new_records: newRecords, updated_records: updatedRecords,
            completed_at: new Date().toISOString(),
        }).eq('id', job.id);

        return Response.json({
            success: true,
            total_records: totalRecords,
            new_records: newRecords,
            updated_records: updatedRecords,
        });
    } catch (error) {
        await supabase.from('scrape_jobs').update({
            status: 'failed', error_message: error.message,
            completed_at: new Date().toISOString(),
        }).eq('id', job.id);

        return Response.json({ error: error.message }, { status: 500 });
    }
}
