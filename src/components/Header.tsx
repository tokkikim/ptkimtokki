'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { signout } from '@/app/auth/actions/auth';
import { LogIn, LogOut, User as UserIcon, Settings } from 'lucide-react';

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 h-14">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📸 <span className="hidden sm:inline">키치 인생네컷</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="relative group">
                <button className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-1">
                  <Settings size={18} />
                  <span className="hidden sm:inline">관리자</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <Link
                    href="/admin/poses"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg"
                  >
                    포즈 관리
                  </Link>
                  <Link
                    href="/admin/prompts"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg"
                  >
                    프롬프트 관리
                  </Link>
                </div>
              </div>
              <Link
                href="/mypage"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <UserIcon size={18} />
                <span className="hidden sm:inline">마이페이지</span>
              </Link>
              <form action={signout}>
                <button
                  className="text-sm font-medium text-gray-600 hover:text-red-600 flex items-center gap-1"
                >
                  <LogOut size={18} />
                  <span className="hidden sm:inline">로그아웃</span>
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <LogIn size={16} />
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

