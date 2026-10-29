import type React from 'react';

// While a ride plays, the map page updates React state every frame. Those updates keep
// interrupting Next's client-side navigation (it runs as a transition) so a <Link> click
// never commits. During playback, follow the link with a normal page load instead.
export function leaveWhilePlaying(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!(window as any).__EDITOR_STATE?.isAnimating) return;
  e.preventDefault();
  window.location.assign(e.currentTarget.href);
}
