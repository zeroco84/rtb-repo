/**
 * API Route: /api/scrape/enforcement
 * Triggers scraping of RTB Court Decisions & Enforcement Orders
 * GET  - Returns current enforcement scrape job status
 * POST - Starts a new enforcement scrape job
 * DELETE - Cancels a running enforcement scrape job
 */

import { createServiceClient } from '@/lib/supabase';
import { scrapeAllEnforcementOrders } from '@/lib/enforcement-scraper';
import { requireAdmin } from '@/lib/admin-auth';
import { processUnanalysedEnforcementOrders } from '@/lib/openai-service';
import { normalizeName } from '@/lib/normalize-name';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServiceClient();

        const { data: job } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('source_type', 'enforcement')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const { count } = await supabase
            .from('enforcement_orders')
            .select('*', { count: 'exact', head: true });

        return Response.json({
            latest_job: job,
            total_enforcement_orders: count || 0,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const supabase = createServiceClient();

        // Check if already running
        const { data: runningJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('status', 'running')
            .eq('source_type', 'enforcement')
            .single();

        if (runningJob) {
            // Check if the job is stale (no progress in 2+ minutes)
            const updatedAt = new Date(runningJob.updated_at || runningJob.created_at);
            const minutesSinceUpdate = (Date.now() - updatedAt.getTime()) / 1000 / 60;

            if (minutesSinceUpdate > 2 && runningJob.current_page > 0) {
                // Resume from where it stopped
                const resumePage = (runningJob.current_page || 0) + 1;
                console.log(`[EnforcementScrape] Resuming stale job ${runningJob.id} from page ${resumePage} (stale for ${Math.round(minutesSinceUpdate)}min)`);

                // Process this chunk synchronously, then self-retrigger
                const result = await runEnforcementChunk(supabase, runningJob.id, resumePage);

                // Self-retrigger next chunk if more remain
                if (result.morePages) {
                    selfRetrigger(request);
                }

                return Response.json({
                    message: `Resumed from page ${resumePage}`,
                    job: runningJob,
                    resumed: true,
                    ...result,
                });
            }

            return Response.json({
                error: 'An enforcement scrape job is already running',
                job: runningJob,
            }, { status: 409 });
        }

        // Create a new scrape job
        const { data: job, error: jobError } = await supabase
            .from('scrape_jobs')
            .insert({
                status: 'running',
                source_type: 'enforcement',
                started_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (jobError) throw jobError;

        // Process first chunk synchronously
        const result = await runEnforcementChunk(supabase, job.id, 1);

        // Self-retrigger next chunk if more remain
        if (result.morePages) {
            selfRetrigger(request);
        }

        return Response.json({
            message: result.morePages
                ? `Chunk processed (page ${result.lastPage}/${result.totalPages}), next chunk queued`
                : 'Enforcement orders scrape completed',
            job: { ...job, ...result },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Fire-and-forget self-retrigger via HTTP.
 * Uses admin cookie forwarding so auth works.
 */
function selfRetrigger(originalRequest) {
    const url = new URL(originalRequest.url);
    const selfUrl = url.origin + '/api/scrape/enforcement';

    // Forward the cookie header for admin auth
    const cookieHeader = originalRequest.headers.get('cookie') || '';

    setTimeout(() => {
        fetch(selfUrl, {
            method: 'POST',
            headers: { 'Cookie': cookieHeader },
        }).catch(err => {
            console.error('[EnforcementScrape] Self-retrigger failed:', err.message);
        });
    }, 2000); // 2s delay between chunks
}

export async function DELETE() {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const supabase = createServiceClient();

        const { data: runningJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('status', 'running')
            .eq('source_type', 'enforcement')
            .single();

        if (!runningJob) {
            return Response.json({ error: 'No running enforcement scrape job found' }, { status: 404 });
        }

        await supabase
            .from('scrape_jobs')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            .eq('id', runningJob.id);

        return Response.json({
            message: 'Enforcement scrape job cancelled',
            job: { ...runningJob, status: 'cancelled' },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Upsert a party by normalized name — reuses the same parties table as disputes
 */
async function upsertParty(supabase, name) {
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
        .insert({
            name,
            normalized_name: normalized,
            party_type: 'Unknown',
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') {
            const { data: retry } = await supabase
                .from('parties')
                .select('id')
                .eq('normalized_name', normalized)
                .single();
            return retry?.id || null;
        }
        console.error('[EnforcementScrape] Error upserting party:', error.message);
        return null;
    }

    return inserted?.id;
}

/**
 * Update party counts — counts BOTH disputes and enforcement orders
 */
async function updatePartyCounts(supabase, partyId) {
    if (!partyId) return;

    const { data: disputeLinks } = await supabase
        .from('dispute_parties')
        .select('role, disputes(dispute_date, dr_no)')
        .eq('party_id', partyId);

    const { data: enforcementLinks } = await supabase
        .from('enforcement_parties')
        .select('role, enforcement_orders(order_date, court_ref_no)')
        .eq('party_id', partyId);

    const seen = new Set();
    let totalCases = 0;
    let asApplicant = 0;
    let asRespondent = 0;

    for (const link of (disputeLinks || [])) {
        const d = link.disputes;
        if (!d) continue;
        const primaryDR = (d.dr_no || '').split(/\s+/)[0] || 'unknown';
        const caseKey = 'D|' + (d.dispute_date || 'no-date') + '|' + primaryDR;
        if (!seen.has(caseKey)) { seen.add(caseKey); totalCases++; }
        const roleKey = caseKey + '|' + link.role;
        if (link.role === 'Applicant' && !seen.has(roleKey)) { seen.add(roleKey); asApplicant++; }
        if (link.role === 'Respondent' && !seen.has(roleKey)) { seen.add(roleKey); asRespondent++; }
    }

    let enforcementCount = 0;
    for (const link of (enforcementLinks || [])) {
        const eo = link.enforcement_orders;
        if (!eo) continue;
        const caseKey = 'E|' + (eo.court_ref_no || eo.order_date || 'unknown');
        if (!seen.has(caseKey)) { seen.add(caseKey); totalCases++; enforcementCount++; }
        const roleKey = caseKey + '|' + link.role;
        if (link.role === 'Applicant' && !seen.has(roleKey)) { seen.add(roleKey); asApplicant++; }
        if (link.role === 'Respondent' && !seen.has(roleKey)) { seen.add(roleKey); asRespondent++; }
    }

    await supabase
        .from('parties')
        .update({
            total_disputes: totalCases,
            total_as_applicant: asApplicant,
            total_as_respondent: asRespondent,
            total_enforcement_orders: enforcementCount,
        })
        .eq('id', partyId);
}


const PAGES_PER_CHUNK = 5; // Process 5 pages per request (~15-20 seconds)

async function runEnforcementChunk(supabase, jobId, startPage) {
    let totalRecords = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    // Fetch existing counts if resuming
    if (startPage > 1) {
        const { data: existingJob } = await supabase
            .from('scrape_jobs')
            .select('total_records, new_records, updated_records')
            .eq('id', jobId)
            .single();
        if (existingJob) {
            totalRecords = existingJob.total_records || 0;
            newRecords = existingJob.new_records || 0;
            updatedRecords = existingJob.updated_records || 0;
        }
    }

    const endPage = startPage + PAGES_PER_CHUNK - 1;
    console.log(`[EnforcementScrape] Chunk: pages ${startPage}–${endPage}`);

    let lastPageProcessed = startPage;
    let totalPages = null;

    try {
        for await (const batch of scrapeAllEnforcementOrders({ startPage, endPage })) {
            // Check if cancelled
            const { data: jobCheck } = await supabase
                .from('scrape_jobs')
                .select('status')
                .eq('id', jobId)
                .single();

            if (jobCheck?.status === 'cancelled') {
                console.log(`[EnforcementScrape] Job ${jobId} was cancelled`);
                return { morePages: false, lastPage: lastPageProcessed, totalPages };
            }

            totalPages = batch.totalPages;
            lastPageProcessed = batch.page;

            // Update progress
            await supabase
                .from('scrape_jobs')
                .update({
                    total_pages: batch.totalPages,
                    current_page: batch.page,
                })
                .eq('id', jobId);

            for (const record of batch.results) {
                totalRecords++;

                try {
                    // Check if already exists by court_ref_no
                    if (record.court_ref_no) {
                        const { data: existing } = await supabase
                            .from('enforcement_orders')
                            .select('id')
                            .eq('court_ref_no', record.court_ref_no)
                            .single();

                        if (existing) {
                            await supabase
                                .from('enforcement_orders')
                                .update({
                                    heading: record.heading,
                                    prtb_no: record.prtb_no,
                                    order_date: record.order_date,
                                    subject: record.subject,
                                    pdf_url: record.pdf_url,
                                    pdf_label: record.pdf_label,
                                    applicant_name: record.applicant_name,
                                    respondent_name: record.respondent_name,
                                    raw_html: record.raw_html,
                                    source_page: batch.page,
                                })
                                .eq('id', existing.id);

                            updatedRecords++;
                            continue;
                        }
                    }

                    // Try to link to existing dispute by PRTB/DR number
                    let linkedDisputeId = null;
                    if (record.prtb_no) {
                        const { data: linkedDispute } = await supabase
                            .from('disputes')
                            .select('id')
                            .eq('dr_no', record.prtb_no)
                            .single();

                        if (linkedDispute) {
                            linkedDisputeId = linkedDispute.id;
                        }
                    }

                    // Insert new enforcement order
                    const { data: insertedOrder, error: insertError } = await supabase
                        .from('enforcement_orders')
                        .insert({
                            heading: record.heading,
                            court_ref_no: record.court_ref_no,
                            prtb_no: record.prtb_no,
                            order_date: record.order_date,
                            subject: record.subject,
                            pdf_url: record.pdf_url,
                            pdf_label: record.pdf_label,
                            applicant_name: record.applicant_name,
                            respondent_name: record.respondent_name,
                            linked_dispute_id: linkedDisputeId,
                            raw_html: record.raw_html,
                            source_page: batch.page,
                        })
                        .select('id')
                        .single();

                    if (insertError) {
                        if (insertError.code === '23505') {
                            updatedRecords++;
                        } else {
                            console.error('[EnforcementScrape] Insert error:', insertError.message);
                        }
                        continue;
                    }

                    newRecords++;

                    // Create party records and link them to this enforcement order
                    if (insertedOrder) {
                        const applicantId = await upsertParty(supabase, record.applicant_name);
                        const respondentId = await upsertParty(supabase, record.respondent_name);

                        if (applicantId) {
                            await supabase.from('enforcement_parties').upsert({
                                enforcement_order_id: insertedOrder.id,
                                party_id: applicantId,
                                role: 'Applicant',
                            }, { onConflict: 'enforcement_order_id,party_id,role' });
                            await updatePartyCounts(supabase, applicantId);
                        }

                        if (respondentId) {
                            await supabase.from('enforcement_parties').upsert({
                                enforcement_order_id: insertedOrder.id,
                                party_id: respondentId,
                                role: 'Respondent',
                            }, { onConflict: 'enforcement_order_id,party_id,role' });
                            await updatePartyCounts(supabase, respondentId);
                        }
                    }
                } catch (recordError) {
                    console.error('[EnforcementScrape] Error processing record:', recordError.message);
                }
            }

            // Update counts
            await supabase
                .from('scrape_jobs')
                .update({
                    total_records: totalRecords,
                    new_records: newRecords,
                    updated_records: updatedRecords,
                })
                .eq('id', jobId);
        }

        // Check if more pages remain
        const morePages = totalPages && lastPageProcessed < totalPages;

        if (!morePages) {
            // All done — mark complete
            await supabase
                .from('scrape_jobs')
                .update({
                    status: 'completed',
                    total_records: totalRecords,
                    new_records: newRecords,
                    updated_records: updatedRecords,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', jobId);

            console.log(`[EnforcementScrape] Complete: ${newRecords} new, ${updatedRecords} updated, ${totalRecords} total`);

            // Auto-trigger AI processing
            if (newRecords > 0) {
                const { data: aiSetting } = await supabase
                    .from('admin_settings')
                    .select('value')
                    .eq('key', 'ai_auto_process')
                    .single();

                if (aiSetting?.value !== 'false') {
                    console.log('[EnforcementScrape] Starting automatic AI processing...');
                    try {
                        const aiResult = await processUnanalysedEnforcementOrders(20);
                        console.log(`[AI-EO] Auto-process: ${aiResult.processed} analysed, ${aiResult.failed} failed`);
                    } catch (aiError) {
                        console.error('[AI-EO] Auto-process error:', aiError.message);
                    }
                }
            }
        } else {
            console.log(`[EnforcementScrape] Chunk done (page ${lastPageProcessed}/${totalPages}). Will self-retrigger.`);
        }

        return { morePages, lastPage: lastPageProcessed, totalPages, totalRecords, newRecords, updatedRecords };
    } catch (error) {
        console.error('[EnforcementScrape] Chunk failed:', error.message);
        await supabase
            .from('scrape_jobs')
            .update({
                status: 'failed',
                error_message: error.message,
                total_records: totalRecords,
                new_records: newRecords,
                updated_records: updatedRecords,
                completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);
        return { morePages: false, lastPage: lastPageProcessed, totalPages, error: error.message };
    }
}
