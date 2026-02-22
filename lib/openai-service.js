/**
 * AI Service for RTB Dispute PDF Analysis
 * Uses Gemini 2.0 Flash (primary) with OpenAI GPT-4o as secondary reviewer
 * Downloads PDFs and sends directly to Gemini's native PDF processing
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createServiceClient } from './supabase.js';

const REQUEST_TIMEOUT = 30000;
const HIGH_VALUE_THRESHOLD = 20000;

// ============================================
// SETTINGS HELPERS
// ============================================

async function getSetting(key) {
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', key)
        .single();
    return data?.value || null;
}

async function getGeminiApiKey() {
    return getSetting('gemini_api_key');
}

async function getOpenAIApiKey() {
    return getSetting('openai_api_key');
}

// ============================================
// PDF DOWNLOAD
// ============================================

async function downloadPdfAsBase64(url) {
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
        if (buffer.length < 1000) {
            throw new Error('PDF too small, likely an error page');
        }

        return buffer.toString('base64');
    } catch (error) {
        clearTimeout(timeoutId);
        throw new Error(`PDF download failed: ${error.message}`);
    }
}

// ============================================
// ANALYSIS PROMPTS
// ============================================

const SYSTEM_PROMPT = `You are an expert legal analyst specialising in Irish residential tenancy disputes.
You analyse RTB (Residential Tenancies Board) dispute determinations and extract key information.

CRITICAL RULES FOR ACCURACY:
- When extracting monetary amounts, copy the EXACT numbers from the document. Do NOT round, estimate, or add/drop digits.
- If the document says "€52,800", the amount is 52800, NOT 652800 or 5280.
- WATCH OUT for double currency symbols: "€€8,282" means €8,282, NOT €68,282. The extra € is a PDF formatting artifact.
- If a number looks unusually large, re-read it carefully. RTB awards rarely exceed €50,000.
- Double-check every digit of every amount before including it in your response.
- If you are uncertain about an amount, set compensation_amount to 0 and set amount_confident to false.
- It is BETTER to return 0 than to return a wrong number. Wrong numbers cause real harm.
- Always respond in valid JSON format only, with no additional text.`;

function getAnalysisPrompt(disputeInfo) {
    return `Analyse this RTB dispute determination and extract the following information.
Return a JSON object with these exact keys:

- "summary": A concise 2-3 sentence summary of the dispute and outcome
- "outcome": One of: "Upheld", "Partially Upheld", "Dismissed", "Withdrawn", "Settled", "Other"
- "compensation_amount": The total compensation/damages awarded in euros (whole number, 0 if none). For each individual award item, round to the nearest euro, then sum them to get the total. Copy amounts EXACTLY as written in the determination — do not add or remove digits. If you cannot read the amount clearly, set to 0.
- "amount_confident": true if you are highly confident the compensation_amount is exactly correct, false if there is any doubt. When false, set compensation_amount to 0.
- "cost_order": Any cost order amount in euros (number only, 0 if none)
- "property_address": The property address if mentioned (null if not found)
- "dispute_type": The category, e.g. "Rent Arrears", "Deposit Retention", "Breach of Obligations", "Invalid Notice of Termination", "Overholding", "Anti-Social Behaviour", "Other"
- "award_items": An array of individual awards, each with {"description": "what the award is for", "amount": number}. This helps verify the total.
- "amount_quote": The exact text from the determination where the main award amount is stated (copy the sentence verbatim)

Dispute reference: ${disputeInfo.dr_no || 'Unknown'}
Parties: ${disputeInfo.heading || 'Unknown'}

Read the document carefully, paying special attention to the Order/Determination section where awards are listed. Extract amounts exactly as written.`;
}

// ============================================
// POST-PROCESSING (shared across models)
// ============================================

function postProcessResult(parsed, disputeInfo) {
    // If AI is not confident, null out the amount (UI shows "Refer to Order")
    if (parsed.amount_confident === false) {
        console.warn(`[AI] Low confidence for ${disputeInfo.dr_no}: claimed €${parsed.compensation_amount}. Setting to null — refer to PDF.`);
        parsed.compensation_amount = null;
        parsed._uncertain = true;
    }

    // Cross-check: if award_items exist, verify the total matches
    if (parsed.award_items && Array.isArray(parsed.award_items) && parsed.award_items.length > 0) {
        const itemsTotal = parsed.award_items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        const claimed = parseFloat(parsed.compensation_amount) || 0;
        if (claimed > 0 && Math.abs(itemsTotal - claimed) > 1) {
            console.warn(`[AI] Amount mismatch for ${disputeInfo.dr_no}: total=${claimed}, items sum=${itemsTotal}. Setting to null — refer to PDF.`);
            parsed.compensation_amount = null;
            parsed._uncertain = true;
        }
    }

    return parsed;
}

// ============================================
// GEMINI ANALYSIS (Primary)
// ============================================

async function analyseWithGemini(apiKey, pdfBase64, disputeInfo) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            maxOutputTokens: 1024,
        },
    });

    const prompt = SYSTEM_PROMPT + '\n\n' + getAnalysisPrompt(disputeInfo);

    // Send PDF directly — Gemini has native PDF understanding with Google's OCR
    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
            },
        },
    ]);

    const content = result.response.text();
    if (!content) throw new Error('No response from Gemini');

    const parsed = JSON.parse(content);
    return postProcessResult(parsed, disputeInfo);
}

// ============================================
// OPENAI ANALYSIS (Secondary reviewer for high-value)
// ============================================

async function analyseWithOpenAI(apiKey, model, pdfBase64, disputeInfo) {
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'text', text: getAnalysisPrompt(disputeInfo) },
                    {
                        type: 'file',
                        file: {
                            filename: `${disputeInfo.dr_no || 'dispute'}.pdf`,
                            file_data: `data:application/pdf;base64,${pdfBase64}`,
                        },
                    },
                ],
            },
        ],
        temperature: 0,
        max_tokens: 800,
        response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content);
    return postProcessResult(parsed, disputeInfo);
}

// ============================================
// PROCESS SINGLE DISPUTE
// ============================================

export async function processDispute(dispute) {
    const geminiKey = await getGeminiApiKey();
    const openaiKey = await getOpenAIApiKey();

    if (!geminiKey && !openaiKey) {
        throw new Error('No AI API key configured. Set gemini_api_key or openai_api_key in Admin → Settings.');
    }

    // Find the first valid PDF URL
    const pdfUrls = dispute.pdf_urls || [];
    if (pdfUrls.length === 0) {
        throw new Error('No PDF URLs available for this dispute');
    }

    // Try each PDF URL until one works
    let pdfBase64 = null;
    for (const pdf of pdfUrls) {
        try {
            pdfBase64 = await downloadPdfAsBase64(pdf.url);
            if (pdfBase64) break;
        } catch (err) {
            console.warn(`[AI] Failed to download PDF from ${pdf.url}:`, err.message);
        }
    }

    if (!pdfBase64) {
        throw new Error('Could not download any PDF for this dispute');
    }

    // Primary analysis — prefer Gemini, fall back to OpenAI
    let result;
    let primaryModel;

    if (geminiKey) {
        primaryModel = 'gemini-2.5-flash-lite';
        result = await analyseWithGemini(geminiKey, pdfBase64, dispute);
    } else {
        primaryModel = 'gpt-4o-mini';
        result = await analyseWithOpenAI(openaiKey, 'gpt-4o-mini', pdfBase64, dispute);
    }

    let amount = parseFloat(result.compensation_amount) || 0;

    // Dual-review for high-value awards using a DIFFERENT provider
    if (amount >= HIGH_VALUE_THRESHOLD) {
        let result2 = null;
        let reviewModel = null;

        if (geminiKey && openaiKey) {
            // Cross-provider review: Gemini primary → OpenAI reviewer
            reviewModel = 'gpt-4o';
            console.log(`[AI] High value (€${amount.toLocaleString()}) — cross-reviewing with ${reviewModel}...`);
            result2 = await analyseWithOpenAI(openaiKey, 'gpt-4o', pdfBase64, dispute);
        } else if (geminiKey) {
            // Same-provider review with a different Gemini model
            reviewModel = 'gemini-2.0-flash (2nd pass)';
            console.log(`[AI] High value (€${amount.toLocaleString()}) — re-verifying with second Gemini pass...`);
            result2 = await analyseWithGemini(geminiKey, pdfBase64, dispute);
        } else if (openaiKey) {
            reviewModel = 'gpt-4o';
            console.log(`[AI] High value (€${amount.toLocaleString()}) — re-verifying with ${reviewModel}...`);
            result2 = await analyseWithOpenAI(openaiKey, 'gpt-4o', pdfBase64, dispute);
        }

        if (result2) {
            const amount2 = parseFloat(result2.compensation_amount) || 0;
            if (Math.abs(amount - amount2) > 1) {
                console.warn(`[AI] Dual-review mismatch for ${dispute.dr_no}: ${primaryModel}=€${amount}, ${reviewModel}=€${amount2}. Using ${reviewModel}.`);
                result = result2;
                amount = amount2;
            }
        }
    }

    return {
        ai_summary: result.summary || null,
        ai_outcome: result.outcome || null,
        ai_compensation_amount: result._uncertain ? null : Math.round(amount),
        ai_cost_order: Math.round(parseFloat(result.cost_order) || 0),
        ai_property_address: result.property_address || null,
        ai_dispute_type: result.dispute_type || null,
        ai_processed_at: new Date().toISOString(),
        ai_error: null,
    };
}

// ============================================
// BATCH PROCESSING
// ============================================

export async function processUnanalysedDisputes(limit = 10, onProgress) {
    const supabase = createServiceClient();

    // Check at least one API key exists
    const geminiKey = await getGeminiApiKey();
    const openaiKey = await getOpenAIApiKey();
    if (!geminiKey && !openaiKey) {
        return { processed: 0, failed: 0, skipped: 0, error: 'No AI API key configured' };
    }

    // Mark disputes with empty PDF arrays as 'no PDF available'
    // so they don't clog the queue
    await supabase
        .from('disputes')
        .update({
            ai_processed_at: new Date().toISOString(),
            ai_error: 'No PDF available',
        })
        .is('ai_processed_at', null)
        .eq('pdf_urls', '[]');

    // Fetch disputes that haven't been AI-processed and have PDFs
    const { data: disputes, error } = await supabase
        .from('disputes')
        .select('id, dr_no, heading, pdf_urls')
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null)
        .neq('pdf_urls', '[]')
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) throw error;
    if (!disputes || disputes.length === 0) {
        return { processed: 0, failed: 0, skipped: 0, total: 0 };
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const dispute of disputes) {
        try {
            if (!dispute.pdf_urls || dispute.pdf_urls.length === 0) {
                skipped++;
                continue;
            }

            const result = await processDispute(dispute);

            await supabase
                .from('disputes')
                .update(result)
                .eq('id', dispute.id);

            processed++;
            const amount = result.ai_compensation_amount;
            const amountStr = amount === null ? '€null' : `€${amount}`;
            console.log(`[AI] ✓ ${dispute.dr_no} — ${result.ai_outcome} — ${amountStr}`);

            if (onProgress) {
                onProgress({ dispute, result, processed, failed, skipped });
            }
        } catch (err) {
            failed++;
            console.error(`[AI] ✗ ${dispute.dr_no}: ${err.message}`);

            await supabase
                .from('disputes')
                .update({
                    ai_error: err.message,
                    ai_processed_at: new Date().toISOString(),
                })
                .eq('id', dispute.id);
        }
    }

    // Recompute party net awards after batch
    if (processed > 0) {
        try {
            await supabase.rpc('recompute_party_awards');
            console.log('[AI] Recomputed party net awards');
        } catch (err) {
            console.warn('[AI] Failed to recompute party awards:', err.message);
        }
    }

    return { processed, failed, skipped, total: disputes.length };
}
