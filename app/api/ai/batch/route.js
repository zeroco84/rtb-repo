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

const BATCH_SIZE = 10;
const MAX_RUNTIME_MS = 4 * 60 * 1000; // 4 minutes (leave 1 min buffer)

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
    let batches = 0;

    try {
        while (Date.now() - startTime < MAX_RUNTIME_MS) {
            // Check remaining
            const { count: remaining } = await supabase
                .from('disputes')
                .select('*', { count: 'exact', head: true })
                .is('ai_processed_at', null)
                .not('pdf_urls', 'is', null);

            if (!remaining || remaining === 0) {
                // All done — recompute awards
                try { await supabase.rpc('recompute_party_awards'); } catch (e) { }
                return Response.json({
                    message: 'All disputes processed!',
                    total_processed: totalProcessed,
                    total_failed: totalFailed,
                    batches,
                    remaining: 0,
                    elapsed_ms: Date.now() - startTime,
                });
            }

            // Process a batch
            const result = await processUnanalysedDisputes(BATCH_SIZE);
            totalProcessed += result.processed;
            totalFailed += result.failed;
            batches++;

            console.log(`[AI Batch] Batch ${batches}: ${result.processed} processed, ${result.failed} failed (${remaining - result.processed} remaining)`);

            // Brief pause between batches
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) {
        console.error('[AI Batch] Error:', err.message);
    }

    // Recompute awards after each run
    try { await supabase.rpc('recompute_party_awards'); } catch (e) { }

    // Check if more remain
    const { count: stillRemaining } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true })
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null);

    // Self-retrigger if more remain (fire and forget)
    if (stillRemaining > 0) {
        const selfUrl = url.origin + '/api/ai/batch';
        fetch(selfUrl, {
            headers: { 'Authorization': `Bearer ${cronSecret}` },
        }).catch(() => { });
    }

    return Response.json({
        message: stillRemaining > 0 ? 'Batch complete, retriggered' : 'All done!',
        total_processed: totalProcessed,
        total_failed: totalFailed,
        batches,
        remaining: stillRemaining || 0,
        elapsed_ms: Date.now() - startTime,
    });
}
