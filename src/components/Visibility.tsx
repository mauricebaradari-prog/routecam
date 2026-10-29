import React from 'react';
import { Lock, Link2, Globe } from 'lucide-react';
import { VISIBILITY_OPTIONS, type Visibility } from '@/lib/routeVisibility';

// Shared look for the three visibility states (icon, colour, badge).
const ICONS: Record<Visibility, typeof Lock> = { private: Lock, unlisted: Link2, public: Globe };

export const VISIBILITY_COLOR: Record<Visibility, string> = {
  public:   'text-[#CCFF00]',
  unlisted: 'text-amber-300',
  private:  'text-red-300',
};

const BADGE_BG: Record<Visibility, string> = {
  public:   'bg-[#CCFF00]/15',
  unlisted: 'bg-amber-400/15',
  private:  'bg-red-500/15',
};

export function visibilityLabel(v: Visibility) {
  return VISIBILITY_OPTIONS.find(o => o.value === v)!.label;
}

export function VisibilityIcon({ v, size = 16, className = '' }: { v: Visibility; size?: number; className?: string }) {
  const Icon = ICONS[v];
  return <Icon size={size} className={`${VISIBILITY_COLOR[v]} ${className}`} aria-hidden />;
}

export function VisibilityBadge({ v, size = 'sm' }: { v: Visibility; size?: 'sm' | 'md' }) {
  const Icon = ICONS[v];
  const md = size === 'md';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${BADGE_BG[v]} ${VISIBILITY_COLOR[v]} ${
      md ? 'h-8 px-3 text-xs' : 'px-2 py-0.5 text-[11px]'
    }`}>
      <Icon size={md ? 14 : 12} aria-hidden />
      {visibilityLabel(v)}
    </span>
  );
}
