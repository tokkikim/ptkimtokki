-- Create pose_collections table
CREATE TABLE IF NOT EXISTS public.pose_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create poses table
CREATE TABLE IF NOT EXISTS public.poses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES public.pose_collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pose_collections_default ON public.pose_collections(is_default);
CREATE INDEX IF NOT EXISTS idx_poses_collection_id ON public.poses(collection_id);
CREATE INDEX IF NOT EXISTS idx_poses_sort_order ON public.poses(collection_id, sort_order);

-- Enable RLS
ALTER TABLE public.pose_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poses ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to pose_collections"
  ON public.pose_collections FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to poses"
  ON public.poses FOR SELECT
  USING (true);

-- Create policies for authenticated admin users (you can customize this)
CREATE POLICY "Allow admin insert pose_collections"
  ON public.pose_collections FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow admin update pose_collections"
  ON public.pose_collections FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin delete pose_collections"
  ON public.pose_collections FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin insert poses"
  ON public.poses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow admin update poses"
  ON public.poses FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin delete poses"
  ON public.poses FOR DELETE
  USING (auth.role() = 'authenticated');

-- Storage bucket creation and policies (execute manually in Supabase Dashboard)
-- NOTE: Run these commands in Supabase Dashboard → Storage → Policies
--
-- 1. Create bucket (if not exists):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('pose-images', 'pose-images', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- 2. Allow public read access:
-- CREATE POLICY "Public read access for pose images"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'pose-images');
--
-- 3. Allow authenticated users to upload:
-- CREATE POLICY "Authenticated users can upload pose images"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'pose-images');
--
-- 4. Allow authenticated users to update:
-- CREATE POLICY "Authenticated users can update pose images"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (bucket_id = 'pose-images');
--
-- 5. Allow authenticated users to delete:
-- CREATE POLICY "Authenticated users can delete pose images"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (bucket_id = 'pose-images');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for pose_collections
CREATE TRIGGER set_pose_collections_updated_at
  BEFORE UPDATE ON public.pose_collections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default pose collection
INSERT INTO public.pose_collections (name, description, is_default, thumbnail)
VALUES (
  '기본 포즈',
  '기본 제공 레퍼런스 포즈',
  true,
  '/reference-poses/rabbit-smile.png'
) ON CONFLICT DO NOTHING;

-- Get the default collection ID
DO $$
DECLARE
  default_collection_id UUID;
BEGIN
  SELECT id INTO default_collection_id
  FROM public.pose_collections
  WHERE is_default = true
  LIMIT 1;

  -- Insert default poses
  INSERT INTO public.poses (collection_id, name, image_url, sort_order) VALUES
    (default_collection_id, '웃는 포즈', '/reference-poses/rabbit-smile.png', 0),
    (default_collection_id, '손가락 포인트', '/reference-poses/rabbit-point.png', 1),
    (default_collection_id, '생각하는 포즈', '/reference-poses/rabbit-think.png', 2),
    (default_collection_id, '하트 포즈', '/reference-poses/rabbit-heart.png', 3)
  ON CONFLICT DO NOTHING;
END $$;
