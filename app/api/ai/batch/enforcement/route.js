/**
 * API Route: /api/ai/batch/enforcement
 * Processes AI enforcement orders in a loop, then self-retriggers.
 * Secured by CRON_SECRET.
 * 
 * GET /api/ai/batch/enforcement — Start/continue batch processing
 */

import { createServiceClient } from '@/lib/supabase';
import { processUnanalysedEnforcementOrders } from '@/lib/openai-service';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 5;
const MAX_RUNTIME_MS = 4 * 60 * 1000;

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
            let result;
            try {
                result = await processUnanalysedEnforcementOrders(BATCH_SIZE);
            } catch (batchErr) {
                lastError = batchErr.message;
                console.error('[AI-EO Batch] processUnanalysedEnforcementOrders threw:', batchErr.message);
                break;
            }

            batches++;
            totalProcessed += (result.processed || 0);
            totalFailed += (result.failed || 0);
            totalSkipped += (result.skipped || 0);

            console.log(`[AI-EO Batch] Batch ${batches}: processed=${result.processed} failed=${result.failed} skipped=${result.skipped} total=${result.total} error=${result.error || 'none'}`);

            if (result.error) {
                lastError = result.error;
                break;
            }

            if ((result.total || 0) === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) break;
            } else {
                consecutiveEmpty = 0;
            }

            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        lastError = err.message;
        console.error('[AI-EO Batch] Loop error:', err.message);
    }

    // Check remaining
    const { count: remaining } = await supabase
        .from('enforcement_orders')
        .select('*', { count: 'exact', head: true })
        .is('ai_processed_at', null)
        .not('pdf_url', 'is', null);

    // Self-retrigger if more remain
    if (remaining > 0 && totalProcessed > 0 && !lastError) {
        const selfUrl = url.origin + '/api/ai/batch/enforcement';
        fetch(selfUrl, {
            headers: { 'Authorization': `Bearer ${cronSecret}` },
        }).catch(() => { });
    }

    return Response.json({
        message: remaining > 0
            ? (totalProcessed > 0 ? 'Batch complete, retriggered' : 'Batch complete, NOT retriggered')
            : 'All enforcement orders processed!',
        total_processed: totalProcessed,
        total_failed: totalFailed,
        total_skipped: totalSkipped,
        batches,
        remaining: remaining || 0,
        elapsed_ms: Date.now() - startTime,
        last_error: lastError,
    });
}
