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
      gap: 8,
      maxWidth: 300,
    }}>
      {badges.map((b) => (
        <div
          key={b.key}
          style={{
            background: "#1a1f14",
            border: `1px solid ${b.color}`,
            borderRadius: "var(--radius)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            boxShadow: `0 4px 20px ${b.color}33`,
          }}
        >
          <BadgeIcon name={b.icon} size={22} color={b.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: b.color, fontSize: 13 }}>
              {b.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
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
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
