-- DATABASE SETUP FOR MUSIC ANNOTATIONS APP
-- Run these commands in your Supabase SQL Editor

-- 1. Create profiles table for user roles
CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Add version tracking columns to annotations table
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 3. Create annotation_history table for version tracking
CREATE TABLE IF NOT EXISTS annotation_history (
  id BIGSERIAL PRIMARY KEY,
  annotation_id BIGINT,
  x NUMERIC,
  y NUMERIC,
  color TEXT,
  type TEXT,
  sticker_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER
);

-- 4. Create storage bucket for stickers (run in Supabase Storage UI or via API)
-- Go to Storage > Create new bucket > Name: "stickers" > Public: true

-- 5. Enable Row Level Security on all tables
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation_history ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for annotations
-- Students can only insert their own annotations
CREATE POLICY "Students can insert own annotations" ON annotations
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Anyone can view all annotations
CREATE POLICY "Anyone can view annotations" ON annotations
  FOR SELECT
  USING (true);

-- Teachers can update any annotation, students can only update their own
CREATE POLICY "Teachers can update all, students own" ON annotations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'teacher'
    )
    OR created_by = auth.uid()
  );

-- Teachers can delete any annotation, students can only delete their own
CREATE POLICY "Teachers can delete all, students own" ON annotations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'teacher'
    )
    OR created_by = auth.uid()
  );

-- 7. RLS Policies for profiles
-- Users can view all profiles
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT
  USING (true);

-- Users can only insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 8. RLS Policies for annotation_history
-- Anyone can view history
CREATE POLICY "Anyone can view history" ON annotation_history
  FOR SELECT
  USING (true);

-- Only authenticated users can insert history
CREATE POLICY "Authenticated can insert history" ON annotation_history
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

