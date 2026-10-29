'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { openSignupWall } from '@/lib/signupWall';
import SignupWall from '@/components/SignupWall';

// Pages that belong to an account (dashboard, settings, sync editor). Signed out, the page
// content is never rendered – only a short note plus the sign-up wall.
// NOTE: this protects the interface. The data itself is protected by the database rules
// (Row Level Security) once Supabase is in place.
export default function AccountGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();

  useEffect(() => { if (ready && !user) openSignupWall('account'); }, [ready, user]);

  if (!ready) return <div className="h-screen bg-[#0b0d10]" />;
  if (user) return <>{children}</>;

  return (
    <div className="h-screen bg-[#0b0d10] text-white flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60"><Lock size={20} /></span>
        <h1 className="mt-4 text-lg font-semibold">Dieser Bereich gehört zu deinem Konto</h1>
        <p className="mt-1.5 text-sm text-white/55">Melde dich an, um ihn zu öffnen.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={() => openSignupWall('account')} className="h-10 px-5 rounded-full bg-[#CCFF00] text-black text-sm font-semibold hover:brightness-110">Anmelden</button>
          <Link href="/" className="h-10 px-4 rounded-full text-sm text-white/70 hover:bg-white/10 inline-flex items-center">Zur Karte</Link>
        </div>
      </div>
      <SignupWall />
    </div>
  );
}
