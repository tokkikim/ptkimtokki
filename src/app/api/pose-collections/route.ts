import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Public API to fetch pose collections (for PoseSelector)
export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all collections
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
          return {
            id: collection.id,
            name: collection.name,
            poses: [],
            thumbnail: collection.thumbnail,
          };
        }

        return {
          id: collection.id,
          name: collection.name,
          poses: poses.map((pose) => ({
            id: pose.id,
            name: pose.name,
            image: pose.image_url,
          })),
          thumbnail: collection.thumbnail,
        };
      })
    );

    return NextResponse.json(collectionsWithPoses);
  } catch (error) {
    console.error('Error in GET /api/pose-collections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
