import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all pose collections with their poses
export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch collections
    const { data: collections, error: collectionsError } = await supabase
      .from('pose_collections')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (collectionsError) {
      return NextResponse.json({ error: collectionsError.message }, { status: 500 });
    }

    // Fetch poses for each collection
    const collectionsWithPoses = await Promise.all(
      collections.map(async (collection) => {
        const { data: poses, error: posesError } = await supabase
          .from('poses')
          .select('*')
          .eq('collection_id', collection.id)
          .order('sort_order', { ascending: true });

        if (posesError) {
          console.error('Error fetching poses:', posesError);
          return { ...collection, poses: [] };
        }

        return { ...collection, poses };
      })
    );

    return NextResponse.json(collectionsWithPoses);
  } catch (error) {
    console.error('Error in GET /api/admin/pose-collections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new pose collection
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create collection
    const { data: collection, error: collectionError } = await supabase
      .from('pose_collections')
      .insert({
        name,
        description: description || null,
      })
      .select()
      .single();

    if (collectionError) {
      return NextResponse.json({ error: collectionError.message }, { status: 500 });
    }

    // Upload pose images and create pose records
    const poses = [];
    let poseIndex = 0;

    while (formData.has(`pose_${poseIndex}`)) {
      const poseFile = formData.get(`pose_${poseIndex}`) as File;
      const poseName = formData.get(`pose_name_${poseIndex}`) as string;

      if (poseFile) {
        // Upload image to Supabase Storage
        const fileName = `${collection.id}/${Date.now()}_${poseIndex}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('pose-images')
          .upload(fileName, poseFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          poseIndex++;
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('pose-images')
          .getPublicUrl(fileName);

        // Create pose record
        const { data: pose, error: poseError } = await supabase
          .from('poses')
          .insert({
            collection_id: collection.id,
            name: poseName || `포즈 ${poseIndex + 1}`,
            image_url: publicUrl,
            sort_order: poseIndex,
          })
          .select()
          .single();

        if (!poseError && pose) {
          poses.push(pose);

          // Set first pose as thumbnail
          if (poseIndex === 0) {
            await supabase
              .from('pose_collections')
              .update({ thumbnail: publicUrl })
              .eq('id', collection.id);
          }
        }
      }

      poseIndex++;
    }

    return NextResponse.json({ ...collection, poses }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/pose-collections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
