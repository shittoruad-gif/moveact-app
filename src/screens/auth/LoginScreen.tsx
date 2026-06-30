import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { useLineLogin } from '../../hooks/useLineLogin';
import { Ionicons } from '@expo/vector-icons';

// 日本の電話番号を E.164（+81…）に変換。不正なら null。
function toE164JP(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 10 ? `+${digits}` : null;
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) return `+81${digits.slice(1)}`;
  return null;
}

type Mode = 'login' | 'register';
type Step = 'form' | 'otp';

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('form');
  const [useEmail, setUseEmail] = useState(false);

  // 電話OTP
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [e164, setE164] = useState('');

  // 新規登録のプロフィール
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastNameKana, setLastNameKana] = useState('');
  const [firstNameKana, setFirstNameKana] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');

  // メール（フォールバック）
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const { signInWithPhone, verifyOtp, signInWithEmail } = useAuth();
  const { signIn: lineSignIn, loading: lineLoading } = useLineLogin((msg) => Alert.alert('LINEログイン', msg));

  // 認証コードを送信
  async function sendCode() {
    const formatted = toE164JP(phone);
    if (!formatted) {
      Alert.alert('エラー', '正しい電話番号を入力してください（例：090-1234-5678）');
      return;
    }
    if (mode === 'register' && (!lastName.trim() || !firstName.trim())) {
      Alert.alert('エラー', 'お名前（苗字・名前）を入力してください');
      return;
    }

    setLoading(true);
    let options: { shouldCreateUser?: boolean; data?: Record<string, unknown> };
    if (mode === 'register') {
      const fullName = `${lastName.trim()} ${firstName.trim()}`;
      const fullNameKana = `${lastNameKana.trim()} ${firstNameKana.trim()}`.trim();
      let dob = '';
      if (birthYear && birthMonth && birthDay) {
        dob = `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`;
      }
      options = {
        shouldCreateUser: true,
        data: {
          full_name: fullName,
          full_name_kana: fullNameKana,
          phone: phone.trim().replace(/[-\s]/g, ''),
          date_of_birth: dob,
        },
      };
    } else {
      options = { shouldCreateUser: false };
    }

    const { error } = await signInWithPhone(formatted, options);
    setLoading(false);
    if (error) {
      const notRegistered = /signup|not allowed|user not found|otp_disabled|not exist/i.test(error.message);
      const msg = mode === 'login' && notRegistered
        ? 'この電話番号の登録が見つかりません。「新規登録」からお進みください。'
        : `認証コードを送信できませんでした。\n${error.message}`;
      Alert.alert('エラー', msg);
      return;
    }
    setE164(formatted);
    setStep('otp');
  }

  // コードを認証（成功時は onAuthStateChange が発火し自動で画面遷移）
  async function verify() {
    if (otp.trim().length < 4) {
      Alert.alert('エラー', '認証コードを入力してください');
      return;
    }
    setLoading(true);
    const { error } = await verifyOtp(e164, otp.trim());
    setLoading(false);
    if (error) Alert.alert('エラー', '認証コードが正しくありません。もう一度お試しください。');
  }

  // メールログイン（フォールバック）
  async function handleEmailLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (error) Alert.alert('エラー', 'メールアドレスまたはパスワードが正しくありません');
  }

  function backToForm() { setStep('form'); setOtp(''); }
  function switchMode(m: Mode) { setMode(m); setStep('form'); setOtp(''); }

  const Logo = ({ small }: { small?: boolean }) => (
    <View style={small ? styles.logoContainerSmall : styles.logoContainer}>
      <Text style={small ? styles.logoTextSmall : styles.logoText}>Moveact</Text>
      <View style={styles.subtitleLine}>
        <View style={styles.line} />
        <Text style={styles.subtitle}>Beauty & Wellness</Text>
        <View style={styles.line} />
      </View>
    </View>
  );

  // ===== OTPコード入力画面 =====
  if (!useEmail && step === 'otp') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <View style={styles.decorLine} />
          <Logo />
          <View style={styles.form}>
            <Text style={styles.label}>認証コードの入力</Text>
            <Text style={styles.otpLead}>
              <Text style={styles.otpPhone}>{phone}</Text> にSMSで送信した{'\n'}6桁の認証コードを入力してください。
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="------"
              placeholderTextColor={COLORS.textLight}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textContentType="oneTimeCode"
            />
            <Button title="認証する" onPress={verify} loading={loading} disabled={otp.trim().length < 4} variant="secondary" />
            <TouchableOpacity onPress={sendCode} disabled={loading}>
              <Text style={styles.switchText}>コードが届かない場合は<Text style={styles.switchLink}>再送する</Text></Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={backToForm}>
              <Text style={styles.switchText}>← 電話番号を修正する</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footer}>整体 ・ 美容鍼 ・ ピラティス</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ===== メールログイン（フォールバック）=====
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
              <Text style={styles.switchText}>← <Text style={styles.switchLink}>電話番号でログイン</Text>に戻る</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footer}>整体 ・ 美容鍼 ・ ピラティス</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ===== 電話番号（ログイン / 新規登録）=====
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.decorLine} />
        <Logo small={mode === 'register'} />

        {/* LINEログイン（主導線） */}
        <TouchableOpacity style={styles.lineButton} onPress={lineSignIn} disabled={lineLoading} activeOpacity={0.85}>
          <Ionicons name="chatbubble" size={18} color="#fff" />
          <Text style={styles.lineButtonText}>{lineLoading ? '接続中…' : 'LINEではじめる'}</Text>
        </TouchableOpacity>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>または電話番号で</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ログイン / 新規登録 タブ */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => switchMode('login')}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>ログイン</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, mode === 'register' && styles.tabActive]} onPress={() => switchMode('register')}>
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>新規登録</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === 'register' && (
            <>
              <Text style={styles.fieldLabel}>お名前</Text>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="苗字" placeholderTextColor={COLORS.textLight} value={lastName} onChangeText={setLastName} autoComplete="family-name" />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="名前" placeholderTextColor={COLORS.textLight} value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
              </View>

              <Text style={styles.fieldLabel}>ふりがな（任意）</Text>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="せい" placeholderTextColor={COLORS.textLight} value={lastNameKana} onChangeText={setLastNameKana} />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="めい" placeholderTextColor={COLORS.textLight} value={firstNameKana} onChangeText={setFirstNameKana} />
              </View>

              <Text style={styles.fieldLabel}>生年月日（任意）</Text>
              <View style={styles.row}>
                <TextInput style={[styles.input, { flex: 2 }]} placeholder="1990" placeholderTextColor={COLORS.textLight} value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="1" placeholderTextColor={COLORS.textLight} value={birthMonth} onChangeText={setBirthMonth} keyboardType="number-pad" maxLength={2} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="1" placeholderTextColor={COLORS.textLight} value={birthDay} onChangeText={setBirthDay} keyboardType="number-pad" maxLength={2} />
              </View>
              <Text style={styles.birthHint}>年 / 月 / 日（お誕生月にクーポンをお届けします）</Text>
            </>
          )}

          <Text style={styles.fieldLabel}>電話番号</Text>
          <TextInput
            style={styles.input}
            placeholder="090-1234-5678"
            placeholderTextColor={COLORS.textLight}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Text style={styles.birthHint}>SMSで認証コードをお送りします</Text>

          <View style={{ marginTop: 8 }}>
            <Button
              title="認証コードを送る"
              onPress={sendCode}
              loading={loading}
              disabled={!phone.trim() || (mode === 'register' && (!lastName.trim() || !firstName.trim()))}
              variant="secondary"
            />
          </View>

          <TouchableOpacity onPress={() => setUseEmail(true)}>
            <Text style={styles.switchText}>メールアドレスでログインする方は<Text style={styles.switchLink}>こちら</Text></Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>整体 ・ 美容鍼 ・ ピラティス</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContainer: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  decorLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: COLORS.accentLight },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logoContainerSmall: { alignItems: 'center', marginBottom: 28 },
  logoText: { fontSize: 36, fontWeight: '300', color: COLORS.text, letterSpacing: 4 },
  logoTextSmall: { fontSize: 28, fontWeight: '300', color: COLORS.text, letterSpacing: 4 },
  subtitleLine: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  line: { height: 0.5, width: 40, backgroundColor: COLORS.textLight },
  subtitle: { fontSize: 11, color: COLORS.textSecondary, letterSpacing: 3, textTransform: 'uppercase' },
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.backgroundSoft, borderRadius: 14, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.surface, shadowColor: COLORS.text, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.accent, fontWeight: '700' },
  lineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#06C755', borderRadius: 16, paddingVertical: 15 },
  lineButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: COLORS.border },
  dividerText: { fontSize: 12, color: COLORS.textLight },
  form: { gap: 10, width: '100%' },
  label: { fontSize: 16, fontWeight: '600', color: COLORS.text, letterSpacing: 0.3, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, minWidth: 0 },
  halfInput: { flex: 1 },
  otpLead: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 21, marginBottom: 6 },
  otpPhone: { color: COLORS.text, fontWeight: '600' },
  otpInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingVertical: 16, fontSize: 30, letterSpacing: 12, textAlign: 'center', color: COLORS.text, fontWeight: '600' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, width: '100%' },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: COLORS.text, minWidth: 0 },
  eyeButton: { paddingHorizontal: 16, paddingVertical: 14 },
  birthHint: { fontSize: 11, color: COLORS.textLight, marginTop: -4, marginLeft: 4 },
  switchText: { textAlign: 'center', fontSize: 13, color: COLORS.textSecondary, marginTop: 8 },
  switchLink: { color: COLORS.accent, fontWeight: '500' },
  footer: { textAlign: 'center', fontSize: 11, color: COLORS.textLight, letterSpacing: 4, marginTop: 36 },
});
