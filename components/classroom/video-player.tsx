"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from "react";
import type Hls from "hls.js";
import { useVideoProgress } from "@/lib/classroom/use-video-progress";
import { fmtTimestamp } from "@/lib/classroom/format";

// ── Types ────────────────────────────────────────────────────

type VideoPlayerProps = {
  playbackId: string;
  lessonId: string;
  lessonTitle?: string;
  durationSeconds: number;
  initialPosition?: number;
  initialWatchPercentage?: number;
  initialCompleted?: boolean;
  /** Throttled callback (~500ms) with current playback time for parent sync */
  onTimeSync?: (currentTime: number) => void;
  /** Ref the parent provides; the player populates it with a seek function */
  seekRef?: MutableRefObject<((time: number) => void) | null>;
  /** Chapter markers shown on the progress bar */
  chapters?: { position_seconds: number; title: string }[];
};

// ── Brand tokens ─────────────────────────────────────────────

const CA = {
  violet: "#5e17eb",
  violetDeep: "#4a0fd1",
  lime: "#c5f122",
  limeDeep: "#a8d310",
  navy: "#14163a",
} as const;

// ── SVG icons — stroke 1.5, no fills except play triangle ────

type IconName =
  | "play"
  | "pause"
  | "skip-back"
  | "skip-fwd"
  | "volume"
  | "volume-low"
  | "mute"
  | "cc"
  | "pip"
  | "pip-on"
  | "fullscreen"
  | "fullscreen-exit"
  | "check"
  | "alert"
  | "refresh"
  | "chevron-down";

function VPIcon({
  name,
  size = 20,
  color = "currentColor",
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "play":
      return (
        <svg {...props}>
          <path
            d="M8 5.5v13a.6.6 0 0 0 .91.51l10.65-6.5a.6.6 0 0 0 0-1.02L8.91 5a.6.6 0 0 0-.91.5z"
            fill={color}
            stroke={color}
          />
        </svg>
      );
    case "pause":
      return (
        <svg {...props}>
          <path d="M8 5v14M16 5v14" />
        </svg>
      );
    case "skip-back":
      return (
        <svg {...props}>
          <path
            d="M11 18l-7-6 7-6v12zM21 18l-7-6 7-6v12z"
            fill={color}
            stroke={color}
          />
        </svg>
      );
    case "skip-fwd":
      return (
        <svg {...props}>
          <path
            d="M13 6l7 6-7 6V6zM3 6l7 6-7 6V6z"
            fill={color}
            stroke={color}
          />
        </svg>
      );
    case "volume":
      return (
        <svg {...props}>
          <path d="M11 5L6 9H3v6h3l5 4V5zM15.5 9a4 4 0 0 1 0 6" />
          <path d="M18.5 6a8 8 0 0 1 0 12" opacity="0.85" />
        </svg>
      );
    case "volume-low":
      return (
        <svg {...props}>
          <path d="M11 5L6 9H3v6h3l5 4V5zM15.5 9a4 4 0 0 1 0 6" />
        </svg>
      );
    case "mute":
      return (
        <svg {...props}>
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M22 9l-6 6M16 9l6 6" />
        </svg>
      );
    case "cc":
      return (
        <svg {...props}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <text
            x="12"
            y="14.5"
            textAnchor="middle"
            fill={color}
            stroke="none"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui"
          >
            CC
          </text>
        </svg>
      );
    case "pip":
      return (
        <svg {...props}>
          <rect x="3" y="4.5" width="18" height="15" rx="2" />
          <rect
            x="12.5"
            y="11"
            width="6.5"
            height="5"
            rx="0.8"
            fill={color}
            stroke="none"
          />
        </svg>
      );
    case "pip-on":
      return (
        <svg {...props}>
          <rect x="3" y="4.5" width="18" height="15" rx="2" />
          <rect
            x="12.5"
            y="11"
            width="6.5"
            height="5"
            rx="0.8"
            fill={CA.lime}
            stroke="none"
          />
        </svg>
      );
    case "fullscreen":
      return (
        <svg {...props}>
          <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
        </svg>
      );
    case "fullscreen-exit":
      return (
        <svg {...props}>
          <path d="M9 4v4H5M15 4v4h4M9 20v-4H5M15 20v-4h4" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <path d="M12 9v5M12 17.5h.01" />
          <circle cx="12" cy="12" r="9.5" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v5h-5M21 12a9 9 0 0 1-15.5 6.3M3 20v-5h5" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...props}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    default:
      return null;
  }
}

// ── Quality options ──────────────────────────────────────────

const QUALITIES = ["Auto", "1080p", "720p", "480p", "360p"] as const;

const SPEED_CYCLE = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ── Main component ───────────────────────────────────────────

export function VideoPlayer({
  playbackId,
  lessonId,
  lessonTitle,
  durationSeconds,
  initialPosition = 0,
  initialWatchPercentage = 0,
  initialCompleted = false,
  onTimeSync,
  seekRef,
  chapters,
}: VideoPlayerProps) {
  // Progress tracking
  const [watchPercentage, setWatchPercentage] = useState(initialWatchPercentage);
  const [completed, setCompleted] = useState(initialCompleted);

  // Media state
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferEnd, setBufferEnd] = useState(0);

  // UI state
  const [mouseActive, setMouseActive] = useState(true);
  const [hoverBar, setHoverBar] = useState(false);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [quality, setQuality] = useState<string>("Auto");
  const [speed, setSpeed] = useState(1);
  const [pipActive, setPipActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);

  const [ccEnabled, setCcEnabled] = useState(() => {
    try {
      return localStorage.getItem("ca-cc") === "1";
    } catch {
      return false;
    }
  });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isDragging = useRef(false);
  const lastSyncRef = useRef(0);

  const progress =
    durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;
  const bufferPct =
    durationSeconds > 0 ? (bufferEnd / durationSeconds) * 100 : 0;
  const started = currentTime > 0 || playing;
  const chapterMarkers = (chapters ?? []).map((c) =>
    durationSeconds > 0 ? (c.position_seconds / durationSeconds) * 100 : 0,
  );

  // ── Progress tracking integration ──────────────────────────

  const onProgressUpdate = useCallback(
    (data: { watchPercentage: number; completed: boolean }) => {
      setWatchPercentage(data.watchPercentage);
      setCompleted(data.completed);
    },
    [],
  );

  const { handleTimeUpdate, handlePause, handleEnded } = useVideoProgress({
    lessonId,
    durationSeconds,
    initialPosition,
    onProgressUpdate,
  });

  // ── HLS / media setup ─────────────────────────────────────

  const hlsUrl = `https://stream.mux.com/${playbackId}.m3u8`;
  const mp4Url = `https://stream.mux.com/${playbackId}/high.mp4`;
  const posterUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?time=30`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Safari / iOS have native HLS — no need to load hls.js at all
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener(
        "loadedmetadata",
        () => {
          setReady(true);
          if (initialPosition > 0) video.currentTime = initialPosition;
        },
        { once: true },
      );
      video.addEventListener("error", () => setError(true), { once: true });
      return;
    }

    // Non-Safari: dynamically import hls.js only when needed
    let cancelled = false;

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          startPosition: initialPosition,
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setReady(true);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
            video.src = mp4Url;
            video.load();
            video.addEventListener("loadedmetadata", () => setReady(true), {
              once: true,
            });
            video.addEventListener("error", () => setError(true), {
              once: true,
            });
          }
        });
      } else {
        // hls.js loaded but not supported — fall back to mp4
        video.src = mp4Url;
        video.addEventListener("loadedmetadata", () => setReady(true), {
          once: true,
        });
        video.addEventListener("error", () => setError(true), { once: true });
      }
    }).catch(() => {
      // Failed to load hls.js — fall back to mp4
      if (cancelled) return;
      video.src = mp4Url;
      video.addEventListener("loadedmetadata", () => setReady(true), {
        once: true,
      });
      video.addEventListener("error", () => setError(true), { once: true });
    });

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackId, hlsUrl, mp4Url, initialPosition]);

  // ── Sync video element events ──────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const t = video.currentTime;
      setCurrentTime(t);
      handleTimeUpdate(t);

      // Throttled sync for parent (at most every 500ms)
      const now = Date.now();
      if (onTimeSync && now - lastSyncRef.current > 500) {
        lastSyncRef.current = now;
        onTimeSync(t);
      }

      if (video.buffered.length > 0) {
        setBufferEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onPlay = () => {
      setPlaying(true);
      setBuffering(false);
    };
    const onPause = () => {
      setPlaying(false);
      handlePause();
    };
    const onEnded = () => {
      setPlaying(false);
      handleEnded();
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("volumechange", onVolumeChange);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [handleTimeUpdate, handlePause, handleEnded, onTimeSync]);

  // ── Expose seek function to parent via seekRef ─────────────

  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (time: number) => {
      const video = videoRef.current;
      if (video) video.currentTime = time;
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef]);

  // ── Idle timer — hide controls after 3s ────────────────────

  const kickIdle = useCallback(() => {
    setMouseActive(true);
    clearTimeout(idleTimer.current);
    if (playing && !qualityOpen && !volumeOpen) {
      idleTimer.current = setTimeout(() => setMouseActive(false), 3000);
    }
  }, [playing, qualityOpen, volumeOpen]);

  useEffect(() => {
    kickIdle();
  }, [kickIdle]);

  // ── Keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const video = videoRef.current;
      if (!video || error) return;

      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        video.paused ? video.play() : video.pause();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "m") {
        video.muted = !video.muted;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        video.currentTime = Math.min(durationSeconds, video.currentTime + 10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [durationSeconds, error]);

  // ── Fullscreen ─────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── PiP ────────────────────────────────────────────────────

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else {
        await video.requestPictureInPicture();
        setPipActive(true);
      }
    } catch {
      // PiP not supported
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLeave = () => setPipActive(false);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => video.removeEventListener("leavepictureinpicture", onLeave);
  }, []);

  // ── Closed captions toggle ─────────────────────────────────

  useEffect(() => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (!video) return;

    if (hls) {
      // hls.js: enable/disable subtitle track
      if (ccEnabled && hls.subtitleTracks.length > 0) {
        hls.subtitleTrack = 0;
      } else {
        hls.subtitleTrack = -1;
      }
    } else {
      // Safari native HLS: use textTracks
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = ccEnabled ? "showing" : "hidden";
      }
    }

    try {
      localStorage.setItem("ca-cc", ccEnabled ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [ccEnabled]);

  // ── Playback toggle ────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;
    video.paused ? video.play() : video.pause();
    kickIdle();
  }, [error, kickIdle]);

  // ── Speed control ──────────────────────────────────────────

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_CYCLE.indexOf(prev as (typeof SPEED_CYCLE)[number]);
      const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
      const video = videoRef.current;
      if (video) video.playbackRate = next;
      return next;
    });
  }, []);

  // ── Skip ±10s ──────────────────────────────────────────────

  const skipBack = useCallback(() => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, video.currentTime - 10);
  }, []);

  const skipForward = useCallback(() => {
    const video = videoRef.current;
    if (video)
      video.currentTime = Math.min(durationSeconds, video.currentTime + 10);
  }, [durationSeconds]);

  // ── Seek on progress bar ───────────────────────────────────

  const seekFromEvent = useCallback(
    (e: ReactMouseEvent | MouseEvent) => {
      const track = trackRef.current;
      const video = videoRef.current;
      if (!track || !video) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
      );
      video.currentTime = (pct / 100) * durationSeconds;
    },
    [durationSeconds],
  );

  const onTrackMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      isDragging.current = true;
      seekFromEvent(e);

      const onMove = (ev: MouseEvent) => {
        seekFromEvent(ev);
        const track = trackRef.current;
        if (track) {
          const rect = track.getBoundingClientRect();
          setScrubX(
            Math.max(
              0,
              Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100),
            ),
          );
        }
      };
      const onUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seekFromEvent],
  );

  const onTrackMove = useCallback((e: ReactMouseEvent) => {
    if (isDragging.current) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    setScrubX(
      Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
      ),
    );
  }, []);

  // ── Volume control ─────────────────────────────────────────

  const onVolumeSliderClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const val = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const video = videoRef.current;
      if (video) {
        video.volume = val;
        video.muted = val === 0;
      }
    },
    [],
  );

  // ── Derived UI flags ───────────────────────────────────────

  const showControls =
    !started || mouseActive || !playing || qualityOpen || volumeOpen;
  const showCenter = !started || (!playing && !buffering && !error);
  const volIcon: IconName = muted
    ? "mute"
    : volume < 0.35
      ? "volume-low"
      : "volume";
  // ── Error state ────────────────────────────────────────────

  if (error) {
    return (
      <div className="vp-frame relative aspect-video w-full overflow-hidden rounded-[18px] bg-black">
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ background: "rgba(10,11,31,0.92)" }}
        >
          <div className="max-w-md px-8 text-center">
            <div
              className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <VPIcon name="alert" size={26} color="#ffffff" />
            </div>
            <div className="text-[15px] font-bold text-white">
              No se pudo cargar el video
            </div>
            <div className="mt-1 text-[12px] text-white/55">
              Intenta recargar la página o verifica tu conexión a internet.
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full px-5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-white/20"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <VPIcon name="refresh" size={14} color="#ffffff" />
                Reintentar
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      <div
        ref={rootRef}
        onMouseMove={kickIdle}
        onMouseLeave={() => {
          if (playing && !qualityOpen) setMouseActive(false);
        }}
        onDoubleClick={toggleFullscreen}
        className="vp-frame relative aspect-video w-full overflow-hidden rounded-[18px] bg-black select-none"
        style={{
          boxShadow:
            "0 30px 80px -20px rgba(20,22,58,0.35), 0 0 0 1px rgba(20,22,58,0.06)",
          cursor: playing && !mouseActive ? "none" : "default",
        }}
      >
        {/* Hidden video element */}
        <video
          ref={videoRef}
          playsInline
          crossOrigin="anonymous"
          poster={posterUrl}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Loading overlay before ready */}
        {!ready && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black">
            <div
              className="vp-spinner h-12 w-12 rounded-full"
              style={{
                border: "3px solid rgba(94,23,235,0.18)",
                borderTopColor: CA.violet,
                borderRightColor: CA.violet,
              }}
            />
          </div>
        )}

        {/* Brand chip top-left */}
        <div className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5">
          <div
            className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black text-white"
            style={{ background: CA.violet }}
          >
            CA
          </div>
        </div>

        {/* Idle duration chip */}
        {!started && (
          <div
            className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-white/90 backdrop-blur-md"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: CA.lime }}
            />
            {fmtTimestamp(durationSeconds)}
          </div>
        )}

        {/* Click area to toggle play */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          aria-label="Reproducir o pausar"
        />

        {/* Center play button — LIME solid */}
        {showCenter && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            {/* Lime halo */}
            <div
              className="absolute rounded-full"
              style={{
                width: 108,
                height: 108,
                background: `radial-gradient(circle, ${CA.lime}28 0%, transparent 65%)`,
              }}
            />
            <div
              className="relative grid place-items-center rounded-full transition-transform hover:scale-105"
              style={{
                width: 80,
                height: 80,
                background: CA.lime,
                boxShadow: `0 24px 60px rgba(0,0,0,0.4), 0 0 0 6px rgba(197,241,34,0.18), inset 0 -2px 0 rgba(0,0,0,0.08)`,
              }}
            >
              <div className="pl-1.5">
                <VPIcon name="play" size={30} color={CA.navy} />
              </div>
            </div>
          </div>
        )}

        {/* Buffering spinner */}
        {buffering && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div
              className="vp-spinner h-14 w-14 rounded-full"
              style={{
                border: "3px solid rgba(94,23,235,0.18)",
                borderTopColor: CA.violet,
                borderRightColor: CA.violet,
              }}
            />
          </div>
        )}

        {/* Gradient overlay for control legibility */}
        {started && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[40%] transition-opacity duration-300"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
              opacity: showControls ? 1 : 0,
            }}
          />
        )}

        {/* ── Controls bar ── */}
        <div
          className="absolute inset-x-3 bottom-3 z-20 transition-opacity duration-300"
          style={{
            opacity: showControls && started ? 1 : 0,
            pointerEvents: showControls && started ? "auto" : "none",
          }}
        >
          <div
            className="rounded-[18px] px-3 pb-3 pt-3"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(24px) saturate(140%)",
              WebkitBackdropFilter: "blur(24px) saturate(140%)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {/* Progress bar */}
            <div
              ref={trackRef}
              className="mb-2 cursor-pointer px-1"
              style={{ height: 16 }}
              onMouseEnter={() => setHoverBar(true)}
              onMouseLeave={() => {
                setHoverBar(false);
                setScrubX(null);
              }}
              onMouseMove={onTrackMove}
              onMouseDown={onTrackMouseDown}
            >
              <div className="relative h-full w-full">
                {/* Track */}
                <div
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full transition-all duration-150"
                  style={{
                    height: hoverBar ? 6 : 4,
                    background: "rgba(255,255,255,0.20)",
                  }}
                >
                  {/* Buffer */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${bufferPct}%`,
                      background: "rgba(255,255,255,0.18)",
                    }}
                  />
                  {/* Played — violet → lime gradient */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: `linear-gradient(90deg, ${CA.violet} 0%, ${CA.violetDeep} 25%, ${CA.lime} 100%)`,
                      boxShadow: hoverBar
                        ? `0 0 14px ${CA.lime}66`
                        : "none",
                      transition: "box-shadow 200ms ease",
                    }}
                  />
                </div>
                {/* Chapter markers */}
                {chapterMarkers.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      left: `${m}%`,
                      zIndex: 2,
                    }}
                    onMouseEnter={() => setHoveredChapter(i)}
                    onMouseLeave={() => setHoveredChapter(null)}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        height: (hoverBar ? 6 : 4) + 2,
                        width: 2,
                        background: "rgba(255,255,255,0.55)",
                      }}
                    />
                    {hoveredChapter === i && chapters?.[i] && (
                      <div
                        className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 font-mono text-[11px] font-bold text-white"
                        style={{
                          background: "rgba(20,22,58,0.92)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        {chapters[i].title}
                        <div
                          className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45"
                          style={{ background: "rgba(20,22,58,0.92)" }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {/* Thumb — LIME */}
                {hoverBar && (
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${progress}%`,
                      width: 14,
                      height: 14,
                      background: CA.lime,
                      boxShadow: `0 0 0 5px rgba(197,241,34,0.30), 0 2px 8px rgba(0,0,0,0.35)`,
                    }}
                  />
                )}
                {/* Scrub tooltip */}
                {scrubX != null && hoverBar && (
                  <div
                    className="absolute -top-9 -translate-x-1/2 rounded-md px-2 py-1 font-mono text-[11px] font-bold text-white"
                    style={{
                      left: `${scrubX}%`,
                      background: "rgba(20,22,58,0.92)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {fmtTimestamp((scrubX / 100) * durationSeconds)}
                    <div
                      className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45"
                      style={{ background: "rgba(20,22,58,0.92)" }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-3 text-white">
              {/* LEFT */}
              <div className="flex items-center gap-1.5">
                {/* LIME play/pause — primary action */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="grid h-10 w-10 place-items-center rounded-full transition-transform hover:scale-105"
                  style={{
                    background: CA.lime,
                    color: CA.navy,
                    boxShadow: `0 6px 18px rgba(197,241,34,0.30), 0 0 0 4px rgba(197,241,34,0.12)`,
                  }}
                >
                  <div className={playing ? "" : "pl-0.5"}>
                    <VPIcon
                      name={playing ? "pause" : "play"}
                      size={18}
                      color={CA.navy}
                    />
                  </div>
                </button>

                {/* Skip ±10s */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    skipBack();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12]"
                >
                  <VPIcon name="skip-back" size={14} color="#ffffff" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    skipForward();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12]"
                >
                  <VPIcon name="skip-fwd" size={14} color="#ffffff" />
                </button>

                {/* Volume */}
                <div
                  className="flex items-center"
                  onMouseEnter={() => setVolumeOpen(true)}
                  onMouseLeave={() => setVolumeOpen(false)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const video = videoRef.current;
                      if (video) video.muted = !video.muted;
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12]"
                  >
                    <VPIcon name={volIcon} size={18} color="#ffffff" />
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-200"
                    style={{ width: volumeOpen ? 92 : 0 }}
                  >
                    <div className="pl-1 pr-2">
                      <div
                        className="relative h-1 w-20 cursor-pointer rounded-full"
                        style={{ background: "rgba(255,255,255,0.22)" }}
                        onClick={onVolumeSliderClick}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${(muted ? 0 : volume) * 100}%`,
                            background: "#ffffff",
                          }}
                        />
                        <div
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white"
                          style={{
                            left: `${(muted ? 0 : volume) * 100}%`,
                            boxShadow: "0 0 0 3px rgba(255,255,255,0.18)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="ml-1.5 font-mono text-[11px] font-semibold tabular-nums text-white/80">
                  <span>{fmtTimestamp(currentTime)}</span>
                  <span className="mx-1 text-white/35">/</span>
                  <span className="text-white/55">
                    {fmtTimestamp(durationSeconds)}
                  </span>
                </div>
              </div>

              {/* CENTER — lesson title */}
              {lessonTitle && (
                <div className="hidden flex-1 px-4 text-center md:block">
                  <div className="truncate text-[12px] font-semibold text-white/55">
                    {lessonTitle}
                  </div>
                </div>
              )}

              {/* RIGHT */}
              <div className="flex items-center gap-1.5">
                {/* CC toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCcEnabled((v) => !v);
                  }}
                  className="relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12]"
                >
                  <VPIcon name="cc" size={18} color="#ffffff" />
                  {ccEnabled && (
                    <span
                      className="absolute bottom-1 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full"
                      style={{ background: CA.lime }}
                    />
                  )}
                </button>

                {/* Speed pill */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleSpeed();
                  }}
                  className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums transition-colors hover:bg-white/[0.12]"
                  style={{ border: "1px solid rgba(255,255,255,0.10)" }}
                >
                  {speed}x
                </button>

                {/* Quality selector — hidden on mobile */}
                <div className="relative hidden md:block">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQualityOpen((v) => !v);
                    }}
                    className="flex h-9 items-center gap-1 rounded-full px-3 transition-colors hover:bg-white/[0.12]"
                    style={
                      qualityOpen
                        ? { background: "rgba(255,255,255,0.10)" }
                        : undefined
                    }
                  >
                    <span className="font-mono text-[11px] font-bold text-white">
                      {quality}
                    </span>
                    <VPIcon name="chevron-down" size={12} color="#ffffff" />
                  </button>
                  {qualityOpen && (
                    <div
                      className="absolute bottom-full right-0 mb-2 min-w-[210px] rounded-2xl p-1.5"
                      style={{
                        background: "rgba(15,17,42,0.85)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
                      }}
                    >
                      <div
                        className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-white/45"
                        style={{ letterSpacing: "0.18em" }}
                      >
                        Calidad
                      </div>
                      {QUALITIES.map((q) => {
                        const isActive = quality === q;
                        return (
                          <button
                            key={q}
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuality(q);
                              setQualityOpen(false);
                              if (hlsRef.current) {
                                if (q === "Auto") {
                                  hlsRef.current.currentLevel = -1;
                                } else {
                                  const targetHeight = parseInt(q);
                                  const levelIndex =
                                    hlsRef.current.levels.findIndex(
                                      (l) => l.height === targetHeight,
                                    );
                                  if (levelIndex !== -1) {
                                    hlsRef.current.currentLevel = levelIndex;
                                  }
                                }
                              }
                              kickIdle();
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-white/90 transition-colors hover:bg-white/10"
                          >
                            <span>
                              {q === "Auto" ? "Auto (recomendado)" : q}
                            </span>
                            {isActive && (
                              <VPIcon name="check" size={16} color={CA.lime} />
                            )}
                          </button>
                        );
                      })}
                      <div
                        className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45"
                        style={{
                          background: "rgba(15,17,42,0.85)",
                          borderRight: "1px solid rgba(255,255,255,0.12)",
                          borderBottom: "1px solid rgba(255,255,255,0.12)",
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* PiP — hidden on mobile */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePip();
                  }}
                  className="hidden h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:grid"
                >
                  <VPIcon
                    name={pipActive ? "pip-on" : "pip"}
                    size={18}
                    color="#ffffff"
                  />
                </button>

                {/* Fullscreen */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12]"
                >
                  <VPIcon
                    name={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                    size={18}
                    color="#ffffff"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Watch progress strip below player */}
      <div
        className="flex items-center gap-3 text-sm"
        style={{ color: "var(--color-ca-ink-soft)" }}
      >
        <div className="flex-1">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{
              background: "var(--color-ca-ink, rgba(20,22,58,0.08))",
            }}
          >
            <div
              className="h-1.5 rounded-full bg-ca-violet transition-all duration-300"
              style={{
                width: `${Math.min(watchPercentage, 100)}%`,
              }}
            />
          </div>
        </div>
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          {Math.round(watchPercentage)}% visto
        </span>
        {completed && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "rgba(168,211,16,0.18)", color: "#3f5a05" }}
          >
            Completado
          </span>
        )}
      </div>
    </div>
  );
}
