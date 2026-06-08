const NODES = [
  { x: 8,   y: 15 }, { x: 42,  y: 6  }, { x: 88,  y: 9  }, { x: 130, y: 20 },
  { x: 152, y: 44 }, { x: 145, y: 72 }, { x: 100, y: 83 }, { x: 60,  y: 86 },
  { x: 18,  y: 76 }, { x: 4,   y: 48 }, { x: 52,  y: 44 }, { x: 96,  y: 50 },
  { x: 32,  y: 28 }, { x: 118, y: 38 }, { x: 74,  y: 18 },
];

const EDGES = [
  [0,1],[1,14],[14,2],[2,3],[3,13],[13,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,0],
  [10,11],[10,12],[11,13],[10,7],[11,5],[12,1],[12,9],[14,10],[3,11],[0,12],
];

// Alternate indigo and cyan for visual interest
const edgeColor = (i) => i % 3 === 0 ? "#4dd0ff" : "#6d5efc";

export default function NeuralBg() {
  return (
    <>
      <svg
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 0,
        }}
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="nb-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x} y1={NODES[a].y}
            x2={NODES[b].x} y2={NODES[b].y}
            stroke={edgeColor(i)}
            strokeWidth="0.22"
            strokeOpacity="0.16"
            strokeDasharray="2.8 1.8"
            style={{
              animation: `edge-flow ${3.6 + (i % 5) * 0.55}s linear ${(i * 0.25) % 2.5}s infinite`,
            }}
          />
        ))}

        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x} cy={n.y}
            r={i % 4 === 0 ? 0.9 : i % 3 === 0 ? 0.65 : 0.48}
            fill={i % 2 === 0 ? "#8b7cff" : "#4dd0ff"}
            filter="url(#nb-glow)"
            style={{
              animation: `node-pulse ${2.6 + (i * 0.38) % 2.4}s ease-in-out ${(i * 0.42) % 3.2}s infinite`,
            }}
          />
        ))}
      </svg>

      {/* Indigo→cyan scanning line */}
      <div className="auth-scan" aria-hidden="true" />
    </>
  );
}
