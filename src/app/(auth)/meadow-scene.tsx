"use client";

import { useEffect, useState, type CSSProperties } from "react";

/*
 * Line-art backdrop for the sign-in page, in the style of the Fleur mark
 * (lucide's Flower2, see FleurMark in components/nav/navbar.tsx): a big
 * outlined sun and thick drifting clouds up top, a meadow in the bottom half.
 */

const INK = "#111111";
const HEADS = ["#e5484d", "#3b82f6", "#f5b800"]; // red, blue, yellow

/** The Fleur flower: black stem and leaves, coloured head. */
function Flower({ head, size, style }: { head: string; size: number; style: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute"
      style={style}
    >
      <g stroke={INK}>
        <path d="M12 10v12" />
        <path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z" />
        <path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z" />
      </g>
      <g stroke={head}>
        <path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1" />
        <circle cx="12" cy="8" r="2" />
      </g>
    </svg>
  );
}

function Grass({ width, style }: { width: number; style: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 16 9"
      width={width}
      height={(width * 9) / 16}
      fill="none"
      stroke={INK}
      strokeWidth={1.4}
      strokeLinecap="round"
      className="absolute"
      style={style}
    >
      <path d="M3 8.5 1.5 3.5M5.5 8.5 6.5 1.5M8 8.5V4.5M10.5 8.5 12.5 2.5M13 8.5l1.5-3" />
    </svg>
  );
}

/** lucide's Cloud, white-filled so it hides the sun as it passes. */
function Cloud({ width }: { width: number }) {
  return (
    <svg viewBox="0.5 3.5 23 17" width={width} height={(width * 17) / 23} fill="#fff" stroke={INK} strokeLinejoin="round">
      <path vectorEffect="non-scaling-stroke" strokeWidth={6} d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

/** lucide's Sun, outlined only. */
function Sun({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={INK} strokeLinecap="round" className="absolute" style={style}>
      <g strokeWidth={0.9}>
        <circle cx="12" cy="12" r="4" fill="#fff" />
        <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- layout

type Placed = { id: number; size: number; x: number; r: number; head: string };
type CloudSpec = { id: number; width: number; top: number; duration: number; delay: number };
type Scene = { flowers: Placed[]; grass: Placed[]; clouds: CloudSpec[] };

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function makeScene(width: number): Scene {
  const mobile = width < 640;
  const flowerCount = Math.min(40, Math.max(12, Math.round(width / 42)));
  const flowers: Placed[] = Array.from({ length: flowerCount }, (_, id) => {
    const r = Math.random();
    // Nearer (lower) flowers are bigger, for a little depth.
    return { id, size: Math.round(34 + r * 30), x: 3 + Math.random() * 94, r, head: pick(HEADS) };
  }).sort((a, b) => a.r - b.r);

  const grass: Placed[] = Array.from({ length: Math.round(flowerCount * 1.2) }, (_, id) => {
    const r = Math.random();
    return { id, size: Math.round(22 + r * 14), x: Math.random() * 100, r, head: INK };
  }).sort((a, b) => a.r - b.r);

  const clouds: CloudSpec[] = Array.from({ length: mobile ? 3 : 4 }, (_, id) => {
    const duration = 80 + Math.random() * 70;
    return {
      id,
      width: Math.round((mobile ? 120 : 170) + Math.random() * (mobile ? 60 : 110)),
      top: Math.random() * 14,
      duration,
      delay: -Math.random() * duration, // start spread across the sky
    };
  });

  return { flowers, grass, clouds };
}

/** Base of the item sits between `from`% of the height and the bottom, never poking above `from`%. */
function groundStyle(p: Placed, from: number, height: number): CSSProperties {
  return {
    left: `${p.x}%`,
    top: `calc(${from}% + ${height}px + (${100 - from}% - ${height}px) * ${p.r.toFixed(4)})`,
    transform: "translate(-50%, -100%)",
  };
}

export function MeadowScene() {
  const [scene, setScene] = useState<Scene | null>(null);

  useEffect(() => {
    let width = window.innerWidth;
    setScene(makeScene(width));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Only re-plant when the width changes (not on mobile URL-bar height jitter).
        if (Math.abs(window.innerWidth - width) < 40) return;
        width = window.innerWidth;
        setScene(makeScene(width));
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (!scene) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 animate-fade-in overflow-hidden select-none">
      <Sun style={{ width: "min(360px, 62vw)", height: "min(360px, 62vw)", right: "8%", top: "-3%" }} />

      {scene.clouds.map((c) => (
        <div
          key={`c${c.id}`}
          className="drift-cloud"
          style={{ top: `${c.top}%`, animationDuration: `${c.duration}s`, animationDelay: `${c.delay}s` }}
        >
          <Cloud width={c.width} />
        </div>
      ))}

      {scene.grass.map((g) => (
        <Grass key={`g${g.id}`} width={g.size} style={groundStyle(g, 55, (g.size * 9) / 16)} />
      ))}
      {scene.flowers.map((f) => (
        <Flower key={`f${f.id}`} head={f.head} size={f.size} style={groundStyle(f, 50, f.size)} />
      ))}
    </div>
  );
}
