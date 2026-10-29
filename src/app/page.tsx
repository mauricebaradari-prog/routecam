'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { 
  Play, Pause, RotateCcw, 
  Map as MapIcon, Plane, Car, Palette, Settings, Download, Camera, Check, Search, Mountain
} from 'lucide-react';
import { Video } from 'lucide-react';
import { useEditorState, NO_ROUTE, type RouteConfig } from '@/hooks/useEditorState';
import { useRouteVisibility } from '@/lib/routeVisibility';
import { useRouteComments } from '@/lib/routeComments';
import { useAuth } from '@/lib/auth';
import { useRouteOverlaps, type RouteOverlap } from '@/lib/routeOverlap';
import PerspectiveSwitcher from '@/components/PerspectiveSwitcher';
import AppHeader, { HEADER_HEIGHT } from '@/components/AppHeader';
import CreateRideModal, { type NewRide } from '@/components/CreateRideModal';
import { routeFromTrack, saveUserRoute, loadAllRoutes, loadUserRoutes } from '@/lib/userRoutes';
import { syncMapper } from '@/lib/trackSync';
// import GlobeMap from '@/components/GlobeMap';
import AnimationsPanel from '@/components/panels/AnimationsPanel';
import CameraPanel, { CAMERA_MODES } from '@/components/panels/CameraPanel';

const YouTubeOverlay = dynamic(() => import('@/components/YouTubeOverlay'), { ssr: false });
const GlobeMap = dynamic(() => import('@/components/GlobeMap'), { ssr: false });
// client-only: its default position depends on window size
const CommunityWidget = dynamic(() => import('@/components/CommunityWidget'), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<'none' | 'speed' | 'camera'>('none');

  // Speed / camera panel: closes on a click anywhere outside (map, windows …) or Escape
  const panelAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openModal === 'none') return;
    const onDown = (e: PointerEvent) => { if (!panelAreaRef.current?.contains(e.target as Node)) setOpenModal('none'); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenModal('none'); };
    document.addEventListener('pointerdown', onDown, true); // capture: MapLibre stops some events from bubbling
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [openModal]);
  const [initialVideoPos, setInitialVideoPos] = useState<{ x: number; y: number; key?: string } | null>(null);
  const [showElevation, setShowElevation] = useState(true);
  const [showVelocity, setShowVelocity] = useState(false);
  const [useGpsTrace, setUseGpsTrace] = useState(false);

  const {
    state,
    setMapStyle,
    set,
    setActiveRoute,
    setActiveWindow,
    startAnimation,
    stopAnimation,
    resetAnimation,
  } = useEditorState();

  // shared with the video overlay (and handy for debugging) – also while no video window is mounted
  useEffect(() => { (window as any).__EDITOR_STATE = state; }, [state]);
  const canAnimate = state.cities.length >= 2;
  // First load (and after deleting the active ride): no route selected → globe overview of all rides
  const hasRoute = !!state.activeRouteId && canAnimate;

  // Only public routes appear in the menu and on the map. Unlisted/private ones stay
  // reachable via direct link (/?route=<id>) – the active route is therefore always kept.
  const { visibilityOf, setVisibility } = useRouteVisibility();
  const [createOpen, setCreateOpen] = useState(false);
  const [focus, setFocus] = useState<{ routeId: string; progress: number } | null>(null);
  const { comments: routeComments, addComment } = useRouteComments(state.activeRouteId);
  const { user: authUser } = useAuth(); // signed-in Google user names their comments

  // Comments the vehicle is near: from 3 s before until 6 s after their video position.
  // Shown as bubbles on the map and highlighted in the community list.
  const nowSec = Math.floor(state.animationProgress * state.durationSeconds);
  const activeCommentKey = state.animationProgress > 0
    ? routeComments.filter(c => nowSec >= c.seconds - 3 && nowSec <= c.seconds + 6).map(c => c.id).join(',')
    : '';
  const activeCommentIds = useMemo(() => (activeCommentKey ? activeCommentKey.split(',') : []), [activeCommentKey]);

  function handleCreateRide(ride: NewRide) {
    const route = routeFromTrack(ride);
    saveUserRoute(route); // throws if storage is full – the modal shows the error
    setVisibility(route.id, ride.visibility);
    setCreateOpen(false);
    if (ride.align && route.timeline) { router.push(`/sync?route=${route.id}`); return; }
    setActiveRoute(route.id);
  }
  // Memoised: GlobeMap rebuilds all inactive-route markers whenever this array changes identity –
  // a fresh array on every animation frame made the start/end markers flicker during playback.
  const listedRoutes = useMemo(
    () => state.routes.filter(r => r.id === state.activeRouteId || visibilityOf(r.id, r.visibility) === 'public'),
    [state.routes, state.activeRouteId, visibilityOf],
  );

  // Deep link: /?route=<id>[&t=<seconds>] from the dashboard, a notification, the sync editor …
  // Opens the ride PAUSED (t: at that second, camera flies there). The parameters are removed
  // from the address bar afterwards, so a reload starts again with the Paphos overview.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const routeId = params.get('route');
    // browser reload of exactly this address (old links still carrying ?route=) → overview.
    // In-app navigations (e.g. "Fertig" in the sync editor) keep the document's first entry, whose URL differs.
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const isReload = nav?.type === 'reload' && nav.name === window.location.href;
    if (routeId || params.has('t')) window.history.replaceState(null, '', window.location.pathname);
    if (!routeId || isReload) return;
    // user routes are merged into state in an effect, so check storage directly
    const route = loadAllRoutes().find(r => r.id === routeId);
    if (!route) return;
    setActiveRoute(route.id);
    const t = Number(params.get('t'));
    if (t > 0 && route.durationSeconds) {
      const progress = Math.min(1, t / route.durationSeconds);
      // while paused, the video overlay moves the (unstarted) video to this second without playing it
      setTimeout(() => set('animationProgress', progress), 400);
      setFocus({ routeId: route.id, progress: syncMapper(route).toRoute(progress) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Same road, other ride: switch perspective at the current position ──
  const activeRoute = state.routes.find(r => r.id === state.activeRouteId);
  // animationProgress = video time; the map needs the position along the route.
  // Synced rides map via GPS timestamps, others linearly (see src/lib/trackSync.ts).
  const sync = useMemo(() => syncMapper(activeRoute), [activeRoute]);
  // 0 keeps meaning "not started" for the map (full-route view), even if the video starts mid-track
  const routeProgress = state.animationProgress > 0 ? Math.max(1e-4, sync.toRoute(state.animationProgress)) : 0;
  const overlaps = useRouteOverlaps(activeRoute, listedRoutes);
  // rides that share the road at the vehicle's current position
  const perspectivesHere = state.animationProgress > 0
    ? overlaps.filter(o => o.mapToOther(routeProgress) !== null)
    : [];

  // Badges on the map at shared stretches (merged when several rides share the same stretch)
  const overlapBadges = useMemo(() => {
    const out: { progress: number; count: number; names: string[] }[] = [];
    for (const o of overlaps) for (const sec of o.sections) {
      const mid = (sec.fromA + sec.toA) / 2;
      const near = out.find(b => Math.abs(b.progress - mid) < 0.05);
      if (near) { near.count++; near.names.push(o.route.name); }
      else out.push({ progress: mid, count: 1, names: [o.route.name] });
    }
    return out;
  }, [overlaps]);

  // Open another route at a given progress; keeps playing if it was playing.
  function jumpToRouteAt(route: RouteConfig, progress: number, play: boolean) {
    setActiveRoute(route.id);
    setFocus({ routeId: route.id, progress });
    let tries = 0;
    const waitForVideo = () => {
      const yt = (window as any).__YT_PLAYER;
      // the overlay loads the new video and pauses it ~1.5 s later – seek after that
      if (yt?.getVideoData?.()?.video_id === route.videoId) {
        setTimeout(() => {
          set('animationProgress', syncMapper(route).toVideo(progress)); // while paused the overlay seeks the video to this point
          if (play) setTimeout(() => startAnimation(), 400);
        }, 1700);
      } else if (++tries < 60) setTimeout(waitForVideo, 250);
    };
    setTimeout(waitForVideo, 300);
  }

  // Notification click while the map is open: fly from the current view to the ride / the
  // commented spot and stay paused there (no page reload, no playback).
  const openRideRef = useRef<(routeId: string, seconds?: number) => void>(() => {});
  openRideRef.current = (routeId, seconds) => {
    const route = state.routes.find(r => r.id === routeId);
    if (!route) return;
    stopAnimation();
    const videoFraction = seconds && route.durationSeconds ? Math.min(1, seconds / route.durationSeconds) : 0;
    const routeFraction = syncMapper(route).toRoute(videoFraction);
    if (routeId === state.activeRouteId) {
      if (videoFraction > 0) {
        set('animationProgress', videoFraction); // paused → the overlay moves the video there without playing
        setFocus({ routeId, progress: routeFraction });
      }
      return;
    }
    if (videoFraction > 0) jumpToRouteAt(route, routeFraction, false);
    else setActiveRoute(routeId); // like / rating: show the ride
  };
  useEffect(() => {
    const onOpen = (e: Event) => {
      const { routeId, seconds } = (e as CustomEvent<{ routeId: string; seconds?: number }>).detail;
      e.preventDefault(); // tells the bell it was handled here
      openRideRef.current(routeId, seconds);
    };
    window.addEventListener('routecam:open-ride', onOpen);
    return () => window.removeEventListener('routecam:open-ride', onOpen);
  }, []);

  function switchPerspective(o: RouteOverlap) {
    const pB = o.mapToOther(routeProgress) ?? o.sections[0].fromB;
    jumpToRouteAt(o.route, pB, state.isAnimating);
  }

  function handlePlayRoute(routeId: string) {
    if (!routeId) routeId = state.activeRouteId; // pin without id = the ride that is shown
    if (!routeId) return;
    if (routeId !== state.activeRouteId) {
      setActiveRoute(routeId);
      if (hasRoute) { setTimeout(() => startAnimation(), 300); return; }
      // From the overview the video window is only mounted now: wait until its player has
      // loaded this ride's video, then start video + ride together (otherwise the map would
      // run ahead while YouTube is still loading).
      const route = state.routes.find(r => r.id === routeId);
      if (!route) return;
      let tries = 0;
      const waitForPlayer = () => {
        const yt = (window as any).__YT_PLAYER;
        // still-mounted player (not one destroyed on an earlier visit) with this ride's video
        if (yt?.playVideo && yt.getIframe?.()?.isConnected && yt.getVideoData?.()?.video_id === route.videoId) {
          startAnimation();
          // YouTube sometimes drops the very first play request (buffering → "unstarted"), which
          // also stops the ride again → one more attempt. If the browser blocks autoplay entirely,
          // the video's own play button still starts both.
          setTimeout(() => {
            const st = yt.getPlayerState?.();
            if ((st === -1 || st === 5) && !(window as any).__EDITOR_STATE?.isAnimating) startAnimation();
          }, 1500);
        } else if (++tries < 80) setTimeout(waitForPlayer, 150);
      };
      setTimeout(waitForPlayer, 300);
    } else {
      if (state.animationProgress >= 1) {
        resetAnimation();
        setTimeout(startAnimation, 50);
      } else {
        startAnimation();
      }
    }
  }

  // map markers keep the handler they were created with → always call the current one
  const playRouteRef = useRef(handlePlayRoute);
  playRouteRef.current = handlePlayRoute;

  function handleStopRoute() {
    stopAnimation();
  }

  function handlePlayPause() {
    if (state.isAnimating) {
      stopAnimation();
    } else if (state.animationProgress >= 1) {
      resetAnimation();
      setTimeout(startAnimation, 50);
    } else {
      startAnimation();
    }
  }

  function handleSeek(progress: number) {
    set('animationProgress', progress);
    if ((window as any).__YT_PLAYER) {
      (window as any).__IS_SCRUBBING = true;
      (window as any).__YT_PLAYER.seekTo(progress * (state.durationSeconds || 2056), true);
      setTimeout(() => { (window as any).__IS_SCRUBBING = false; }, 500);
    }
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-black text-white font-sans">

      {/* ── Top bar (YouTube-style) ── */}
      <AppHeader routes={listedRoutes} activeRouteId={state.activeRouteId} onSelectRoute={setActiveRoute} onCreate={() => setCreateOpen(true)} />
      {createOpen && <CreateRideModal onClose={() => setCreateOpen(false)} onCreate={handleCreateRide} />}
      
      {/* ── Map area ── */}
      <main className="absolute inset-0">
 {hasRoute && (
        <YouTubeOverlay 
          state={state} 
          startAnimation={startAnimation} 
          stopAnimation={stopAnimation} 
          initialPos={initialVideoPos} 
          setActiveWindow={setActiveWindow}
          visibility={visibilityOf(state.activeRouteId, state.routes.find(r => r.id === state.activeRouteId)?.visibility)}
        />
        )}
        
        <GlobeMap
          cities={state.cities}
          routes={listedRoutes}
          vehicle={state.vehicle}
          mapStyle={state.mapStyle}
          globeAtmosphere={state.globeAtmosphere}
          animationProgress={routeProgress}
          timeToRoute={sync.toRoute}
          routeToTime={sync.toVideo}
          speedAt={sync.speedAt}
          isAnimating={state.isAnimating}
          cameraMode={state.cameraMode}
          routeColor={state.routeColor}
          routeWidth={state.routeWidth}
          showElevation={showElevation && hasRoute}
          showVelocity={showVelocity && hasRoute}
          durationSeconds={state.durationSeconds}
          onSeek={p => handleSeek(sync.toVideo(p))}
          comments={routeComments}
          focus={focus}
          activeCommentIds={activeCommentIds}
          overlapBadges={overlapBadges}
          onOverlapBadgeClick={p => handleSeek(sync.toVideo(p))}
          activeWindow={state.activeWindow}
          setActiveWindow={setActiveWindow}
          onPlayRoute={id => playRouteRef.current(id)}
          onStopRoute={handleStopRoute}
          onBackgroundClick={() => {
            // click somewhere on the map → deselect the current ride (not while it is playing)
            if (!state.activeRouteId || state.isAnimating) return;
            setActiveRoute(NO_ROUTE);
          }}
          onPoint1Projected={(x: number, y: number, dirX: number, dirY: number, key: string) => {
            if (typeof window === 'undefined') return;
            // Video window right at the start of the ride, preferably on the side the route does NOT
            // go to (route heads north → video below the start). If that side has no room on screen,
            // the next side that fits is used, so the window never lands on the start.
            const w = 320, h = 204, gap = 36, pad = 20;
            // keep clear of the left control column and the info windows (Elevation, Community) on the right
            const minX = 96, maxX = window.innerWidth - w - 344 - pad;
            const minY = HEADER_HEIGHT + 16, maxY = window.innerHeight - h - pad;
            let ux = dirX - x, uy = dirY - y;
            const len = Math.hypot(ux, uy);
            if (len < 1) { ux = 0; uy = -1; } else { ux /= len; uy /= len; }
            const at = (vx: number, vy: number) => {
              const extent = Math.abs(vx) * w / 2 + Math.abs(vy) * h / 2;
              return { x: x + vx * (gap + extent) - w / 2, y: y + vy * (gap + extent) - h / 2 };
            };
            const candidates = [at(-ux, -uy), at(0, 1), at(-1, 0), at(1, 0), at(0, -1)];
            const clampCost = (c: { x: number; y: number }) =>
              Math.max(0, minX - c.x) + Math.max(0, c.x - maxX) + Math.max(0, minY - c.y) + Math.max(0, c.y - maxY);
            const best = candidates.find(c => clampCost(c) === 0) ?? candidates.reduce((a, b) => (clampCost(b) < clampCost(a) ? b : a));
            const idealX = Math.max(minX, Math.min(best.x, maxX));
            const idealY = Math.max(minY, Math.min(best.y, maxY));
            setInitialVideoPos({ x: idealX, y: idealY, key });
          }}
        />

        {/* "Also ridden here" – perspective switch at the current position */}
        {hasRoute && <PerspectiveSwitcher overlaps={perspectivesHere} onSwitch={switchPerspective} />}

        {/* Like / share / rate / report – sits below the Elevation window (compass now lives in its header) */}
        {hasRoute && (
        <CommunityWidget
          routeId={state.activeRouteId}
          routeName={state.routes.find(r => r.id === state.activeRouteId)?.name ?? ''}
          activeWindow={state.activeWindow}
          setActiveWindow={setActiveWindow}
          defaultY={showVelocity ? 504 : 248}
          currentSeconds={state.animationProgress * state.durationSeconds}
          commentCount={routeComments.length}
          onAddComment={(seconds, text) => addComment(state.activeRouteId, seconds, text, authUser?.name)}
          comments={routeComments}
          activeCommentIds={activeCommentIds}
          isAnimating={state.isAnimating}
          onSeekToSeconds={sec => handleSeek(Math.min(1, sec / (state.durationSeconds || 1)))}
          syncHref={activeRoute?.timeline && loadUserRoutes().some(r => r.id === activeRoute.id) ? `/routecam/sync?route=${activeRoute.id}` : null}
        />
        )}

        {/* Animation progress bar overlay */}
        {(state.isAnimating || state.animationProgress > 0) && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-50">
            <div
              className="h-full transition-all duration-100"
              style={{ width: `${state.animationProgress * 100}%`, background: 'linear-gradient(to right, #FFFFFF, #CCFF00)' }}
            />
          </div>
        )}
      </main>




      {/* ── Floating Minimalist UI (Top Left) ── */}
      <div className="absolute top-[72px] left-4 md:top-[80px] md:left-6 z-50 flex flex-col items-center gap-3 md:gap-4">

        {/* Play Button */}
        {hasRoute && (
        <button
          id="top-left-play-btn"
          onClick={handlePlayPause}
          disabled={!canAnimate}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md transition-all border ${
            canAnimate
              ? state.isAnimating
                ? 'bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/50 hover:bg-lime-400/30'
                : 'bg-black/60 text-white border-white/20 hover:bg-black/80 hover:border-white/40'
              : 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
          }`}
        >
          {state.isAnimating ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>
        )}

        {/* Floating Modals Container */}
        <div className="relative" ref={panelAreaRef}>
          
          {/* Action Buttons Row */}
          <div className="flex flex-col gap-2">


            
            
            
            {hasRoute && (<>
            <button
              onClick={() => setOpenModal(openModal === 'speed' ? 'none' : 'speed')}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all border ${
                openModal === 'speed' 
                  ? 'bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/50' 
                  : 'bg-black/50 text-white border-white/10 hover:bg-black/70'
              }`}
              title={`Abspielgeschwindigkeit: ${state.animSpeed}×`}
            >
              {/* the current value says more than a gauge icon */}
              <span className={`font-mono text-[11px] font-semibold tracking-tight ${state.animSpeed !== 1 && openModal !== 'speed' ? 'text-[#CCFF00]' : ''}`}>
                {String(state.animSpeed).replace(/^0\./, '.')}×
              </span>
            </button>
            <button
              onClick={() => setOpenModal(openModal === 'camera' ? 'none' : 'camera')}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all border ${
                openModal === 'camera' 
                  ? 'bg-[#CCFF00]/20 text-[#CCFF00] border-[#CCFF00]/50' 
                  : 'bg-black/50 text-white border-white/10 hover:bg-black/70'
              }`}
              title={`Kamera: ${CAMERA_MODES.find(m => m.value === state.cameraMode)?.label}`}
            >
              {/* shows the current camera mode, like the speed button shows its value */}
              {(() => { const M = CAMERA_MODES.find(m => m.value === state.cameraMode)?.Icon ?? Video; return <M size={18} />; })()}
            </button>
            </>)}
            {(state.isAnimating || state.animationProgress > 0) && (
              <button
                onClick={resetAnimation}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 text-gray-400 border border-white/10 hover:bg-black/70 hover:text-white transition-all mt-2"
                title="Reset animation"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>

          {/* Floating Panels */}
          {openModal !== 'none' && (
            <div 
              className="absolute left-14 w-72 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200"
              style={{
                top: openModal === 'camera' ? 48 : 0
              }}
            >
              
              
              {openModal === 'speed' && (
                <AnimationsPanel
                  animSpeed={state.animSpeed}
                  cameraMode={state.cameraMode}
                  onChange={set}
                />
              )}
              {openModal === 'camera' && (
                <CameraPanel
                  cameraMode={state.cameraMode}
                  onChange={set}
                />
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
