import { useEffect, useState } from 'react';

// Reads a video's length and title via the YouTube IFrame player (no API key needed).
// A hidden player is created off-screen, asked for getDuration() and destroyed again.

type DurationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; seconds: number; title: string }
  | { status: 'error'; message: string };

export function waitForYT(timeoutMs = 10000): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  // Load the API script if nobody did yet – without touching window.onYouTubeIframeAPIReady,
  // which the video overlay uses.
  if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (w.YT?.Player) resolve(w.YT);
      else if (Date.now() - start > timeoutMs) reject(new Error('YouTube konnte nicht geladen werden.'));
      else setTimeout(poll, 150);
    };
    poll();
  });
}

const ERRORS: Record<number, string> = {
  2: 'Ungültige Video-ID.',
  5: 'Das Video kann nicht abgespielt werden.',
  // YouTube reports missing, private and non-embeddable videos inconsistently with these codes
  100: 'Video nicht verfügbar – es existiert nicht, ist privat oder darf nicht eingebettet werden.',
  101: 'Video nicht verfügbar – es existiert nicht, ist privat oder darf nicht eingebettet werden.',
  150: 'Video nicht verfügbar – es existiert nicht, ist privat oder darf nicht eingebettet werden.',
};

export function useYouTubeDuration(videoId: string | null): DurationState {
  const [state, setState] = useState<DurationState>({ status: 'idle' });

  useEffect(() => {
    if (!videoId) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    let player: any = null;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none;';
    const mount = document.createElement('div');
    host.appendChild(mount);
    document.body.appendChild(host);
    setState({ status: 'loading' });

    const finish = (s: DurationState) => { if (!cancelled) setState(s); };

    waitForYT()
      .then(YT => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId,
          playerVars: { autoplay: 0, controls: 0, mute: 1 },
          events: {
            onReady: () => {
              // getDuration() is usually available right away, occasionally a moment later
              let tries = 0;
              const read = () => {
                const d = Math.round(player?.getDuration?.() || 0);
                if (d > 0) finish({ status: 'ok', seconds: d, title: player?.getVideoData?.()?.title || '' });
                else if (++tries < 20) setTimeout(read, 250);
                else finish({ status: 'error', message: 'Die Videolänge konnte nicht ermittelt werden.' });
              };
              read();
            },
            onError: (e: any) => finish({ status: 'error', message: ERRORS[e.data] || 'Das Video kann nicht geladen werden.' }),
          },
        });
      })
      .catch(err => finish({ status: 'error', message: err.message }));

    return () => {
      cancelled = true;
      try { player?.destroy(); } catch {}
      host.remove();
    };
  }, [videoId]);

  return state;
}
