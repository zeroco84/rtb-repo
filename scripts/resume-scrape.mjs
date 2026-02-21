#!/usr/bin/env node
/**
 * One-off script: Resume scraping RTB disputes from a specific page
 * Runs as a standalone process, unaffected by dev server restarts.
 * 
 * Usage: node --env-file=.env.local scripts/resume-scrape.mjs
 */

import { scrapeAllDisputes } from '../lib/rtb-scraper.js';
import { createClient } from '@supabase/supabase-js';

const START_PAGE = 625;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function upsertParty(name, partyType) {
    if (!name) return null;
    const normalized = normalizeName(name);
    if (!normalized) return null;

    const { data: existing } = await supabase
        .from('parties').select('id').eq('normalized_name', normalized).single();
    if (existing) return existing.id;

    const { data: inserted, error } = await supabase
        .from('parties')
        .insert({ name, normalized_name: normalized, party_type: partyType || 'Unknown' })
        .select('id').single();
    if (error) { console.error('[Scrape] Party upsert error:', error.message); return null; }
    return inserted?.id;
}

async function updatePartyCounts(partyId) {
    if (!partyId) return;
    const { data: links } = await supabase.from('dispute_parties').select('role').eq('party_id', partyId);
    if (!links) return;
    await supabase.from('parties').update({
        total_disputes: links.length,
        total_as_applicant: links.filter(l => l.role === 'Applicant').length,
        total_as_respondent: links.filter(l => l.role === 'Respondent').length,
    }).eq('id', partyId);
}

async function main() {
    console.log(`=== RTB Scrape: Resuming from page ${START_PAGE} ===\n`);

    let totalRecords = 0;
    let newRecords = 0;
    let updatedRecords = 0;
    let currentPage = START_PAGE;

    try {
        for await (const batch of scrapeAllDisputes({ startPage: START_PAGE })) {
            currentPage = batch.page;

            for (const record of batch.results) {
                totalRecords++;

                try {
                    if (record.dr_no) {
                        const { data: existing } = await supabase
                            .from('disputes').select('id').eq('dr_no', record.dr_no).single();

                        if (existing) {
                            await supabase.from('disputes').update({
                                heading: record.heading, tr_no: record.tr_no,
                                dispute_date: record.dispute_date,
                                applicant_name: record.applicant_name, applicant_role: record.applicant_role,
                                respondent_name: record.respondent_name, respondent_role: record.respondent_role,
                                pdf_urls: record.pdf_urls, raw_html: record.raw_html,
                            }).eq('id', existing.id);
                            updatedRecords++;
                            continue;
                        }
                    }

                    const { data: dispute, error: insertError } = await supabase
                        .from('disputes')
                        .insert({
                            heading: record.heading, dr_no: record.dr_no, tr_no: record.tr_no,
                            dispute_date: record.dispute_date,
                            applicant_name: record.applicant_name, applicant_role: record.applicant_role,
                            respondent_name: record.respondent_name, respondent_role: record.respondent_role,
                            pdf_urls: record.pdf_urls, raw_html: record.raw_html,
                            source_page: batch.page,
                        })
                        .select('id').single();

                    if (insertError) {
                        if (insertError.code === '23505') updatedRecords++;
                        else console.error('[Scrape] Insert error:', insertError.message);
                        continue;
                    }

                    newRecords++;

                    if (dispute) {
                        const appId = await upsertParty(record.applicant_name, record.applicant_role);
                        const resId = await upsertParty(record.respondent_name, record.respondent_role);

                        if (appId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id, party_id: appId,
                                role: 'Applicant', party_type: record.applicant_role,
                            }, { onConflict: 'dispute_id,party_id,role' });
                            await updatePartyCounts(appId);
                        }
                        if (resId) {
                            await supabase.from('dispute_parties').upsert({
                                dispute_id: dispute.id, party_id: resId,
                                role: 'Respondent', party_type: record.respondent_role,
                            }, { onConflict: 'dispute_id,party_id,role' });
                            await updatePartyCounts(resId);
                        }
                    }
                } catch (recErr) {
                    console.error('[Scrape] Record error:', recErr.message);
                }
            }

            console.log(`  Page ${batch.page}/${batch.totalPages} — ${newRecords} new, ${updatedRecords} updated (${totalRecords} total)`);
        }
    } catch (err) {
        console.error('\n[Scrape] Fatal error:', err.message);
    }

    console.log('\n=== SCRAPE COMPLETE ===');
    console.log(`Pages: ${START_PAGE} to ${currentPage}`);
    console.log(`New records: ${newRecords}`);
    console.log(`Updated records: ${updatedRecords}`);
    console.log(`Total processed: ${totalRecords}`);

    const { count } = await supabase.from('disputes').select('*', { count: 'exact', head: true });
    console.log(`Total disputes in DB: ${count}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
