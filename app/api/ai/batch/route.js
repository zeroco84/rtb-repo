/**
 * API Route: /api/ai/batch
 * Processes AI disputes in a loop for up to 4 minutes, then self-retriggers
 * if there are more to process. Secured by CRON_SECRET.
 * 
 * GET /api/ai/batch — Start/continue batch processing
 * Query params:
 *   stop=true — Stop self-retriggering
 */

import { createServiceClient } from '@/lib/supabase';
import { processUnanalysedDisputes } from '@/lib/openai-service';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 15;
const MAX_RUNTIME_MS = 4 * 60 * 1000; // 4 minutes

export async function GET(request) {
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get('stop') === 'true') {
        return Response.json({ message: 'Stopped' });
    }

    const supabase = createServiceClient();
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let batches = 0;
    let lastError = null;
    let consecutiveEmpty = 0;

    try {
        while (Date.now() - startTime < MAX_RUNTIME_MS) {
            // Process a batch
            let result;
            try {
                result = await processUnanalysedDisputes(BATCH_SIZE);
            } catch (batchErr) {
                lastError = batchErr.message;
                console.error('[AI Batch] processUnanalysedDisputes threw:', batchErr.message);
                break;
            }

            batches++;
            totalProcessed += (result.processed || 0);
            totalFailed += (result.failed || 0);
            totalSkipped += (result.skipped || 0);

            console.log(`[AI Batch] Batch ${batches}: processed=${result.processed} failed=${result.failed} skipped=${result.skipped} total=${result.total} error=${result.error || 'none'}`);

            // If the function returned an error message (e.g., no API key)
            if (result.error) {
                lastError = result.error;
                break;
            }

            // If no disputes were found at all, we're done
            if ((result.total || 0) === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) break;
            } else {
                consecutiveEmpty = 0;
            }

            // If a batch processes 0 but has items, something is wrong
            if ((result.total || 0) > 0 && (result.processed || 0) === 0 && (result.failed || 0) === 0) {
                // All skipped — might be records with empty pdf arrays
                totalSkipped += (result.total || 0);
            }

            // Brief pause between batches to avoid hammering APIs
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (err) {
        lastError = err.message;
        console.error('[AI Batch] Loop error:', err.message);
    }

    // Recompute awards after each run
    try { await supabase.rpc('recompute_party_awards'); } catch (e) { }

    // Check remaining
    const { count: remaining } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true })
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null);

    // Self-retrigger if more remain and we actually processed some
    if (remaining > 0 && totalProcessed > 0 && !lastError) {
        const selfUrl = url.origin + '/api/ai/batch';
        fetch(selfUrl, {
            headers: { 'Authorization': `Bearer ${cronSecret}` },
        }).catch(() => { });
    }

    return Response.json({
        message: remaining > 0
            ? (totalProcessed > 0 ? 'Batch complete, retriggered' : 'Batch complete, NOT retriggered (0 processed)')
            : 'All done!',
        total_processed: totalProcessed,
        total_failed: totalFailed,
        total_skipped: totalSkipped,
        batches,
        remaining: remaining || 0,
        elapsed_ms: Date.now() - startTime,
        last_error: lastError,
    });
}
