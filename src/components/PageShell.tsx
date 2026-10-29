'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { useAllRoutes } from '@/lib/userRoutes';

// Scrolling content page with the shared top bar (settings, support …)
export default function PageShell({ title, subtitle, children, current = 'other' }: { title: string; subtitle?: string; children: React.ReactNode; current?: 'about' | 'other' }) {
  const router = useRouter();
  const routes = useAllRoutes();
  return (
    <div className="no-scrollbar h-screen overflow-y-auto w-full bg-[#0b0d10] text-white font-sans">
      <AppHeader
        routes={routes}
        activeRouteId=""
        onSelectRoute={id => router.push(`/?route=${id}`)}
        onCreate={() => router.push('/dashboard?create=1')}
        current={current}
        showSearch={false}
        sticky
      />
      <main className="w-full max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
        <div className="mt-8 flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}
