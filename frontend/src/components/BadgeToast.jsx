import BadgeIcon from "./BadgeIcon";

export default function BadgeToast({ badges, onDismiss }) {
  if (!badges.length) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      maxWidth: 310,
    }}>
      {badges.map((b) => (
        <div
          key={b.key}
          style={{
            background: "rgba(10,11,20,0.94)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${b.color}50`,
            borderRadius: "var(--radius)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 24px ${b.color}22`,
            animation: "fade-in-up 0.25s var(--ease) both",
          }}
        >
          <BadgeIcon name={b.icon} size={22} color={b.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: b.color, fontSize: 13, marginBottom: 2 }}>
              {b.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
              {b.description}
            </div>
          </div>
          <button
            onClick={onDismiss}
            style={{
              background: "none",
              border: "none",
              color: "var(--faint)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
              boxShadow: "none",
              letterSpacing: 0,
              fontWeight: "normal",
              width: "auto",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
