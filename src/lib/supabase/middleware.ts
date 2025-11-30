import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // refreshing the auth token
  // 사용자가 로그인하지 않았거나 토큰이 만료된 경우 에러가 발생할 수 있지만,
  // 이는 자연스러운 현상이므로 무시합니다.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // 보호된 경로 설정 (로그인이 필요한 페이지)
    // 예: /dashboard, /payment 등
    // 현재는 /pose-overlay-test도 로그인 없이 접근 가능하지만, 추후 정책에 따라 변경 가능
    // 여기서는 예시로 /protected 로 시작하는 경로만 보호
    if (request.nextUrl.pathname.startsWith('/protected') && !user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // 로그인된 사용자가 로그인/회원가입 페이지 접근 시 메인으로 리다이렉트
    if ((request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/auth')) && user) {
        // /auth/callback, /auth/confirm 등은 제외해야 함 (이메일 인증 등 처리를 위해)
        if (!request.nextUrl.pathname.startsWith('/auth/callback') && !request.nextUrl.pathname.startsWith('/auth/confirm')) {
             const url = request.nextUrl.clone()
             url.pathname = '/'
             return NextResponse.redirect(url)
        }
    }

  } catch (e) {
    // 세션 없음 또는 토큰 만료됨
  }

  return supabaseResponse
}

