-- Add interests column to profiles for onboarding product recommendations
-- Column already added to production DB via Management API
-- This migration ensures it's tracked in version control

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'interests'
  ) THEN
    ALTER TABLE profiles ADD COLUMN interests text[] DEFAULT '{}';
  END IF;
END $$;

COMMENT ON COLUMN profiles.interests IS 'User interest categories selected during onboarding (e.g. hair_care, face_care, body_care)';
