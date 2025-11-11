"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root page - Redirects to dashboard
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="text-sm text-black/60 dark:text-white/60 uppercase tracking-wider animate-pulse">
          Loading Observatory...
        </div>
      </div>
    </div>
  );
}
