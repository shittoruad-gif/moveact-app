import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';

/**
 * Appleでサインイン（iOSのApp Store審査要件4.8対応）。
 * ネイティブの identityToken を Supabase の signInWithIdToken('apple') に渡す。
 * 成功時は useAuth の onAuthStateChange が発火してアプリが自動遷移する。
 */
export function useAppleLogin(onError?: (msg: string) => void) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  const signIn = useCallback(async () => {
    try {
      setLoading(true);
      // nonce(生)を作りSHA256ハッシュをApple要求へ。生nonceは検証用にSupabaseへ渡す。
      const bytes = await Crypto.getRandomBytesAsync(16);
      const rawNonce = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        setLoading(false);
        onError?.('Appleサインインに失敗しました');
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      setLoading(false);
      if (error) {
        onError?.('サインインに失敗しました。もう一度お試しください。');
        return;
      }

      // 氏名はApple初回認証時のみ取得できる → profilesへ反映
      const fn = credential.fullName;
      if (data?.user && (fn?.familyName || fn?.givenName)) {
        const full = `${fn?.familyName ?? ''} ${fn?.givenName ?? ''}`.trim();
        if (full) await supabase.from('profiles').update({ full_name: full }).eq('id', data.user.id);
      }
      // 成功時は onAuthStateChange が発火
    } catch (e) {
      setLoading(false);
      // ユーザーがキャンセルした場合は無視
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      onError?.('Appleサインインに失敗しました');
    }
  }, [onError]);

  return { signIn, loading, available };
}
