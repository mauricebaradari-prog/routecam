import React, { useEffect, useRef, useState } from 'react';
import { useEditorState } from '../hooks/useEditorState';
import { Rnd } from 'react-rnd';
import { lockIframes, unlockIframes } from '@/lib/dragGuard';
import Link from 'next/link';
import { GripHorizontal, ChevronRight, Maximize2, Minimize2, Play, Pause } from 'lucide-react';
import { ownerOf, channelHref, type RouteOwner } from '@/lib/channels';
import { loadAllRoutes } from '@/lib/userRoutes';
import ChannelAvatar from '@/components/ChannelAvatar';
import { leaveWhilePlaying } from '@/lib/nav';
import { waitForYT } from '@/lib/youtubeDuration';
import { VisibilityIcon, visibilityLabel } from '@/components/Visibility';

export default function YouTubeOverlay({ state, startAnimation, stopAnimation, initialPos, setActiveWindow, visibility }: any) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const isInternalChange = useRef(false);
  const hasInitialized = useRef(false);
  const currentVideoIdRef = useRef<string>(state.videoId || '5EgtgRoC8NI');

  const [pos, setPos] = useState({ 
    x: 96, // right of the left control column; the right side holds the info windows
    y: 80 
  });
  const [size, setSize] = useState({ width: 320, height: 218 + CHANNEL_BAR_H });
  const hasSetInitial = useRef(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [videoTitle, setVideoTitle] = useState("YOUTUBE VIDEO");

  // Fallback: the start position is only reported while progress is 0. When the page opens
  // mid-route (deep link ?t=), show the window at its default position anyway.
  useEffect(() => {
    const t = setTimeout(() => {
      // only when opened mid-route; at progress 0 the start position arrives with the map
      if (!hasSetInitial.current && (window as any).__EDITOR_STATE?.animationProgress > 0) setIsPositioned(true);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // The window sits at the start of the ride. It follows the start while the camera settles
  // after a route is selected (fly-in ~1.5 s), then stays put. A new route places it again –
  // unless the user has moved/resized the window for this route.
  const placedKeyRef = useRef<string | undefined>(undefined);
  const placedAtRef = useRef(0);
  const userMovedRef = useRef(false);
  useEffect(() => {
    if (!initialPos) return;
    const now = Date.now();
    if (initialPos.key !== placedKeyRef.current) {
      placedKeyRef.current = initialPos.key;
      placedAtRef.current = now;
      userMovedRef.current = false;
    } else if (userMovedRef.current || now - placedAtRef.current > 3000) {
      return;
    }
    setPos({ x: initialPos.x, y: initialPos.y });
    if (!hasSetInitial.current) {
      hasSetInitial.current = true;
      // Small delay to ensure the position is applied before fading in
      setTimeout(() => setIsPositioned(true), 100);
    }
  }, [initialPos]);

  useEffect(() => {
    const initPlayer = () => {
      if (playerRef.current) return;
      playerRef.current = new (window as any).YT.Player('youtube-player', {
        videoId: currentVideoIdRef.current,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          disablekb: 1,
          rel: 0,
          showinfo: 0,
          origin: window.location.origin,
          vq: isMobile ? 'hd1080' : undefined
        },
        events: {
          'onReady': () => { 
            setIsReady(true); 
            (window as any).__YT_PLAYER = playerRef.current; 
            // The route (and its video) may have changed while the player was still loading –
            // the switch effect skipped it then, so catch up here (cue = load without playing).
            try {
              const want = currentVideoIdRef.current;
              if (want && playerRef.current.getVideoData?.()?.video_id !== want) playerRef.current.cueVideoById(want, 0);
            } catch {}
            try {
              if (isMobile && playerRef.current.setPlaybackQuality) {
                 playerRef.current.setPlaybackQuality('hd1080');
              }
              const data = playerRef.current.getVideoData();
              if (data && data.title) {
                setVideoTitle(data.title);
              }
            } catch(e) {}
          },
          'onStateChange': (event: any) => {
            // keep the header title in sync when another video was loaded (route / perspective switch)
            try {
              const t = playerRef.current?.getVideoData?.()?.title;
              if (t) setVideoTitle(prev => (prev === t ? prev : t));
            } catch {}
            try {
              if (isMobile && event.data === 1 && playerRef.current.setPlaybackQuality) {
                 playerRef.current.setPlaybackQuality('hd1080');
              }
            } catch(e) {}
            
            if (isInternalChange.current || (window as any).__IS_SCRUBBING) return;
            const isPlaying = event.data === 1;
            const isPaused = event.data === 2;
            // Buffering no longer stops the ride: the animation loop simply waits while the video
            // buffers (see useEditorState). Stopping here raced with the following "playing" event
            // and left the map stopped while the video played on.
            const currentState = (window as any).__EDITOR_STATE;
            
            if (isPlaying && !currentState.isAnimating) {
              if (!(window as any).__yt_throttle_play) {
                (window as any).__yt_throttle_play = setTimeout(() => {
                  startAnimation();
                  (window as any).__yt_throttle_play = null;
                }, 100);
              }
            } else if (isPaused && currentState.isAnimating) {
              if (!(window as any).__yt_throttle_pause) {
                (window as any).__yt_throttle_pause = setTimeout(() => {
                  stopAnimation();
                  (window as any).__yt_throttle_pause = null;
                }, 100);
              }
            }
          }
        }
      });
    };

    // Loads the API script if needed and waits until YT.Player exists (also when another
    // component – e.g. the video-length check in "Anlegen" – started loading it first)
    let cancelled = false;
    waitForYT(15000).then(() => { if (!cancelled) initPlayer(); }).catch(() => {});

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setIsReady(false);
      }
    };
  }, [startAnimation, stopAnimation]);

  // ── Switch video when route changes ──
  useEffect(() => {
    const newVideoId = state.videoId;
    if (!newVideoId || newVideoId === currentVideoIdRef.current) return;
    currentVideoIdRef.current = newVideoId;
    
    if (playerRef.current && playerRef.current.loadVideoById) {
      isInternalChange.current = true;
      // paused (e.g. opened from a notification): only cue – loadVideoById would start playing
      if ((window as any).__EDITOR_STATE?.isAnimating) playerRef.current.loadVideoById(newVideoId, 0);
      else playerRef.current.cueVideoById(newVideoId, 0);
      // Wait for the new video to be ready, then update the title
      setTimeout(() => {
        try {
          const data = playerRef.current.getVideoData();
          if (data && data.title) {
            setVideoTitle(data.title);
          }
        } catch(e) {}
        // Pause it so it doesn't autoplay, but only if we are not animating!
        const currentState = (window as any).__EDITOR_STATE;
        if (!currentState?.isAnimating) {
          try { playerRef.current.pauseVideo(); } catch(e) {}
        }
        isInternalChange.current = false;
      }, 1500);
    }
  }, [state.videoId]);

  useEffect(() => {
    (window as any).__EDITOR_STATE = state;
    
    const btn = document.getElementById('top-left-play-btn');
    if (btn) {
      const handler = () => {
        if (!state.isAnimating && playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        } else if (state.isAnimating && playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
      };
      btn.addEventListener('click', handler);
      return () => btn.removeEventListener('click', handler);
    }
  }, [state]);

  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    isInternalChange.current = true;
    if (state.isAnimating) {
      if (typeof playerRef.current.playVideo === 'function') playerRef.current.playVideo();
    } else {
      const playerState = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
      if (playerState !== -1 && playerState !== 5) {
        if (typeof playerRef.current.pauseVideo === 'function') playerRef.current.pauseVideo();
      }
    }
    setTimeout(() => { isInternalChange.current = false; }, 200);
  }, [state.isAnimating, isReady]);

  const lastProgress = useRef(state.animationProgress);
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    if (state.animationProgress === 0 && lastProgress.current === 0) return;
    
    // Check if progress jumped significantly (e.g., a manual seek)
    const isManualSeek = Math.abs(state.animationProgress - lastProgress.current) > 0.005;
    
    if (isManualSeek || !state.isAnimating) {
      if (state.animationProgress !== lastProgress.current) {
        const targetTime = state.animationProgress * (state.durationSeconds || 2056);
        const ps = typeof playerRef.current.getPlayerState === 'function' ? playerRef.current.getPlayerState() : -1;
        if (!state.isAnimating && (ps === -1 || ps === 5)) {
          // not started yet: seekTo would START the video (and with it the ride) –
          // cue it at that second instead, it stays paused there (deep link / notification)
          (window as any).__IS_SCRUBBING = true;
          playerRef.current.cueVideoById({ videoId: currentVideoIdRef.current, startSeconds: targetTime });
          setTimeout(() => { (window as any).__IS_SCRUBBING = false; }, 800);
        } else {
          playerRef.current.seekTo(targetTime, true);
        }
        lastProgress.current = state.animationProgress;
      }
    } else {
      // Natural progression while playing, just update lastProgress so we don't seek next time
      lastProgress.current = state.animationProgress;
    }
  }, [state.animationProgress, isReady, state.isAnimating]);

  useEffect(() => {
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(state.animSpeed);
    }
  }, [state.animSpeed]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Fullscreen video ──
  // Native Fullscreen API on the video box (the map keeps running behind it, so the ride stays
  // in sync). Where the API is missing (iPhone Safari only allows <video> elements), the box
  // is pinned over the whole window instead.
  const fsRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState<'off' | 'native' | 'css'>('off');
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(f => (f === 'native' ? 'off' : f)); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (fullscreen !== 'css') return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen('off'); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [fullscreen]);
  const toggleFullscreen = async () => {
    if (fullscreen === 'native') { try { await document.exitFullscreen(); } catch {} return; }
    if (fullscreen === 'css') { setFullscreen('off'); return; }
    const el = fsRef.current as any;
    if (el?.requestFullscreen) {
      // some embedded browsers never settle the promise – don't wait forever
      try { await Promise.race([el.requestFullscreen({ navigationUI: 'hide' }), new Promise(r => setTimeout(r, 700))]); } catch {}
      if (document.fullscreenElement) { setFullscreen('native'); return; }
    }
    setFullscreen('css');
  };
  const togglePlay = () => {
    const pl = playerRef.current;
    if (!pl) return;
    if (state.isAnimating) pl.pauseVideo?.(); else pl.playVideo?.();
  };
  const isFull = fullscreen !== 'off';
  const cssFullDesktop = fullscreen === 'css' && !isMobile;
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!cssFullDesktop) return;
    const fit = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [cssFullDesktop]);
  const fmt = (sec: number) => { const m = Math.floor(sec / 60), x = Math.floor(sec % 60); return `${m}:${String(x).padStart(2, '0')}`; };
  const routeName = state.routes?.find((r: any) => r.id === state.activeRouteId)?.name ?? '';

  const headerContent = (
    <div className="drag-handle w-full flex items-center justify-between cursor-move text-white/50 hover:text-white/90 transition-colors px-3" style={{ height: '38px', minHeight: '38px', flexShrink: 0 }}>
      {visibility && (
        <span title={`Sichtbarkeit: ${visibilityLabel(visibility)}`} className="shrink-0 mr-2.5 flex items-center">
          <VisibilityIcon v={visibility} size={15} />
        </span>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden mr-2 pointer-events-none select-none h-full pt-0.5">
        <span className="text-white text-[11px] font-bold tracking-wide uppercase opacity-80 truncate">
          {videoTitle}
        </span>
        <span className="text-[#CCFF00]/80 text-[8px] tracking-wider uppercase font-medium truncate mt-[-1px]">
          *Video might not be 100% synced with route
        </span>
      </div>
      {!isMobile && (
        <button type="button" onClick={toggleFullscreen} title="Vollbild" aria-label="Video im Vollbild"
          className="no-drag shrink-0 mr-1.5 w-7 h-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
          <Maximize2 size={15} />
        </button>
      )}
      {!isMobile && <GripHorizontal size={20} className="shrink-0" />}
    </div>
  );

  // whose ride is this → their RouteCam channel (owner is resolved on the client; localStorage)
  const [owner, setOwner] = useState<{ owner: RouteOwner; rides: number } | null>(null);
  useEffect(() => {
    const route = state.routes?.find((r: any) => r.id === state.activeRouteId);
    if (!route) { setOwner(null); return; }
    const o = ownerOf(route);
    setOwner({ owner: o, rides: loadAllRoutes().filter(r => ownerOf(r).id === o.id).length });
  }, [state.activeRouteId, state.routes]);
  const channelBar = <ChannelBar data={owner} />;

  const videoContent = (
    <div className="w-full relative bg-black" style={{ height: cssFullDesktop ? '100%' : isMobile ? `calc(100% - ${CHANNEL_BAR_H}px)` : `calc(100% - 38px - ${CHANNEL_BAR_H}px)` }}>
      <div ref={fsRef} className={`group/fs bg-black ${fullscreen === 'css' && isMobile ? 'fixed inset-0 z-[200]' : 'absolute inset-0'}`}>
        <div id="youtube-player" className="absolute inset-0 w-full h-full"></div>

        {/* phone: small enter-fullscreen button on the video */}
        {isMobile && !isFull && (
          <button type="button" onClick={toggleFullscreen} aria-label="Video im Vollbild"
            className="absolute right-2 top-2 z-10 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white">
            <Maximize2 size={16} />
          </button>
        )}

        {/* fullscreen controls at the bottom: progress, play/pause, ride name + time, exit */}
        {isFull && (
          <div className="absolute inset-0 z-10 pointer-events-none opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/fs:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-x-0 bottom-0 px-5 pt-12 pb-[max(16px,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/75 to-transparent pointer-events-auto">
              <div className="h-1 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-[#CCFF00]" style={{ width: `${(state.animationProgress || 0) * 100}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={togglePlay} aria-label={state.isAnimating ? 'Pause' : 'Abspielen'}
                  className="w-10 h-10 rounded-full bg-[#CCFF00] text-black flex items-center justify-center hover:brightness-110">
                  {state.isAnimating ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-semibold text-white truncate">{routeName || videoTitle}</div>
                  <div className="text-xs text-white/70 tabular-nums">
                    {fmt((state.animationProgress || 0) * (state.durationSeconds || 0))} / {fmt(state.durationSeconds || 0)}
                  </div>
                </div>
                <button type="button" onClick={toggleFullscreen} aria-label="Vollbild beenden" title="Vollbild beenden (Esc)"
                  className="ml-auto h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium inline-flex items-center gap-1.5">
                  <Minimize2 size={15} /> Beenden
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div 
        className={`absolute left-0 w-full bg-black ${fullscreen === 'css' ? 'z-[200]' : 'z-50'} border-t border-b border-white/10`} 
        style={{ top: '40vh', height: '35vh' }}
      >
        {videoContent}
        {channelBar}
      </div>
    );
  }

  return (
    <Rnd
      position={cssFullDesktop ? { x: 0, y: 0 } : { x: pos.x, y: pos.y }}
      size={cssFullDesktop ? { width: viewport.w || size.width, height: viewport.h || size.height } : { width: size.width, height: size.height }}
      disableDragging={cssFullDesktop}
      enableResizing={!cssFullDesktop}
      onDragStop={(e, d) => { unlockIframes(); userMovedRef.current = true; setPos({ x: d.x, y: d.y }); }}
      onResizeStart={lockIframes}
      onResizeStop={(e, direction, ref, delta, position) => {
        unlockIframes();
        userMovedRef.current = true;
        setSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
        setPos(position);
      }}
      minWidth={200}
      minHeight={150}
      lockAspectRatio={16/9}
      lockAspectRatioExtraHeight={38 + CHANNEL_BAR_H}
      bounds={cssFullDesktop ? undefined : 'parent'}
      dragHandleClassName="drag-handle"
      cancel=".no-drag"
      className={`rounded-xl overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_rgba(0,0,0,0.5)] border border-white/20 bg-black/60 backdrop-blur-md flex flex-col transition-opacity duration-1000 ${isPositioned ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ zIndex: cssFullDesktop ? 200 : state.activeWindow === 'video' ? 60 : 50, ...(cssFullDesktop ? { position: 'fixed', borderRadius: 0, border: 0 } : {}) }}
      onDragStart={() => { lockIframes(); setActiveWindow && setActiveWindow('video'); }}
      onMouseDown={() => setActiveWindow && setActiveWindow('video')}
    >
      {!cssFullDesktop && headerContent}
      {videoContent}
      {!cssFullDesktop && channelBar}
    </Rnd>
  );
}

const CHANNEL_BAR_H = 44;

// Whose ride this is – links to their RouteCam channel. Only exists while a ride's video is open.
function ChannelBar({ data }: { data: { owner: RouteOwner; rides: number } | null }) {
  return (
    <div className="w-full flex items-center gap-2.5 px-3 border-t border-white/10 bg-black/40" style={{ height: CHANNEL_BAR_H, minHeight: CHANNEL_BAR_H, flexShrink: 0 }}>
      {!data ? (
        <>
          <span className="w-7 h-7 rounded-full bg-white/10 animate-pulse shrink-0" />
          <span className="h-2.5 w-28 rounded bg-white/10 animate-pulse" />
        </>
      ) : (
        <Link
          href={channelHref(data.owner.id)}
          onMouseDown={e => e.stopPropagation()}
          onClick={leaveWhilePlaying} // see lib/nav.ts
          className="group flex-1 min-w-0 flex items-center gap-2.5 -mx-1.5 px-1.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ChannelAvatar owner={data.owner} size={28} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[12px] font-semibold text-white truncate" title={data.owner.name}>{data.owner.name}</div>
            <div className="text-[10px] text-white/45 tabular-nums">{data.rides} {data.rides === 1 ? 'Fahrt' : 'Fahrten'} auf RouteCam</div>
          </div>
          <span className="shrink-0 inline-flex items-center gap-0.5 h-7 pl-3 pr-2 rounded-full bg-white/10 group-hover:bg-[#CCFF00] group-hover:text-black text-[11px] font-medium text-white transition-colors">
            Kanal <ChevronRight size={14} />
          </span>
        </Link>
      )}
    </div>
  );
}
