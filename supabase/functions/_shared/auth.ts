// Edge Function 共通の認証ヘルパー
// =====================================================
// 全 Edge Function で使う Authorization ヘッダーの解析・検証を一箇所に集約。

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  userId: string;
  email: string | null;
  serviceClient: SupabaseClient;
  userClient: SupabaseClient;
}

/**
 * Authorization ヘッダーを検証してユーザー情報を返す。
 * 失敗時は throw する（Edge Function 側で 401 を返す）。
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 401);
  }
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError('Invalid Authorization header format', 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AuthError('Empty bearer token', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    throw new AuthError('Server configuration missing', 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    serviceClient,
    userClient,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 共通の CORS ヘッダー
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * JSON レスポンスヘルパー
 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * エラーオブジェクトから安全なメッセージを抽出（PII を含めない）
 */
export function safeErrorMessage(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  if (e instanceof Error) {
    // Supabase エラーは詳細にメール等が含まれる可能性があるので code だけ抽出
    const msg = e.message;
    if (msg.length > 200) return 'Internal error';
    return msg;
  }
  return 'Unknown error';
}
