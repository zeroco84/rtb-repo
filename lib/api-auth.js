/**
 * API Authentication Middleware
 * Validates API keys and tracks usage
 */

import { createServiceClient } from './supabase';
import crypto from 'crypto';

/**
 * Generate a unique API key
 */
export function generateApiKey() {
    const random = crypto.randomBytes(24).toString('hex');
    return `rtb_live_${random}`;
}

/**
 * Validate an API key and return the user
 * Returns { user, error, status }
 */
export async function authenticateApiKey(request) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
        return {
            user: null,
            error: 'Missing Authorization header. Use: Authorization: Bearer rtb_live_xxx',
            status: 401,
        };
    }

    const match = authHeader.match(/^Bearer\s+(rtb_live_\w+)$/i);
    if (!match) {
        return {
            user: null,
            error: 'Invalid Authorization format. Use: Authorization: Bearer rtb_live_xxx',
            status: 401,
        };
    }

    const apiKey = match[1];
    const supabase = createServiceClient();

    const { data: user, error } = await supabase
        .from('api_users')
        .select('*')
        .eq('api_key', apiKey)
        .single();

    if (error || !user) {
        return { user: null, error: 'Invalid API key', status: 401 };
    }

    if (!user.is_active) {
        return { user: null, error: 'API key has been deactivated', status: 403 };
    }

    // Check rate limit (simple: count calls in the last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCalls } = await supabase
        .from('api_usage_log')
        .select('*', { count: 'exact', head: true })
        .eq('api_user_id', user.id)
        .gte('created_at', oneHourAgo);

    if (recentCalls >= user.rate_limit_per_hour) {
        return {
            user: null,
            error: `Rate limit exceeded. ${user.rate_limit_per_hour} requests per hour allowed.`,
            status: 429,
        };
    }

    // Update last API call timestamp and increment counter
    await supabase
        .from('api_users')
        .update({
            last_api_call_at: new Date().toISOString(),
            total_api_calls: (user.total_api_calls || 0) + 1,
        })
        .eq('id', user.id);

    return { user, error: null, status: 200 };
}

/**
 * Log an API request
 */
export async function logApiUsage(userId, endpoint, method, statusCode, responseTimeMs) {
    const supabase = createServiceClient();
    await supabase.from('api_usage_log').insert({
        api_user_id: userId,
        endpoint,
        method,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
    });
}

/**
 * Standard API error response
 */
export function apiError(message, status = 400) {
    return Response.json(
        { error: message, status },
        { status, headers: corsHeaders() }
    );
}

/**
 * Standard API success response
 */
export function apiSuccess(data, meta = {}) {
    return Response.json(
        { data, meta, status: 200 },
        { status: 200, headers: corsHeaders() }
    );
}

/**
 * CORS headers for API responses
 */
export function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'X-API-Version': '1.0',
    };
}
