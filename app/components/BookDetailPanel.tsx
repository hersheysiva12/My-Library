"use client";

import { useState, useEffect, useRef } from "react";
import { X, Pencil } from "lucide-react";
import { Book } from "@/app/types";

interface Props {
  book: Book;
  onUpdate: (updates: Partial<Book>) => void;
  onDelete: () => void;
  onClose: () => void;
  savedTs: number;
}

const LABEL: React.CSSProperties = {
  fontFamily: "var(--font-cinzel)",
  fontSize: "9px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "rgba(212,168,67,0.7)",
  marginBottom: "8px",
  display: "block",
};

const DIVIDER = (
  <hr style={{ border: "none", borderTop: "1px solid rgba(212,168,67,0.1)", margin: "16px 0" }} />
);

const FORMAT_SOURCES: Record<string, string[]> = {
  ebook: ["Libby", "Kindle"],
  audiobook: ["Libby", "Spotify", "Audible"],
};

const STATUS_CONFIG: Record<Book["status"], { label: string; color: string }> = {
  "tbr-owned":     { label: "TBR (Owned)",     color: "#f0c060" },
  "tbr-not-owned": { label: "TBR (Not Owned)", color: "#fbbf24" },
  reading:         { label: "Reading",          color: "#c084fc" },
  read:            { label: "Finished",         color: "#6dcc9a" },
  dnf:             { label: "DNF",              color: "#f87171" },
};

function returnDateColor(iso: string): string {
  const diff = Math.ceil(
    (new Date(iso + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 3) return "#ef4444";
  if (diff <= 7) return "#fbbf24";
  return "rgba(255,240,200,0.8)";
}

function returnDateBorder(iso: string): string {
  const c = returnDateColor(iso);
  if (c === "#ef4444") return "rgba(239,68,68,0.5)";
  if (c === "#fbbf24") return "rgba(251,191,36,0.5)";
  return "rgba(212,168,67,0.2)";
}

export default function BookDetailPanel({ book, onUpdate, onDelete, onClose, savedTs }: Props) {
  const [titleDraft, setTitleDraft]     = useState(book.title);
  const [titleEditing, setTitleEditing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [reviewDraft, setReviewDraft]   = useState(book.review ?? "");
  const [seriesOn, setSeriesOn]         = useState(!!book.seriesName);
  const [seriesName, setSeriesName]     = useState(book.seriesName ?? "");
  const [seriesPos, setSeriesPos]       = useState(book.seriesPosition?.toString() ?? "");
  const [seriesTotal, setSeriesTotal]   = useState(book.seriesTotal?.toString() ?? "");
  const [pageCountDraft, setPageCountDraft] = useState(book.pageCount?.toString() ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSaved, setShowSaved]       = useState(false);
  const [starHover, setStarHover]       = useState(0);

  // Sync local state when the panel opens for a different book
  useEffect(() => {
    setTitleDraft(book.title);
    setTitleEditing(false);
    setReviewDraft(book.review ?? "");
    setSeriesOn(!!book.seriesName);
    setSeriesName(book.seriesName ?? "");
    setSeriesPos(book.seriesPosition?.toString() ?? "");
    setSeriesTotal(book.seriesTotal?.toString() ?? "");
    setPageCountDraft(book.pageCount?.toString() ?? "");
    setConfirmDelete(false);
    setStarHover(0);
  }, [book.id]);

  // Debounced review save
  useEffect(() => {
    const t = setTimeout(() => {
      if (reviewDraft !== (book.review ?? "")) onUpdate({ review: reviewDraft || undefined });
    }, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewDraft]);

  // Saved toast
  useEffect(() => {
    if (!savedTs) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [savedTs]);

  const today = () => new Date().toISOString().split("T")[0];

  const INPUT: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(212,168,67,0.2)",
    borderRadius: "4px",
    color: "rgba(255,240,200,0.9)",
    fontFamily: "var(--font-crimson)",
    fontSize: "14px",
    padding: "6px 10px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const PILL: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: "999px",
    fontSize: "10px",
    fontFamily: "var(--font-cinzel)",
    letterSpacing: "0.1em",
    cursor: "pointer",
    border: "1px solid",
    transition: "all 0.2s",
    background: "transparent",
  };

  const activePill = (active: boolean, color = "rgba(212,168,67,0.6)") => ({
    ...PILL,
    borderColor: active ? color : "rgba(212,168,67,0.15)",
    background:  active ? "rgba(212,168,67,0.15)" : "transparent",
    color:       active ? "#fde68a" : "rgba(255,240,200,0.45)",
  });

  const formatSources = book.format ? FORMAT_SOURCES[book.format] : undefined;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: "clamp(340px, 420px, 92vw)",
      background: "linear-gradient(170deg, #0d0a1e 0%, #110d22 60%, #0a0816 100%)",
      borderLeft: "1px solid rgba(212,168,67,0.25)",
      boxShadow: "-8px 0 40px rgba(212,168,67,0.08), -2px 0 8px rgba(0,0,0,0.8)",
      zIndex: 51,
      overflowY: "auto",
      animation: "slideInRight 0.35s cubic-bezier(0.4,0,0.2,1)",
      fontFamily: "var(--font-crimson)",
      color: "rgba(255,240,200,0.9)",
    }}>

      {/* ── Cover header ── */}
      <div style={{ position: "relative", height: "180px", overflow: "hidden", flexShrink: 0 }}>
        {book.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverUrl} alt={book.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: book.coverGradient ?? "#1a0f2e" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d0a1e 0%, rgba(13,10,30,0.65) 45%, transparent 100%)" }} />
        <button onClick={onClose} style={{
          position: "absolute", top: "12px", right: "12px",
          background: "rgba(0,0,0,0.55)", border: "1px solid rgba(212,168,67,0.3)",
          borderRadius: "50%", width: "28px", height: "28px",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "rgba(212,168,67,0.8)",
        }}>
          <X size={14} />
        </button>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
            {titleEditing ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setTitleEditing(false);
                  if (titleDraft.trim() && titleDraft.trim() !== book.title) onUpdate({ title: titleDraft.trim() });
                  else setTitleDraft(book.title);
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitleDraft(book.title); setTitleEditing(false); } }}
                style={{
                  flex: 1, background: "rgba(0,0,0,0.4)", border: "none",
                  borderBottom: "1px solid rgba(212,168,67,0.5)",
                  color: "#f5e6c8", fontFamily: "var(--font-cinzel)", fontSize: "16px",
                  lineHeight: 1.3, outline: "none", padding: "0 0 2px",
                  textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                }}
                autoFocus
              />
            ) : (
              <>
                <h2 style={{
                  fontFamily: "var(--font-cinzel)", fontSize: "16px",
                  color: "#f5e6c8", lineHeight: 1.3,
                  textShadow: "0 1px 4px rgba(0,0,0,0.9)", margin: 0,
                }}>{titleDraft}</h2>
                <button
                  onClick={() => { setTitleEditing(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "rgba(212,168,67,0.5)", padding: "2px",
                    display: "flex", alignItems: "center", flexShrink: 0, marginTop: "2px",
                  }}>
                  <Pencil size={11} />
                </button>
              </>
            )}
          </div>
          <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "#d4a843", fontStyle: "italic" }}>
            {book.author}
          </p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ padding: "16px 18px" }}>

        {/* Format */}
        <label style={LABEL}>Format</label>
        <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
          {(["physical", "ebook", "audiobook"] as const).map(f => (
            <button key={f}
              onClick={() => onUpdate({ format: f, formatSource: undefined, returnDate: undefined })}
              style={activePill(book.format === f || (!book.format && f === "physical"))}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Source */}
        {formatSources && (
          <>
            <label style={LABEL}>Source</label>
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
              {formatSources.map(src => (
                <button key={src}
                  onClick={() => onUpdate({ formatSource: src })}
                  style={activePill(book.formatSource === src)}>
                  {src}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Return date — Libby only */}
        {book.formatSource === "Libby" && (
          <>
            {DIVIDER}
            <label style={LABEL}>Return Date</label>
            <input
              type="date"
              value={book.returnDate ?? ""}
              onChange={e => onUpdate({ returnDate: e.target.value || undefined })}
              style={{
                ...INPUT,
                color: book.returnDate ? returnDateColor(book.returnDate) : "rgba(255,240,200,0.45)",
                borderColor: book.returnDate ? returnDateBorder(book.returnDate) : "rgba(212,168,67,0.2)",
                colorScheme: "dark",
              }}
            />
          </>
        )}

        {DIVIDER}

        {/* Status */}
        <label style={LABEL}>Status</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {(["tbr-owned", "tbr-not-owned", "reading", "read", "dnf"] as const).map(s => {
            const cfg = STATUS_CONFIG[s];
            const isActive = book.status === s;
            return (
              <button key={s}
                onClick={() => {
                  const updates: Partial<Book> = { status: s };
                  if (s === "reading" && !book.startDate) updates.startDate = today();
                  if (s === "read"    && !book.dateFinished) updates.dateFinished = today();
                  onUpdate(updates);
                }}
                style={{
                  ...PILL,
                  borderColor: isActive ? cfg.color + "99" : "rgba(255,255,255,0.1)",
                  background:  isActive ? cfg.color + "22" : "transparent",
                  color:       isActive ? cfg.color : "rgba(255,240,200,0.4)",
                }}>
                {cfg.label}
              </button>
            );
          })}
        </div>


        {DIVIDER}

        {/* Rating */}
        <label style={LABEL}>Rating</label>
        <div style={{ display: "flex", gap: "4px" }}>
          {[1, 2, 3, 4, 5].map(star => {
            const filled = star <= (starHover || book.rating || 0);
            return (
              <span key={star}
                onMouseEnter={() => setStarHover(star)}
                onMouseLeave={() => setStarHover(0)}
                onClick={() => onUpdate({ rating: star === book.rating ? undefined : star })}
                style={{
                  fontSize: "24px", cursor: "pointer",
                  color: filled ? "#f59e0b" : "rgba(255,255,255,0.15)",
                  textShadow: filled ? "0 0 10px rgba(245,158,11,0.8)" : "none",
                  transition: "all 0.15s", lineHeight: 1,
                }}>★</span>
            );
          })}
        </div>

        {DIVIDER}

        {/* Review */}
        <label style={LABEL}>Review</label>
        <textarea
          value={reviewDraft}
          onChange={e => setReviewDraft(e.target.value)}
          placeholder="What did you think?"
          rows={4}
          style={{ ...INPUT, resize: "vertical", lineHeight: 1.6 }}
        />

        {DIVIDER}

        {/* Start / Finish dates */}
        {(book.status === "reading" || book.status === "read" || book.status === "dnf") && (
          <>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Date Started</label>
                <input
                  type="date"
                  value={book.startDate ?? ""}
                  onChange={e => onUpdate({ startDate: e.target.value || undefined })}
                  style={{ ...INPUT, colorScheme: "dark" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>Date Finished</label>
                <input
                  type="date"
                  value={book.dateFinished ?? ""}
                  onChange={e => onUpdate({ dateFinished: e.target.value || undefined })}
                  style={{ ...INPUT, colorScheme: "dark" }}
                />
              </div>
            </div>
            {DIVIDER}
          </>
        )}

        {/* Series */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <label style={{ ...LABEL, marginBottom: 0 }}>Part of a Series</label>
          <button
            onClick={() => {
              const next = !seriesOn;
              setSeriesOn(next);
              if (!next) onUpdate({ seriesName: undefined, seriesPosition: undefined, seriesTotal: undefined });
            }}
            style={{
              width: "38px", height: "22px", borderRadius: "11px",
              border: "none", cursor: "pointer", position: "relative",
              background: seriesOn ? "rgba(212,168,67,0.5)" : "rgba(255,255,255,0.1)",
              transition: "background 0.2s", flexShrink: 0,
            }}>
            <div style={{
              position: "absolute", top: "4px",
              left: seriesOn ? "18px" : "4px",
              width: "14px", height: "14px", borderRadius: "50%",
              background: seriesOn ? "#fde68a" : "rgba(255,255,255,0.4)",
              transition: "left 0.2s",
            }} />
          </button>
        </div>

        {seriesOn && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input
              placeholder="Series name"
              value={seriesName}
              onChange={e => setSeriesName(e.target.value)}
              onBlur={() => onUpdate({ seriesName: seriesName || undefined })}
              style={INPUT}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "rgba(255,240,200,0.45)", whiteSpace: "nowrap" }}>Book</span>
              <input
                type="number" min={1} placeholder="1"
                value={seriesPos}
                onChange={e => setSeriesPos(e.target.value)}
                onBlur={() => onUpdate({ seriesPosition: seriesPos ? Number(seriesPos) : undefined })}
                style={{ ...INPUT, width: "64px", textAlign: "center" }}
              />
              <span style={{ fontSize: "12px", color: "rgba(255,240,200,0.45)" }}>of</span>
              <input
                type="number" min={1} placeholder="?"
                value={seriesTotal}
                onChange={e => setSeriesTotal(e.target.value)}
                onBlur={() => onUpdate({ seriesTotal: seriesTotal ? Number(seriesTotal) : undefined })}
                style={{ ...INPUT, width: "64px", textAlign: "center" }}
              />
            </div>
          </div>
        )}

        {DIVIDER}

        {/* Page Count */}
        <div>
          <label style={LABEL}>Page Count</label>
          <input
            type="number"
            min={1}
            max={9999}
            placeholder="e.g. 324"
            value={pageCountDraft}
            onChange={e => setPageCountDraft(e.target.value)}
            onBlur={() => onUpdate({ pageCount: pageCountDraft ? Number(pageCountDraft) : undefined })}
            style={INPUT}
          />
          <p style={{ marginTop: "5px", fontSize: "11px", color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-crimson)", margin: "5px 0 0" }}>
            Affects spine width on the shelf
          </p>
        </div>

        {DIVIDER}

        {/* Delete */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              width: "100%", padding: "10px",
              background: "transparent",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "4px",
              color: "rgba(239,68,68,0.6)",
              fontFamily: "var(--font-cinzel)", fontSize: "10px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: "pointer",
            }}>
            Remove from Library
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ fontSize: "12px", color: "rgba(255,240,200,0.5)", textAlign: "center", margin: "0 0 2px" }}>
              Are you sure?
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: "10px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "4px",
                  color: "rgba(255,240,200,0.5)",
                  fontFamily: "var(--font-cinzel)", fontSize: "10px",
                  letterSpacing: "0.1em", cursor: "pointer",
                }}>
                Cancel
              </button>
              <button
                onClick={onDelete}
                style={{
                  flex: 1, padding: "10px",
                  background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.5)",
                  borderRadius: "4px",
                  color: "#ef4444",
                  fontFamily: "var(--font-cinzel)", fontSize: "10px",
                  letterSpacing: "0.1em", cursor: "pointer",
                }}>
                Yes, Remove
              </button>
            </div>
          </div>
        )}

        <div style={{ height: "28px" }} />
      </div>

      {/* Saved toast */}
      <div style={{
        position: "sticky", bottom: "12px",
        display: "flex", justifyContent: "flex-end",
        padding: "0 16px", pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "var(--font-cinzel)", fontSize: "10px",
          color: "#86efac", letterSpacing: "0.1em",
          opacity: showSaved ? 1 : 0,
          transition: "opacity 0.4s",
          background: "rgba(10,8,22,0.95)",
          padding: "4px 10px", borderRadius: "4px",
          border: "1px solid rgba(134,239,172,0.2)",
        }}>
          ✓ Saved
        </span>
      </div>
    </div>
  );
}
