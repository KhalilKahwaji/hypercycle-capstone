import { useEffect, useRef, useState } from "react";
import client from "../api/client";
import BadgeIcon from "../components/BadgeIcon";
import BadgeToast from "../components/BadgeToast";

// Messages that change as the count goes up
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
  return PRESS_MESSAGES.find(([threshold]) => n >= threshold)?.[1] ?? `That's ${n}. Keep going, I guess.`;
}

function pickIcon(n) {
  if (n >= 50) return { icon: "Target",  color: "#e07a5f" };
  if (n >= 20) return { icon: "Zap",     color: "#7fce8c" };
  if (n >= 10) return { icon: "Star",    color: "#e8b84b" };
  return               { icon: "Send",   color: "#6fa8dc" };
}

function pickButtonLabel(n) {
  if (n >= 150) return "It was a test button";
  if (n >= 50) return "WHY ARE YOU STILL DOING THIS";
  if (n >= 20) return "Stop. Please.";
  if (n >= 10) return "okay but why";
  if (n >= 5)  return "Again?";
  if (n >= 1)  return "Press me again";
  return "Press me";
}

function StatPill({ label, value }) {
  return (
    <div style={{
      background: "#20241a",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "12px 20px",
      textAlign: "center",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 2 }}>{label}</div>
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
      background: earned ? "#1a1f14" : "var(--panel-solid)",
      border: `1px solid ${earned ? badge.color + "55" : "var(--border)"}`,
      borderRadius: "var(--radius)",
      padding: "18px 16px",
      opacity: earned ? 1 : 0.55,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition: "opacity 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BadgeIcon name={badge.icon} size={28} color={iconColor} />
        <div>
          <div style={{ fontWeight: 700, color: earned ? badge.color : "var(--muted)", fontSize: 14 }}>
            {badge.name}
          </div>
          {earnedDate && (
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 1 }}>{earnedDate}</div>
          )}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        {badge.description}
      </p>
      {!earned && (
        <div style={{ fontSize: 11, color: "var(--faint)", letterSpacing: "1px" }}>LOCKED</div>
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
    <div className="center-screen" style={{ justifyContent: "flex-start", paddingTop: 60 }}>
      <span className="spinner" /> &nbsp; Loading achievements…
    </div>
  );

  const { badges, stats } = data;

  return (
    <div>
      <h1 className="page-title">Achievements</h1>
      <p className="page-sub">
        {stats.earned}/{stats.total} badges earned
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
        <StatPill label="Badges earned" value={`${stats.earned}/${stats.total}`} />
        <StatPill label="Days completed" value={stats.completed_days} />
        <StatPill label="Total submissions" value={stats.total_submissions} />
      </div>

      {/* Demo / debug card */}
      <div style={{
        border: "1px dashed var(--amber)",
        borderRadius: "var(--radius)",
        padding: "16px 18px",
        marginBottom: 28,
        background: "#1a1600",
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

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}>
        {badges.map((badge) => (
          <BadgeCard key={badge.key} badge={badge} />
        ))}
      </div>

      <BadgeToast badges={demoToast} onDismiss={() => setDemoToast([])} />
    </div>
  );
}
