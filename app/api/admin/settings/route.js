/**
 * API Route: /api/admin/settings
 * Manage admin settings (API keys, configuration)
 * Protected by admin authentication
 */

import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';

export async function GET() {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabase = createServiceClient();

    const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .order('key');

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    // Mask secret values for display
    const settings = (data || []).map(s => ({
        ...s,
        value: s.is_secret && s.value ? '••••••' + s.value.slice(-4) : s.value,
        has_value: !!s.value && s.value.length > 0,
    }));

    return Response.json({ settings });
}

export async function PUT(request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabase = createServiceClient();
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
        return Response.json({ error: 'Key is required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('admin_settings')
        .update({
            value,
            updated_at: new Date().toISOString(),
            updated_by: 'admin',
        })
        .eq('key', key);

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, key });
}

export async function POST(request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabase = createServiceClient();
    const body = await request.json();
    const { key, value, description, is_secret } = body;

    if (!key) {
        return Response.json({ error: 'Key is required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('admin_settings')
        .upsert({
            key,
            value: value || '',
            description: description || '',
            is_secret: is_secret !== false,
            updated_at: new Date().toISOString(),
            updated_by: 'admin',
        });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, key });
}
