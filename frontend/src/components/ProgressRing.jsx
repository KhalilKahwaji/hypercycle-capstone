import { useEffect, useState } from "react";

// Each ring gets its own gradient ID to support multiple rings on a page.
let _ringCounter = 0;

export default function ProgressRing({
  pct = 0,
  size = 96,
  stroke = 8,
  color = "var(--amber)",       // used for label; ring uses gradient
  trackColor = "rgba(255,255,255,0.06)",
  labelStyle = {},
}) {
  const [displayed, setDisplayed] = useState(0);
  const [gradId] = useState(() => `rg-${++_ringCounter}`);

  useEffect(() => {
    const id = setTimeout(() => setDisplayed(pct), 80);
    return () => clearTimeout(id);
  }, [pct]);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (displayed / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ display: "block", transform: "rotate(-90deg)" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4dd0ff" />
            <stop offset="100%" stopColor="#8b7cff" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />

        {/* Animated fill — gradient stroke */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            filter: `drop-shadow(0 0 ${Math.round(stroke * 1.5)}px rgba(109,94,252,0.55))`,
          }}
        />
      </svg>

      {/* Centered label */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--display)",
          fontWeight: 900,
          fontSize: Math.round(size * 0.21),
          background: "linear-gradient(135deg, #8b7cff, #4dd0ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1,
          ...labelStyle,
        }}>
          {Math.round(displayed)}%
        </span>
      </div>
    </div>
  );
}
