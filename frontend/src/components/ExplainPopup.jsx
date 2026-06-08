import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, X } from "lucide-react";
import client from "../api/client";

const POPUP_W = 340;
const BTN_H = 32;
const POPUP_OFFSET = 8;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// All positions are fixed (viewport-relative) so they match getBoundingClientRect() directly.
function computeButtonPos(rect) {
  const vw = window.innerWidth;
  let x = rect.left + rect.width / 2 - 48;
  x = clamp(x, 8, vw - 108);
  const y = rect.top > BTN_H + 16
    ? rect.top - BTN_H - 8
    : rect.bottom + 8;
  return { x, y };
}

function computePopupPos(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = rect.left + rect.width / 2 - POPUP_W / 2;
  x = clamp(x, 8, vw - POPUP_W - 8);
  const y = vh - rect.bottom >= 270
    ? rect.bottom + POPUP_OFFSET
    : rect.top - 270 - POPUP_OFFSET;
  return { x, y };
}

function isInsideEditable(node) {
  let el = node instanceof Element ? node : node?.parentElement;
  while (el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    if (el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

export default function ExplainPopup({ pageContext }) {
  const [btnPos, setBtnPos]         = useState(null);
  const [popupPos, setPopupPos]     = useState(null);
  const [selectedText, setSelectedText] = useState("");
  const [selRect, setSelRect]       = useState(null);
  const [busy, setBusy]             = useState(false);
  const [explanation, setExplanation] = useState("");
  const [error, setError]           = useState("");

  const popupRef  = useRef(null);
  const btnRef    = useRef(null);
  // Set to true in handleExplain so the queued mouseup callback doesn't overwrite state.
  const skipNextMouseUpRef = useRef(false);

  const close = useCallback(() => {
    setBtnPos(null);
    setPopupPos(null);
    setSelectedText("");
    setSelRect(null);
    setExplanation("");
    setError("");
    setBusy(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const onMouseUp = (e) => {
      setTimeout(() => {
        // If handleExplain was just triggered, don't reset its state.
        if (skipNextMouseUpRef.current) {
          skipNextMouseUpRef.current = false;
          return;
        }

        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";

        if (text.length < 3) return;

        const anchorNode = sel.anchorNode;
        if (isInsideEditable(anchorNode)) return;

        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) return;

        setSelectedText(text);
        setSelRect(rect);
        setBtnPos(computeButtonPos(rect));
        setPopupPos(null);
        setExplanation("");
        setError("");
      }, 10);
    };

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  // Close on Escape or click-outside (reads refs, not state, to avoid stale closure)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onDown = (e) => {
      const inBtn   = btnRef.current?.contains(e.target);
      const inPopup = popupRef.current?.contains(e.target);
      if (!inBtn && !inPopup && (btnRef.current || popupRef.current)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [close]);

  const handleExplain = async () => {
    if (!selectedText || !selRect) return;
    // Signal the queued mouseup callback (10ms) to skip resetting our state.
    skipNextMouseUpRef.current = true;
    setPopupPos(computePopupPos(selRect));
    setBtnPos(null);
    setBusy(true);
    setExplanation("");
    setError("");
    try {
      const res = await client.post("/define", {
        text: selectedText,
        context: pageContext || "",
      });
      setExplanation(res.data.explanation);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Could not fetch explanation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {btnPos && (
        <button
          ref={btnRef}
          className="explain-btn"
          style={{ position: "fixed", top: btnPos.y, left: btnPos.x, zIndex: 1200 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleExplain}
        >
          <Sparkles size={13} strokeWidth={2} />
          Explain
        </button>
      )}

      {popupPos && (
        <div
          ref={popupRef}
          className="explain-popup"
          style={{ position: "fixed", top: popupPos.y, left: popupPos.x, zIndex: 1200 }}
        >
          <div className="explain-popup-header">
            <span className="explain-quote">
              "{selectedText.slice(0, 120)}{selectedText.length > 120 ? "…" : ""}"
            </span>
            <button className="explain-close" onClick={close} aria-label="Close">
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="explain-popup-body">
            {busy && (
              <div className="explain-shimmer-wrap">
                <div className="skeleton explain-shimmer-line" style={{ width: "90%" }} />
                <div className="skeleton explain-shimmer-line" style={{ width: "76%" }} />
                <div className="skeleton explain-shimmer-line" style={{ width: "83%" }} />
              </div>
            )}
            {!busy && error && <p className="explain-error">{error}</p>}
            {!busy && explanation && <p className="explain-text">{explanation}</p>}
          </div>
        </div>
      )}
    </>
  );
}
