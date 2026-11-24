const N = 19;
const CX = 150;
const CY = 150;
const R_IN = 92;
const R_OUT = 138;

/** Round to 0.01 so server and browser render identical attributes. */
const r2 = (n: number) => Math.round(n * 100) / 100;

function mix(a: number[], b: number[], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ")})`;
}

/**
 * Semicircle of capsules (like the reference's "Channel performance" gauge).
 * `fraction` fills capsules left → right, dark fading to mid-gray.
 * Scales to fit its container (text included).
 */
export function SegmentedGauge({
  fraction,
  over = false,
  value,
  label,
}: {
  fraction: number;
  over?: boolean;
  value: string;
  label: string;
}) {
  const filled = Math.max(0, Math.min(N, Math.round(fraction * N)));
  const dark = [17, 17, 17];
  const end = over ? [220, 38, 38] : [150, 151, 155];

  return (
    <svg
      viewBox="0 0 300 160"
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={label}
      className="block h-full w-full"
    >
      {Array.from({ length: N }, (_, i) => {
        const a = Math.PI - (i * Math.PI) / (N - 1);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const on = i < filled;
        return (
          <line
            key={i}
            x1={r2(CX + R_IN * cos)}
            y1={r2(CY - R_IN * sin)}
            x2={r2(CX + R_OUT * cos)}
            y2={r2(CY - R_OUT * sin)}
            stroke={on ? mix(dark, end, filled > 1 ? i / (filled - 1) : 0) : "#e6e7e9"}
            strokeWidth={14}
            strokeLinecap="round"
          />
        );
      })}
      <text x={CX} y={146} textAnchor="middle" fontSize={40} fontWeight={600} fill={over ? "#dc2626" : "#111"} className="tabular">
        {value}
      </text>
    </svg>
  );
}
