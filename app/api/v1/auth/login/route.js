/**
 * POST /api/v1/auth/login
 * Login with email + password, returns API key
 */

import { createServiceClient } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { apiError, apiSuccess, corsHeaders } from '@/lib/api-auth';

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return apiError('Email and password are required', 400);
        }

        const supabase = createServiceClient();
        const { data: user, error } = await supabase
            .from('api_users')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !user) {
            return apiError('Invalid email or password', 401);
        }

        if (!user.is_active) {
            return apiError('Account has been deactivated', 403);
        }

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return apiError('Invalid email or password', 401);
        }

        // Update last login
        await supabase
            .from('api_users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id);

        return apiSuccess({
            api_key: user.api_key,
            name: user.name,
            email: user.email,
            rate_limit_per_hour: user.rate_limit_per_hour,
        });
    } catch (err) {
        return apiError('Internal server error', 500);
    }
}
