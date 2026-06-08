import { useEffect, useState } from "react";

export default function ProgressRing({
  pct = 0,
  size = 96,
  stroke = 8,
  color = "var(--amber)",
  trackColor = "var(--border)",
  labelStyle = {},
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    // Small delay so the browser paints the initial 0 state,
    // giving the CSS transition something to animate from.
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
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--display)",
          fontWeight: 900,
          fontSize: Math.round(size * 0.21),
          color,
          lineHeight: 1,
          ...labelStyle,
        }}>
          {Math.round(displayed)}%
        </span>
      </div>
    </div>
  );
}
