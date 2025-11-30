-- Create prompt_templates table
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'pose_generation',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  version INTEGER DEFAULT 1
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON public.prompt_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON public.prompt_templates(category);

-- Enable RLS
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- Public read for active prompts
CREATE POLICY "Allow public read active prompts"
  ON public.prompt_templates FOR SELECT
  USING (is_active = true);

-- Authenticated users can read all
CREATE POLICY "Allow authenticated read all prompts"
  ON public.prompt_templates FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Allow authenticated insert prompts"
  ON public.prompt_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Allow authenticated update prompts"
  ON public.prompt_templates FOR UPDATE
  TO authenticated
  USING (true);

-- Authenticated users can delete
CREATE POLICY "Allow authenticated delete prompts"
  ON public.prompt_templates FOR DELETE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER set_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default prompt template
INSERT INTO public.prompt_templates (name, description, template, variables, is_active, category)
VALUES (
  '기본 포즈 생성 프롬프트',
  'AI 포즈 생성을 위한 기본 프롬프트 템플릿',
  '첫 번째 이미지는 생성할 인물 사진이고, 두 번째 이미지는 2x2 그리드로 배치된 {{pose_count}}가지 포즈 레퍼런스입니다. 인물 사진의 인물이 각 레퍼런스 포즈를 취하도록 {{pose_count}}개의 포즈를 생성해주세요. {{pose_descriptions}} 인물의 얼굴과 신체 특징은 그대로 유지하면서 포즈만 레퍼런스와 동일하게 변경해주세요. {{style_instruction}} 배경은 투명하게 처리하고, 2x2 그리드 형태로 생성해주세요.',
  '[
    {"name": "pose_count", "description": "생성할 포즈 개수", "default": "4"},
    {"name": "pose_descriptions", "description": "각 포즈에 대한 설명", "default": "왼쪽 위부터 시계방향으로: 1) 웃는 포즈, 2) 손가락 포인트 포즈, 3) 생각하는 포즈, 4) 하트 포즈입니다."},
    {"name": "style_instruction", "description": "스타일 지시사항", "default": "실물사진을 애니메이션화 하지 마세요."}
  ]'::jsonb,
  true,
  'pose_generation'
) ON CONFLICT DO NOTHING;
