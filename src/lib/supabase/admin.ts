import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서만 사용할 Supabase Admin 클라이언트 (Service Role Key 사용)
// RLS를 우회하여 DB 업데이트 가능
// 주의: 이 키는 클라이언트에 노출되면 안 됨
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default supabaseAdmin;

