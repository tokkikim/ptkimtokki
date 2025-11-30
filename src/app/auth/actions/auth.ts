'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect('/login?error=Could not authenticate user')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    redirect('/login?error=Could not create user')
  }

  revalidatePath('/', 'layout')
  redirect('/login?message=Check email to continue sign in process')
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  
  // 1. 환경 변수 (NEXT_PUBLIC_SITE_URL) 우선 사용
  // 2. 없으면 origin 헤더 사용
  // 3. 그것도 없으면 localhost:3000 (로컬 개발 최후의 수단)
  let origin = process.env.NEXT_PUBLIC_SITE_URL;
  
  if (!origin) {
    const headerOrigin = (await headers()).get('origin');
    if (headerOrigin) {
      origin = headerOrigin;
    } else {
      origin = 'http://localhost:3000';
    }
  }

  // 로컬 개발 중 0.0.0.0으로 잡히는 경우 강제로 localhost로 변경
  if (origin.includes('0.0.0.0')) {
    origin = origin.replace('0.0.0.0', 'localhost');
  }

  console.log('[Auth] Redirecting to:', `${origin}/auth/callback`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    redirect('/login?error=Could not authenticate with Google')
  }

  if (data.url) {
    redirect(data.url)
  }
}

export async function signout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/')
}
