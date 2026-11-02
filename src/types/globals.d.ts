// The few values parts of the app share through `window` (instead of React props/context):
//   __EDITOR_STATE – the map page's current state (video overlay, sign-up wall, nav helper read it)
//   __YT_PLAYER    – the map page's YouTube player (animation loop, seeking, sign-up wall)
//   __IS_SCRUBBING – true for a moment while the app itself seeks the video (ignore its events)
//   __yt_throttle_* – debounce timers for the player's play/pause events
// Typed here so the rest of the code can use them without `any`.
import type { EditorState } from '@/hooks/useEditorState';

declare global {
  // The parts of the YouTube IFrame API player that RouteCam uses
  interface YTPlayer {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number; // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    getPlaybackRate(): number;
    setPlaybackRate(rate: number): void;
    setPlaybackQuality?(quality: string): void;
    getVideoData(): { video_id?: string; title?: string };
    getIframe(): HTMLIFrameElement;
    loadVideoById(videoId: string, startSeconds?: number): void;
    cueVideoById(arg: string | { videoId: string; startSeconds?: number }, startSeconds?: number): void;
    destroy(): void;
  }
  interface YTPlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number | undefined>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      onError?: (e: { data: number; target: YTPlayer }) => void;
    };
  }
  interface YTNamespace { Player: new (el: string | HTMLElement, options: YTPlayerOptions) => YTPlayer }

  // Google Identity Services ("Sign in with Google")
  interface GsiId {
    initialize(config: Record<string, unknown>): void;
    renderButton(el: HTMLElement, options: Record<string, unknown>): void;
    prompt(): void;
    disableAutoSelect(): void;
  }

  interface Window {
    __EDITOR_STATE?: EditorState;
    __YT_PLAYER?: YTPlayer;
    __IS_SCRUBBING?: boolean;
    __yt_throttle_play?: ReturnType<typeof setTimeout> | null;
    __yt_throttle_pause?: ReturnType<typeof setTimeout> | null;
    YT?: YTNamespace;
    google?: { accounts?: { id?: GsiId } };
  }
}

export {};
