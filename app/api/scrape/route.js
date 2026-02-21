/**
 * API Route: /api/scrape
 * Triggers a full scrape of RTB dispute records
 * GET - Returns current scrape job status
 * POST - Starts a new scrape job
 * DELETE - Cancels a running scrape job
 */

import { createServiceClient } from '@/lib/supabase';
import { scrapeAllDisputes, parseHeading } from '@/lib/rtb-scraper';
import { requireAdmin } from '@/lib/admin-auth';
import { processUnanalysedDisputes } from '@/lib/openai-service';

export const maxDuration = 300; // 5 minutes max for edge/serverless
export const dynamic = 'force-dynamic';

/**
import { normalizeName } from '@/lib/normalize-name';

/**
 * Upsert a party record and return its ID
 */
async function upsertParty(supabase, name, partyType) {
    if (!name) return null;

    const normalized = normalizeName(name);
    if (!normalized) return null;

    // Try to find existing
    const { data: existing } = await supabase
        .from('parties')
        .select('id')
        .eq('normalized_name', normalized)
        .single();

    if (existing) {
        return existing.id;
    }

    // Insert new
    const { data: inserted, error } = await supabase
        .from('parties')
        .insert({
            name,
            normalized_name: normalized,
            party_type: partyType || 'Unknown',
        })
        .select('id')
        .single();

    if (error) {
        console.error('[Scrape] Error upserting party:', error.message);
        return null;
    }

    return inserted?.id;
}

/**
 * Update party dispute counts
 */
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
        const primaryDR = (d.dr_no || '').split(/\s+/)[0] || 'unknown';
        const caseKey = (d.dispute_date || 'no-date') + '|' + primaryDR;

        if (!seen.has(caseKey)) {
            seen.add(caseKey);
            totalCases++;
        }
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

export async function GET() {
    try {
        const supabase = createServiceClient();

        // Get the latest scrape job
        const { data: job } = await supabase
            .from('scrape_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Get total dispute count
        const { count } = await supabase
            .from('disputes')
            .select('*', { count: 'exact', head: true });

        return Response.json({
            latest_job: job,
            total_disputes: count || 0,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function POST() {
    // Require admin authentication to start scrape
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const supabase = createServiceClient();

        // Check if a scrape is already running
        const { data: runningJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('status', 'running')
            .single();

        if (runningJob) {
            return Response.json({
                error: 'A scrape job is already running',
                job: runningJob,
            }, { status: 409 });
        }

        // Create a new scrape job
        const { data: job, error: jobError } = await supabase
            .from('scrape_jobs')
            .insert({
                status: 'running',
                started_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (jobError) throw jobError;

        // Start scraping in background (don't await)
        runScrape(supabase, job.id).catch(err => {
            console.error('[Scrape] Background scrape failed:', err);
        });

        return Response.json({
            message: 'Scrape job started',
            job,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE() {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const supabase = createServiceClient();

        // Find and cancel the running job
        const { data: runningJob } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('status', 'running')
            .single();

        if (!runningJob) {
            return Response.json({ error: 'No running scrape job found' }, { status: 404 });
        }

        // Mark as cancelled — the runScrape loop checks this between pages
        await supabase
            .from('scrape_jobs')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            .eq('id', runningJob.id);

        return Response.json({
            message: 'Scrape job cancelled',
            job: { ...runningJob, status: 'cancelled' },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

const PAGES_PER_CHUNK = 50; // ~2.5 minutes per chunk at 3s/page

async function runScrape(supabase, jobId, resumeFromPage = 1) {
    let totalRecords = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    // Fetch existing counts if resuming
    if (resumeFromPage > 1) {
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

    const endPage = resumeFromPage + PAGES_PER_CHUNK - 1;
    console.log(`[Scrape] Processing chunk: pages ${resumeFromPage} to ${endPage}`);

    try {
        let lastPageProcessed = resumeFromPage;
        let totalPages = null;

        for await (const batch of scrapeAllDisputes({ startPage: resumeFromPage, endPage })) {
            // Check if job was cancelled
            const { data: jobCheck } = await supabase
                .from('scrape_jobs')
                .select('status')
                .eq('id', jobId)
                .single();

            if (jobCheck?.status === 'cancelled') {
                console.log(`[Scrape] Job ${jobId} was cancelled by admin`);
                return; // Exit gracefully — status already set to 'cancelled'
            }

            totalPages = batch.totalPages;

            // Update job progress
            await supabase
                .from('scrape_jobs')
                .update({
                    total_pages: batch.totalPages,
                    current_page: batch.page,
                })
                .eq('id', jobId);

            lastPageProcessed = batch.page;

            // Process each record
            for (const record of batch.results) {
                totalRecords++;

                try {
                    // Check if dispute already exists by DR number
                    if (record.dr_no) {
                        const { data: existing } = await supabase
                            .from('disputes')
                            .select('id')
                            .eq('dr_no', record.dr_no)
                            .single();

                        if (existing) {
                            // Update existing record
                            await supabase
                                .from('disputes')
                                .update({
                                    heading: record.heading,
                                    tr_no: record.tr_no,
                                    dispute_date: record.dispute_date,
                                    applicant_name: record.applicant_name,
                                    applicant_role: record.applicant_role,
                                    respondent_name: record.respondent_name,
                                    respondent_role: record.respondent_role,
                                    pdf_urls: record.pdf_urls,
                                    raw_html: record.raw_html,
                                    source_page: record.page,
                                })
                                .eq('id', existing.id);

                            updatedRecords++;
                            continue;
                        }
                    }

                    // Insert new dispute
                    const { data: dispute, error: insertError } = await supabase
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

                    if (insertError) {
                        // Possibly a duplicate DR number from concurrent inserts
                        if (insertError.code === '23505') {
                            updatedRecords++;
                        } else {
                            console.error('[Scrape] Insert error:', insertError.message);
                        }
                        continue;
                    }

                    newRecords++;

                    // Create party records and link them
                    if (dispute) {
                        const applicantId = await upsertParty(
                            supabase,
                            record.applicant_name,
                            record.applicant_role
                        );
                        const respondentId = await upsertParty(
                            supabase,
                            record.respondent_name,
                            record.respondent_role
                        );

                        if (applicantId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id,
                                party_id: applicantId,
                                role: 'Applicant',
                                party_type: record.applicant_role,
                            }, { onConflict: 'dispute_id,party_id,role' });

                            await updatePartyCounts(supabase, applicantId);
                        }

                        if (respondentId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id,
                                party_id: respondentId,
                                role: 'Respondent',
                                party_type: record.respondent_role,
                            }, { onConflict: 'dispute_id,party_id,role' });

                            await updatePartyCounts(supabase, respondentId);
                        }
                    }
                } catch (recordError) {
                    console.error('[Scrape] Error processing record:', recordError.message);
                }
            }

            // Update counts on job
            await supabase
                .from('scrape_jobs')
                .update({
                    total_records: totalRecords,
                    new_records: newRecords,
                    updated_records: updatedRecords,
                })
                .eq('id', jobId);
        }

        // Check if we've finished all pages or need another chunk
        if (totalPages && lastPageProcessed < totalPages) {
            // More pages to go — chain the next chunk
            const nextPage = lastPageProcessed + 1;
            console.log(`[Scrape] Chunk done (page ${lastPageProcessed}/${totalPages}). Chaining next chunk from page ${nextPage}...`);

            // Small delay between chunks
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Recurse into next chunk
            return runScrape(supabase, jobId, nextPage);
        }

        // All pages complete — mark job done
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

        console.log(`[Scrape] Complete: ${newRecords} new, ${updatedRecords} updated, ${totalRecords} total`);

        // Auto-trigger AI processing on new records (if enabled)
        if (newRecords > 0) {
            const { data: aiSetting } = await supabase
                .from('admin_settings')
                .select('value')
                .eq('key', 'ai_auto_process')
                .single();

            const autoProcess = aiSetting?.value !== 'false'; // default: enabled

            if (autoProcess) {
                console.log('[Scrape] Starting automatic AI processing...');
                try {
                    const aiResult = await processUnanalysedDisputes(20);
                    console.log(`[AI] Auto-process: ${aiResult.processed} analysed, ${aiResult.failed} failed`);
                } catch (aiError) {
                    console.error('[AI] Auto-process error:', aiError.message);
                }
            } else {
                console.log('[Scrape] AI auto-processing is disabled');
            }
        }
    } catch (error) {
        console.error('[Scrape] Job failed:', error.message);
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
    }
}
