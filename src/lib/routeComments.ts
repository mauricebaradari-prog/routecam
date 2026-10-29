import { useCallback, useEffect, useMemo, useState } from 'react';
import { DUMMY_COMMENTS } from '@/data/dummyComments';

// Timed comments (SoundCloud-style): each comment sits at a point in the video,
// and therefore at a point on the route.
//
// INTERIM STORAGE: own comments live in localStorage until Supabase exists (see 07_TODO.md).
// Dummy comments come from src/data/dummyComments.ts and are meant to be deleted later.

export interface RouteComment {
  id: string;
  routeId: string;
  seconds: number; // position in the video
  author: string;
  color: string;   // avatar colour (no profile pictures yet)
  text: string;
  createdAt: string;
  dummy?: boolean;
}

const STORAGE_KEY = 'routecam.comments';
const CHANGE_EVENT = 'routecam:comments';

function loadOwn(): RouteComment[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
}

export function formatCommentTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// All comments (dummy + own), optionally for one route, sorted by video position.
export function useRouteComments(routeId?: string) {
  const [own, setOwn] = useState<RouteComment[]>([]);

  useEffect(() => {
    const sync = () => setOwn(loadOwn());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const all = useMemo(() => [...DUMMY_COMMENTS, ...own], [own]);
  const comments = useMemo(
    () => (routeId ? all.filter(c => c.routeId === routeId) : all).sort((a, b) => a.seconds - b.seconds),
    [all, routeId],
  );

  const countOf = useCallback((id: string) => all.filter(c => c.routeId === id).length, [all]);

  const addComment = useCallback((rId: string, seconds: number, text: string, author = 'Du') => {
    const comment: RouteComment = {
      id: `c-${Date.now().toString(36)}`,
      routeId: rId,
      seconds: Math.max(0, Math.round(seconds)),
      author,
      color: '#CCFF00',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadOwn(), comment]));
    } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { comments, countOf, addComment };
}
