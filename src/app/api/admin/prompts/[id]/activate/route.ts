import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Activate prompt template (deactivate others in same category)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the category of the prompt to activate
    const { data: promptToActivate, error: fetchError } = await supabase
      .from('prompt_templates')
      .select('category')
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Deactivate all prompts in the same category
    await supabase
      .from('prompt_templates')
      .update({ is_active: false })
      .eq('category', promptToActivate.category);

    // Activate the selected prompt
    const { data: prompt, error } = await supabase
      .from('prompt_templates')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(prompt);
  } catch (error) {
    console.error('Error in POST /api/admin/prompts/[id]/activate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
