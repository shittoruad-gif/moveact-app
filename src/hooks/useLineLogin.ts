import { useEffect, useState, useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

// ブラウザ認証から戻ったセッションを確実に閉じる
WebBrowser.maybeCompleteAuthSession();

const CHANNEL_ID = process.env.EXPO_PUBLIC_LINE_LOGIN_CHANNEL_ID ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://khsriogicdjdyivshplc.supabase.co';
const FN_URL = `${SUPABASE_URL}/functions/v1/line-auth`;

// LINE は OpenID Connect 準拠。authorize でcodeを取り、token交換はEdge Function(秘密鍵保持)が行う。
const discovery = {
  authorizationEndpoint: 'https://access.line.me/oauth2/v2.1/authorize',
  tokenEndpoint: 'https://api.line.me/oauth2/v2.1/token',
};

/**
 * LINEログイン。promptで認可→codeをline-auth関数へ→token_hashでverifyOtp→セッション確立。
 * 成功時は useAuth の onAuthStateChange が発火してアプリが自動遷移する。
 */
export function useLineLogin(onError?: (msg: string) => void) {
  const [loading, setLoading] = useState(false);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'moveact', path: 'line-auth' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CHANNEL_ID,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'profile'],
      usePKCE: true,
    },
    discovery,
  );

  const exchange = useCallback(
    async (code: string, codeVerifier?: string) => {
      try {
        const res = await fetch(FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok || !data.token_hash) {
          setLoading(false);
          onError?.(data.error ?? 'LINEログインに失敗しました');
          return;
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
        setLoading(false);
        if (error) onError?.('セッションの確立に失敗しました。もう一度お試しください。');
        // 成功時は onAuthStateChange が発火
      } catch {
        setLoading(false);
        onError?.('通信に失敗しました。電波の良い場所で再度お試しください。');
      }
    },
    [redirectUri, onError],
  );

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success' && response.params.code) {
      exchange(response.params.code, request?.codeVerifier);
    } else if (response.type === 'error' || response.type === 'cancel' || response.type === 'dismiss') {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = useCallback(async () => {
    if (!CHANNEL_ID) {
      onError?.('LINEログインは現在準備中です。電話番号でのご登録をご利用ください。');
      return;
    }
    setLoading(true);
    await promptAsync();
  }, [promptAsync, onError]);

  return { signIn, loading, ready: !!request };
}
