'use client';

// Rundes Nutzerbild: Profilbild (Google), sonst Initialen mit gut lesbarem Kontrast.
import React, { useState } from 'react';
import { avatarColors, initials } from '@/lib/avatar';

export default function UserAvatar({ name, picture, seed, size = 40, className = '', style }: {
  name: string; picture?: string | null; seed?: string; size?: number; className?: string; style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const { bg, fg } = avatarColors(seed || name);
  const showImg = !!picture && broken !== picture;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold leading-none select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.38)), background: showImg ? '#2a2a2a' : bg, color: fg, ...style }}
      aria-hidden
    >
      {showImg
        ? <img src={picture!} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={() => setBroken(picture!)} />
        : initials(name)}
    </span>
  );
}
