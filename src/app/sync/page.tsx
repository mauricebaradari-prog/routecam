'use client';

import AccountGate from '@/components/AccountGate';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// client-only: MapLibre + YouTube player
const SyncEditor = dynamic(() => import('@/components/SyncEditor'), { ssr: false });

// /sync?route=<id> – align the video of an own ride with its GPS track
function SyncPage() {
  const [routeId, setRouteId] = useState<string | null | undefined>(undefined);
  useEffect(() => { setRouteId(new URLSearchParams(window.location.search).get('route')); }, []);
  if (routeId === undefined) return <div className="h-screen bg-black" />;
  return <SyncEditor routeId={routeId} />;
}


export default function GatedSyncPage() {
  return <AccountGate><SyncPage /></AccountGate>;
}
