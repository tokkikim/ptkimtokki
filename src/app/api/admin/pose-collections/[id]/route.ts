import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PUT - Update pose collection
export async function PUT(
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
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Update collection
    const { error: updateError } = await supabase
      .from('pose_collections')
      .update({
        name,
        description: description || null,
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Handle pose updates
    const poses = [];
    let poseIndex = 0;

    // Process new pose uploads
    while (formData.has(`pose_${poseIndex}`)) {
      const poseFile = formData.get(`pose_${poseIndex}`) as File;
      const poseName = formData.get(`pose_name_${poseIndex}`) as string;

      if (poseFile) {
        // Upload new image
        const fileName = `${id}/${Date.now()}_${poseIndex}.png`;
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

        // Create or update pose
        const { data: pose, error: poseError } = await supabase
          .from('poses')
          .upsert({
            collection_id: id,
            name: poseName || `포즈 ${poseIndex + 1}`,
            image_url: publicUrl,
            sort_order: poseIndex,
          })
          .select()
          .single();

        if (!poseError && pose) {
          poses.push(pose);

          // Update thumbnail if first pose
          if (poseIndex === 0) {
            await supabase
              .from('pose_collections')
              .update({ thumbnail: publicUrl })
              .eq('id', id);
          }
        }
      }

      poseIndex++;
    }

    // Process existing poses
    let existingIndex = 0;
    while (formData.has(`existing_pose_${existingIndex}`)) {
      const existingPoseData = formData.get(`existing_pose_${existingIndex}`) as string;
      try {
        const poseData = JSON.parse(existingPoseData);
        const { error: updatePoseError } = await supabase
          .from('poses')
          .update({
            name: poseData.name,
            sort_order: poseData.sort_order,
          })
          .eq('id', poseData.id);

        if (updatePoseError) {
          console.error('Error updating existing pose:', updatePoseError);
        }
      } catch (parseError) {
        console.error('Error parsing existing pose data:', parseError);
      }

      existingIndex++;
    }

    // Fetch updated collection with poses
    const { data: updatedCollection, error: fetchError } = await supabase
      .from('pose_collections')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const { data: allPoses } = await supabase
      .from('poses')
      .select('*')
      .eq('collection_id', id)
      .order('sort_order', { ascending: true });

    return NextResponse.json({ ...updatedCollection, poses: allPoses });
  } catch (error) {
    console.error('Error in PUT /api/admin/pose-collections/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete pose collection
export async function DELETE(
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

    // Check if it's a default collection
    const { data: collection, error: fetchError } = await supabase
      .from('pose_collections')
      .select('is_default')
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (collection.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete default collection' },
        { status: 400 }
      );
    }

    // Delete associated images from storage
    const { data: poses } = await supabase
      .from('poses')
      .select('image_url')
      .eq('collection_id', id);

    if (poses) {
      for (const pose of poses) {
        const fileName = pose.image_url.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('pose-images')
            .remove([`${id}/${fileName}`]);
        }
      }
    }

    // Delete collection (poses will be cascade deleted)
    const { error: deleteError } = await supabase
      .from('pose_collections')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/admin/pose-collections/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
