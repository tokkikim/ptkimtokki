import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all prompt templates
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: prompts, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(prompts);
  } catch (error) {
    console.error('Error in GET /api/admin/prompts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new prompt template
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, template, variables, category } = body;

    if (!name || !template) {
      return NextResponse.json({ error: 'Name and template are required' }, { status: 400 });
    }

    const { data: prompt, error } = await supabase
      .from('prompt_templates')
      .insert({
        name,
        description: description || null,
        template,
        variables: variables || [],
        category: category || 'pose_generation',
        is_active: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/prompts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
