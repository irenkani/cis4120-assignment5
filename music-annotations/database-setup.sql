-- DATABASE SETUP FOR SCOREHUB - UPDATED FOR FINAL PROJECT
-- Run these commands in your Supabase SQL Editor

-- ============================================================================
-- SECTION 1: USER PROFILES & AUTHENTICATION
-- ============================================================================

-- 1. Create profiles table for user roles
CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,np
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================================
-- SECTION 2: ANNOTATIONS TABLE (ENHANCED)
-- ============================================================================

-- 2. Ensure annotations table exists with all required columns
CREATE TABLE IF NOT EXISTS annotations (
  id BIGSERIAL PRIMARY KEY,
  x NUMERIC NOT NULL,
  y NUMERIC NOT NULL,
  color TEXT,
  type TEXT DEFAULT 'dot'
);

-- 3. Add existing version tracking columns
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS sticker_url TEXT;

-- 4. Add NEW columns for auto-detection and piece management
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS piece_id TEXT DEFAULT 'symphony-1',
ADD COLUMN IF NOT EXISTS page INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS radius NUMERIC,
ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS piece_version_id BIGINT;

-- 5. Add columns for PNG annotation regions (width and height for transparent overlays)
ALTER TABLE annotations
ADD COLUMN IF NOT EXISTS width NUMERIC,
ADD COLUMN IF NOT EXISTS height NUMERIC;

-- ============================================================================
-- SECTION 3: PIECES MANAGEMENT
-- ============================================================================

-- 5. Create pieces table to manage music pieces
CREATE TABLE IF NOT EXISTS pieces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pdf_url TEXT,
  base_pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create piece_versions table for version tracking
CREATE TABLE IF NOT EXISTS piece_versions (
  id BIGSERIAL PRIMARY KEY,
  piece_id TEXT REFERENCES pieces(id),
  version_number INTEGER NOT NULL,
  pdf_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  annotations_count INTEGER DEFAULT 0,
  notes TEXT
);

-- 7. Add foreign key constraint for piece versions (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'annotations_piece_version_id_fkey'
  ) THEN
    ALTER TABLE annotations
    ADD CONSTRAINT annotations_piece_version_id_fkey 
    FOREIGN KEY (piece_version_id) REFERENCES piece_versions(id);
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: ANNOTATION HISTORY
-- ============================================================================

-- 8. Create annotation_history table for version tracking
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
  version INTEGER,
  piece_id TEXT,
  page INTEGER
);

-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY SETUP
-- ============================================================================

-- 9. Enable Row Level Security on all tables
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE piece_versions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 6: DROP ALL EXISTING POLICIES (CLEAN SLATE)
-- ============================================================================

-- Drop ALL existing policies to avoid conflicts
DROP POLICY IF EXISTS "Students can insert own annotations" ON annotations;
DROP POLICY IF EXISTS "Anyone can view annotations" ON annotations;
DROP POLICY IF EXISTS "Teachers can update all, students own" ON annotations;
DROP POLICY IF EXISTS "Teachers can delete all, students own" ON annotations;

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

DROP POLICY IF EXISTS "Anyone can view history" ON annotation_history;
DROP POLICY IF EXISTS "Authenticated can insert history" ON annotation_history;

DROP POLICY IF EXISTS "Anyone can view pieces" ON pieces;
DROP POLICY IF EXISTS "Only teachers can create pieces" ON pieces;
DROP POLICY IF EXISTS "Only teachers can update pieces" ON pieces;

DROP POLICY IF EXISTS "Anyone can view versions" ON piece_versions;
DROP POLICY IF EXISTS "Authenticated users can insert versions" ON piece_versions;

-- ============================================================================
-- SECTION 7: RLS POLICIES - ANNOTATIONS
-- ============================================================================

-- 10. RLS Policies for annotations
-- Drop old policy if exists
DROP POLICY IF EXISTS "Students can insert own annotations" ON annotations;

-- Create new policy that allows both students and teachers to insert
CREATE POLICY "Students & teachers can insert annotations" ON annotations
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role IN ('student', 'teacher')
    )
  );

CREATE POLICY "Anyone can view annotations" ON annotations
  FOR SELECT
  USING (true);

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

-- ============================================================================
-- SECTION 8: RLS POLICIES - PROFILES
-- ============================================================================

-- 11. RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 9: RLS POLICIES - ANNOTATION HISTORY
-- ============================================================================

-- 12. RLS Policies for annotation_history
CREATE POLICY "Anyone can view history" ON annotation_history
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert history" ON annotation_history
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- SECTION 10: RLS POLICIES - PIECES
-- ============================================================================

-- 13. RLS Policies for pieces
CREATE POLICY "Anyone can view pieces" ON pieces
  FOR SELECT
  USING (true);

CREATE POLICY "Only teachers can create pieces" ON pieces
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'teacher'
    )
  );

CREATE POLICY "Only teachers can update pieces" ON pieces
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'teacher'
    )
  );

-- ============================================================================
-- SECTION 11: RLS POLICIES - PIECE VERSIONS
-- ============================================================================

-- 14. RLS Policies for piece_versions
CREATE POLICY "Anyone can view versions" ON piece_versions
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert versions" ON piece_versions
  FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

-- ============================================================================
-- SECTION 12: PERFORMANCE INDEXES
-- ============================================================================

-- 15. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_annotations_piece_id ON annotations(piece_id);
CREATE INDEX IF NOT EXISTS idx_annotations_page ON annotations(page);
CREATE INDEX IF NOT EXISTS idx_annotations_created_by ON annotations(created_by);
CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at);
CREATE INDEX IF NOT EXISTS idx_piece_versions_piece_id ON piece_versions(piece_id);
CREATE INDEX IF NOT EXISTS idx_annotation_history_annotation_id ON annotation_history(annotation_id);

-- ============================================================================
-- SECTION 13: SAMPLE DATA (OPTIONAL)
-- ============================================================================

-- 16. Insert sample pieces
-- IMPORTANT: Replace these URLs with your actual PDF URLs after uploading to Supabase Storage
INSERT INTO pieces (id, name, pdf_url, base_pdf_url) VALUES
('symphony-1', 'Symphony No. 1', 
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/symphony%201.pdf',
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/symphony%201.pdf'),
('symphony-2', 'Symphony No. 2', 
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/symphony-2.pdf',
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/symphony-2.pdf'),
('canon-in-d', 'Canon in D', 
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/canon-in-d.pdf',
 'https://ddbizdtluchzqaxrxvtf.supabase.co/storage/v1/object/public/stickers/canon-in-d.pdf')
ON CONFLICT (id) DO UPDATE SET
  pdf_url = EXCLUDED.pdf_url,
  base_pdf_url = EXCLUDED.base_pdf_url,
  last_updated = NOW();

-- ============================================================================
-- SECTION 14: VERIFICATION
-- ============================================================================

-- 17. Verify setup
SELECT 
  'Setup complete!' as status,
  (SELECT COUNT(*) FROM pieces) as pieces_count,
  (SELECT COUNT(*) FROM annotations) as annotations_count,
  (SELECT COUNT(*) FROM profiles) as profiles_count,
  (SELECT COUNT(*) FROM piece_versions) as versions_count;

-- Show all columns in annotations table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'annotations'
ORDER BY ordinal_position;