import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useSensei } from "../context/SenseiContext";
import { useAuth } from "../context/AuthContext";
import { LINES, PERSONALITIES, PERSONALITY_LABELS, getIdleKey } from "../data/senseiLines";
import client from "../api/client";

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_DISMISSED   = "sensei_dismissed";
const LS_COLLAPSED   = "sensei_collapsed";
const LS_PERSONALITY = "sensei_personality";
const IDLE_DELAY_MS  = 6000;  // wait 6s before first idle line (gives events breathing room)
const IDLE_COOL_MS   = 20000; // min gap between consecutive idle lines
const BUBBLE_MS      = 4000;  // how long a bubble stays before auto-dismiss

// ── localStorage helpers ──────────────────────────────────────────────────────
function ls(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, String(val)); } catch {}
}

// ── Personality accent colors ─────────────────────────────────────────────────
const PAL = {
  sensei: { from: "#8b7cff", to: "#4dd0ff" },
  hype:   { from: "#ff6b9d", to: "#ffba35" },
  drill:  { from: "#00891e", to: "#9e4845" },
  zen:    { from: "#4dd0ff", to: "#80ffdb" },
};

// ── Inline icons ──────────────────────────────────────────────────────────────
function IconX() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  );
}
function IconMinus() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="6" x2="10" y2="6"/>
    </svg>
  );
}
function IconExpand() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 8l4-4 4 4"/>
    </svg>
  );
}

// ── Orb SVG character ─────────────────────────────────────────────────────────
function SenseiOrb({ personality, blinking, size = 52 }) {
  const c = PAL[personality] || PAL.sensei;
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="sn-body" cx="35%" cy="28%" r="65%">
          <stop offset="0%"   stopColor="#fff"   stopOpacity="0.24"/>
          <stop offset="45%"  stopColor={c.from} stopOpacity="0.92"/>
          <stop offset="100%" stopColor={c.to}   stopOpacity="0.55"/>
        </radialGradient>
        <radialGradient id="sn-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={c.from} stopOpacity="0.45"/>
          <stop offset="100%" stopColor={c.from} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="26" cy="26" r="25" fill="url(#sn-glow)"/>
      <circle cx="26" cy="26" r="17" fill="url(#sn-body)"/>
      <circle cx="26" cy="26" r="17" stroke="rgba(255,255,255,0.2)" strokeWidth="0.75"/>
      <ellipse cx="19.5" cy="18.5" rx="4.5" ry="3" fill="rgba(255,255,255,0.22)"/>
      {blinking ? (
        <>
          <rect x="18"   y="27.5" width="5.5" height="1" rx="0.5" fill="rgba(255,255,255,0.65)"/>
          <rect x="28.5" y="27.5" width="5.5" height="1" rx="0.5" fill="rgba(255,255,255,0.65)"/>
        </>
      ) : (
        <>
          <circle cx="21.5" cy="28"   r="1.9"  fill="rgba(255,255,255,0.72)"/>
          <circle cx="30.5" cy="28"   r="1.9"  fill="rgba(255,255,255,0.72)"/>
          <circle cx="22"   cy="28.5" r="0.85" fill="rgba(20,20,50,0.5)"/>
          <circle cx="31"   cy="28.5" r="0.85" fill="rgba(20,20,50,0.5)"/>
        </>
      )}
    </svg>
  );
}

// ── Control button base style ─────────────────────────────────────────────────
const ctrlBtnStyle = {
  width: 24, height: 24,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(10,11,20,0.82)",
  color: "var(--faint)",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0,
  letterSpacing: 0, fontWeight: "normal",
  boxShadow: "none",
  transition: "color 0.15s, border-color 0.15s",
};

// ── Main component ────────────────────────────────────────────────────────────
export default function HyperSensei() {
  const [dismissed,   setDismissed]   = useState(() => ls(LS_DISMISSED) === "1");
  const [collapsed,   setCollapsed]   = useState(() => {
    if (ls(LS_COLLAPSED) === "1") return true;
    return typeof window !== "undefined" && window.innerWidth < 480;
  });
  const [personality, setPersonality] = useState(() => {
    const p = ls(LS_PERSONALITY);
    return PERSONALITIES.includes(p) ? p : "sensei";
  });
  const [showPicker, setShowPicker] = useState(false);
  const [bubble,     setBubble]     = useState(null);
  const [blinking,   setBlinking]   = useState(false);
  const [hovered,    setHovered]    = useState(false);

  const location = useLocation();
  const { registerListener, registerRevive } = useSensei();
  const { user } = useAuth();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const lastIdleAt     = useRef(0);
  const lastLineRef    = useRef(null);
  const pathnameRef    = useRef(location.pathname);
  const personalityRef = useRef(personality);
  const userNameRef    = useRef("");
  const bubbleRef      = useRef(null);
  const idleTimerRef   = useRef(null);
  const bubbleTimerRef = useRef(null);
  const justRevivedRef = useRef(false);

  // Keep refs in sync with state/props
  useEffect(() => { pathnameRef.current    = location.pathname;                       }, [location.pathname]);
  useEffect(() => { personalityRef.current = personality;                             }, [personality]);
  useEffect(() => { bubbleRef.current      = bubble;                                  }, [bubble]);
  useEffect(() => { userNameRef.current    = user?.full_name?.split(" ")[0] || "";    }, [user]);

  // ── Stable callbacks ──────────────────────────────────────────────────────
  const closeBubble = useCallback(() => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble(null);
  }, []);

  const showLine = useCallback((text) => {
    if (!text) return;
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    lastLineRef.current = text;
    setBubble({ text, key: Date.now() });
    setBlinking(true);
    setTimeout(() => setBlinking(false), 200);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  const pickLine = useCallback((pool) => {
    if (!pool?.length) return null;
    const avail = pool.filter(l => l !== lastLineRef.current);
    const src = avail.length ? avail : pool;
    return src[Math.floor(Math.random() * src.length)];
  }, []);

  // fetchLine: calls Groq via /sensei/line; falls back to static pool on error.
  const fetchLine = useCallback(async (trigger, staticPool) => {
    try {
      const res = await client.post("/sensei/line", {
        personality: personalityRef.current,
        trigger,
        user_name: userNameRef.current,
      });
      return res.data.line || pickLine(staticPool);
    } catch {
      return pickLine(staticPool);
    }
  }, [pickLine]);

  // maybeShowIdle: checks its own cooldown, independent of events.
  const maybeShowIdle = useCallback(async () => {
    if (Date.now() - lastIdleAt.current < IDLE_COOL_MS) return;
    const key = getIdleKey(pathnameRef.current);
    if (!key) return;
    const staticPool = LINES[personalityRef.current]?.idle?.[key];
    const line = await fetchLine(key, staticPool);
    if (line) {
      lastIdleAt.current = Date.now();
      showLine(line);
    }
  }, [fetchLine, showLine]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Revive handler — registered even when dismissed=true (component still mounted).
  // When triggerRevive() is called from Dashboard, this runs, flips dismissed→false,
  // and sets a flag so the next render shows the greeting line.
  useEffect(() => {
    return registerRevive(() => {
      justRevivedRef.current = true;
      lsSet(LS_DISMISSED, "0");
      lsSet(LS_COLLAPSED, "0");
      setDismissed(false);
      setCollapsed(false);
    });
  }, [registerRevive]);

  // Once dismissed flips to false via revive, show the greeting line.
  useEffect(() => {
    if (dismissed || !justRevivedRef.current) return;
    justRevivedRef.current = false;
    const t = setTimeout(async () => {
      const pool = LINES[personalityRef.current]?.events?.revive;
      const line = await fetchLine("revive", pool);
      if (line) showLine(line);
    }, 500);
    return () => clearTimeout(t);
  }, [dismissed, fetchLine, showLine]);

  // Page change → clear bubble, schedule idle line.
  useEffect(() => {
    if (dismissed || collapsed) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    closeBubble();
    idleTimerRef.current = setTimeout(maybeShowIdle, IDLE_DELAY_MS);
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [location.pathname, dismissed, collapsed, maybeShowIdle, closeBubble]);

  // Event listener (pass/fail/badge etc.) — no cooldown, fires immediately.
  useEffect(() => {
    return registerListener(async (eventKey) => {
      const pool = LINES[personalityRef.current]?.events?.[eventKey];
      const line = await fetchLine(eventKey, pool);
      if (line) showLine(line);
    });
  }, [registerListener, fetchLine, showLine]);

  // Login greeting — set by Login.jsx via sessionStorage before navigating away.
  useEffect(() => {
    const pending = sessionStorage.getItem("sensei_pending_event");
    if (!pending) return;
    sessionStorage.removeItem("sensei_pending_event");
    const t = setTimeout(async () => {
      const pool = LINES[personalityRef.current]?.events?.[pending];
      const line = await fetchLine(pending, pool);
      if (line) showLine(line);
    }, 1200);
    return () => clearTimeout(t);
  }, [fetchLine, showLine]);

  // Occasional idle blink — keeps the orb feeling alive.
  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => {
      if (!bubbleRef.current && Math.random() > 0.65) {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 180);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [dismissed]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (dismissed) return null;

  const c = PAL[personality] || PAL.sensei;

  const dismiss = () => { setDismissed(true); lsSet(LS_DISMISSED, "1"); };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    lsSet(LS_COLLAPSED, next ? "1" : "0");
    if (next) { closeBubble(); setShowPicker(false); }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 999,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* ── Speech bubble ── */}
      {!collapsed && bubble && (
        <div
          key={bubble.key}
          style={{
            pointerEvents: "auto",
            maxWidth: 255,
            background: "rgba(10,11,20,0.94)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${c.from}35`,
            borderRadius: 12,
            padding: "12px 14px",
            boxShadow: `0 8px 32px rgba(0,0,0,0.65), 0 0 20px ${c.from}18`,
            animation: "sensei-bubble-in 0.22s cubic-bezier(0.16,1,0.3,1) both",
            position: "relative",
          }}
        >
          <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", margin: 0, paddingRight: 18 }}>
            {bubble.text}
          </p>
          <button
            onClick={closeBubble}
            title="Dismiss"
            style={{
              position: "absolute", top: 8, right: 8,
              background: "transparent", border: "none",
              color: "var(--faint)", cursor: "pointer",
              width: 16, height: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 1, letterSpacing: 0, fontWeight: "normal",
              boxShadow: "none",
            }}
          >
            <IconX />
          </button>
        </div>
      )}

      {/* ── Personality picker ── */}
      {showPicker && (
        <div
          style={{
            pointerEvents: "auto",
            background: "rgba(10,11,20,0.97)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid var(--border-bright)",
            borderRadius: 10,
            padding: 8,
            boxShadow: "0 8px 32px rgba(0,0,0,0.75)",
            display: "flex", flexDirection: "column", gap: 2,
            minWidth: 128,
          }}
        >
          <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 2, padding: "3px 8px 6px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            Personality
          </div>
          {PERSONALITIES.map((p) => {
            const pc = PAL[p];
            const active = personality === p;
            return (
              <button
                key={p}
                onClick={() => { setPersonality(p); lsSet(LS_PERSONALITY, p); setShowPicker(false); closeBubble(); }}
                style={{
                  background: active ? `${pc.from}18` : "transparent",
                  border: active ? `1px solid ${pc.from}40` : "1px solid transparent",
                  color: active ? pc.from : "var(--muted)",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  letterSpacing: 0,
                  boxShadow: "none",
                  width: "100%",
                }}
              >
                {PERSONALITY_LABELS[p]}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Orb + controls row ── */}
      <div
        style={{ pointerEvents: "auto", display: "flex", alignItems: "flex-end", gap: 6 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Controls — fade in on hover */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 4,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.18s",
          marginBottom: 4,
        }}>
          <button
            style={ctrlBtnStyle}
            onClick={(e) => { e.stopPropagation(); setShowPicker(s => !s); }}
            title="Change personality"
          >
            <IconSettings />
          </button>
          <button style={ctrlBtnStyle} onClick={toggleCollapse} title={collapsed ? "Expand" : "Minimize"}>
            {collapsed ? <IconExpand /> : <IconMinus />}
          </button>
          <button style={ctrlBtnStyle} onClick={dismiss} title="Dismiss HyperSensei">
            <IconX />
          </button>
        </div>

        {/* Orb */}
        <div
          onClick={collapsed ? toggleCollapse : undefined}
          style={{
            cursor: collapsed ? "pointer" : "default",
            animation: "sensei-float 4s ease-in-out infinite",
            filter: `drop-shadow(0 0 ${bubble ? 22 : 14}px ${c.from}55)`,
            transition: "filter 0.4s",
            position: "relative",
          }}
        >
          <SenseiOrb personality={personality} blinking={blinking} size={52} />
          {collapsed && (
            <div style={{
              position: "absolute", bottom: 1, right: 1,
              width: 10, height: 10, borderRadius: "50%",
              background: c.from, border: "2px solid #0a0b0f",
              boxShadow: `0 0 8px ${c.from}90`,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
