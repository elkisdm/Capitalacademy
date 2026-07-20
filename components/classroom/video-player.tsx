"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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

const MAX_HLS_RECOVERIES = 3;

function applyStoredMediaPrefs(video: HTMLVideoElement) {
  try {
    const vol = localStorage.getItem("ca-vol");
    if (vol != null) video.volume = Number(vol);
    video.muted = localStorage.getItem("ca-muted") === "1";
    const rate = localStorage.getItem("ca-speed");
    if (rate != null) video.playbackRate = Number(rate);
  } catch {
    /* noop */
  }
}

function applyNativeCc(video: HTMLVideoElement, enabled: boolean) {
  const tracks = video.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = enabled ? "showing" : "hidden";
  }
}

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
  const [markingComplete, setMarkingComplete] = useState(false);

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
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem("ca-vol");
      return v != null ? Number(v) : 1;
    } catch {
      return 1;
    }
  });
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem("ca-muted") === "1";
    } catch {
      return false;
    }
  });
  const [qualityOpen, setQualityOpen] = useState(false);
  const [quality, setQuality] = useState<string>("Auto");
  const [speed, setSpeed] = useState(() => {
    try {
      const s = localStorage.getItem("ca-speed");
      return s != null ? Number(s) : 1;
    } catch {
      return 1;
    }
  });
  const [pipActive, setPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);
  const [usingHls, setUsingHls] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

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
  const isVolumeDragging = useRef(false);
  const lastSyncRef = useRef(0);
  const hlsRetryRef = useRef(0);
  const ccEnabledRef = useRef(ccEnabled);
  const qualityRef = useRef<HTMLDivElement>(null);
  const qualityBtnRef = useRef<HTMLButtonElement>(null);

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

  // ── Manual mark-complete ───────────────────────────────────

  const markComplete = useCallback(async () => {
    if (completed || markingComplete) return;
    setMarkingComplete(true);
    try {
      const res = await fetch("/api/classroom/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (res.ok) {
        setCompleted(true);
        setWatchPercentage(100);
      }
    } finally {
      setMarkingComplete(false);
    }
  }, [lessonId, completed, markingComplete]);

  // ── HLS / media setup ─────────────────────────────────────

  const hlsUrl = `https://stream.mux.com/${playbackId}.m3u8`;
  // La ingesta pide `static_renditions: [{ resolution: "highest" }]`, cuyo
  // archivo se sirve como `highest.mp4` (el naming `high.mp4` era del
  // `mp4_support: "standard"` deprecado).
  const mp4Url = `https://stream.mux.com/${playbackId}/highest.mp4`;
  const posterUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?time=30`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    hlsRetryRef.current = 0;

    // Último recurso: MP4 progresivo. Conserva la posición de reanudación y las
    // preferencias de reproducción; no lleva subtítulos ni control de calidad.
    const fallbackToMp4 = (resumeAt: number) => {
      setUsingHls(false);
      setHasCaptions(false);
      setDegraded(true);
      video.src = mp4Url;
      video.load();
      video.addEventListener(
        "loadedmetadata",
        () => {
          setReady(true);
          const at = resumeAt > 0 ? resumeAt : initialPosition;
          if (at > 0) video.currentTime = at;
          applyStoredMediaPrefs(video);
        },
        { once: true },
      );
      video.addEventListener("error", () => setError(true), { once: true });
    };

    // Reproducción nativa: solo para navegadores sin soporte MSE (p.ej. iOS
    // Safari viejo), donde hls.js no podría usarse de todas formas. Algunos
    // Chromium (incluido el headless de Playwright) devuelven "maybe" en
    // canPlayType para HLS pese a no tener parsing real — por eso este
    // camino se intenta DESPUÉS de comprobar Hls.isSupported(), nunca antes.
    const useNativeHls = () => {
      video.src = hlsUrl;
      const applyCc = () => applyNativeCc(video, ccEnabledRef.current);
      video.addEventListener(
        "loadedmetadata",
        () => {
          setReady(true);
          if (initialPosition > 0) video.currentTime = initialPosition;
          applyStoredMediaPrefs(video);
          if (video.textTracks.length > 0) setHasCaptions(true);
          applyCc();
        },
        { once: true },
      );
      video.textTracks.addEventListener("addtrack", () => {
        setHasCaptions(video.textTracks.length > 0);
        applyCc();
      });
      video.addEventListener("error", () => setError(true), { once: true });
    };

    let cancelled = false;

    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            startPosition: initialPosition,
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsRef.current = hls;
          setUsingHls(true);
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setReady(true);
            applyStoredMediaPrefs(video);
          });

          // Los subtítulos de Mux llegan como rendition aparte: recién se
          // conocen cuando hls.js resuelve el nivel activo (tras
          // LEVEL_LOADING), no en MANIFEST_PARSED — leer hls.subtitleTracks
          // ahí siempre da 0.
          hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
            setHasCaptions(data.subtitleTracks.length > 0);
            if (ccEnabledRef.current && data.subtitleTracks.length > 0) {
              hls.subtitleTrack = 0;
            }
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;

            // Intentar recuperación in situ antes de degradar.
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              hlsRetryRef.current < MAX_HLS_RECOVERIES
            ) {
              hlsRetryRef.current += 1;
              hls.startLoad();
              return;
            }
            if (
              data.type === Hls.ErrorTypes.MEDIA_ERROR &&
              hlsRetryRef.current < MAX_HLS_RECOVERIES
            ) {
              hlsRetryRef.current += 1;
              hls.recoverMediaError();
              return;
            }

            // Recuperación agotada — cae a MP4 conservando la posición actual.
            const resumeAt = video.currentTime;
            hls.destroy();
            hlsRef.current = null;
            fallbackToMp4(resumeAt);
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          useNativeHls();
        } else {
          // Ni hls.js ni HLS nativo disponibles — fallback a mp4
          fallbackToMp4(0);
        }
      })
      .catch(() => {
        // Failed to load hls.js — fall back to mp4
        if (cancelled) return;
        fallbackToMp4(0);
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
      try {
        localStorage.setItem("ca-vol", String(video.volume));
        localStorage.setItem("ca-muted", video.muted ? "1" : "0");
      } catch {
        /* noop */
      }
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

      // Cuando el foco está en un slider (barra de progreso o volumen), este
      // maneja su propio teclado — no dispares también el atajo global (evita
      // el doble seek).
      if (
        e.target instanceof HTMLElement &&
        e.target.getAttribute("role") === "slider"
      )
        return;

      // Solo intercepta cuando el foco está en el reproductor o en el body: así
      // Espacio y flechas siguen sirviendo para hacer scroll de la página o
      // activar botones en el resto de la pantalla de clase.
      const active = document.activeElement;
      const withinPlayer =
        !!active && !!rootRef.current && rootRef.current.contains(active);
      const onBody = !active || active === document.body;
      if (!withinPlayer && !onBody) return;

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

  // ── Cierre del menú de calidad — clic afuera / Escape ──────

  useEffect(() => {
    if (!qualityOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        qualityRef.current &&
        !qualityRef.current.contains(e.target as Node)
      ) {
        setQualityOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQualityOpen(false);
        qualityBtnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [qualityOpen]);

  // ── Fullscreen ─────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else {
        // iOS Safari no soporta Fullscreen API en el contenedor — usa el
        // reproductor nativo del <video> (webkitEnterFullscreen).
        const video = videoRef.current as unknown as {
          webkitEnterFullscreen?: () => void;
        } | null;
        video?.webkitEnterFullscreen?.();
      }
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);

    // iOS Safari (webkitEnterFullscreen) no dispara fullscreenchange, sino
    // los eventos propietarios webkitbeginfullscreen/webkitendfullscreen
    // sobre el propio <video>.
    const video = videoRef.current;
    const onBegin = () => setIsFullscreen(true);
    const onEnd = () => setIsFullscreen(false);
    video?.addEventListener("webkitbeginfullscreen" as any, onBegin);
    video?.addEventListener("webkitendfullscreen" as any, onEnd);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      video?.removeEventListener("webkitbeginfullscreen" as any, onBegin);
      video?.removeEventListener("webkitendfullscreen" as any, onEnd);
    };
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
    setPipSupported(
      document.pictureInPictureEnabled === true &&
        !video.disablePictureInPicture,
    );
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

  useEffect(() => {
    ccEnabledRef.current = ccEnabled;
  }, [ccEnabled]);

  // ── Estado hablado para lectores de pantalla ───────────────

  useEffect(() => {
    setLiveMessage(playing ? "Reproduciendo" : "En pausa");
  }, [playing]);

  useEffect(() => {
    if (buffering) setLiveMessage("Cargando video");
  }, [buffering]);

  useEffect(() => {
    setLiveMessage(muted ? "Silenciado" : "Sonido activado");
  }, [muted]);

  // ── Playback toggle (touch-aware) ──────────────────────────

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;
    video.paused ? video.play() : video.pause();
    kickIdle();
  }, [error, kickIdle]);

  const handleVideoAreaTap = useCallback(() => {
    if (!started) {
      togglePlay();
      return;
    }
    if (!mouseActive) {
      kickIdle();
      return;
    }
    togglePlay();
  }, [started, mouseActive, kickIdle, togglePlay]);

  // ── Speed control ──────────────────────────────────────────

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_CYCLE.indexOf(prev as (typeof SPEED_CYCLE)[number]);
      const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
      const video = videoRef.current;
      if (video) video.playbackRate = next;
      try {
        localStorage.setItem("ca-speed", String(next));
      } catch {
        /* noop */
      }
      setLiveMessage(`Velocidad ${next}x`);
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

  const onTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      seekFromEvent(e);
    },
    [seekFromEvent],
  );

  const onTrackPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const onTrackKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const video = videoRef.current;
      if (!video || durationSeconds <= 0) return;
      const t = video.currentTime;
      let handled = true;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          video.currentTime = Math.min(durationSeconds, t + 5);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          video.currentTime = Math.max(0, t - 5);
          break;
        case "Home":
          video.currentTime = 0;
          break;
        case "End":
          video.currentTime = durationSeconds;
          break;
        case "PageUp":
          video.currentTime = Math.min(durationSeconds, t + 30);
          break;
        case "PageDown":
          video.currentTime = Math.max(0, t - 30);
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [durationSeconds],
  );

  const onTrackPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      setScrubX(
        Math.max(
          0,
          Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
        ),
      );
      if (isDragging.current) seekFromEvent(e);
    },
    [seekFromEvent],
  );

  // ── Volume control ─────────────────────────────────────────

  const applyVolumeFromPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
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

  const onVolumePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isVolumeDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyVolumeFromPointer(e);
    },
    [applyVolumeFromPointer],
  );

  const onVolumePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isVolumeDragging.current) return;
      applyVolumeFromPointer(e);
    },
    [applyVolumeFromPointer],
  );

  const onVolumePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isVolumeDragging.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  const onVolumeKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const cur = video.muted ? 0 : video.volume;
      let next = cur;
      let handled = true;
      switch (e.key) {
        case "ArrowUp":
        case "ArrowRight":
          next = Math.min(1, cur + 0.1);
          break;
        case "ArrowDown":
        case "ArrowLeft":
          next = Math.max(0, cur - 0.1);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = 1;
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        video.volume = next;
        video.muted = next === 0;
      }
    },
    [],
  );

  // ── Derived UI flags ───────────────────────────────────────

  const showControls =
    !started ||
    mouseActive ||
    !playing ||
    qualityOpen ||
    volumeOpen ||
    controlsFocused;

  // Capítulo bajo el cursor o cercano al punto de scrubbing (funciona también
  // con touch, donde no hay hover).
  const nearChapter =
    scrubX == null
      ? null
      : chapterMarkers.reduce<number | null>((acc, m, i) => {
          if (Math.abs(m - scrubX) > 2.5) return acc;
          if (acc == null) return i;
          return Math.abs(m - scrubX) < Math.abs(chapterMarkers[acc] - scrubX)
            ? i
            : acc;
        }, null);
  const shownChapter = hoveredChapter != null ? hoveredChapter : nearChapter;
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
        className="vp-frame relative aspect-video w-full overflow-hidden rounded-[18px] bg-black select-none touch-manipulation"
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
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* Legibilidad de subtítulos sobre el video */}
        <style>{`
          .vp-frame video::cue {
            font-size: 1.05em;
            line-height: 1.35;
            background: rgba(0,0,0,0.75);
            color: #fff;
          }
        `}</style>

        {/* Estado hablado para lectores de pantalla */}
        <div className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </div>

        {/* Aviso de modo de respaldo (MP4 progresivo, sin subtítulos) */}
        {degraded && (
          <div
            className="absolute right-4 top-4 z-20 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            Modo de respaldo — sin subtítulos
          </div>
        )}

        {/* Loading overlay before ready — mantiene visible el poster debajo,
            oscurecido con un gradiente encima (no bg-black/40 + backgroundImage:
            el background-image se pinta sobre el background-color y el tinte
            no se ve). El gradient-over-image sí compone en el mismo layer. */}
        {!ready && (
          <div
            className="absolute inset-0 z-10 grid place-items-center"
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${posterUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
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

        {/* Click/tap area — touch: first tap shows controls, second pauses */}
        <button
          onClick={handleVideoAreaTap}
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
          onFocusCapture={() => {
            setControlsFocused(true);
            kickIdle();
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setControlsFocused(false);
          }}
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
              role="slider"
              tabIndex={0}
              aria-label="Barra de progreso del video"
              aria-valuemin={0}
              aria-valuemax={Math.round(durationSeconds)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${fmtTimestamp(currentTime)} de ${fmtTimestamp(durationSeconds)}`}
              onKeyDown={onTrackKeyDown}
              className="mb-2 cursor-pointer rounded-full px-1 outline-none touch-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{ height: 24 }}
              onPointerEnter={() => setHoverBar(true)}
              onPointerLeave={() => {
                setHoverBar(false);
                setScrubX(null);
              }}
              onPointerMove={onTrackPointerMove}
              onPointerDown={onTrackPointerDown}
              onPointerUp={onTrackPointerUp}
              onPointerCancel={onTrackPointerUp}
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
                    {shownChapter === i &&
                      chapters?.[i] &&
                      (hoverBar || isDragging.current) && (
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
                {/* Scrub tooltip — visible en hover (mouse) o durante drag táctil */}
                {scrubX != null &&
                  shownChapter == null &&
                  (hoverBar || isDragging.current) && (
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
              <div className="flex items-center gap-1 md:gap-1.5">
                {/* LIME play/pause — primary action */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  aria-label={playing ? "Pausar" : "Reproducir"}
                  className="grid h-11 w-11 place-items-center rounded-full transition-transform hover:scale-105"
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
                  aria-label="Retroceder 10 segundos"
                  className="hidden h-11 w-11 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:grid md:h-9 md:w-9"
                >
                  <VPIcon name="skip-back" size={14} color="#ffffff" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    skipForward();
                  }}
                  aria-label="Avanzar 10 segundos"
                  className="hidden h-11 w-11 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:grid md:h-9 md:w-9"
                >
                  <VPIcon name="skip-fwd" size={14} color="#ffffff" />
                </button>

                {/* Volume — hidden on mobile (use device volume) */}
                <div
                  className="hidden items-center md:flex"
                  onMouseEnter={() => setVolumeOpen(true)}
                  onMouseLeave={() => setVolumeOpen(false)}
                  onFocus={() => setVolumeOpen(true)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node))
                      setVolumeOpen(false);
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const video = videoRef.current;
                      if (video) video.muted = !video.muted;
                    }}
                    aria-label={muted ? "Activar sonido" : "Silenciar"}
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
                        role="slider"
                        tabIndex={0}
                        aria-label="Volumen"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
                        aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
                        onKeyDown={onVolumeKeyDown}
                        className="relative h-1 w-20 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        style={{ background: "rgba(255,255,255,0.22)" }}
                        onPointerDown={onVolumePointerDown}
                        onPointerMove={onVolumePointerMove}
                        onPointerUp={onVolumePointerUp}
                        onPointerCancel={onVolumePointerUp}
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
                <div className="ml-1 font-mono text-[10px] font-semibold tabular-nums text-white/80 md:ml-1.5 md:text-[11px]">
                  <span>{fmtTimestamp(currentTime)}</span>
                  <span className="mx-0.5 text-white/35 md:mx-1">/</span>
                  <span className="text-white/55">
                    {fmtTimestamp(durationSeconds)}
                  </span>
                </div>
              </div>

              {/* RIGHT */}
              <div className="flex items-center gap-1 md:gap-1.5">
                {/* CC toggle — solo si la lección tiene subtítulos */}
                {hasCaptions && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCcEnabled((v) => !v);
                    }}
                    aria-label={ccEnabled ? "Desactivar subtítulos" : "Activar subtítulos"}
                    className="relative grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:h-9 md:w-9"
                  >
                    <VPIcon name="cc" size={18} color="#ffffff" />
                    {ccEnabled && (
                      <span
                        className="absolute bottom-1.5 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full md:bottom-1"
                        style={{ background: CA.lime }}
                      />
                    )}
                  </button>
                )}

                {/* Speed pill */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleSpeed();
                  }}
                  aria-label={`Velocidad de reproducción: ${speed}x`}
                  className="rounded-full px-2 py-1.5 font-mono text-[11px] font-bold tabular-nums transition-colors hover:bg-white/[0.12] md:px-2.5 md:py-1"
                  style={{ border: "1px solid rgba(255,255,255,0.10)", minHeight: 44, minWidth: 44, display: "grid", placeItems: "center" }}
                >
                  {speed}x
                </button>

                {/* Quality selector — solo con hls.js (en HLS nativo la calidad
                    la controla el navegador); oculto en móvil */}
                {usingHls && (
                  <div ref={qualityRef} className="relative hidden md:block">
                    <button
                      ref={qualityBtnRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        setQualityOpen((v) => !v);
                      }}
                      aria-label={`Calidad de video: ${quality}`}
                      aria-haspopup="menu"
                      aria-expanded={qualityOpen}
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
                        role="menu"
                        aria-label="Calidad"
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
                          className="px-3 py-1.5 font-sans text-[10px] font-bold uppercase text-white/45"
                          style={{ letterSpacing: "0.18em" }}
                        >
                          Calidad
                        </div>
                        {QUALITIES.map((q) => {
                          const isActive = quality === q;
                          return (
                            <button
                              key={q}
                              role="menuitemradio"
                              aria-checked={isActive}
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
                )}

                {/* PiP — hidden on mobile y solo si el navegador lo soporta */}
                {pipSupported && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePip();
                    }}
                    aria-label={pipActive ? "Salir de imagen en imagen" : "Imagen en imagen"}
                    className="hidden h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:grid"
                  >
                    <VPIcon
                      name={pipActive ? "pip-on" : "pip"}
                      size={18}
                      color="#ffffff"
                    />
                  </button>
                )}

                {/* Fullscreen */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                  className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-white/[0.12] md:h-9 md:w-9"
                >
                  <VPIcon
                    name={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                    size={20}
                    color="#ffffff"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lesson progress strip below player */}
      <div
        className="flex flex-wrap items-center gap-2 text-sm md:gap-3"
        style={{ color: "var(--color-ca-ink-soft)" }}
      >
        <span className="shrink-0 text-[11px] font-semibold">
          Progreso
        </span>
        <div className="min-w-[100px] flex-1">
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
          {Math.round(watchPercentage)}%
        </span>
        {completed ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "rgba(168,211,16,0.18)", color: "#3f5a05" }}
          >
            Completada
          </span>
        ) : (
          <button
            onClick={markComplete}
            disabled={markingComplete}
            className="shrink-0 rounded-full border border-ca-violet/30 bg-ca-violet/[0.06] px-3 py-1 text-[11px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/[0.12] disabled:opacity-50"
          >
            {markingComplete ? "Guardando…" : "Marcar completada"}
          </button>
        )}
      </div>
    </div>
  );
}
