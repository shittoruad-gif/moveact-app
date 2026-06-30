import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const CHANNEL_ID = process.env.EXPO_PUBLIC_LINE_LOGIN_CHANNEL_ID ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://khsriogicdjdyivshplc.supabase.co';
const FN_URL = `${SUPABASE_URL}/functions/v1/line-auth`;

// LINEは独自スキームをコールバックに登録できないため、https中継ページを経由する。
// LINE → https中継(booking.moveact.net/line-callback) → moveact://line-auth(アプリ)
const REDIRECT_URI = 'https://booking.moveact.net/line-callback';
const APP_RETURN = 'moveact://line-auth';

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * LINEログイン。認可コードを取得→line-auth関数でセッション用token_hashを得て→verifyOtp。
 * 成功時は useAuth の onAuthStateChange が発火してアプリが自動遷移する。
 */
export function useLineLogin(onError?: (msg: string) => void) {
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(async () => {
    if (!CHANNEL_ID) {
      onError?.('LINEログインは現在準備中です。Appleまたはメールをご利用ください。');
      return;
    }
    try {
      setLoading(true);

      // PKCE（code_verifier は hex、challenge は SHA256 の base64url）
      const verifier = hex(await Crypto.getRandomBytesAsync(32));
      const hashB64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const challenge = toBase64Url(hashB64);
      const state = hex(await Crypto.getRandomBytesAsync(8));

      const authUrl =
        'https://access.line.me/oauth2/v2.1/authorize?' +
        new URLSearchParams({
          response_type: 'code',
          client_id: CHANNEL_ID,
          redirect_uri: REDIRECT_URI,
          state,
          scope: 'openid profile',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }).toString();

      // 中継ページ経由でアプリ(moveact://line-auth)へ戻る
      const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN);
      if (result.type !== 'success' || !result.url) {
        setLoading(false);
        return; // キャンセル等
      }

      const qs = result.url.split('?')[1] ?? '';
      const params = new URLSearchParams(qs);
      const code = params.get('code');
      const returnedState = params.get('state');
      if (!code || returnedState !== state) {
        setLoading(false);
        onError?.('LINEログインに失敗しました。もう一度お試しください。');
        return;
      }

      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
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
      onError?.('LINEログインに失敗しました。通信環境をご確認ください。');
    }
  }, [onError]);

  return { signIn, loading };
}
