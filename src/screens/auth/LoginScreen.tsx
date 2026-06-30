import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { useLineLogin } from '../../hooks/useLineLogin';
import { useAppleLogin } from '../../hooks/useAppleLogin';
import { Ionicons } from '@expo/vector-icons';

export function LoginScreen() {
  const [useEmail, setUseEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signInWithEmail } = useAuth();
  const { signIn: lineSignIn, loading: lineLoading } = useLineLogin((m) => Alert.alert('LINEログイン', m));
  const { signIn: appleSignIn, available: appleAvailable } = useAppleLogin((m) => Alert.alert('Appleサインイン', m));

  async function handleEmailLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (error) Alert.alert('エラー', 'メールアドレスまたはパスワードが正しくありません');
  }

  const Logo = () => (
    <View style={styles.logoContainer}>
      <Text style={styles.logoText}>Moveact</Text>
      <View style={styles.subtitleLine}>
        <View style={styles.line} />
        <Text style={styles.subtitle}>Beauty & Wellness</Text>
        <View style={styles.line} />
      </View>
    </View>
  );

  // ===== メールログイン（既存会員向けフォールバック）=====
  if (useEmail) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <View style={styles.decorLine} />
          <Logo />
          <View style={styles.form}>
            <Text style={styles.label}>メールでログイン</Text>
            <TextInput
              style={styles.input}
              placeholder="メールアドレス"
              placeholderTextColor={COLORS.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="パスワード"
                placeholderTextColor={COLORS.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Button title="ログイン" onPress={handleEmailLogin} loading={loading} disabled={!email.trim() || !password.trim()} variant="secondary" />
            <TouchableOpacity onPress={() => setUseEmail(false)}>
              <Text style={styles.switchText}>← <Text style={styles.switchLink}>LINE・Appleでログイン</Text>に戻る</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footer}>整体 ・ 美容鍼 ・ ピラティス</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ===== メイン（LINE / Apple）=====
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <View style={styles.decorLine} />
        <Logo />
        <View style={styles.form}>
          <Text style={styles.lead}>ご登録・ログイン</Text>

          {/* LINE（主導線） */}
          <TouchableOpacity style={styles.lineButton} onPress={lineSignIn} disabled={lineLoading} activeOpacity={0.85}>
            <Ionicons name="chatbubble" size={18} color="#fff" />
            <Text style={styles.lineButtonText}>{lineLoading ? '接続中…' : 'LINEではじめる'}</Text>
          </TouchableOpacity>

          {/* Appleでサインイン（iOSのみ・公式ボタン） */}
          {Platform.OS === 'ios' && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={styles.appleButton}
              onPress={appleSignIn}
            />
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>または</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity onPress={() => setUseEmail(true)}>
            <Text style={styles.switchText}>メールアドレスで<Text style={styles.switchLink}>ログイン</Text></Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            「LINEではじめる」を押すと、初めての方は自動でアカウントが作成されます。
          </Text>
        </View>
        <Text style={styles.footer}>整体 ・ 美容鍼 ・ ピラティス</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  decorLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: COLORS.accentLight },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logoText: { fontSize: 36, fontWeight: '300', color: COLORS.text, letterSpacing: 4 },
  subtitleLine: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  line: { height: 0.5, width: 40, backgroundColor: COLORS.textLight },
  subtitle: { fontSize: 11, color: COLORS.textSecondary, letterSpacing: 3, textTransform: 'uppercase' },
  form: { gap: 12, width: '100%' },
  label: { fontSize: 16, fontWeight: '600', color: COLORS.text, letterSpacing: 0.3, marginBottom: 4 },
  lead: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, minWidth: 0 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, width: '100%' },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, minWidth: 0 },
  eyeButton: { paddingHorizontal: 16, paddingVertical: 14 },
  lineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#06C755', borderRadius: 16, paddingVertical: 16 },
  lineButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  appleButton: { width: '100%', height: 52 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: COLORS.border },
  dividerText: { fontSize: 12, color: COLORS.textLight },
  switchText: { textAlign: 'center', fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  switchLink: { color: COLORS.accent, fontWeight: '600' },
  note: { fontSize: 11, color: COLORS.textLight, textAlign: 'center', lineHeight: 17, marginTop: 8 },
  footer: { textAlign: 'center', fontSize: 11, color: COLORS.textLight, letterSpacing: 4, marginTop: 40 },
});
