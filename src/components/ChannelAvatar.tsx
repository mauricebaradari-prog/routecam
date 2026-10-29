import React from 'react';
import { initialOf, type RouteOwner } from '@/lib/channels';

export default function ChannelAvatar({ owner, size }: { owner: RouteOwner; size: number }) {
  return owner.picture ? (
    <img src={owner.picture} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-[#CCFF00]/15 text-[#CCFF00] font-semibold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {initialOf(owner.name)}
    </span>
  );
}
