"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Moon, Sparkles, BookOpen, Stars, Loader2 } from "lucide-react";
import { Book, DbBook } from "@/app/types";
import SearchBar from "@/app/components/SearchBar";
import { supabase } from "@/lib/supabase";
import { paletteForIndex } from "@/lib/gradients";
import { extractColorsFromCover } from "@/lib/extractColors";

function dbRowToBook(row: DbBook, index: number): Book {
  const palette = paletteForIndex(index);
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? "Unknown Author",
    coverUrl: row.cover_url ?? undefined,
    googleBooksId: row.google_books_id ?? undefined,
    status: (["read", "reading", "tbr", "owned"].includes(row.status)
      ? row.status : "owned") as Book["status"],
    rating: row.rating ?? undefined,
    ...palette,
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} style={{ color: star <= rating ? "#d4a843" : "rgba(255,255,255,0.2)", fontSize: "10px" }}>★</span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Book["status"] }) {
  const config: Record<Book["status"], { label: string; bg: string; border: string; text: string }> = {
    read:    { label: "Read",    bg: "rgba(20,120,80,0.35)",  border: "rgba(109,204,154,0.5)", text: "#6dcc9a" },
    reading: { label: "Reading", bg: "rgba(100,30,180,0.35)", border: "rgba(192,132,252,0.5)", text: "#c084fc" },
    tbr:     { label: "TBR",     bg: "rgba(180,100,20,0.35)", border: "rgba(240,192,96,0.5)",  text: "#f0c060" },
    owned:   { label: "Owned",   bg: "rgba(30,100,180,0.35)", border: "rgba(125,211,252,0.5)", text: "#7dd3fc" },
  };
  const c = config[status] ?? config.owned;
  return (
    <span style={{
      fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.12em",
      padding: "2px 6px", borderRadius: "999px", textTransform: "uppercase",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    }}>
      {c.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   Book dimensions
───────────────────────────────────────────────────────── */
const SPINE_W = 36;
const COVER_W = 110;
const BOOK_H  = 168;

/* ─────────────────────────────────────────────────────────
   BookSpine
   Spine uses the left-edge slice of the cover image so
   colors always match. Falls back to palette gradient.
───────────────────────────────────────────────────────── */
function BookSpine({ book, isSelected, onSelect }: {
  book: Book; isSelected: boolean; onSelect: () => void;
}) {
  /* Spine always uses the gradient (palette or cover-extracted colours) */
  const spineBackground = { background: book.coverGradient ?? book.spineColor };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "relative",
        width: isSelected ? `${COVER_W}px` : `${SPINE_W}px`,
        height: `${BOOK_H}px`,
        flexShrink: 0,
        cursor: "pointer",
        transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
        perspective: "900px",
        perspectiveOrigin: "50% 50%",
        zIndex: isSelected ? 20 : 1,
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        transformStyle: "preserve-3d",
        transform: isSelected ? "translateZ(55px) rotateY(180deg)" : "translateZ(0) rotateY(0deg)",
        transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
      }}>

        {/* ══ FRONT: Spine ══ */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: `${SPINE_W}px`, height: `${BOOK_H}px`,
          ...spineBackground,
          borderRadius: "2px 1px 1px 2px",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          boxShadow: "inset -4px 0 10px rgba(0,0,0,0.55), 2px 0 6px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* Spine crease shadow */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 100%)",
          }} />
          {/* Decorative rules */}
          <div style={{ position: "absolute", top: "10px", left: "6px", right: "6px", height: "1px", background: book.accentColor, opacity: 0.4 }} />
          <div style={{ position: "absolute", bottom: "10px", left: "6px", right: "6px", height: "1px", background: book.accentColor, opacity: 0.4 }} />
          {/* Title along spine */}
          <div style={{
            position: "absolute", top: "18px", bottom: "18px", left: 0, right: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <p style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontFamily: "var(--font-cinzel)",
              fontSize: "7.5px",
              color: book.accentColor,
              letterSpacing: "0.09em",
              textAlign: "center",
              maxHeight: "120px",
              overflow: "hidden",
              textShadow: `0 0 6px ${book.accentColor}90`,
              lineHeight: 1.15,
            }}>
              {book.title}
            </p>
          </div>
        </div>

        {/* ══ BACK: Cover ══ */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: `${COVER_W}px`, height: `${BOOK_H}px`,
          transform: "rotateY(180deg)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          borderRadius: "2px 4px 4px 2px",
          overflow: "hidden",
          background: book.coverGradient ?? "#1a0f2e",
          boxShadow: `0 0 40px 10px ${book.glowColor}, -4px 6px 20px rgba(0,0,0,0.9)`,
        }}>
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverUrl} alt={book.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <>
              <div style={{ position: "absolute", left: 0, top: 0, width: "6px", height: "100%", background: "linear-gradient(to right, rgba(0,0,0,0.65), transparent)" }} />
              <div style={{ position: "absolute", inset: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ width: "100%", height: "1px", background: book.accentColor, opacity: 0.4 }} />
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: `1px solid ${book.accentColor}50`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: book.accentColor, opacity: 0.3 }} />
                </div>
                <div style={{ width: "100%", height: "1px", background: book.accentColor, opacity: 0.4 }} />
              </div>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)" }} />
            </>
          )}
          {/* Info bar at bottom */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "linear-gradient(to top, rgba(3,1,10,0.97) 0%, rgba(3,1,10,0.85) 50%, transparent 100%)",
            padding: "20px 8px 8px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
          }}>
            <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "7px", color: "#f5e6c8", textAlign: "center", lineHeight: 1.35, marginBottom: "1px" }}>
              {book.title}
            </p>
            <p style={{ fontFamily: "var(--font-crimson)", fontSize: "10px", color: "#d4a843", fontStyle: "italic", opacity: 0.9, marginBottom: "3px" }}>
              {book.author}
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
              <StatusBadge status={book.status} />
              {book.rating && <StarRating rating={book.rating} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Floating golden light motes
───────────────────────────────────────────────────────── */
function FloatingParticles() {
  const motes = [
    { left: "18%", bottom: "30%", delay: "0s",   dur: "6s"   },
    { left: "32%", bottom: "45%", delay: "1.4s", dur: "7s"   },
    { left: "47%", bottom: "25%", delay: "2.8s", dur: "5.5s" },
    { left: "61%", bottom: "55%", delay: "0.7s", dur: "8s"   },
    { left: "75%", bottom: "35%", delay: "3.5s", dur: "6.5s" },
    { left: "24%", bottom: "60%", delay: "1.9s", dur: "7.5s" },
    { left: "55%", bottom: "40%", delay: "4.2s", dur: "6s"   },
    { left: "83%", bottom: "50%", delay: "0.3s", dur: "9s"   },
    { left: "10%", bottom: "42%", delay: "2.1s", dur: "7s"   },
    { left: "68%", bottom: "28%", delay: "5s",   dur: "5.5s" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      {motes.map((m, i) => (
        <div key={i} style={{
          position: "absolute", left: m.left, bottom: m.bottom,
          width: "3px", height: "3px", borderRadius: "50%",
          background: "radial-gradient(circle, #fde68a 0%, #d4a843 60%, transparent 100%)",
          boxShadow: "0 0 6px 2px rgba(253,230,138,0.7)",
          animation: `floatUp ${m.dur} ${m.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   3-D Shelf row
───────────────────────────────────────────────────────── */
function Shelf3D({ books, selectedId, onSelect }: {
  books: Book[]; selectedId: string | number | null; onSelect: (id: string | number) => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      {/* Back wall */}
      <div style={{
        position: "absolute", top: 0, left: "10px", right: "10px", bottom: "28px",
        background: "linear-gradient(to bottom, #0c0608 0%, #120c0a 60%, #0e0806 100%)",
        borderLeft: "1px solid rgba(100,70,20,0.3)", borderRight: "1px solid rgba(100,70,20,0.3)",
        borderTop: "1px solid rgba(80,50,12,0.2)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.8)",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.1, backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 52px, rgba(160,90,20,0.4) 52px, rgba(160,90,20,0.4) 53px)" }} />
        <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: "50%", background: "radial-gradient(ellipse at 50% 100%, rgba(200,130,30,0.12) 0%, transparent 70%)" }} />
      </div>
      {/* Left bookend */}
      <div style={{ position: "absolute", bottom: "28px", left: "10px", width: "14px", height: `${BOOK_H}px`, background: "linear-gradient(to right, #4a2808 0%, #7a4018 60%, #5c3010 100%)", boxShadow: "2px 0 10px rgba(0,0,0,0.7)", borderRadius: "0 1px 1px 0", zIndex: 2 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "8px", background: "linear-gradient(to bottom, #c8903a, #9a6820)", borderRadius: "0 1px 0 0" }} />
      </div>
      {/* Right bookend */}
      <div style={{ position: "absolute", bottom: "28px", right: "10px", width: "14px", height: `${BOOK_H}px`, background: "linear-gradient(to left, #4a2808 0%, #7a4018 60%, #5c3010 100%)", boxShadow: "-2px 0 10px rgba(0,0,0,0.7)", borderRadius: "1px 0 0 1px", zIndex: 2 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "8px", background: "linear-gradient(to bottom, #c8903a, #9a6820)", borderRadius: "1px 0 0 0" }} />
      </div>
      {/* Books */}
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: "2px", padding: `20px 32px 0`, minHeight: `${BOOK_H + 20}px`, overflow: "visible", zIndex: 3 }}>
        {books.map((book) => (
          <BookSpine key={book.id} book={book} isSelected={selectedId === book.id} onSelect={() => onSelect(book.id)} />
        ))}
      </div>
      {/* Shelf board */}
      <div style={{ position: "relative", zIndex: 4 }}>
        <div style={{ height: "8px", margin: "0 4px", background: "linear-gradient(to bottom, #7a3e18 0%, #5a2c0e 100%)", boxShadow: "inset 0 2px 4px rgba(255,190,90,0.15)" }} />
        <div style={{ height: "20px", margin: "0 4px", position: "relative", overflow: "hidden", background: "linear-gradient(to bottom, #5c2a10 0%, #3e1c08 65%, #2e1406 100%)", boxShadow: "0 8px 22px rgba(0,0,0,0.8)" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.3, backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(0,0,0,0.2) 60px, rgba(0,0,0,0.2) 61px)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "rgba(210,150,70,0.3)" }} />
          <div style={{ position: "absolute", top: "35%", left: 0, right: 0, height: "1px", background: "rgba(212,168,67,0.12)" }} />
        </div>
        <div style={{ height: "12px", margin: "0 4px", background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }} />
      </div>
    </div>
  );
}

function ShelfDivider() {
  return (
    <div style={{ position: "relative", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2px" }}>
      <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, transparent, rgba(180,120,40,0.12))" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 14px" }}>
        <span style={{ color: "rgba(180,130,40,0.25)", fontSize: "8px" }}>✦</span>
        <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "radial-gradient(circle, #f8d870 0%, #d4a843 55%, #9a7018 100%)", boxShadow: "0 0 10px 4px rgba(212,168,67,0.45), 0 0 22px 8px rgba(180,110,10,0.18)", animation: "float 4s ease-in-out infinite" }} />
        <span style={{ color: "rgba(180,130,40,0.25)", fontSize: "8px" }}>✦</span>
      </div>
      <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left, transparent, rgba(180,120,40,0.12))" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ATMOSPHERIC BACKGROUND ELEMENTS
═══════════════════════════════════════════════════════ */

/* Spiral staircase silhouette — SVG, fixed in center background */
function SpiralStaircase() {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "420px", height: "70vh", pointerEvents: "none", zIndex: 0, opacity: 0.07 }}>
      <svg viewBox="0 0 420 600" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
        {/* Central pole */}
        <line x1="210" y1="0" x2="210" y2="600" stroke="#c8a050" strokeWidth="4" />
        {/* Spiral steps — ellipses at decreasing heights (perspective) */}
        {[580, 520, 462, 406, 352, 300, 250, 202, 156, 112, 70, 30].map((y, i) => {
          const rx = 130 - i * 6;
          const ry = 18 - i * 0.8;
          return <ellipse key={i} cx="210" cy={y} rx={Math.max(rx, 30)} ry={Math.max(ry, 5)} stroke="#c8a050" strokeWidth="2" fill="rgba(120,80,20,0.15)" />;
        })}
        {/* Outer helical railing */}
        <path d="M 80 580 C 20 520 400 480 400 420 C 400 360 20 320 20 260 C 20 200 400 160 400 100 C 400 60 200 20 200 0" stroke="#c8a050" strokeWidth="1.5" fill="none" />
        {/* Inner helical railing */}
        <path d="M 340 580 C 400 520 20 480 20 420 C 20 360 400 320 400 260 C 400 200 20 160 20 100 C 20 60 210 20 210 0" stroke="#c8a050" strokeWidth="1.5" fill="none" />
        {/* Step risers */}
        {[560, 500, 442, 386, 332, 280, 230, 182].map((y, i) => (
          <line key={i} x1={210 - (110 - i * 5)} y1={y} x2={210 + (110 - i * 5)} y2={y - 20} stroke="#c8a050" strokeWidth="1" />
        ))}
      </svg>
    </div>
  );
}

/* Wall bookshelf tiers — background depth layers */
function WallBookshelfTiers() {
  const tiers = [
    { y: "12%", opacity: 0.035, books: 28 },
    { y: "24%", opacity: 0.045, books: 26 },
    { y: "36%", opacity: 0.055, books: 24 },
    { y: "50%", opacity: 0.06,  books: 22 },
    { y: "64%", opacity: 0.065, books: 20 },
    { y: "78%", opacity: 0.07,  books: 18 },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {tiers.map((tier, ti) => (
        <div key={ti} style={{ position: "absolute", top: tier.y, left: 0, right: 0, height: "40px" }}>
          {/* Shelf board line */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: `rgba(140,90,30,${tier.opacity * 1.5})` }} />
          {/* Book spine silhouettes */}
          <div style={{ position: "absolute", bottom: "2px", left: 0, right: 0, height: "38px", display: "flex", justifyContent: "center", gap: "1px", overflow: "hidden" }}>
            {Array.from({ length: tier.books }).map((_, bi) => {
              const h = 20 + ((bi * 7 + ti * 3) % 15);
              const w = 6 + ((bi * 3 + ti) % 8);
              const hue = (bi * 40 + ti * 60) % 360;
              return (
                <div key={bi} style={{
                  width: `${w}px`, height: `${h}px`, alignSelf: "flex-end",
                  background: `hsla(${hue}, 30%, 25%, ${tier.opacity * 10})`,
                  borderRadius: "1px 1px 0 0",
                }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Crepuscular light beams from lanterns above */
function LightBeams() {
  const beams = [
    { left: "14%", width: "90px",  opacity: 0.045, delay: "0s"   },
    { left: "38%", width: "120px", opacity: 0.055, delay: "0.8s" },
    { left: "62%", width: "100px", opacity: 0.05,  delay: "0.4s" },
    { left: "84%", width: "80px",  opacity: 0.04,  delay: "1.2s" },
  ];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "80vh", pointerEvents: "none", zIndex: 0 }}>
      {beams.map((b, i) => (
        <div key={i} style={{
          position: "absolute",
          top: 0,
          left: `calc(${b.left} - ${parseInt(b.width) / 2}px)`,
          width: b.width, height: "100%",
          background: `linear-gradient(to bottom, rgba(220,175,70,${b.opacity}) 0%, rgba(180,130,40,${b.opacity * 0.4}) 40%, transparent 100%)`,
          clipPath: "polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%)",
          animation: `lanternGlow 4s ${b.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

/* Arched stone ceiling dome at top */
function ArchedDome() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "200px", pointerEvents: "none", zIndex: 0 }}>
      {/* Circular dome glow */}
      <div style={{
        position: "absolute", top: "-80px", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "260px",
        background: "radial-gradient(ellipse at 50% 30%, rgba(160,100,20,0.08) 0%, rgba(120,70,10,0.05) 40%, transparent 70%)",
        borderRadius: "50%",
      }} />
      {/* Stone arch SVG */}
      <svg viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.12 }}>
        {/* Main arch */}
        <path d="M 0 200 L 0 120 Q 400 -40 800 120 L 800 200" stroke="#b08040" strokeWidth="2" fill="rgba(40,25,10,0.3)" />
        {/* Inner arch detail */}
        <path d="M 40 200 L 40 130 Q 400 0 760 130 L 760 200" stroke="#b08040" strokeWidth="1" fill="none" opacity="0.6" />
        {/* Keystone at top */}
        <polygon points="390,8 410,8 415,30 385,30" fill="rgba(180,130,50,0.4)" />
        {/* Left column capital */}
        <rect x="0" y="100" width="50" height="20" fill="rgba(100,70,25,0.3)" />
        {/* Right column capital */}
        <rect x="750" y="100" width="50" height="20" fill="rgba(100,70,25,0.3)" />
      </svg>
    </div>
  );
}

/* Enhanced floating books — open and closed, many sizes */
function FloatingBooks() {
  const books = [
    /* Open books (two-page spread) */
    { top: "14%", left: "4%",  type: "open",   rot: "-18deg", s: 1.1,  dur: "9s",  delay: "0s",   col: "rgba(100,130,220,0.22)" },
    { top: "8%",  left: "70%", type: "open",   rot: "22deg",  s: 0.75, dur: "11s", delay: "3s",   col: "rgba(90,120,200,0.18)"  },
    { top: "28%", left: "88%", type: "open",   rot: "-6deg",  s: 0.9,  dur: "13s", delay: "1.5s", col: "rgba(120,150,230,0.2)"  },
    { top: "55%", left: "3%",  type: "open",   rot: "14deg",  s: 0.65, dur: "10s", delay: "5s",   col: "rgba(100,130,215,0.16)" },
    { top: "42%", left: "91%", type: "open",   rot: "-11deg", s: 1.0,  dur: "8s",  delay: "2s",   col: "rgba(110,140,225,0.2)"  },
    { top: "70%", left: "92%", type: "open",   rot: "19deg",  s: 0.55, dur: "12s", delay: "4s",   col: "rgba(90,115,195,0.15)"  },
    { top: "78%", left: "2%",  type: "open",   rot: "-24deg", s: 0.7,  dur: "14s", delay: "6.5s", col: "rgba(110,140,218,0.17)" },
    /* Closed books (spines) drifting */
    { top: "20%", left: "92%", type: "closed", rot: "35deg",  s: 0.8,  dur: "10s", delay: "2.5s", col: "rgba(160,100,200,0.18)" },
    { top: "62%", left: "6%",  type: "closed", rot: "-40deg", s: 0.6,  dur: "9s",  delay: "1s",   col: "rgba(200,150,80,0.16)"  },
    { top: "35%", left: "5%",  type: "closed", rot: "28deg",  s: 0.7,  dur: "15s", delay: "7s",   col: "rgba(80,160,200,0.15)"  },
    { top: "85%", left: "88%", type: "closed", rot: "-15deg", s: 0.5,  dur: "11s", delay: "3.5s", col: "rgba(140,100,220,0.14)" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {books.map((b, i) => (
        <div key={i} style={{ position: "absolute", top: b.top, left: b.left, animation: `floatBook ${b.dur} ${b.delay} ease-in-out infinite` }}>
          {b.type === "open" ? (
            /* Open book — two pages like butterfly wings */
            <div style={{ position: "relative", transform: `rotate(${b.rot}) scale(${b.s})`, width: "52px", height: "0" }}>
              <div style={{ position: "absolute", right: "24px", top: "-15px", width: "22px", height: "28px", background: b.col, border: `1px solid ${b.col.replace(/[\d.]+\)$/, "0.55)")}`, borderRadius: "2px 0 0 2px", boxShadow: `0 0 12px 3px ${b.col}`, transform: "perspective(80px) rotateY(14deg)" }} />
              <div style={{ position: "absolute", left: "24px", top: "-15px", width: "22px", height: "28px", background: b.col, border: `1px solid ${b.col.replace(/[\d.]+\)$/, "0.55)")}`, borderRadius: "0 2px 2px 0", boxShadow: `0 0 12px 3px ${b.col}`, transform: "perspective(80px) rotateY(-14deg)" }} />
              <div style={{ position: "absolute", left: "23px", top: "-15px", width: "2px", height: "28px", background: `rgba(255,255,255,0.12)` }} />
              {/* Page lines */}
              {[5, 10, 15, 20].map((py) => (
                <div key={py}>
                  <div style={{ position: "absolute", right: "26px", top: `${-15 + py}px`, width: "16px", height: "1px", background: `rgba(255,255,255,0.15)` }} />
                  <div style={{ position: "absolute", left: "26px", top: `${-15 + py}px`, width: "16px", height: "1px", background: `rgba(255,255,255,0.15)` }} />
                </div>
              ))}
            </div>
          ) : (
            /* Closed book — a spine rect */
            <div style={{ transform: `rotate(${b.rot}) scale(${b.s})`, width: "10px", height: "32px", background: b.col, border: `1px solid ${b.col.replace(/[\d.]+\)$/, "0.5)")}`, borderRadius: "1px 2px 2px 1px", boxShadow: `0 0 10px 3px ${b.col}` }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* Hanging lanterns */
function HangingLanterns() {
  const lanterns = [
    { left: "12%", delay: "0s",   cordH: 90,  size: 11 },
    { left: "30%", delay: "1.2s", cordH: 60,  size: 9  },
    { left: "50%", delay: "0.4s", cordH: 110, size: 13 },
    { left: "68%", delay: "0.9s", cordH: 55,  size: 9  },
    { left: "85%", delay: "1.7s", cordH: 80,  size: 10 },
  ];
  return (
    <div className="fixed top-0 left-0 right-0 pointer-events-none" style={{ zIndex: 1 }}>
      {lanterns.map((l, i) => (
        <div key={i} style={{ position: "absolute", left: l.left, top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "1px", height: `${l.cordH}px`, background: "linear-gradient(to bottom, rgba(140,100,40,0.45), rgba(120,80,20,0.2))" }} />
          <div style={{ width: `${l.size}px`, height: `${Math.round(l.size * 1.3)}px`, borderRadius: "2px 2px 5px 5px", background: "radial-gradient(ellipse at 50% 30%, #fde68a, #d4a843 45%, #92680f 100%)", animation: `lanternGlow 3s ${l.delay} ease-in-out infinite` }} />
          <div style={{ width: "1px", height: "10px", background: "linear-gradient(to bottom, rgba(212,168,67,0.5), transparent)" }} />
        </div>
      ))}
    </div>
  );
}

/* Depth mist layers */
function DepthMist() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {/* Upper mist */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "35%", background: "linear-gradient(to bottom, rgba(60,40,120,0.18) 0%, transparent 100%)" }} />
      {/* Side vignettes */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(2,3,15,0.65) 100%)" }} />
      {/* Bottom warmth */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "25%", background: "linear-gradient(to top, rgba(80,40,5,0.12) 0%, transparent 100%)" }} />
    </div>
  );
}

/* Stone pillars */
function StonePillars() {
  const side = (dir: "left" | "right"): React.CSSProperties => ({
    position: "fixed", top: 0, bottom: 0, [dir]: 0, width: "60px",
    background: dir === "left"
      ? "linear-gradient(to right, rgba(10,8,6,0.9) 0%, rgba(16,12,8,0.65) 55%, transparent 100%)"
      : "linear-gradient(to left,  rgba(10,8,6,0.9) 0%, rgba(16,12,8,0.65) 55%, transparent 100%)",
    pointerEvents: "none", zIndex: 2,
  });
  return (
    <>
      <div style={side("left")}>
        {[15, 30, 46, 62, 78].map((p) => <div key={p} style={{ position: "absolute", top: `${p}%`, left: 0, right: 0, height: "2px", background: "rgba(140,100,40,0.14)" }} />)}
      </div>
      <div style={side("right")}>
        {[15, 30, 46, 62, 78].map((p) => <div key={p} style={{ position: "absolute", top: `${p}%`, left: 0, right: 0, height: "2px", background: "rgba(140,100,40,0.14)" }} />)}
      </div>
    </>
  );
}

/* Starfield */
function Starfield() {
  const stars = [
    { top: "6%",  left: "8%",  size: 1.5, delay: "0s",   dur: "4s"   },
    { top: "13%", left: "22%", size: 1,   delay: "1s",   dur: "3s"   },
    { top: "4%",  left: "42%", size: 2,   delay: "0.5s", dur: "5s"   },
    { top: "11%", left: "58%", size: 1,   delay: "2s",   dur: "3.5s" },
    { top: "7%",  left: "76%", size: 1.5, delay: "0.8s", dur: "4.5s" },
    { top: "18%", left: "89%", size: 1,   delay: "1.5s", dur: "3s"   },
    { top: "3%",  left: "93%", size: 2,   delay: "0.3s", dur: "5s"   },
    { top: "16%", left: "46%", size: 1,   delay: "2.5s", dur: "4s"   },
    { top: "22%", left: "12%", size: 1.5, delay: "1.2s", dur: "3.8s" },
    { top: "9%",  left: "34%", size: 1,   delay: "0.7s", dur: "4.2s" },
    { top: "28%", left: "67%", size: 1,   delay: "1.8s", dur: "3.3s" },
    { top: "20%", left: "53%", size: 1.5, delay: "0.4s", dur: "5.2s" },
    { top: "2%",  left: "62%", size: 1,   delay: "3s",   dur: "3.7s" },
    { top: "25%", left: "80%", size: 1,   delay: "0.6s", dur: "4.8s" },
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full" style={{
          top: s.top, left: s.left,
          width: `${s.size}px`, height: `${s.size}px`,
          background: "rgba(210,225,255,0.9)",
          boxShadow: `0 0 ${s.size * 4}px rgba(160,190,255,0.7)`,
          animation: `twinkle ${s.dur} ${s.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

function toShelves(books: Book[], perShelf = 10): Book[][] {
  const shelves: Book[][] = [];
  for (let i = 0; i < books.length; i += perShelf) shelves.push(books.slice(i, i + perShelf));
  return shelves;
}

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  // Track which book IDs have already had colours extracted so we don't repeat
  const extractedRef = useRef(new Set<string | number>());

  useEffect(() => {
    async function loadBooks() {
      const { data, error } = await supabase
        .from("books").select("*").order("created_at", { ascending: true });
      if (!error && data) setBooks((data as DbBook[]).map((row, i) => dbRowToBook(row, i)));
      setIsLoading(false);
    }
    loadBooks();
  }, []);

  // After books load (or a new book is added), extract cover-derived colours
  useEffect(() => {
    books.forEach((book) => {
      if (!book.coverUrl || extractedRef.current.has(book.id)) return;
      extractedRef.current.add(book.id);
      extractColorsFromCover(book.coverUrl).then((colors) => {
        if (!colors) return;
        setBooks((prev) =>
          prev.map((b) => (b.id === book.id ? { ...b, ...colors } : b))
        );
      });
    });
  }, [books]);

  const handlePageClick = useCallback(() => setSelectedId(null), []);
  const handleSelect = useCallback((id: string | number) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  async function handleAddBook(book: Book) {
    const googleId = book.id as string;
    if (books.some((b) => b.googleBooksId === googleId)) return;
    const optimisticBook: Book = { ...book, googleBooksId: googleId };
    setBooks((prev) => [...prev, optimisticBook]);
    const { data, error } = await supabase.from("books")
      .insert({ title: book.title, author: book.author, cover_url: book.coverUrl ?? null, google_books_id: googleId, status: "owned" })
      .select().single();
    if (error) {
      setBooks((prev) => prev.filter((b) => b.id !== googleId));
      console.error("Failed to save book:", error.message);
      return;
    }
    setBooks((prev) => prev.map((b) => (b.id === googleId ? { ...b, id: (data as DbBook).id } : b)));
  }

  const shelves = toShelves(books);
  const readCount = books.filter((b) => b.status === "read").length;
  const readingCount = books.filter((b) => b.status === "reading").length;

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ background: "#0a0a1a" }}
      onClick={handlePageClick}
    >
      <div className="page-vignette" />

      {/* ── Background atmosphere (back to front) ── */}
      <Starfield />
      <DepthMist />
      <HangingLanterns />
      <FloatingParticles />
      <StonePillars />

      <main className="relative flex flex-col items-center px-8 py-12 max-w-5xl mx-auto" style={{ zIndex: 5 }}>

        {/* ── Header ── */}
        <header className="flex flex-col items-center gap-4 mb-10">
          <ArchedDome />
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2 mt-8" style={{
            background: "radial-gradient(circle, #f0c060 0%, #d4a843 50%, #a07020 100%)",
            boxShadow: "0 0 30px 10px rgba(212,168,67,0.4), 0 0 70px 30px rgba(212,168,67,0.14)",
            animation: "float 6s ease-in-out infinite",
          }}>
            <Moon className="w-8 h-8" style={{ color: "#2a1a04" }} />
          </div>

          <h1 className="text-5xl md:text-6xl text-center tracking-widest" style={{
            fontFamily: "var(--font-cinzel)", color: "#d4a843",
            textShadow: "0 0 40px rgba(212,168,67,0.6), 0 0 80px rgba(160,100,10,0.3), 0 2px 4px rgba(0,0,0,0.8)",
            letterSpacing: "0.15em",
          }}>
            My Library
          </h1>

          <div className="flex items-center gap-3 w-full max-w-xs">
            <div className="flex-1 h-[1px]" style={{ background: "linear-gradient(to right, transparent, #d4a843)" }} />
            <Sparkles className="w-4 h-4" style={{ color: "#d4a843", opacity: 0.7 }} />
            <div className="flex-1 h-[1px]" style={{ background: "linear-gradient(to left, transparent, #d4a843)" }} />
          </div>

          <p className="text-lg italic tracking-wider opacity-60" style={{ fontFamily: "var(--font-crimson)", color: "#d8c8a8" }}>
            A Magical Collection
          </p>

          <div className="flex gap-8 mt-2">
            {[
              { label: "Volumes", value: books.length },
              { label: "Read", value: readCount },
              { label: "In Progress", value: readingCount },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-2xl font-semibold" style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843" }}>{stat.value}</span>
                <span className="text-xs tracking-widest uppercase opacity-55" style={{ fontFamily: "var(--font-cinzel)", color: "#c8b890" }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ── Search ── */}
        <div className="w-full mb-12" onClick={(e) => e.stopPropagation()}>
          <SearchBar
            onAddBook={handleAddBook}
            existingGoogleIds={books.map((b) => b.googleBooksId).filter(Boolean) as string[]}
          />
        </div>

        {/* ── Bookcase ── */}
        <section className="w-full">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-5 h-5" style={{ color: "#d4a843" }} />
            <h2 className="text-lg tracking-widest uppercase" style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843", opacity: 0.85 }}>
              The Shelves
            </h2>
            <div className="flex-1 h-[1px] opacity-25" style={{ background: "#d4a843" }} />
          </div>

          <div style={{
            background: "linear-gradient(to bottom, #1e0e04 0%, #130904 100%)",
            border: "2px solid rgba(110,65,20,0.5)",
            borderRadius: "4px",
            padding: "12px 8px 8px",
            boxShadow: "0 0 80px rgba(0,0,0,0.95), inset 0 0 50px rgba(0,0,0,0.65), 0 0 40px rgba(140,80,10,0.07)",
            position: "relative", overflow: "visible",
          }}>
            <div style={{ position: "absolute", top: "-2px", left: "-2px", right: "-2px", height: "6px", background: "linear-gradient(to bottom, #b07838, #7c4c20)", borderRadius: "4px 4px 0 0" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "4px", width: "4px", background: "linear-gradient(to right, #7a4018, #5c3010)" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, right: "4px", width: "4px", background: "linear-gradient(to left, #7a4018, #5c3010)" }} />

            {isLoading ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#d4a843", opacity: 0.8 }} />
                <p className="text-sm italic tracking-widest opacity-50" style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8" }}>Summoning your collection…</p>
              </div>
            ) : books.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-20 opacity-40">
                <BookOpen className="w-10 h-10" style={{ color: "#d4a843" }} />
                <p className="text-sm italic tracking-widest" style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8" }}>Your library awaits its first tome.</p>
                <p className="text-xs tracking-wider" style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843" }}>Search for a book above to begin.</p>
              </div>
            ) : (
              shelves.map((shelf, idx) => (
                <div key={idx}>
                  {idx > 0 && <ShelfDivider />}
                  <Shelf3D books={shelf} selectedId={selectedId} onSelect={handleSelect} />
                </div>
              ))
            )}
          </div>
        </section>

        {books.length > 0 && !isLoading && (
          <p className="mt-4 text-xs italic opacity-25 tracking-widest" style={{ fontFamily: "var(--font-crimson)", color: "#d8c8a8" }}>
            Click a spine to unshelve
          </p>
        )}

        <footer className="mt-16 flex flex-col items-center gap-2 opacity-35">
          <div className="flex items-center gap-2">
            <div className="w-12 h-[1px]" style={{ background: "#d4a843" }} />
            <Stars className="w-3 h-3" style={{ color: "#d4a843" }} />
            <div className="w-12 h-[1px]" style={{ background: "#d4a843" }} />
          </div>
          <p className="text-xs tracking-widest italic" style={{ fontFamily: "var(--font-crimson)", color: "#d8c8a8" }}>
            &ldquo;A reader lives a thousand lives before he dies.&rdquo;
          </p>
        </footer>
      </main>
    </div>
  );
}
