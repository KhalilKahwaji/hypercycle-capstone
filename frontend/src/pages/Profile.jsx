import { useEffect, useRef, useState } from "react";
import client from "../api/client";
import BadgeIcon from "../components/BadgeIcon";
import BadgeToast from "../components/BadgeToast";

const PRESS_MESSAGES = [
  [150, "Now stop procrastinating and go learn something -.-"],
  [145, "OK OK I'LL ADMIT, THIS IS A TEST BUTTON."],
  [100, "At this point you're just trolling."],
  [50,  "Seek professional assistance."],
  [20,  "Please. Stop."],
  [10,  "OK this is getting weird."],
  [5,   "Still going, huh?"],
  [2,   "Wow, you actually pressed it again."],
  [1,   "Oh. You actually pressed it."],
];

function pickMessage(n) {
  return PRESS_MESSAGES.find(([t]) => n >= t)?.[1] ?? `That's ${n}. Keep going, I guess.`;
}
function pickIcon(n) {
  if (n >= 50) return { icon: "Target",  color: "#f87171" };
  if (n >= 20) return { icon: "Zap",     color: "#4ade80" };
  if (n >= 10) return { icon: "Star",    color: "#8b7cff" };
  return               { icon: "Send",   color: "#4dd0ff" };
}
function pickButtonLabel(n) {
  if (n >= 150) return "It was a test button";
  if (n >= 50)  return "WHY ARE YOU STILL DOING THIS";
  if (n >= 20)  return "Stop. Please.";
  if (n >= 10)  return "okay but why";
  if (n >= 5)   return "Again?";
  if (n >= 1)   return "Press me again";
  return "Press me";
}

function StatPill({ label, value }) {
  return (
    <div style={{
      background: "rgba(13,15,24,0.72)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "var(--radius)",
      padding: "16px 22px",
      textAlign: "center",
      minWidth: 130,
      boxShadow: "var(--shadow-md)",
    }}>
      <div style={{
        fontSize: 26,
        fontWeight: 900,
        fontFamily: "var(--display)",
        background: "linear-gradient(135deg, var(--amber), var(--cyan))",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        lineHeight: 1.1,
      }}>{value}</div>
      <div style={{
        fontSize: 10,
        color: "var(--faint)",
        textTransform: "uppercase",
        letterSpacing: "1.8px",
        marginTop: 4,
      }}>{label}</div>
    </div>
  );
}

function BadgeCard({ badge }) {
  const earned = badge.earned;
  const iconColor = earned ? badge.color : "var(--faint)";
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{
      background: earned
        ? `rgba(13,15,24,0.8)`
        : "rgba(13,15,24,0.5)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: `1px solid ${earned ? badge.color + "44" : "rgba(255,255,255,0.07)"}`,
      borderRadius: "var(--radius)",
      padding: "20px",
      opacity: earned ? 1 : 0.45,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      transition: "opacity 0.2s, transform 0.2s var(--ease), box-shadow 0.2s",
      boxShadow: earned
        ? `0 4px 24px rgba(0,0,0,0.4), 0 0 20px ${badge.color}22`
        : "var(--shadow-sm)",
      cursor: earned ? "default" : "default",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BadgeIcon name={badge.icon} size={28} color={iconColor} />
        <div>
          <div style={{ fontWeight: 700, color: earned ? badge.color : "var(--muted)", fontSize: 14 }}>
            {badge.name}
          </div>
          {earnedDate && (
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{earnedDate}</div>
          )}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
        {badge.description}
      </p>
      {!earned && (
        <div style={{ fontSize: 10, color: "var(--faint)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          Locked
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pressCount, setPressCount] = useState(0);
  const [demoToast, setDemoToast] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    client.get("/achievements/me")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleDemoPress = () => {
    const n = pressCount + 1;
    setPressCount(n);
    if (timerRef.current) clearTimeout(timerRef.current);
    const { icon, color } = pickIcon(n);
    setDemoToast([{
      key: "demo_press",
      name: n === 1 ? "Button Found" : `Button Masher (×${n})`,
      description: pickMessage(n),
      icon,
      color,
    }]);
    timerRef.current = setTimeout(() => setDemoToast([]), 4000);
  };

  if (error) return <div className="alert err">{error}</div>;
  if (!data) return (
    <div style={{ padding: "60px 0", color: "var(--muted)", display: "flex", alignItems: "center", gap: 12 }}>
      <span className="spinner" /> Loading achievements…
    </div>
  );

  const { badges, stats } = data;

  return (
    <div>
      <h1 className="page-title fade-in">Achievements</h1>
      <p className="page-sub fade-in-1">{stats.earned}/{stats.total} badges earned</p>

      {/* Stats hero row */}
      <div className="fade-in-1" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 36 }}>
        <StatPill label="Badges earned" value={`${stats.earned}/${stats.total}`} />
        <StatPill label="Days completed" value={stats.completed_days} />
        <StatPill label="Total submissions" value={stats.total_submissions} />
      </div>

      {/* Demo / debug card */}
      <div className="fade-in-2" style={{
        border: "1px dashed rgba(139,124,255,0.35)",
        borderRadius: "var(--radius)",
        padding: "18px 22px",
        marginBottom: 32,
        background: "rgba(139,124,255,0.05)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--amber)", fontSize: 13, marginBottom: 4 }}>
            Definitely Not a Test Button
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {pressCount === 0
              ? "Try pressing this button. Go on."
              : `Wow, you've pressed it ${pressCount} time${pressCount === 1 ? "" : "s"}.`}
          </div>
        </div>
        <button onClick={handleDemoPress} style={{ flexShrink: 0 }}>
          {pickButtonLabel(pressCount)}
        </button>
      </div>

      {/* Badge grid */}
      <div className="fade-in-3" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 14,
      }}>
        {badges.map((badge) => (
          <BadgeCard key={badge.key} badge={badge} />
        ))}
      </div>

      <BadgeToast badges={demoToast} onDismiss={() => setDemoToast([])} />
    </div>
  );
}
