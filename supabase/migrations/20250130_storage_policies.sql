-- Storage Bucket and Policies for pose-images
-- Execute this in Supabase Dashboard → SQL Editor

-- 1. Create the storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pose-images', 'pose-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public read access for pose images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload pose images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pose images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete pose images" ON storage.objects;

-- 3. Allow public read access to pose images
CREATE POLICY "Public read access for pose images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pose-images');

-- 4. Allow authenticated users to upload pose images
CREATE POLICY "Authenticated users can upload pose images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pose-images');

-- 5. Allow authenticated users to update pose images
CREATE POLICY "Authenticated users can update pose images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'pose-images');

-- 6. Allow authenticated users to delete pose images
CREATE POLICY "Authenticated users can delete pose images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pose-images');
