/**
 * API Route: /api/ai/process
 * GET - Get AI processing status
 * POST - Start AI processing of unanalysed disputes
 */

import { createServiceClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { processUnanalysedDisputes } from '@/lib/openai-service';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// GET: Check how many disputes need AI processing
export async function GET() {
    const supabase = createServiceClient();

    const { count: unprocessed } = await supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .is('ai_processed_at', null)
        .not('pdf_urls', 'is', null);

    const { count: processed } = await supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .not('ai_processed_at', 'is', null);

    const { count: failed } = await supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .not('ai_error', 'is', null)
        .neq('ai_error', 'No PDF available');

    return Response.json({
        unprocessed: unprocessed || 0,
        processed: processed || 0,
        failed: failed || 0,
    });
}

// POST: Start processing unanalysed disputes
export async function POST(request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const limit = Math.min(body.limit || 20, 50);

        const result = await processUnanalysedDisputes(limit);

        return Response.json({
            message: `AI processing complete: ${result.processed} analysed, ${result.failed} failed, ${result.skipped} skipped`,
            ...result,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
