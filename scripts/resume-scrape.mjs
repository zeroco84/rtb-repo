#!/usr/bin/env node
/**
 * Resume scraping from the ACTUAL last page we successfully scraped.
 * Dynamically determines start page instead of hardcoding.
 */

import { scrapeAllDisputes } from '../lib/rtb-scraper.js';
import { createClient } from '@supabase/supabase-js';
import { normalizeName } from '../lib/normalize-name.js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const { data: links } = await supabase
        .from('dispute_parties')
        .select('role, disputes(dispute_date, dr_no)')
        .eq('party_id', partyId);
    if (!links) return;

    const seen = new Set();
    let totalCases = 0, asApplicant = 0, asRespondent = 0;
    for (const link of links) {
        const d = link.disputes;
        if (!d) continue;
        const primaryDR = (d.dr_no || '').split(/\s+/)[0] || 'unknown';
        const caseKey = (d.dispute_date || 'no-date') + '|' + primaryDR;
        if (!seen.has(caseKey)) { seen.add(caseKey); totalCases++; }
        const roleKey = caseKey + '|' + link.role;
        if (link.role === 'Applicant' && !seen.has(roleKey)) { seen.add(roleKey); asApplicant++; }
        if (link.role === 'Respondent' && !seen.has(roleKey)) { seen.add(roleKey); asRespondent++; }
    }

    await supabase.from('parties').update({
        total_disputes: totalCases,
        total_as_applicant: asApplicant,
        total_as_respondent: asRespondent,
    }).eq('id', partyId);
}

async function main() {
    // Find the highest source_page we have
    const { data: maxPage } = await supabase
        .from('disputes')
        .select('source_page')
        .not('source_page', 'is', null)
        .order('source_page', { ascending: false })
        .limit(1)
        .single();

    // Also check: how many pages have at least one record?
    const { count: totalInDB } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true });

    const highestPage = maxPage?.source_page || 0;
    // Start from page 1 if we have less than expected, otherwise resume
    const expectedTotal = 2090 * 10;
    const startPage = totalInDB >= expectedTotal ? highestPage + 1 : 1;

    console.log('=== RTB Scraper (Smart Resume) ===');
    console.log('Total in DB:', totalInDB);
    console.log('Highest source_page:', highestPage);
    console.log('Starting from page:', startPage);
    console.log('');

    if (startPage > 2090) {
        console.log('All pages already scraped!');
        return;
    }

    let totalRecords = 0, newRecords = 0, updatedRecords = 0;
    let currentPage = startPage;

    try {
        for await (const batch of scrapeAllDisputes({ startPage })) {
            currentPage = batch.page;

            for (const record of batch.results) {
                totalRecords++;

                try {
                    if (record.dr_no) {
                        const { data: existing } = await supabase
                            .from('disputes').select('id').eq('dr_no', record.dr_no).single();

                        if (existing) {
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

            console.log('  Page ' + batch.page + '/' + batch.totalPages + ' — ' + newRecords + ' new, ' + updatedRecords + ' updated (' + totalRecords + ' total)');
        }
    } catch (err) {
        console.error('\n[Scrape] Fatal error:', err.message);
    }

    console.log('\n=== SCRAPE COMPLETE ===');
    console.log('Pages: ' + startPage + ' to ' + currentPage);
    console.log('New records: ' + newRecords);
    console.log('Updated records: ' + updatedRecords);
    console.log('Total processed: ' + totalRecords);

    const { count } = await supabase.from('disputes').select('*', { count: 'exact', head: true });
    console.log('Total disputes in DB: ' + count);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
