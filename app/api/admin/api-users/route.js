/**
 * API User Management (Admin only)
 * GET  /api/admin/api-users — list all API users
 * POST /api/admin/api-users — create a new API user
 */

import { createServiceClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-auth';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

async function checkAdmin() {
    const cookieStore = await cookies();
    return cookieStore.get('admin_session')?.value === 'authenticated';
}

export async function GET(request) {
    if (!await checkAdmin()) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from('api_users')
        .select('id, email, name, company, is_active, api_key, rate_limit_per_hour, total_api_calls, last_api_call_at, last_login_at, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);
}

export async function POST(request) {
    if (!await checkAdmin()) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { email, password, name, company, rate_limit_per_hour } = body;

        if (!email || !password) {
            return Response.json({ error: 'Email and password are required' }, { status: 400 });
        }

        if (password.length < 8) {
            return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const apiKey = generateApiKey();

        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from('api_users')
            .insert({
                email: email.toLowerCase().trim(),
                password_hash: passwordHash,
                api_key: apiKey,
                name: name || null,
                company: company || null,
                rate_limit_per_hour: rate_limit_per_hour || 100,
            })
            .select('id, email, name, company, api_key, rate_limit_per_hour, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return Response.json({ error: 'Email already exists' }, { status: 409 });
            }
            return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json(data, { status: 201 });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
