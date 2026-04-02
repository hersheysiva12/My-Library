"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Moon, Sparkles, BookOpen, Stars, Loader2, FolderInput } from "lucide-react";
import Link from "next/link";
import { Book, DbBook } from "@/app/types";
import SearchBar from "@/app/components/SearchBar";
import BookDetailPanel from "@/app/components/BookDetailPanel";
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
    status: (["tbr-owned", "tbr-not-owned", "reading", "read", "dnf"].includes(row.status)
      ? row.status : "tbr-owned") as Book["status"],
    rating: row.rating ?? undefined,
    format: ((row.format ?? "physical") as Book["format"]),
    formatSource: row.format_source ?? undefined,
    startDate:    row.start_date    ?? undefined,
    dateFinished: row.date_finished ?? undefined,
    review:       row.review        ?? undefined,
    seriesName:   row.series_name   ?? undefined,
    seriesPosition: row.series_position ?? undefined,
    seriesTotal:  row.series_total  ?? undefined,
    returnDate:   row.return_date   ?? undefined,
    pageCount:    row.page_count    ?? undefined,
    shelfNumber:  row.shelf_number  ?? 0,
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
    "tbr-owned":     { label: "TBR",      bg: "rgba(180,100,20,0.35)", border: "rgba(240,192,96,0.5)",  text: "#f0c060" },
    "tbr-not-owned": { label: "TBR",      bg: "rgba(180,100,20,0.35)", border: "rgba(240,192,96,0.5)",  text: "#f0c060" },
    reading:         { label: "Reading",  bg: "rgba(100,30,180,0.35)", border: "rgba(192,132,252,0.5)", text: "#c084fc" },
    read:            { label: "Finished", bg: "rgba(20,120,80,0.35)",  border: "rgba(109,204,154,0.5)", text: "#6dcc9a" },
    dnf:             { label: "DNF",      bg: "rgba(120,30,30,0.35)",  border: "rgba(248,113,113,0.5)", text: "#f87171" },
  };
  const c = config[status] ?? config["tbr-owned"];
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

const COVER_W = 110;

/* ─────────────────────────────────────────────────────────
   BookSpine — click spine → flip to cover; click cover → panel.
   Height/width are deterministic from title+author chars.
───────────────────────────────────────────────────────── */
function BookSpine({ book, isSelected, onSelect, onOpenDetail }: {
  book: Book; isSelected: boolean; onSelect: () => void; onOpenDetail: () => void;
}) {
  const heightSeed = book.seriesName ?? book.title;
  const bookH = 145 + (heightSeed.charCodeAt(0) + heightSeed.length) % 42; // 145–186px
  const bookW = calcSpineWidth(book);
  const spineFontSize = bookW >= 62 ? 11 : bookW >= 42 ? 10 : 9;
  const wordCount = book.title.split(" ").length;
  const titleFontSize = wordCount >= 6 ? Math.max(7, spineFontSize - 2)
                      : wordCount >= 4 ? Math.max(8, spineFontSize - 1)
                      : spineFontSize;
  const authorFontSize = Math.max(7, spineFontSize - 2);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "relative",
        width: isSelected ? `${COVER_W}px` : `${bookW}px`,
        height: `${bookH}px`,
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
        transform: isSelected ? "rotateY(-180deg)" : "rotateY(0deg)",
        transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
      }}>

        {/* ══ FRONT: Spine ══ */}
        <div
          className={isSelected ? undefined : "book-spine"}
          style={{
            "--glow-color": book.glowColor,
            position: "absolute", top: 0, left: 0,
            width: `${bookW}px`, height: `${bookH}px`,
            background: book.coverGradient ?? book.spineColor,
            borderRadius: "2px 1px 1px 2px",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            boxShadow: "inset -3px 0 8px rgba(0,0,0,0.2), 2px 0 4px rgba(0,0,0,0.25)",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {/* Spine crease */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.22) 0%, transparent 40%)" }} />
          {/* Top rule */}
          <div style={{ position: "absolute", top: "8px", left: "4px", right: "4px", height: "1px", background: book.accentColor, opacity: 0.5 }} />
          {/* Bottom rule */}
          <div style={{ position: "absolute", bottom: "8px", left: "4px", right: "4px", height: "1px", background: book.accentColor, opacity: 0.5 }} />
          {/* Title — fills space from top rule down to author zone */}
          <div style={{ position: "absolute", top: "18px", left: 0, right: 0, bottom: "60px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p title={book.title} style={{
              writingMode: "vertical-rl", transform: "rotate(180deg)",
              fontFamily: "var(--font-cinzel)", fontSize: `${titleFontSize}px`,
              color: book.accentColor, letterSpacing: "0.08em",
              textAlign: "center", maxHeight: "100%",
              overflow: "hidden", margin: 0,
              textShadow: `0 0 8px ${book.accentColor}80`, lineHeight: 1.2,
            }}>{book.title}</p>
          </div>
          {/* Author — always pinned above the bottom rule */}
          <div style={{ position: "absolute", bottom: "12px", left: 0, right: 0, height: "44px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{
              writingMode: "vertical-rl", transform: "rotate(180deg)",
              fontFamily: "var(--font-crimson)", fontSize: `${authorFontSize}px`,
              color: book.accentColor, opacity: 0.65, letterSpacing: "0.04em",
              textAlign: "center", maxHeight: "44px",
              overflow: "hidden", margin: 0, fontStyle: "italic", lineHeight: 1.2,
            }}>{book.author}</p>
          </div>
          {/* Unknown page count indicator */}
          {book.pageCount == null && (
            <div style={{
              position: "absolute", bottom: "58px", right: "3px",
              fontFamily: "var(--font-cinzel)", fontSize: "7px",
              color: book.accentColor, opacity: 0.4, lineHeight: 1,
              pointerEvents: "none",
            }}>?</div>
          )}
        </div>

        {/* ══ BACK: Cover ══ */}
        <div
          onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
          style={{
            position: "absolute", top: 0, left: 0,
            width: `${COVER_W}px`, height: `${bookH}px`,
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: "2px 4px 4px 2px",
            overflow: "hidden",
            background: book.coverGradient ?? "#1a0f2e",
            boxShadow: `0 0 40px 10px ${book.glowColor}, -4px 6px 20px rgba(0,0,0,0.9)`,
            cursor: "pointer",
          }}
        >
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
            <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "7px", color: "#f0e0c0", textAlign: "center", lineHeight: 1.35, marginBottom: "1px" }}>
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
   Ceiling glow — warm amber radial from top of page
───────────────────────────────────────────────────────── */
function CeilingGlow() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "45vh", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% -5%, rgba(220,160,40,0.38) 0%, rgba(180,100,20,0.18) 25%, rgba(100,60,10,0.06) 55%, transparent 75%)" }} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Floating golden light motes (15 motes, larger + brighter)
───────────────────────────────────────────────────────── */
function FloatingParticles() {
  const motes = [
    { left: "5%",  bottom: "30%", delay: "0s",   dur: "6s"   },
    { left: "18%", bottom: "45%", delay: "1.4s", dur: "7s"   },
    { left: "28%", bottom: "25%", delay: "2.8s", dur: "5.5s" },
    { left: "38%", bottom: "55%", delay: "0.7s", dur: "8s"   },
    { left: "47%", bottom: "35%", delay: "3.5s", dur: "6.5s" },
    { left: "55%", bottom: "60%", delay: "1.9s", dur: "7.5s" },
    { left: "63%", bottom: "40%", delay: "4.2s", dur: "6s"   },
    { left: "70%", bottom: "50%", delay: "0.3s", dur: "9s"   },
    { left: "78%", bottom: "20%", delay: "2.1s", dur: "7s"   },
    { left: "85%", bottom: "42%", delay: "5s",   dur: "5.5s" },
    { left: "92%", bottom: "65%", delay: "1.2s", dur: "6.5s" },
    { left: "12%", bottom: "70%", delay: "3.8s", dur: "8s"   },
    { left: "42%", bottom: "15%", delay: "0.9s", dur: "7s"   },
    { left: "60%", bottom: "75%", delay: "2.4s", dur: "6s"   },
    { left: "88%", bottom: "30%", delay: "4.6s", dur: "7.5s" },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      {motes.map((m, i) => (
        <div key={i} style={{
          position: "absolute", left: m.left, bottom: m.bottom,
          width: "4px", height: "4px", borderRadius: "50%",
          background: "radial-gradient(circle, #fde68a 0%, #d4a843 60%, transparent 100%)",
          boxShadow: "0 0 8px 3px rgba(253,230,138,0.85)",
          animation: `floatUp ${m.dur} ${m.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   LibraryShelf — depth-aware shelf row.
   shelfIndex 0 = top/far (cooler), n = bottom/near (warmer).
───────────────────────────────────────────────────────── */
function LibraryShelf({ books, shelfIndex, totalShelves, selectedId, onSelect, onOpenDetail, isArrangeMode, onWidthMeasured }: {
  books: Book[]; shelfIndex: number; totalShelves: number;
  selectedId: string | number | null;
  onSelect: (id: string | number) => void;
  onOpenDetail: (id: string | number) => void;
  isArrangeMode: boolean;
  onWidthMeasured?: (w: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rowRef.current || !onWidthMeasured) return;
    const obs = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) {
        const usable = w - 360;
        console.log(`[Shelf] container=${w}px  usable=${usable}px  ≈${Math.floor(usable / 34)} books`);
        onWidthMeasured(w);
      }
    });
    obs.observe(rowRef.current);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

  function groupForDisplay(bks: Book[]) {
    const groups: Array<{ seriesName?: string; books: Book[] }> = [];
    for (const book of bks) {
      const last = groups[groups.length - 1];
      if (book.seriesName && last?.seriesName === book.seriesName) {
        last.books.push(book);
      } else {
        groups.push({ seriesName: book.seriesName, books: [book] });
      }
    }
    return groups;
  }

  const depth = shelfIndex / Math.max(totalShelves - 1, 1); // 0.0 → 1.0
  const ambientAlpha = 0.18 + depth * 0.22;
  const woodLightL = Math.round(18 + depth * 10);
  const woodFrontL = Math.round(14 + depth * 8);
  const woodH = Math.round(20 + depth * 8);
  const woodSat = Math.round(55 + depth * 15);
  const woodFrontSat = Math.round(50 + depth * 15);
  const woodLight = `hsl(${woodH}, ${woodSat}%, ${woodLightL}%)`;
  const woodFront = `hsl(${woodH - 2}, ${woodFrontSat}%, ${woodFrontL}%)`;

  return (
    <div style={{ position: "relative", marginBottom: "4px" }}>
      {/* Back wall */}
      <div style={{
        position: "absolute", top: 0, left: "8px", right: "8px", bottom: "24px",
        background: "linear-gradient(to bottom, #1e0e06 0%, #2a1608 60%, #1a0c04 100%)",
        borderLeft: "1px solid rgba(120,80,20,0.25)",
        borderRight: "1px solid rgba(120,80,20,0.25)",
        boxShadow: "inset 0 8px 20px rgba(0,0,0,0.9), inset 0 0 40px rgba(0,0,0,0.6)",
      }}>
        {/* Ambient pool of warm light behind books */}
        <div style={{
          position: "absolute", bottom: 0, left: "10%", right: "10%", height: "70%",
          background: `radial-gradient(ellipse at 50% 100%, rgba(200,130,30,${ambientAlpha}) 0%, transparent 70%)`,
        }} />
        {/* Vertical wood grain */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.07,
          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(180,100,20,0.5) 48px, rgba(180,100,20,0.5) 49px)" }} />
      </div>

      {/* Books row */}
      {isArrangeMode ? (
        <Droppable droppableId={`shelf-${shelfIndex}`} direction="horizontal">
          {(provided) => (
            <div
              ref={(el) => { (provided.innerRef as (el: HTMLDivElement | null) => void)(el); (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
              {...provided.droppableProps}
              style={{
                position: "relative", zIndex: 3,
                display: "flex", alignItems: "flex-end", justifyContent: "flex-start", gap: "0px",
                padding: "16px 20px 0", minHeight: "200px", overflow: "hidden",
              }}
            >
              {shelfToUnits(books).map((unit, i) => {
                const key = unit.type === "series" ? `series::${shelfIndex}::${unit.seriesName}` : `solo::${unit.book.id}`;
                return (
                  <Draggable key={key} draggableId={key} index={i}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={{
                          ...provided.draggableProps.style,
                          display: "flex", alignItems: "flex-end",
                          opacity: snapshot.isDragging ? 0.85 : 1,
                          outline: snapshot.isDragging ? "1px solid rgba(212,168,67,0.6)" : "1px solid rgba(212,168,67,0.35)",
                          borderRadius: "2px",
                          cursor: "grab",
                        }}
                      >
                        {unit.type === "series"
                          ? unit.books.map(book => <BookSpine key={book.id} book={book} isSelected={false} onSelect={() => {}} onOpenDetail={() => {}} />)
                          : <BookSpine book={unit.book} isSelected={false} onSelect={() => {}} onOpenDetail={() => {}} />
                        }
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ) : (
        <div ref={rowRef} style={{
          position: "relative", zIndex: 3,
          display: "flex", alignItems: "flex-end", justifyContent: "flex-start", gap: "0px",
          padding: "16px 20px 0", minHeight: "200px", overflow: "hidden",
        }}>
          {groupForDisplay(books).map((group, gi) => (
            <div
              key={gi}
              style={{ position: "relative", display: "flex", alignItems: "flex-end" }}
              onMouseEnter={() => group.seriesName && setHoveredSeries(group.seriesName)}
              onMouseLeave={() => setHoveredSeries(null)}
            >
              {group.seriesName && group.books.length > 1 && hoveredSeries === group.seriesName && (
                <div style={{
                  position: "absolute", top: "2px", left: 0, right: 0,
                  display: "flex", flexDirection: "column", alignItems: "center",
                  pointerEvents: "none", zIndex: 10,
                }}>
                  <span style={{
                    fontFamily: "var(--font-cinzel)", fontSize: "8px",
                    color: "rgba(212,168,67,0.75)", letterSpacing: "0.12em",
                    whiteSpace: "nowrap", textShadow: "0 0 8px rgba(212,168,67,0.4)",
                  }}>{group.seriesName}</span>
                  <div style={{
                    width: "100%", height: "1px", marginTop: "2px",
                    background: "linear-gradient(to right, transparent, rgba(212,168,67,0.5), transparent)",
                  }} />
                </div>
              )}
              {group.books.map(book => (
                <BookSpine key={book.id} book={book}
                  isSelected={selectedId === book.id}
                  onSelect={() => onSelect(book.id)}
                  onOpenDetail={() => onOpenDetail(book.id)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Shelf plank */}
      <div style={{ position: "relative", zIndex: 4 }}>
        {/* Top face */}
        <div style={{ height: "12px", margin: "0 4px",
          background: `linear-gradient(to bottom, ${woodLight}, hsl(${woodH},${woodSat - 5}%,12%))`,
          boxShadow: "inset 0 3px 8px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,180,80,0.12)" }} />
        {/* Front face */}
        <div style={{ height: "22px", margin: "0 4px", position: "relative", overflow: "hidden",
          background: `linear-gradient(to bottom, ${woodFront}, hsl(${woodH - 2},${woodFrontSat - 5}%,10%) 70%, hsl(${woodH - 2},${woodFrontSat - 8}%,8%) 100%)`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.6)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "rgba(220,160,60,0.35)" }} />
          <div style={{ position: "absolute", top: "40%", left: "5%", right: "5%", height: "1px", background: "rgba(180,120,40,0.1)" }} />
          <div style={{ position: "absolute", inset: 0, opacity: 0.15,
            backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 55px, rgba(0,0,0,0.3) 55px, rgba(0,0,0,0.3) 56px)" }} />
        </div>
        {/* Drop shadow */}
        <div style={{ height: "14px", margin: "0 4px", background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ShelfFrameVines — climbing vines on the outer wooden frame.
   Rendered once over the full shelf area; one vine per side.
───────────────────────────────────────────────────────── */
function ShelfFrameVines() {
  const lp = "M 0 0 C -4 -3 -6 -7 0 -12 C 6 -7 4 -3 0 0 Z"; // pointed ivy leaf
  const lc = ["#3a7d35", "#4a9e42", "#5db854", "#8bc34a"];
  // Dense ivy SVG — main stem snakes up the frame; 11 branch clusters per side
  const vineSvg = (
    <>
      {/* Main stem */}
      <path d="M 22 1000 C 20 900 26 800 22 700 C 18 600 26 500 22 400 C 18 300 26 200 22 100 C 20 50 23 20 24 0"
        stroke="#1e4d1a" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* ── Cluster y≈960 right ── */}
      <path d="M 22 960 C 30 956 38 950 45 948" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[0]} opacity="0.85" transform="translate(26,962) rotate(-30) scale(1.3)" />
      <path d={lp} fill={lc[1]} opacity="0.90" transform="translate(32,958) rotate(15) scale(1.3)" />
      <path d={lp} fill={lc[2]} opacity="0.80" transform="translate(38,953) rotate(-10) scale(1.1)" />
      <path d={lp} fill={lc[0]} opacity="0.75" transform="translate(44,950) rotate(25) scale(0.9)" />
      <path d={lp} fill={lc[3]} opacity="0.85" transform="translate(29,956) rotate(-58) scale(0.8)" />
      <path d={lp} fill={lc[1]} opacity="0.78" transform="translate(40,954) rotate(52) scale(0.7)" />
      <path d={lp} fill={lc[2]} opacity="0.68" transform="translate(18,964) rotate(162) scale(0.8)" />

      {/* ── Cluster y≈870 left ── */}
      <path d="M 22 870 C 14 866 8 860 4 858" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[1]} opacity="0.88" transform="translate(18,872) rotate(200) scale(1.3)" />
      <path d={lp} fill={lc[0]} opacity="0.82" transform="translate(12,868) rotate(222) scale(1.2)" />
      <path d={lp} fill={lc[3]} opacity="0.78" transform="translate(6,862) rotate(192) scale(1.1)" />
      <path d={lp} fill={lc[2]} opacity="0.85" transform="translate(14,865) rotate(245) scale(0.9)" />
      <path d={lp} fill={lc[1]} opacity="0.75" transform="translate(5,859) rotate(212) scale(0.8)" />
      <path d={lp} fill={lc[0]} opacity="0.70" transform="translate(26,873) rotate(-22) scale(0.7)" />

      {/* ── Cluster y≈780 right ── */}
      <path d="M 22 780 C 30 776 38 770 46 768" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[2]} opacity="0.90" transform="translate(27,782) rotate(-25) scale(1.3)" />
      <path d={lp} fill={lc[0]} opacity="0.85" transform="translate(33,777) rotate(10) scale(1.3)" />
      <path d={lp} fill={lc[1]} opacity="0.80" transform="translate(39,772) rotate(-15) scale(1.1)" />
      <path d={lp} fill={lc[3]} opacity="0.88" transform="translate(45,769) rotate(30) scale(1.0)" />
      <path d={lp} fill={lc[0]} opacity="0.75" transform="translate(30,775) rotate(-52) scale(0.9)" />
      <path d={lp} fill={lc[2]} opacity="0.82" transform="translate(37,770) rotate(55) scale(0.8)" />
      <path d={lp} fill={lc[1]} opacity="0.65" transform="translate(18,784) rotate(172) scale(0.7)" />

      {/* ── Cluster y≈690 left ── */}
      <path d="M 22 690 C 14 686 8 680 3 678" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[0]} opacity="0.88" transform="translate(17,692) rotate(215) scale(1.3)" />
      <path d={lp} fill={lc[3]} opacity="0.82" transform="translate(11,687) rotate(195) scale(1.2)" />
      <path d={lp} fill={lc[2]} opacity="0.90" transform="translate(5,681) rotate(228) scale(1.0)" />
      <path d={lp} fill={lc[1]} opacity="0.78" transform="translate(13,684) rotate(252) scale(0.9)" />
      <path d={lp} fill={lc[0]} opacity="0.85" transform="translate(6,679) rotate(186) scale(0.8)" />
      <path d={lp} fill={lc[3]} opacity="0.70" transform="translate(26,693) rotate(-35) scale(0.7)" />

      {/* ── Cluster y≈600 right ── */}
      <path d="M 22 600 C 30 596 38 590 44 588" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[1]} opacity="0.88" transform="translate(27,602) rotate(-20) scale(1.3)" />
      <path d={lp} fill={lc[2]} opacity="0.92" transform="translate(33,597) rotate(18) scale(1.2)" />
      <path d={lp} fill={lc[0]} opacity="0.85" transform="translate(39,591) rotate(-8) scale(1.1)" />
      <path d={lp} fill={lc[3]} opacity="0.80" transform="translate(43,589) rotate(28) scale(1.0)" />
      <path d={lp} fill={lc[1]} opacity="0.75" transform="translate(30,595) rotate(-55) scale(0.9)" />
      <path d={lp} fill={lc[2]} opacity="0.82" transform="translate(36,592) rotate(46) scale(0.8)" />
      <path d={lp} fill={lc[0]} opacity="0.68" transform="translate(19,604) rotate(166) scale(0.7)" />

      {/* ── Cluster y≈510 left ── */}
      <path d="M 22 510 C 13 506 7 500 3 498" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[3]} opacity="0.90" transform="translate(17,512) rotate(205) scale(1.3)" />
      <path d={lp} fill={lc[1]} opacity="0.85" transform="translate(10,507) rotate(232) scale(1.2)" />
      <path d={lp} fill={lc[0]} opacity="0.80" transform="translate(5,501) rotate(212) scale(1.0)" />
      <path d={lp} fill={lc[2]} opacity="0.88" transform="translate(12,504) rotate(256) scale(0.9)" />
      <path d={lp} fill={lc[3]} opacity="0.75" transform="translate(4,499) rotate(196) scale(0.8)" />
      <path d={lp} fill={lc[1]} opacity="0.70" transform="translate(27,513) rotate(-28) scale(0.7)" />

      {/* ── Cluster y≈420 right ── */}
      <path d="M 22 420 C 31 416 39 410 46 408" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[0]} opacity="0.92" transform="translate(27,422) rotate(-18) scale(1.3)" />
      <path d={lp} fill={lc[2]} opacity="0.87" transform="translate(34,417) rotate(12) scale(1.3)" />
      <path d={lp} fill={lc[1]} opacity="0.82" transform="translate(40,411) rotate(-20) scale(1.1)" />
      <path d={lp} fill={lc[3]} opacity="0.90" transform="translate(45,409) rotate(22) scale(1.0)" />
      <path d={lp} fill={lc[0]} opacity="0.78" transform="translate(31,415) rotate(-48) scale(0.9)" />
      <path d={lp} fill={lc[2]} opacity="0.85" transform="translate(38,412) rotate(50) scale(0.8)" />
      <path d={lp} fill={lc[1]} opacity="0.66" transform="translate(18,424) rotate(175) scale(0.7)" />

      {/* ── Cluster y≈330 left ── */}
      <path d="M 22 330 C 13 326 7 320 3 318" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[2]} opacity="0.88" transform="translate(17,332) rotate(210) scale(1.3)" />
      <path d={lp} fill={lc[0]} opacity="0.93" transform="translate(11,327) rotate(235) scale(1.2)" />
      <path d={lp} fill={lc[3]} opacity="0.85" transform="translate(5,321) rotate(218) scale(1.0)" />
      <path d={lp} fill={lc[1]} opacity="0.80" transform="translate(13,324) rotate(260) scale(0.9)" />
      <path d={lp} fill={lc[2]} opacity="0.75" transform="translate(4,319) rotate(202) scale(0.8)" />
      <path d={lp} fill={lc[0]} opacity="0.68" transform="translate(27,333) rotate(-22) scale(0.7)" />

      {/* ── Cluster y≈240 right ── */}
      <path d="M 22 240 C 30 236 38 230 45 228" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[1]} opacity="0.90" transform="translate(27,242) rotate(-25) scale(1.3)" />
      <path d={lp} fill={lc[3]} opacity="0.85" transform="translate(33,237) rotate(15) scale(1.3)" />
      <path d={lp} fill={lc[0]} opacity="0.80" transform="translate(39,231) rotate(-12) scale(1.1)" />
      <path d={lp} fill={lc[2]} opacity="0.88" transform="translate(44,229) rotate(20) scale(1.0)" />
      <path d={lp} fill={lc[1]} opacity="0.78" transform="translate(30,235) rotate(-52) scale(0.9)" />
      <path d={lp} fill={lc[3]} opacity="0.83" transform="translate(37,232) rotate(48) scale(0.8)" />
      <path d={lp} fill={lc[2]} opacity="0.65" transform="translate(18,244) rotate(170) scale(0.7)" />

      {/* ── Cluster y≈150 left ── */}
      <path d="M 22 150 C 13 146 7 140 3 138" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[0]} opacity="0.88" transform="translate(17,152) rotate(200) scale(1.3)" />
      <path d={lp} fill={lc[2]} opacity="0.92" transform="translate(11,147) rotate(225) scale(1.2)" />
      <path d={lp} fill={lc[3]} opacity="0.85" transform="translate(5,141) rotate(208) scale(1.0)" />
      <path d={lp} fill={lc[1]} opacity="0.80" transform="translate(13,144) rotate(248) scale(0.9)" />
      <path d={lp} fill={lc[0]} opacity="0.75" transform="translate(4,139) rotate(196) scale(0.8)" />
      <path d={lp} fill={lc[2]} opacity="0.68" transform="translate(26,153) rotate(-18) scale(0.7)" />

      {/* ── Cluster y≈60 right (top) ── */}
      <path d="M 22 60 C 30 56 38 50 44 48" stroke="#2d6b28" strokeWidth="2" fill="none" />
      <path d={lp} fill={lc[3]} opacity="0.85" transform="translate(26,62) rotate(-22) scale(1.2)" />
      <path d={lp} fill={lc[1]} opacity="0.90" transform="translate(32,57) rotate(12) scale(1.2)" />
      <path d={lp} fill={lc[0]} opacity="0.80" transform="translate(38,51) rotate(-8) scale(1.0)" />
      <path d={lp} fill={lc[2]} opacity="0.85" transform="translate(43,49) rotate(25) scale(0.9)" />
      <path d={lp} fill={lc[1]} opacity="0.75" transform="translate(30,55) rotate(-45) scale(0.8)" />
    </>
  );
  return (
    <>
      {/* Left frame vine */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: "50px",
        pointerEvents: "none", zIndex: 6, overflow: "hidden",
      }}>
        <svg width="50" viewBox="0 0 50 1000" preserveAspectRatio="none"
          fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", bottom: 0, left: 0, width: "50px", height: "100%" }}>
          {vineSvg}
        </svg>
      </div>
      {/* Right frame vine — mirrored */}
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "50px",
        pointerEvents: "none", zIndex: 6, overflow: "hidden",
      }}>
        <svg width="50" viewBox="0 0 50 1000" preserveAspectRatio="none"
          fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", bottom: 0, right: 0, width: "50px", height: "100%", transform: "scaleX(-1)" }}>
          {vineSvg}
        </svg>
      </div>
    </>
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

/* ─────────────────────────────────────────────────────────
   ShelfBookend — decorative object at the end of books.
   Cycles through: candle, hourglass, crystal ball, globe
───────────────────────────────────────────────────────── */
function ShelfBookend({ shelfIndex }: { shelfIndex: number }) {
  const variant = shelfIndex % 4;
  return (
    <div style={{ width: "48px", pointerEvents: "none", opacity: 0.9 }}>
      {variant === 3 && (
        // Globe
        <svg width="48" height="72" viewBox="0 0 48 72" fill="none">
          <ellipse cx="24" cy="66" rx="10" ry="3" fill="rgba(80,50,15,0.5)" />
          <rect x="22" y="52" width="4" height="12" fill="#7a5520" rx="1" />
          <ellipse cx="24" cy="18" rx="2" ry="2" fill="#9b6e30" />
          <circle cx="24" cy="30" r="18" fill="none" stroke="#8b6820" strokeWidth="1" opacity="0.4" />
          <circle cx="24" cy="30" r="18" fill="rgba(30,60,100,0.7)" />
          <ellipse cx="24" cy="30" rx="18" ry="18" fill="none" stroke="rgba(100,160,220,0.3)" strokeWidth="0.5" />
          {/* continents */}
          <path d="M 10 24 C 12 20 18 20 20 24 C 18 28 12 27 10 24 Z" fill="rgba(60,120,60,0.8)" />
          <path d="M 22 18 C 26 16 32 17 33 21 C 34 26 28 28 24 26 C 21 24 20 21 22 18 Z" fill="rgba(60,120,60,0.8)" />
          <path d="M 14 32 C 16 30 20 31 21 34 C 20 38 15 38 13 35 Z" fill="rgba(60,120,60,0.7)" />
          <path d="M 26 32 C 30 30 36 32 37 36 C 36 40 30 41 26 38 Z" fill="rgba(60,120,60,0.7)" />
          {/* latitude/longitude lines */}
          <ellipse cx="24" cy="30" rx="18" ry="7" fill="none" stroke="rgba(100,160,220,0.2)" strokeWidth="0.5" />
          <line x1="24" y1="12" x2="24" y2="48" stroke="rgba(100,160,220,0.2)" strokeWidth="0.5" />
          <line x1="6" y1="30" x2="42" y2="30" stroke="rgba(100,160,220,0.2)" strokeWidth="0.5" />
          {/* glass highlight */}
          <ellipse cx="18" cy="22" rx="5" ry="3" fill="rgba(255,255,255,0.1)" transform="rotate(-20,18,22)" />
          {/* stand ring */}
          <ellipse cx="24" cy="52" rx="8" ry="2" fill="#7a5520" />
        </svg>
      )}
      {variant === 2 && (
        // Crystal ball
        <svg width="48" height="72" viewBox="0 0 48 72" fill="none">
          <ellipse cx="24" cy="66" rx="9" ry="2.5" fill="rgba(80,50,15,0.4)" />
          {/* base */}
          <path d="M 16 54 Q 24 58 32 54 L 30 52 Q 24 55 18 52 Z" fill="#6a4a20" />
          <ellipse cx="24" cy="52" rx="8" ry="2" fill="#8b6030" />
          {/* orb */}
          <circle cx="24" cy="32" r="20" fill="rgba(180,140,220,0.15)" />
          <circle cx="24" cy="32" r="20" fill="none" stroke="rgba(200,160,255,0.4)" strokeWidth="1" />
          <circle cx="24" cy="32" r="18" fill="rgba(100,60,160,0.3)" />
          {/* inner glow */}
          <circle cx="24" cy="32" r="14" fill="rgba(160,100,220,0.2)" />
          <circle cx="24" cy="32" r="8" fill="rgba(200,150,255,0.15)" />
          {/* swirling mist */}
          <path d="M 14 30 C 18 26 28 28 32 32 C 28 36 18 36 14 32 Z" fill="rgba(255,255,255,0.06)" />
          <path d="M 16 36 C 20 32 30 34 32 38 C 28 40 18 40 16 36 Z" fill="rgba(255,255,255,0.04)" />
          {/* highlight */}
          <ellipse cx="18" cy="22" rx="6" ry="4" fill="rgba(255,255,255,0.18)" transform="rotate(-25,18,22)" />
          <ellipse cx="16" cy="20" rx="2" ry="1.5" fill="rgba(255,255,255,0.35)" transform="rotate(-25,16,20)" />
        </svg>
      )}
      {variant === 1 && (
        // Hourglass
        <svg width="48" height="72" viewBox="0 0 48 72" fill="none">
          <ellipse cx="24" cy="66" rx="9" ry="2.5" fill="rgba(80,50,15,0.4)" />
          {/* base plate */}
          <rect x="14" y="60" width="20" height="4" rx="2" fill="#7a5520" />
          {/* top plate */}
          <rect x="14" y="16" width="20" height="4" rx="2" fill="#7a5520" />
          {/* frame sides */}
          <line x1="16" y1="20" x2="24" y2="40" stroke="#9b6e30" strokeWidth="1.5" />
          <line x1="32" y1="20" x2="24" y2="40" stroke="#9b6e30" strokeWidth="1.5" />
          <line x1="16" y1="60" x2="24" y2="40" stroke="#9b6e30" strokeWidth="1.5" />
          <line x1="32" y1="60" x2="24" y2="40" stroke="#9b6e30" strokeWidth="1.5" />
          {/* glass top — sand */}
          <path d="M 16 20 L 32 20 L 25 38 L 23 38 Z" fill="rgba(240,200,100,0.55)" />
          {/* glass bottom — sand pile */}
          <path d="M 23 42 L 25 42 L 32 60 L 16 60 Z" fill="rgba(240,200,100,0.35)" />
          {/* sand pile top */}
          <ellipse cx="24" cy="58" rx="7" ry="2" fill="rgba(240,200,100,0.5)" />
          {/* falling sand thread */}
          <line x1="24" y1="38" x2="24" y2="42" stroke="rgba(240,200,100,0.7)" strokeWidth="0.8" />
          {/* glass sheen */}
          <path d="M 18 22 L 22 22 L 24 36 L 21 36 Z" fill="rgba(255,255,255,0.07)" />
        </svg>
      )}
      {variant === 0 && (
        // Candle with wax drips
        <svg width="48" height="72" viewBox="0 0 48 72" fill="none">
          <ellipse cx="24" cy="66" rx="9" ry="2.5" fill="rgba(80,50,15,0.4)" />
          {/* candle holder */}
          <ellipse cx="24" cy="58" rx="11" ry="3" fill="#7a5520" />
          <ellipse cx="24" cy="56" rx="9" ry="2.5" fill="#9b6e30" />
          {/* wax body */}
          <rect x="18" y="30" width="12" height="28" rx="2" fill="#f5e8c0" />
          {/* wax drips */}
          <path d="M 18 38 C 16 40 15 44 17 46 C 18 44 18 40 18 38 Z" fill="#ede0b0" />
          <path d="M 30 42 C 32 44 33 48 31 50 C 30 48 30 44 30 42 Z" fill="#ede0b0" />
          <path d="M 22 31 C 20 33 19 36 21 38 C 22 36 22 33 22 31 Z" fill="#ede0b0" />
          {/* wick */}
          <line x1="24" y1="30" x2="24" y2="26" stroke="#3a2010" strokeWidth="1" strokeLinecap="round" />
          {/* flame */}
          <path d="M 24 26 C 22 22 20 18 24 14 C 28 18 26 22 24 26 Z" fill="#fde68a" />
          <path d="M 24 24 C 22 21 21 18 24 15 C 27 18 26 21 24 24 Z" fill="#fbbf24" />
          <path d="M 24 22 C 23 20 23 18 24 16 C 25 18 25 20 24 22 Z" fill="#fff7ed" />
          {/* glow */}
          <circle cx="24" cy="18" r="8" fill="rgba(253,230,138,0.12)" />
        </svg>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ATMOSPHERIC BACKGROUND ELEMENTS
═══════════════════════════════════════════════════════ */


/* Crepuscular light beams from lanterns above (brighter) */
function LightBeams() {
  const beams = [
    { left: "14%", width: "90px",  opacity: 0.15, delay: "0s"   },
    { left: "38%", width: "120px", opacity: 0.18, delay: "0.8s" },
    { left: "50%", width: "110px", opacity: 0.20, delay: "0.3s" },
    { left: "62%", width: "100px", opacity: 0.16, delay: "0.4s" },
    { left: "84%", width: "80px",  opacity: 0.12, delay: "1.2s" },
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
      {/* Circular dome glow — brighter */}
      <div style={{
        position: "absolute", top: "-80px", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "260px",
        background: "radial-gradient(ellipse at 50% 30%, rgba(160,100,20,0.22) 0%, rgba(120,70,10,0.12) 40%, transparent 70%)",
        borderRadius: "50%",
      }} />
      {/* Stone arch SVG */}
      <svg viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.22 }}>
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


/* Hanging lanterns — 7 lanterns, brighter glow */
function HangingLanterns() {
  const lanterns = [
    { left: "8%",  delay: "0s",   cordH: 85,  size: 13 },
    { left: "20%", delay: "1.2s", cordH: 62,  size: 11 },
    { left: "35%", delay: "0.4s", cordH: 105, size: 15 },
    { left: "50%", delay: "0.9s", cordH: 115, size: 16 },
    { left: "62%", delay: "1.7s", cordH: 58,  size: 11 },
    { left: "76%", delay: "0.6s", cordH: 90,  size: 13 },
    { left: "88%", delay: "1.4s", cordH: 72,  size: 12 },
  ];
  return (
    <div className="fixed top-0 left-0 right-0 pointer-events-none" style={{ zIndex: 1 }}>
      {lanterns.map((l, i) => (
        <div key={i} style={{ position: "absolute", left: l.left, top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "1px", height: `${l.cordH}px`, background: "linear-gradient(to bottom, rgba(140,100,40,0.65), rgba(120,80,20,0.3))" }} />
          <div style={{ width: `${l.size}px`, height: `${Math.round(l.size * 1.3)}px`, borderRadius: "2px 2px 5px 5px",
            background: "radial-gradient(ellipse at 50% 30%, #fff5c0, #fde68a 30%, #d4a843 65%, #92680f 100%)",
            animation: `lanternGlow 3s ${l.delay} ease-in-out infinite`,
            boxShadow: `0 0 20px 8px rgba(212,168,67,0.55), 0 0 40px 16px rgba(180,100,20,0.28)` }} />
          <div style={{ width: "1px", height: "10px", background: "linear-gradient(to bottom, rgba(212,168,67,0.7), transparent)" }} />
        </div>
      ))}
    </div>
  );
}

/* Depth mist layers — richer purple-indigo upper, softer sides */
function DepthMist() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {/* Upper mist — richer purple-indigo */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "35%", background: "linear-gradient(to bottom, rgba(60,30,100,0.35) 0%, transparent 100%)" }} />
      {/* Side vignettes — slightly softer */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(8,4,20,0.55) 100%)" }} />
      {/* Bottom warmth */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "25%", background: "linear-gradient(to top, rgba(120,70,10,0.18) 0%, transparent 100%)" }} />
    </div>
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

function toShelves(books: Book[]): Book[][] {
  if (books.length === 0) return [[]];
  const maxShelf = Math.max(...books.map(b => b.shelfNumber ?? 0));
  const result: Book[][] = Array.from({ length: maxShelf + 1 }, () => []);
  books.forEach(b => result[b.shelfNumber ?? 0].push(b));
  return result;
}

/** Returns spine width based on page count tiers. */
function calcSpineWidth(book: Book): number {
  const p = book.pageCount;
  if (p == null) return 44; // unknown — default
  if (p < 200)  return 32; // slim
  if (p < 350)  return 42; // standard
  if (p < 500)  return 52; // chunky
  if (p < 700)  return 62; // thick
  return 72;               // doorstopper
}
function shelfTotalWidth(shelf: Book[]): number {
  return shelf.reduce((sum, b) => sum + calcSpineWidth(b), 0);
}
/** Usable width on a shelf — reserves space for the flip cover panel. */
function shelfUsableWidth(shelfWidthPx: number): number {
  return shelfWidthPx - COVER_W;
}

type ShelfUnit =
  | { type: "series"; seriesName: string; books: Book[] }
  | { type: "solo"; book: Book };

/** Group consecutive same-series books into draggable units. */
function shelfToUnits(shelf: Book[]): ShelfUnit[] {
  const units: ShelfUnit[] = [];
  for (const book of shelf) {
    if (book.seriesName) {
      const last = units[units.length - 1];
      if (last?.type === "series" && last.seriesName === book.seriesName) {
        last.books.push(book);
      } else {
        units.push({ type: "series", seriesName: book.seriesName, books: [book] });
      }
    } else {
      units.push({ type: "solo", book });
    }
  }
  return units;
}

function unitWidth(unit: ShelfUnit): number {
  return unit.type === "series"
    ? unit.books.reduce((s, b) => s + calcSpineWidth(b), 0)
    : calcSpineWidth(unit.book);
}

/**
 * Re-orders books so series are grouped (sorted by seriesPosition).
 * Units keep their original relative order. Returns books with updated shelfNumber.
 */
function recomputeGrouping(allBooks: Book[], shelfWidthPx: number): Book[] {
  if (allBooks.length === 0) return [];

  const seriesGroups = new Map<string, Book[]>();
  for (const book of allBooks) {
    if (book.seriesName) {
      if (!seriesGroups.has(book.seriesName)) seriesGroups.set(book.seriesName, []);
      seriesGroups.get(book.seriesName)!.push(book);
    }
  }
  seriesGroups.forEach(grp => grp.sort((a, b) => (a.seriesPosition ?? 0) - (b.seriesPosition ?? 0)));

  const units: Book[][] = [];
  const addedSeries = new Set<string>();
  for (const book of allBooks) {
    if (book.seriesName) {
      if (!addedSeries.has(book.seriesName)) {
        addedSeries.add(book.seriesName);
        units.push(seriesGroups.get(book.seriesName)!);
      }
    } else {
      units.push([book]);
    }
  }

  const usable = shelfUsableWidth(shelfWidthPx);
  let shelf = 0;
  let shelfUsed = 0;
  const result: Book[] = [];

  for (const unit of units) {
    const unitW = unit.reduce((s, b) => s + calcSpineWidth(b), 0);
    if (unitW <= usable) {
      if (shelfUsed + unitW > usable && shelfUsed > 0) { shelf++; shelfUsed = 0; }
      for (const book of unit) { result.push({ ...book, shelfNumber: shelf }); shelfUsed += calcSpineWidth(book); }
    } else {
      for (const book of unit) {
        const bw = calcSpineWidth(book);
        if (shelfUsed + bw > usable && shelfUsed > 0) { shelf++; shelfUsed = 0; }
        result.push({ ...book, shelfNumber: shelf }); shelfUsed += bw;
      }
    }
  }
  return result;
}

/** Persists updated shelf_number + sort_order for every book after a recompute. */
function persistGrouping(recomputed: Book[]) {
  const byShelf = new Map<number, Book[]>();
  recomputed.forEach(b => {
    const s = b.shelfNumber ?? 0;
    if (!byShelf.has(s)) byShelf.set(s, []);
    byShelf.get(s)!.push(b);
  });
  byShelf.forEach((shelfBooks, shelfIdx) => {
    shelfBooks.forEach((book, pos) => {
      supabase.from("books").update({ shelf_number: shelfIdx, sort_order: pos }).eq("id", book.id);
    });
  });
}

/* ─────────────────────────────────────────────────────────
   View switcher dropdown — The Shelves / Reading Queue
───────────────────────────────────────────────────────── */
function ViewDropdown() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "none", border: "none", padding: 0, cursor: "pointer",
        }}
      >
        <h2 className="text-lg tracking-widest uppercase" style={{
          fontFamily: "var(--font-cinzel)", color: "#d4a843", opacity: 0.85, margin: 0,
        }}>
          The Shelves
        </h2>
        <span style={{
          fontFamily: "var(--font-cinzel)", fontSize: "9px", color: "rgba(212,168,67,0.5)",
          marginTop: "2px",
        }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => setOpen(false)}
          />
          {/* Menu */}
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 50,
            background: "rgba(20,14,40,0.97)",
            border: "1px solid rgba(212,168,67,0.25)",
            borderRadius: "10px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            overflow: "hidden",
            minWidth: "180px",
          }}>
            {/* Active: The Shelves */}
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 16px",
              background: "rgba(212,168,67,0.1)",
              borderBottom: "1px solid rgba(212,168,67,0.1)",
              cursor: "default",
            }}>
              <BookOpen size={12} color="#d4a843" />
              <span style={{
                fontFamily: "var(--font-cinzel)", fontSize: "10px",
                letterSpacing: "0.12em", textTransform: "uppercase", color: "#d4a843",
              }}>
                The Shelves
              </span>
              <span style={{ marginLeft: "auto", color: "#d4a843", fontSize: "10px" }}>✓</span>
            </div>
            {/* Link: Reading Queue */}
            <Link
              href="/tbr"
              onClick={() => setOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 16px", textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(212,168,67,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "12px", color: "rgba(212,168,67,0.6)" }}>☰</span>
              <span style={{
                fontFamily: "var(--font-cinzel)", fontSize: "10px",
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: "rgba(240,224,192,0.65)",
              }}>
                Reading Queue
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [detailBookId, setDetailBookId] = useState<string | number | null>(null);
  const [savedTs, setSavedTs] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<Book["status"] | null>(null);
  const [filterFormat, setFilterFormat] = useState<"ebook" | "physical" | "audiobook" | null>(null);
  const [sortBy, setSortBy] = useState<string>("none");
  const [showFilters, setShowFilters] = useState(false);
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [shelfWidthPx, setShelfWidthPx] = useState(900);
  const [shelfFullToast, setShelfFullToast] = useState<"series" | "full" | null>(null);
  // Track which book IDs have already had colours extracted so we don't repeat
  const extractedRef = useRef(new Set<string | number>());
  // Prevent StrictMode double-fetch (second load would overwrite extracted colors)
  const loadedRef = useRef(false);

  const handlePageClick = useCallback(() => setSelectedId(null), []);
  const handleSelect = useCallback((id: string | number) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    async function loadBooks() {
      let { data, error } = await supabase
        .from("books").select("*")
        .order("shelf_number", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      // Fallback if new columns don't exist yet
      if (error) ({ data, error } = await supabase
        .from("books").select("*").order("created_at", { ascending: true }));
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

  // Backfill page counts from Google Books for books that don't have one yet
  const backfillDoneRef = useRef(false);
  useEffect(() => {
    if (backfillDoneRef.current || books.length === 0) return;
    backfillDoneRef.current = true;

    const needsCount = books.filter(b => b.pageCount == null);
    if (needsCount.length === 0) return;

    async function backfill() {
      const BATCH = 5;
      const upserts: { id: string; page_count: number }[] = [];

      for (let i = 0; i < needsCount.length; i += BATCH) {
        const chunk = needsCount.slice(i, i + BATCH);
        await Promise.all(chunk.map(async (book) => {
          let pageCount: number | null = null;

          // Try direct Google Books volume lookup first
          if (book.googleBooksId) {
            try {
              const res = await fetch(`/api/books/${encodeURIComponent(book.googleBooksId)}`);
              if (res.ok) pageCount = (await res.json()).pageCount ?? null;
            } catch { /* ignore */ }
          }

          // Fall back to title+author search (handles OverDrive IDs and missing IDs)
          if (!pageCount) {
            try {
              const q = encodeURIComponent(`${book.title} ${book.author ?? ""}`.trim());
              const res = await fetch(`/api/search?q=${q}`);
              if (res.ok) {
                const d = await res.json();
                pageCount = d.items?.[0]?.volumeInfo?.pageCount ?? null;
              }
            } catch { /* ignore */ }
          }

          if (pageCount) {
            upserts.push({ id: String(book.id), page_count: pageCount });
            setBooks(prev => prev.map(b => b.id === book.id ? { ...b, pageCount: pageCount! } : b));
          }
        }));

        if (i + BATCH < needsCount.length) await new Promise(r => setTimeout(r, 250));
      }

      if (upserts.length > 0) {
        await supabase.from("books").upsert(upserts, { onConflict: "id" });
        setBooks(prev => {
          const recomputed = recomputeGrouping(prev, shelfWidthPx);
          persistGrouping(recomputed);
          return recomputed;
        });
      }
    }

    backfill();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length]);


  async function handleAddBook(book: Book) {
    const googleId = book.id as string;
    if (books.some((b) => b.googleBooksId === googleId)) return;

    const matchesSeries = !!book.seriesName && books.some(b => b.seriesName === book.seriesName);
    const newBookWidth = calcSpineWidth(book);
    const currentShelves = toShelves(books);

    // Find initial shelf placement (for non-series books, or as temp for series books)
    let targetShelf = currentShelves.length;
    if (!matchesSeries) {
      const usable = shelfUsableWidth(shelfWidthPx);
      for (let i = 0; i < currentShelves.length; i++) {
        if (shelfTotalWidth(currentShelves[i]) + newBookWidth <= usable) { targetShelf = i; break; }
      }
    }
    const shelfPosition = currentShelves[targetShelf]?.length ?? 0;

    const optimisticBook: Book = { ...book, googleBooksId: googleId, shelfNumber: targetShelf };
    setBooks(prev => {
      const next = [...prev, optimisticBook];
      if (matchesSeries) return recomputeGrouping(next, shelfWidthPx);
      return next;
    });

    const { data, error } = await supabase.from("books")
      .insert({ title: book.title, author: book.author, cover_url: book.coverUrl ?? null,
                google_books_id: googleId, status: "tbr-owned",
                page_count: book.pageCount ?? null,
                shelf_number: targetShelf, sort_order: shelfPosition })
      .select().single();
    if (error) {
      setBooks((prev) => prev.filter((b) => b.id !== googleId));
      console.error("Failed to save book:", error.message);
      return;
    }
    const realId = (data as DbBook).id;
    setBooks(prev => {
      const updated = prev.map(b => b.id === googleId ? { ...b, id: realId } : b);
      if (matchesSeries) persistGrouping(updated);
      return updated;
    });
  }

  async function handleUpdateBook(id: string | number, updates: Partial<Book>) {
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    const db: Record<string, unknown> = {};
    if ("title"          in updates) db.title            = updates.title;
    if ("status"         in updates) db.status          = updates.status;
    if ("rating"         in updates) db.rating          = updates.rating ?? null;
    if ("format"         in updates) db.format          = updates.format;
    if ("formatSource"   in updates) db.format_source   = updates.formatSource  ?? null;
    if ("startDate"      in updates) db.start_date      = updates.startDate     ?? null;
    if ("dateFinished"   in updates) db.date_finished   = updates.dateFinished  ?? null;
    if ("review"         in updates) db.review          = updates.review        ?? null;
    if ("seriesName"     in updates) db.series_name     = updates.seriesName    ?? null;
    if ("seriesPosition" in updates) db.series_position = updates.seriesPosition ?? null;
    if ("seriesTotal"    in updates) db.series_total    = updates.seriesTotal   ?? null;
    if ("returnDate"     in updates) db.return_date     = updates.returnDate    ?? null;
    if ("pageCount"      in updates) db.page_count      = updates.pageCount     ?? null;
    const { error } = await supabase.from("books").update(db).eq("id", id);
    if (!error) {
      setSavedTs(Date.now());
      if ("seriesName" in updates || "seriesPosition" in updates || "pageCount" in updates) {
        const updatedBooks = books.map(b => b.id === id ? { ...b, ...updates } : b);
        const recomputed = recomputeGrouping(updatedBooks, shelfWidthPx);
        setBooks(recomputed);
        persistGrouping(recomputed);
      }
    }
  }

  async function handleDeleteBook(id: string | number) {
    setBooks(prev => prev.filter(b => b.id !== id));
    setDetailBookId(null);
    setSelectedId(null);
    await supabase.from("books").delete().eq("id", id);
  }

  function handleDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const srcIdx = parseInt(source.droppableId.replace("shelf-", ""));
    const dstIdx = parseInt(destination.droppableId.replace("shelf-", ""));

    const newShelves = shelves.map(s => [...s]);
    while (newShelves.length <= dstIdx) newShelves.push([]);

    // Identify the dragged unit and its books (indices are unit indices, not book indices)
    const srcUnits = shelfToUnits(newShelves[srcIdx]);
    const movedUnit = srcUnits[source.index];
    if (!movedUnit) return;
    const movedBooks = movedUnit.type === "series" ? movedUnit.books : [movedUnit.book];
    const movedW = movedBooks.reduce((s, b) => s + calcSpineWidth(b), 0);

    // Capacity check for cross-shelf moves
    if (srcIdx !== dstIdx) {
      const dstUsed = shelfTotalWidth(newShelves[dstIdx]);
      if (dstUsed + movedW > shelfUsableWidth(shelfWidthPx)) {
        setShelfFullToast(movedUnit.type === "series" ? "series" : "full");
        setTimeout(() => setShelfFullToast(null), 2200);
        return;
      }
    }

    // Remove movedBooks from source shelf
    const movedIds = new Set(movedBooks.map(b => b.id));
    newShelves[srcIdx] = newShelves[srcIdx].filter(b => !movedIds.has(b.id));

    // Compute book-level insertion index on destination shelf
    // (after removal; for same-shelf moves the src shelf is already filtered)
    const insertShelf = srcIdx === dstIdx ? newShelves[srcIdx] : newShelves[dstIdx];
    const insertUnits = shelfToUnits(insertShelf);
    let bookInsertAt = 0;
    for (let i = 0; i < Math.min(destination.index, insertUnits.length); i++) {
      const u = insertUnits[i];
      bookInsertAt += u.type === "series" ? u.books.length : 1;
    }

    if (srcIdx === dstIdx) {
      newShelves[srcIdx].splice(bookInsertAt, 0, ...movedBooks);
    } else {
      newShelves[dstIdx].splice(bookInsertAt, 0, ...movedBooks);
    }

    // Remove trailing empty shelves
    while (newShelves.length > 1 && newShelves[newShelves.length - 1].length === 0) {
      newShelves.pop();
    }

    const final = newShelves.flatMap((shelf, shelfIdx) =>
      shelf.map(b => ({ ...b, shelfNumber: shelfIdx }))
    );

    setBooks(prev => {
      const inFinal = new Set(final.map(b => b.id));
      return [...final, ...prev.filter(b => !inFinal.has(b.id))];
    });

    // Single batch upsert — one network request for all moved books
    void (async () => {
      const byShelf = new Map<number, Book[]>();
      final.forEach(b => {
        const s = b.shelfNumber ?? 0;
        if (!byShelf.has(s)) byShelf.set(s, []);
        byShelf.get(s)!.push(b);
      });
      const rows: { id: string | number; shelf_number: number; sort_order: number }[] = [];
      byShelf.forEach((shelfBooks, shelfIdx) => {
        shelfBooks.forEach((book, pos) => {
          rows.push({ id: book.id, shelf_number: shelfIdx, sort_order: pos });
        });
      });
      const { error } = await supabase.from("books").upsert(rows, { onConflict: "id" });
      if (error) console.error("Batch shelf update failed:", error.message);
    })();
  }

  const displayedBooks = useMemo(() => {
    if (isArrangeMode) return [...books];
    let result = [...books];
    if (filterStatus) result = result.filter(b => b.status === filterStatus);
    if (filterFormat) result = result.filter(b => (b.format ?? "physical") === filterFormat);
    switch (sortBy) {
      case "title":      result.sort((a, b) => a.title.localeCompare(b.title)); break;
      case "author":     result.sort((a, b) => a.author.localeCompare(b.author)); break;
      case "rating":     result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case "startDate":  result.sort((a, b) => !a.startDate ? 1 : !b.startDate ? -1 : a.startDate.localeCompare(b.startDate)); break;
      case "returnDate": result.sort((a, b) => !a.returnDate ? 1 : !b.returnDate ? -1 : a.returnDate.localeCompare(b.returnDate)); break;
    }
    return result;
  }, [books, isArrangeMode, filterStatus, filterFormat, sortBy]);

  const shelves = useMemo(() =>
    isArrangeMode
      ? toShelves(books)
      : toShelves(recomputeGrouping(displayedBooks, shelfWidthPx)),
    [books, displayedBooks, isArrangeMode, shelfWidthPx]
  );
  const displayShelves = isArrangeMode ? [...shelves, []] : shelves;
  const readCount = books.filter((b) => b.status === "read").length;
  const readingCount = books.filter((b) => b.status === "reading").length;

  const PILL = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      padding: "4px 11px", borderRadius: "999px", fontSize: "9.5px",
      fontFamily: "var(--font-cinzel)", letterSpacing: "0.1em", cursor: "pointer",
      border: `1px solid ${active ? "rgba(212,168,67,0.65)" : "rgba(212,168,67,0.18)"}`,
      background: active ? "rgba(212,168,67,0.18)" : "transparent",
      color: active ? "#fde68a" : "rgba(255,240,200,0.4)",
      boxShadow: active ? "0 0 10px rgba(212,168,67,0.2)" : "none",
      transition: "all 0.18s", whiteSpace: "nowrap",
    }}>{label}</button>
  );

  const statusFilters: Array<{ label: string; value: Book["status"] | null }> = [
    { label: "All", value: null },
    { label: "TBR (Owned)", value: "tbr-owned" },
    { label: "TBR (Not Owned)", value: "tbr-not-owned" },
    { label: "Reading", value: "reading" },
    { label: "Finished", value: "read" },
    { label: "DNF", value: "dnf" },
  ];
  const formatFilters: Array<{ label: string; value: "ebook" | "physical" | "audiobook" | null }> = [
    { label: "All Formats", value: null },
    { label: "Ebook", value: "ebook" },
    { label: "Physical", value: "physical" },
    { label: "Audiobook", value: "audiobook" },
  ];
  const sortOptions = [
    { label: "Date Added", value: "none" },
    { label: "Title", value: "title" },
    { label: "Author", value: "author" },
    { label: "Rating", value: "rating" },
    { label: "Date Started", value: "startDate" },
    { label: "Return Date", value: "returnDate" },
  ];

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "linear-gradient(170deg, #1a1530 0%, #2d1b4e 35%, #1e1340 70%, #170e2e 100%)" }}
      onClick={handlePageClick}
    >
      <div className="page-vignette" />

      {/* ── Fixed atmospheric layers (behind everything) ── */}
      <CeilingGlow />
      <Starfield />
      <DepthMist />
      <HangingLanterns />
      <LightBeams />
      <FloatingParticles />

      {/* ══════════════════════════════════════════
          SECTION 1 — HEADER
          Opaque background blocks fixed layers.
      ══════════════════════════════════════════ */}
      <header style={{
        position: "relative", zIndex: 10,
        background: "linear-gradient(to bottom, rgba(18,12,36,0.98) 0%, rgba(22,15,42,0.95) 100%)",
        borderBottom: "1px solid rgba(212,168,67,0.15)",
      }}>
        {/* Import link — top-right corner */}
        <Link
          href="/import"
          style={{
            position: "absolute", top: "14px", right: "18px", zIndex: 20,
            display: "inline-flex", alignItems: "center", gap: "5px",
            fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.12em",
            textTransform: "uppercase", textDecoration: "none",
            color: "rgba(212,168,67,0.4)",
            padding: "5px 10px", borderRadius: "999px",
            border: "1px solid rgba(212,168,67,0.12)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "rgba(212,168,67,0.8)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(212,168,67,0.35)";
            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(212,168,67,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "rgba(212,168,67,0.4)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(212,168,67,0.12)";
            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
          }}
        >
          <FolderInput size={11} />
          Import
        </Link>
        <ArchedDome />
        <div className="flex flex-col items-center gap-4 px-8 py-10 max-w-5xl mx-auto">
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

          <div className="w-full mt-4" onClick={(e) => e.stopPropagation()}>
            <SearchBar
              onAddBook={handleAddBook}
              existingGoogleIds={books.map((b) => b.googleBooksId).filter(Boolean) as string[]}
            />
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          SECTION 2 — BOOKSHELF
          Normal document flow; scrolls below header.
      ══════════════════════════════════════════ */}
      <section
        style={{ position: "relative", zIndex: 5, padding: "28px 32px 80px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-5xl mx-auto">

          {/* Shelf row label + filter toggle + arrange button */}
          <div className="flex items-center gap-3 mb-5" style={{ userSelect: "none" }}>
            <BookOpen className="w-5 h-5" style={{ color: "#d4a843" }} />
            <ViewDropdown />
            {!isLoading && books.length > 0 && !isArrangeMode && (
              <span
                style={{
                  fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.12em",
                  color: "rgba(212,168,67,0.45)", border: "1px solid rgba(212,168,67,0.2)",
                  borderRadius: "999px", padding: "2px 8px", whiteSpace: "nowrap",
                  background: showFilters ? "rgba(212,168,67,0.1)" : "transparent",
                  transition: "all 0.2s", cursor: "pointer",
                }}
                onClick={() => setShowFilters(v => !v)}
              >
                {showFilters ? "▲ filters" : "▼ filters"}
                {(filterStatus || filterFormat || sortBy !== "none") && (
                  <span style={{ marginLeft: "5px", color: "#fde68a" }}>•</span>
                )}
              </span>
            )}
            <div className="flex-1 h-[1px] opacity-25" style={{ background: "#d4a843" }} />
            {!isLoading && (
              <span style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(212,168,67,0.5)", fontStyle: "italic", whiteSpace: "nowrap" }}>
                {displayedBooks.length}{displayedBooks.length < books.length ? ` of ${books.length}` : ""} {displayedBooks.length === 1 ? "volume" : "volumes"}
              </span>
            )}
            {!isLoading && books.length > 0 && (
              <button
                onClick={() => setIsArrangeMode(v => !v)}
                style={{
                  fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.12em",
                  padding: "3px 10px", borderRadius: "999px", cursor: "pointer",
                  background: isArrangeMode ? "rgba(109,204,154,0.2)" : "rgba(212,168,67,0.1)",
                  border: `1px solid ${isArrangeMode ? "rgba(109,204,154,0.5)" : "rgba(212,168,67,0.3)"}`,
                  color: isArrangeMode ? "#6dcc9a" : "#d4a843",
                  transition: "all 0.2s", whiteSpace: "nowrap",
                }}
              >
                {isArrangeMode ? "✓ Done" : "⠿ Arrange"}
              </button>
            )}
          </div>

          {/* Filter + sort controls — collapsible, hidden in arrange mode */}
          {!isLoading && books.length > 0 && showFilters && !isArrangeMode && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.15em", color: "rgba(212,168,67,0.45)", textTransform: "uppercase", marginRight: "2px", whiteSpace: "nowrap" }}>Status</span>
                {statusFilters.map(f => PILL(f.label, filterStatus === f.value, () => setFilterStatus(f.value)))}
              </div>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.15em", color: "rgba(212,168,67,0.45)", textTransform: "uppercase", marginRight: "2px", whiteSpace: "nowrap" }}>Format</span>
                {formatFilters.map(f => PILL(f.label, filterFormat === f.value, () => setFilterFormat(f.value)))}
                <div style={{ width: "1px", height: "16px", background: "rgba(212,168,67,0.15)", margin: "0 4px", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.15em", color: "rgba(212,168,67,0.45)", textTransform: "uppercase", marginRight: "2px", whiteSpace: "nowrap" }}>Sort</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                  padding: "4px 10px", borderRadius: "999px", fontSize: "9.5px",
                  fontFamily: "var(--font-cinzel)", letterSpacing: "0.08em",
                  background: sortBy !== "none" ? "rgba(212,168,67,0.14)" : "rgba(10,8,22,0.8)",
                  border: `1px solid ${sortBy !== "none" ? "rgba(212,168,67,0.55)" : "rgba(212,168,67,0.18)"}`,
                  color: sortBy !== "none" ? "#fde68a" : "rgba(255,240,200,0.4)",
                  cursor: "pointer", outline: "none",
                  boxShadow: sortBy !== "none" ? "0 0 10px rgba(212,168,67,0.18)" : "none",
                }}>
                  {sortOptions.map(o => (
                    <option key={o.value} value={o.value} style={{ background: "#0d0a1e", color: "#f5e6c8" }}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Arrange mode hint / shelf-full toast */}
          {isArrangeMode && (
            shelfFullToast ? (
              <p className="mb-4 text-xs italic tracking-widest text-center" style={{ fontFamily: "var(--font-crimson)", color: "#f87171", animation: "fadeInUp 0.2s ease" }}>
                {shelfFullToast === "series"
                  ? "Not enough space for this series — try another shelf"
                  : "That shelf is full — try another"}
              </p>
            ) : (
              <p className="mb-4 text-xs italic opacity-40 tracking-widest text-center" style={{ fontFamily: "var(--font-crimson)", color: "#6dcc9a" }}>
                Drag books to rearrange · click ✓ Done when finished
              </p>
            )
          )}

          {/* Shelf rows */}
          <div style={{ position: "relative" }}>
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 py-20">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#d4a843", opacity: 0.8 }} />
              <p className="text-sm italic tracking-widest opacity-50" style={{ fontFamily: "var(--font-crimson)", color: "#f0e0c0" }}>Summoning your collection…</p>
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 opacity-40">
              <BookOpen className="w-10 h-10" style={{ color: "#d4a843" }} />
              <p className="text-sm italic tracking-widest" style={{ fontFamily: "var(--font-crimson)", color: "#f0e0c0" }}>Your library awaits its first tome.</p>
              <p className="text-xs tracking-wider" style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843" }}>Search for a book above to begin.</p>
            </div>
          ) : displayedBooks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 opacity-40">
              <BookOpen className="w-8 h-8" style={{ color: "#d4a843" }} />
              <p className="text-sm italic tracking-widest" style={{ fontFamily: "var(--font-crimson)", color: "#f0e0c0" }}>No books match the current filters.</p>
            </div>
          ) : isArrangeMode ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              {displayShelves.map((shelf, idx) => (
                <div key={idx}>
                  {idx > 0 && <ShelfDivider />}
                  <LibraryShelf
                    books={shelf} shelfIndex={idx} totalShelves={displayShelves.length}
                    selectedId={selectedId} onSelect={handleSelect} onOpenDetail={setDetailBookId}
                    isArrangeMode={true}
                    onWidthMeasured={idx === 0 ? (w) => setShelfWidthPx(w) : undefined}
                  />
                </div>
              ))}
            </DragDropContext>
          ) : (
            <>
              {shelves.map((shelf, idx) => (
                <div key={idx}>
                  {idx > 0 && <ShelfDivider />}
                  <LibraryShelf
                    books={shelf} shelfIndex={idx} totalShelves={shelves.length}
                    selectedId={selectedId} onSelect={handleSelect} onOpenDetail={setDetailBookId}
                    isArrangeMode={false}
                    onWidthMeasured={idx === 0 ? (w) => setShelfWidthPx(w) : undefined}
                  />
                </div>
              ))}
            </>
          )}
          </div>{/* end shelf-rows relative wrapper */}

          {books.length > 0 && !isLoading && !isArrangeMode && (
            <p className="mt-4 text-xs italic opacity-25 tracking-widest text-center" style={{ fontFamily: "var(--font-crimson)", color: "#d8c8a8" }}>
              Click a spine to unshelve · click the cover to open its record
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
        </div>
      </section>

      {/* ── Book detail panel ── */}
      {detailBookId && (() => {
        const detailBook = books.find(b => b.id === detailBookId);
        if (!detailBook) return null;
        return (
          <>
            <div
              onClick={() => { setDetailBookId(null); setSelectedId(null); }}
              style={{ position: "fixed", inset: 0, background: "rgba(2,1,10,0.65)", zIndex: 50, backdropFilter: "blur(2px)" }}
            />
            <BookDetailPanel
              book={detailBook}
              onUpdate={(updates) => handleUpdateBook(detailBook.id, updates)}
              onDelete={() => handleDeleteBook(detailBook.id)}
              onClose={() => { setDetailBookId(null); setSelectedId(null); }}
              savedTs={savedTs}
            />
          </>
        );
      })()}
    </div>
  );
}
