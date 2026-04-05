import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastNameKana, setLastNameKana] = useState('');
  const [firstNameKana, setFirstNameKana] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signUpWithEmail } = useAuth();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setLoading(false);
    if (error) {
      Alert.alert('エラー', 'メールアドレスまたはパスワードが正しくありません');
    }
  }

  async function handleRegister() {
    if (!lastName.trim() || !firstName.trim() || !lastNameKana.trim() || !firstNameKana.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      Alert.alert('エラー', 'すべての項目を入力してください');
      return;
    }
    if (password.length < 6) {
      Alert.alert('エラー', 'パスワードは6文字以上で入力してください');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('エラー', 'パスワードが一致しません。もう一度確認してください。');
      return;
    }
    // Validate phone number format
    const phoneClean = phone.trim().replace(/[-\s]/g, '');
    if (!/^(0\d{9,10}|\+?\d{10,13})$/.test(phoneClean)) {
      Alert.alert('エラー', '正しい電話番号を入力してください');
      return;
    }

    const fullName = `${lastName.trim()} ${firstName.trim()}`;
    const fullNameKana = `${lastNameKana.trim()} ${firstNameKana.trim()}`;

    // Build date_of_birth string
    let dateOfBirth = '';
    if (birthYear && birthMonth && birthDay) {
      dateOfBirth = `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`;
    }

    setLoading(true);
    const { error } = await signUpWithEmail(email.trim(), password, fullName, fullNameKana, phoneClean, dateOfBirth);
    setLoading(false);
    if (error) {
      Alert.alert('エラー', error.message);
    } else {
      Alert.alert(
        '登録完了',
        'Moveactから確認メールを送信しました。\n\nメール内の「メールアドレスを確認する」ボタンをタップしてからログインしてください。\n\n※ 迷惑メールフォルダもご確認ください。',
      );
      setMode('login');
      setPassword('');
      setPasswordConfirm('');
    }
  }

  const registerFormValid =
    lastName.trim() &&
    firstName.trim() &&
    lastNameKana.trim() &&
    firstNameKana.trim() &&
    phone.trim() &&
    email.trim() &&
    password.trim() &&
    passwordConfirm.trim();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {mode === 'login' ? (
        <View style={styles.content}>
          <View style={styles.decorLine} />

          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Moveact</Text>
            <View style={styles.subtitleLine}>
              <View style={styles.line} />
              <Text style={styles.subtitle}>Beauty & Wellness</Text>
              <View style={styles.line} />
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>ログイン</Text>
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
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>
            <Button
              title="ログイン"
              onPress={handleLogin}
              loading={loading}
              disabled={!email.trim() || !password.trim()}
              variant="secondary"
            />
            <TouchableOpacity onPress={() => { setMode('register'); setPassword(''); setPasswordConfirm(''); }}>
              <Text style={styles.switchText}>アカウントをお持ちでない方は<Text style={styles.switchLink}>新規登録</Text></Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            整体 ・ 美容鍼 ・ ピラティス
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.decorLine} />

          <View style={styles.logoContainerSmall}>
            <Text style={styles.logoTextSmall}>Moveact</Text>
            <View style={styles.subtitleLine}>
              <View style={styles.line} />
              <Text style={styles.subtitle}>Beauty & Wellness</Text>
              <View style={styles.line} />
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>新規登録</Text>

            <Text style={styles.fieldLabel}>お名前</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="苗字"
                placeholderTextColor={COLORS.textLight}
                value={lastName}
                onChangeText={setLastName}
                autoComplete="family-name"
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="名前"
                placeholderTextColor={COLORS.textLight}
                value={firstName}
                onChangeText={setFirstName}
                autoComplete="given-name"
              />
            </View>

            <Text style={styles.fieldLabel}>ふりがな</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="せい"
                placeholderTextColor={COLORS.textLight}
                value={lastNameKana}
                onChangeText={setLastNameKana}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="めい"
                placeholderTextColor={COLORS.textLight}
                value={firstNameKana}
                onChangeText={setFirstNameKana}
              />
            </View>

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

            <Text style={styles.fieldLabel}>生年月日</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="1990"
                placeholderTextColor={COLORS.textLight}
                value={birthYear}
                onChangeText={setBirthYear}
                keyboardType="number-pad"
                maxLength={4}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="1"
                placeholderTextColor={COLORS.textLight}
                value={birthMonth}
                onChangeText={setBirthMonth}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="1"
                placeholderTextColor={COLORS.textLight}
                value={birthDay}
                onChangeText={setBirthDay}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Text style={styles.birthHint}>年 / 月 / 日（お誕生月にクーポンをお届けします）</Text>

            <Text style={styles.fieldLabel}>メールアドレス</Text>
            <TextInput
              style={styles.input}
              placeholder="example@email.com"
              placeholderTextColor={COLORS.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <Text style={styles.fieldLabel}>パスワード（6文字以上）</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="パスワードを入力"
                placeholderTextColor={COLORS.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>パスワード（確認用）</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.passwordInput,
                  passwordConfirm.length > 0 && password !== passwordConfirm
                    ? styles.inputError
                    : null,
                ]}
                placeholder="もう一度パスワードを入力"
                placeholderTextColor={COLORS.textLight}
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                secureTextEntry={!showPasswordConfirm}
                autoComplete="new-password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPasswordConfirm(!showPasswordConfirm)}
              >
                <Ionicons
                  name={showPasswordConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {passwordConfirm.length > 0 && password !== passwordConfirm && (
              <Text style={styles.errorText}>パスワードが一致しません</Text>
            )}
            {passwordConfirm.length > 0 && password === passwordConfirm && password.length >= 6 && (
              <Text style={styles.matchText}>パスワードが一致しました</Text>
            )}

            <View style={{ marginTop: 4 }}>
              <Button
                title="登録する"
                onPress={handleRegister}
                loading={loading}
                disabled={!registerFormValid}
                variant="secondary"
              />
            </View>
            <TouchableOpacity onPress={() => { setMode('login'); setPassword(''); setPasswordConfirm(''); }}>
              <Text style={styles.switchText}>すでにアカウントをお持ちの方は<Text style={styles.switchLink}>ログイン</Text></Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            整体 ・ 美容鍼 ・ ピラティス
          </Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  decorLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.accentLight,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 56,
  },
  logoContainerSmall: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: 4,
  },
  logoTextSmall: {
    fontSize: 28,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: 4,
  },
  subtitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  line: {
    height: 0.5,
    width: 40,
    backgroundColor: COLORS.textLight,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  form: {
    gap: 10,
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    minWidth: 0,
  },
  halfInput: {
    flex: 1,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    width: '100%',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    minWidth: 0,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputError: {
    borderColor: '#E74C3C',
  },
  errorText: {
    fontSize: 12,
    color: '#E74C3C',
    marginTop: -4,
  },
  matchText: {
    fontSize: 12,
    color: '#27AE60',
    marginTop: -4,
  },
  birthHint: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: -4,
    marginLeft: 4,
  },
  switchText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  switchLink: {
    color: COLORS.accent,
    fontWeight: '500',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textLight,
    letterSpacing: 4,
    marginTop: 40,
  },
});
