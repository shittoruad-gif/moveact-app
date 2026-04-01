import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://khsriogicdjdyivshplc.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtoc3Jpb2dpY2RqZHlpdnNocGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTA2NzgsImV4cCI6MjA5MDM2NjY3OH0.1sDRNML0QqvQW1j2dIoJZdjV2NfFPQr4tYWxGC9gOCc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
