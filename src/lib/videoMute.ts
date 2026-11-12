// Video stumm schalten (Knopf links an der Karte). Gilt für den Player der Karte und bleibt
// über neue Fahrten und Neuladen hinweg erhalten (nur in diesem Browser).
const KEY = 'routecam.muted';

export function isVideoMuted(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function applyVideoMute(player: YTPlayer | undefined | null, muted = isVideoMuted()) {
  try { if (muted) player?.mute?.(); else player?.unMute?.(); } catch {}
}

export function setVideoMuted(muted: boolean) {
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
  applyVideoMute(window.__YT_PLAYER, muted);
}
