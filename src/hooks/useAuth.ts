import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Profile } from '../types/database';

export function useAuth() {
  const { session, profile, isLoading, setSession, setProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      // Supabase not configured yet - show login screen
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  }

  async function signInWithPhone(phone: string) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error };
  }

  async function verifyOtp(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    return { data, error };
  }

  async function signInWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signUpWithEmail(email: string, password: string, fullName: string, fullNameKana?: string, phone?: string, dateOfBirth?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          full_name_kana: fullNameKana || '',
          phone: phone || '',
          date_of_birth: dateOfBirth || '',
        },
      },
    });
    return { data, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    reset();
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!session?.user) return { error: new Error('Not authenticated') };
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single();

    if (data) {
      setProfile(data as Profile);
    }
    return { data, error };
  }

  return {
    session,
    profile,
    isLoading,
    signInWithPhone,
    verifyOtp,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateProfile,
  };
}
