'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Support lives on the About page now – keep old links working.
export default function SupportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/about#support'); }, [router]);
  return null;
}
