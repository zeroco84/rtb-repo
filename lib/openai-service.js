/**
 * OpenAI Service for RTB Dispute PDF Analysis
 * Downloads PDFs, extracts text, and uses GPT-4o-mini to analyse content
 */

import OpenAI from 'openai';
import { createServiceClient } from './supabase.js';

const REQUEST_TIMEOUT = 30000;

/**
 * Get the OpenAI API key from admin_settings
 */
async function getApiKey() {
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'openai_api_key')
        .single();

    return data?.value || null;
}

/**
 * Get the model name from admin_settings
 */
async function getModel() {
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'openai_model')
        .single();

    return data?.value || 'gpt-4o-mini';
}

/**
 * Download a PDF and extract its text content
 */
async function extractPdfText(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`PDF download failed: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Dynamic import to avoid ESM/CJS bundling issues
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(buffer);
        return data.text;
    } catch (error) {
        clearTimeout(timeoutId);
        throw new Error(`PDF extraction failed: ${error.message}`);
    }
}

/**
 * Analyse dispute text using GPT-4o-mini
 */
async function analyseWithAI(apiKey, model, pdfText, disputeInfo) {
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are an expert legal analyst specialising in Irish residential tenancy disputes. 
You analyse RTB (Residential Tenancies Board) dispute determinations and extract key information.
Always respond in valid JSON format only, with no additional text.`;

    const userPrompt = `Analyse this RTB dispute determination and extract the following information.
Return a JSON object with these exact keys:

- "summary": A concise 2-3 sentence summary of the dispute and outcome
- "outcome": One of: "Upheld", "Partially Upheld", "Dismissed", "Withdrawn", "Settled", "Other"
- "compensation_amount": The total compensation/damages awarded in euros (number only, 0 if none)
- "cost_order": Any cost order amount in euros (number only, 0 if none)  
- "property_address": The property address if mentioned (null if not found)
- "dispute_type": The category, e.g. "Rent Arrears", "Deposit Retention", "Breach of Obligations", "Invalid Notice of Termination", "Overholding", "Anti-Social Behaviour", "Other"

Dispute reference: ${disputeInfo.dr_no || 'Unknown'}
Parties: ${disputeInfo.heading || 'Unknown'}

=== DISPUTE DETERMINATION TEXT ===
${pdfText.substring(0, 12000)}
=== END ===

Respond with ONLY the JSON object, no markdown formatting or code blocks.`;

    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    return JSON.parse(content);
}

/**
 * Process a single dispute — download PDF, extract text, analyse with AI
 */
export async function processDispute(dispute) {
    const apiKey = await getApiKey();
    if (!apiKey || apiKey === '' || apiKey.startsWith('••')) {
        throw new Error('OpenAI API key not configured. Set it in Admin → Settings.');
    }

    const model = await getModel();

    // Find the first valid PDF URL
    const pdfUrls = dispute.pdf_urls || [];
    if (pdfUrls.length === 0) {
        throw new Error('No PDF URLs available for this dispute');
    }

    // Try each PDF URL until one works
    let pdfText = null;
    for (const pdf of pdfUrls) {
        try {
            pdfText = await extractPdfText(pdf.url);
            if (pdfText && pdfText.trim().length > 100) break;
        } catch (err) {
            console.warn(`[AI] Failed to extract PDF from ${pdf.url}:`, err.message);
        }
    }

    if (!pdfText || pdfText.trim().length < 100) {
        throw new Error('Could not extract readable text from any PDF');
    }

    // Analyse with AI
    const result = await analyseWithAI(apiKey, model, pdfText, dispute);

    return {
        ai_summary: result.summary || null,
        ai_outcome: result.outcome || null,
        ai_compensation_amount: parseFloat(result.compensation_amount) || 0,
        ai_cost_order: parseFloat(result.cost_order) || 0,
        ai_property_address: result.property_address || null,
        ai_dispute_type: result.dispute_type || null,
        ai_processed_at: new Date().toISOString(),
        ai_error: null,
    };
}

/**
 * Process a batch of unprocessed disputes
 * Returns counts of processed/failed/skipped
 */
export async function processUnanalysedDisputes(limit = 10, onProgress) {
    const supabase = createServiceClient();

    // Check API key first
    const apiKey = await getApiKey();
    if (!apiKey || apiKey === '') {
        return { processed: 0, failed: 0, skipped: 0, error: 'OpenAI API key not configured' };
    }

    // Fetch disputes that haven't been AI-processed and have PDFs
    const { data: disputes, error } = await supabase
        .from('disputes')
        .select('id, dr_no, heading, pdf_urls')
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) throw error;
    if (!disputes || disputes.length === 0) {
        return { processed: 0, failed: 0, skipped: 0, total: 0 };
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < disputes.length; i++) {
        const dispute = disputes[i];

        // Skip if no PDFs
        if (!dispute.pdf_urls || dispute.pdf_urls.length === 0) {
            skipped++;
            await supabase
                .from('disputes')
                .update({ ai_processed_at: new Date().toISOString(), ai_error: 'No PDF available' })
                .eq('id', dispute.id);
            continue;
        }

        try {
            const result = await processDispute(dispute);

            await supabase
                .from('disputes')
                .update(result)
                .eq('id', dispute.id);

            processed++;
            console.log(`[AI] ✓ ${dispute.dr_no} — ${result.ai_outcome} — €${result.ai_compensation_amount}`);
        } catch (err) {
            failed++;
            console.error(`[AI] ✗ ${dispute.dr_no}:`, err.message);

            await supabase
                .from('disputes')
                .update({
                    ai_processed_at: new Date().toISOString(),
                    ai_error: err.message,
                })
                .eq('id', dispute.id);
        }

        if (onProgress) {
            onProgress({ current: i + 1, total: disputes.length, processed, failed, skipped });
        }

        // Rate limit — 1.5s between requests to avoid OpenAI rate limits
        if (i < disputes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    return { processed, failed, skipped, total: disputes.length };
}
