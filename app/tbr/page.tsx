"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Loader2, BookOpen, Search, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbBook } from "../types";

/* ─────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────── */
interface TbrBook {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  format: string | null;
  formatSource: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  seriesTotal: number | null;
  rating: number | null;
  tbrOrder: number | null;
  status: string;
}

interface AllBook {
  id: string;
  title: string;
  status: string;
  seriesName: string | null;
  seriesPosition: number | null;
  seriesTotal: number | null;
}

interface SeriesGap {
  seriesName: string;
  lastBook: AllBook;
  nextPosition: number;
  seriesTotal: number | null;
}

interface LibbyCard {
  advantageKey: string;
  websiteId: number;
  cardName: string;
}

interface AvailabilityResult {
  bookId: string;
  status: "available" | "holds" | "not_found" | "loading";
  holdsCount?: number;
  libbyUrl?: string;
}

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
function cleanCoverUrl(raw: string): string {
  return raw
    .replace(/^http:\/\//, "https://")
    .replace(/&edge=curl/g, "")
    .replace(/zoom=1(&|$)/, "zoom=5$1");
}

function dbRowToTbrBook(row: DbBook): TbrBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? "Unknown",
    coverUrl: row.cover_url,
    format: row.format,
    formatSource: row.format_source,
    seriesName: row.series_name,
    seriesPosition: row.series_position,
    seriesTotal: row.series_total,
    rating: row.rating,
    tbrOrder: row.tbr_order,
    status: row.status,
  };
}

/* ─────────────────────────────────────────────────────────
   Small components
───────────────────────────────────────────────────────── */
function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{
            color: star <= rating ? "#d4a843" : "rgba(255,255,255,0.15)",
            fontSize: "10px",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const FORMAT_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  ebook:     { label: "E-Book",   bg: "rgba(100,30,180,0.25)", border: "rgba(192,132,252,0.4)", text: "#c084fc" },
  physical:  { label: "Physical", bg: "rgba(20,80,140,0.25)",  border: "rgba(96,165,250,0.4)",  text: "#60a5fa" },
  audiobook: { label: "Audio",    bg: "rgba(20,120,60,0.25)",  border: "rgba(74,222,128,0.4)",  text: "#4ade80" },
};

function FormatBadge({ format }: { format: string }) {
  const c = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.physical;
  return (
    <span
      style={{
        fontFamily: "var(--font-cinzel)",
        fontSize: "8px",
        letterSpacing: "0.12em",
        padding: "2px 6px",
        borderRadius: "999px",
        textTransform: "uppercase",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function LibbyAvailBadge({ result }: { result: AvailabilityResult | undefined }) {
  if (!result || result.status === "loading") {
    return (
      <span style={{
        fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.1em",
        padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(240,224,192,0.3)", whiteSpace: "nowrap",
      }}>
        ☽ …
      </span>
    );
  }
  if (result.status === "not_found") {
    return (
      <span style={{
        fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.1em",
        padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        color: "rgba(240,224,192,0.25)", whiteSpace: "nowrap",
      }}>
        ☽ Not on Libby
      </span>
    );
  }
  if (result.status === "available") {
    return (
      <a
        href={result.libbyUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.1em",
          padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase",
          background: "rgba(20,120,80,0.25)", border: "1px solid rgba(109,204,154,0.45)",
          color: "#6dcc9a", whiteSpace: "nowrap", textDecoration: "none",
        }}
      >
        ☽ Available now
      </a>
    );
  }
  // holds
  return (
    <a
      href={result.libbyUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.1em",
        padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase",
        background: "rgba(180,100,20,0.22)", border: "1px solid rgba(212,168,67,0.38)",
        color: "#d4a843", whiteSpace: "nowrap", textDecoration: "none",
      }}
    >
      ☽ {result.holdsCount} hold{result.holdsCount !== 1 ? "s" : ""}
    </a>
  );
}

/* ─────────────────────────────────────────────────────────
   Pill button styles
───────────────────────────────────────────────────────── */
const GOLD_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "6px 14px",
  background: "rgba(212,168,67,0.12)",
  border: "1px solid rgba(212,168,67,0.35)",
  borderRadius: "999px",
  fontFamily: "var(--font-cinzel)",
  fontSize: "9px",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#d4a843",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const GREEN_BTN: React.CSSProperties = {
  ...GOLD_BTN,
  background: "rgba(20,120,80,0.2)",
  border: "1px solid rgba(109,204,154,0.4)",
  color: "#6dcc9a",
};

/* ─────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────── */
export default function TbrPage() {
  const [tbrBooks, setTbrBooks] = useState<TbrBook[]>([]);
  const [allBooks, setAllBooks] = useState<AllBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingGap, setAddingGap] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  /* Libby availability */
  const [libbyCard, setLibbyCard] = useState<LibbyCard | null>(null);
  const [librarySlug, setLibrarySlug] = useState<string>("");
  const [availability, setAvailability] = useState<Record<string, AvailabilityResult>>({});

  /* ── Load data ── */
  const loadAllBooks = useCallback(async () => {
    const { data } = await supabase
      .from("books")
      .select("id, title, status, series_name, series_position, series_total")
      .order("created_at", { ascending: true });
    if (data) {
      setAllBooks(
        (data as Pick<DbBook, "id" | "title" | "status" | "series_name" | "series_position" | "series_total">[]).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          seriesName: r.series_name,
          seriesPosition: r.series_position,
          seriesTotal: r.series_total,
        }))
      );
    }
  }, []);

  const loadTbrBooks = useCallback(async () => {
    const { data } = await supabase
      .from("books")
      .select("*")
      .in("status", ["tbr-owned", "tbr-not-owned"])
      .order("tbr_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (data) setTbrBooks((data as DbBook[]).map(dbRowToTbrBook));
  }, []);

  useEffect(() => {
    async function load() {
      await Promise.all([loadTbrBooks(), loadAllBooks()]);
      setIsLoading(false);
    }
    load();
  }, [loadTbrBooks, loadAllBooks]);

  /* ── Load Libby credentials from localStorage ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("libbyAuth");
      if (saved) {
        const { cards, selectedCardKey } = JSON.parse(saved);
        const card = cards?.find((c: LibbyCard) => c.advantageKey === selectedCardKey) ?? cards?.[0];
        if (card) {
          setLibbyCard(card);
          setLibrarySlug(card.advantageKey);
        }
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Fetch availability once TBR books and Libby card are ready ── */
  useEffect(() => {
    if (!libbyCard || tbrBooks.length === 0) return;
    const pending = tbrBooks.filter((b) => !availability[b.id]);
    if (pending.length === 0) return;

    // Mark all as loading
    setAvailability((prev) => {
      const next = { ...prev };
      for (const b of pending) next[b.id] = { bookId: b.id, status: "loading" };
      return next;
    });

    async function fetchAvailability() {
      try {
        const res = await fetch("/api/libby/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            books: pending.map((b) => ({ bookId: b.id, title: b.title, author: b.author })),
            advantageKey: libbyCard!.advantageKey,
            librarySlug,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const results: AvailabilityResult[] = data.results ?? [];
        setAvailability((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.bookId] = r;
          return next;
        });
      } catch { /* fail silently */ }
    }

    fetchAvailability();
  // Run when books load or card loads; don't re-run on availability changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libbyCard, tbrBooks.length]);

  /* ── Drag and drop ── */
  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(tbrBooks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setTbrBooks(reordered);
    const updates = reordered.map((b, i) => ({ id: b.id, tbr_order: i }));
    await supabase.from("books").upsert(updates, { onConflict: "id" });
  }

  /* ── Series gaps ── */
  const seriesGaps = useMemo<SeriesGap[]>(() => {
    const finished = allBooks.filter(
      (b) => b.status === "read" && b.seriesName && b.seriesPosition != null
    );
    const highestFinished = new Map<string, { book: AllBook; pos: number }>();
    for (const b of finished) {
      const key = b.seriesName!;
      const cur = highestFinished.get(key);
      if (!cur || b.seriesPosition! > cur.pos)
        highestFinished.set(key, { book: b, pos: b.seriesPosition! });
    }
    const gaps: SeriesGap[] = [];
    highestFinished.forEach(({ book, pos }, seriesName) => {
      const nextExists = allBooks.some(
        (b) => b.seriesName === seriesName && b.seriesPosition === pos + 1
      );
      if (!nextExists)
        gaps.push({ seriesName, lastBook: book, nextPosition: pos + 1, seriesTotal: book.seriesTotal });
    });
    return gaps;
  }, [allBooks]);

  /* ── Add next book to TBR ── */
  async function addNextBookToTBR(gap: SeriesGap) {
    setAddingGap(gap.seriesName);
    setAddError(null);
    try {
      const q = `${gap.seriesName} book ${gap.nextPosition}`;
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const item = data.items?.[0];
      if (!item) {
        setAddError(`Couldn't find Book ${gap.nextPosition} of ${gap.seriesName} on Google Books.`);
        setAddingGap(null);
        return;
      }
      const vi = item.volumeInfo;
      const raw: string | undefined =
        vi?.imageLinks?.thumbnail ?? vi?.imageLinks?.smallThumbnail;
      const coverUrl = raw ? cleanCoverUrl(raw) : null;
      await supabase.from("books").insert({
        title: vi.title,
        author: vi.authors?.[0] ?? "Unknown",
        cover_url: coverUrl,
        google_books_id: item.id,
        status: "tbr-not-owned",
        series_name: gap.seriesName,
        series_position: gap.nextPosition,
        series_total: gap.seriesTotal ?? null,
      });
      await Promise.all([loadTbrBooks(), loadAllBooks()]);
    } catch {
      setAddError("Something went wrong. Please try again.");
    } finally {
      setAddingGap(null);
    }
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(170deg,#1a1530 0%,#2d1b4e 35%,#1e1340 70%,#170e2e 100%)",
        color: "#f0e0c0",
        fontFamily: "var(--font-crimson)",
        padding: "40px 48px 80px",
      }}
    >
      {/* Vignette */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 9999,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(2,2,14,0.72) 100%)",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "48px",
          maxWidth: "860px",
          margin: "0 auto 48px",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-crimson)",
            fontSize: "14px",
            fontStyle: "italic",
            color: "#d4a843",
            textDecoration: "none",
            opacity: 0.75,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            transition: "opacity 0.2s",
          }}
        >
          ← Return to Library
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-cinzel)",
            fontSize: "22px",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#d4a843",
            margin: 0,
            textShadow: "0 0 40px rgba(212,168,67,0.4)",
          }}
        >
          Reading Queue
        </h1>
        <div style={{ width: "140px" }} /> {/* spacer */}
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              height: "200px",
              color: "rgba(240,224,192,0.45)",
              fontFamily: "var(--font-cinzel)",
              fontSize: "11px",
              letterSpacing: "0.15em",
            }}
          >
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Loading your reading queue…
          </div>
        ) : (
          <>
            {/* ── Section 1: TBR List ── */}
            <section style={{ marginBottom: "64px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "24px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid rgba(212,168,67,0.1)",
                }}
              >
                <BookOpen size={14} color="rgba(212,168,67,0.6)" />
                <span
                  style={{
                    fontFamily: "var(--font-cinzel)",
                    fontSize: "11px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "rgba(212,168,67,0.7)",
                  }}
                >
                  My TBR List
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-cinzel)",
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                    color: "rgba(240,224,192,0.3)",
                  }}
                >
                  {tbrBooks.length} {tbrBooks.length === 1 ? "book" : "books"}
                </span>
              </div>

              {tbrBooks.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px",
                    color: "rgba(240,224,192,0.3)",
                    fontStyle: "italic",
                    fontSize: "15px",
                  }}
                >
                  Your TBR list is empty. Add books from the{" "}
                  <Link
                    href="/import"
                    style={{ color: "#d4a843", textDecoration: "none" }}
                  >
                    import page
                  </Link>
                  .
                </div>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="tbr-list" direction="vertical">
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                      >
                        {tbrBooks.map((book, i) => (
                          <Draggable
                            key={book.id}
                            draggableId={book.id}
                            index={i}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onMouseEnter={() => setHoveredRow(book.id)}
                                onMouseLeave={() => setHoveredRow(null)}
                                style={{
                                  ...provided.draggableProps.style,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "14px",
                                  padding: "10px 16px 10px 12px",
                                  background: snapshot.isDragging
                                    ? "rgba(212,168,67,0.08)"
                                    : hoveredRow === book.id
                                    ? "rgba(255,255,255,0.03)"
                                    : "rgba(255,255,255,0.02)",
                                  border: snapshot.isDragging
                                    ? "1px solid rgba(212,168,67,0.4)"
                                    : hoveredRow === book.id
                                    ? "1px solid rgba(212,168,67,0.28)"
                                    : "1px solid rgba(212,168,67,0.13)",
                                  borderRadius: "8px",
                                  boxShadow: snapshot.isDragging
                                    ? "0 8px 32px rgba(0,0,0,0.5)"
                                    : "none",
                                  transition: snapshot.isDragging
                                    ? "none"
                                    : "border-color 0.2s, background 0.2s",
                                  transform: snapshot.isDragging
                                    ? provided.draggableProps.style?.transform
                                    : hoveredRow === book.id
                                    ? `${provided.draggableProps.style?.transform ?? ""} translateX(2px)`.trim()
                                    : provided.draggableProps.style?.transform,
                                }}
                              >
                                {/* Drag handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  style={{
                                    color: "rgba(240,224,192,0.2)",
                                    cursor: "grab",
                                    fontSize: "16px",
                                    lineHeight: 1,
                                    userSelect: "none",
                                    flexShrink: 0,
                                    paddingTop: "1px",
                                  }}
                                >
                                  ⠿
                                </div>

                                {/* Rank */}
                                <div
                                  style={{
                                    fontFamily: "var(--font-cinzel)",
                                    fontSize: "13px",
                                    color: i === 0 ? "#d4a843" : "rgba(212,168,67,0.4)",
                                    minWidth: "26px",
                                    textAlign: "right",
                                    flexShrink: 0,
                                    fontWeight: i === 0 ? "bold" : "normal",
                                  }}
                                >
                                  #{i + 1}
                                </div>

                                {/* Cover thumbnail */}
                                <div
                                  style={{
                                    width: "40px",
                                    height: "58px",
                                    flexShrink: 0,
                                    borderRadius: "2px",
                                    overflow: "hidden",
                                    background: "rgba(255,255,255,0.05)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                  }}
                                >
                                  {book.coverUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={book.coverUrl}
                                      alt=""
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "18px",
                                        opacity: 0.3,
                                      }}
                                    >
                                      📖
                                    </div>
                                  )}
                                </div>

                                {/* Title / author / meta */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontFamily: "var(--font-cinzel)",
                                      fontSize: "12px",
                                      color: "#f0e0c0",
                                      letterSpacing: "0.04em",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      marginBottom: "3px",
                                    }}
                                  >
                                    {book.title}
                                  </div>
                                  <div
                                    style={{
                                      fontFamily: "var(--font-crimson)",
                                      fontSize: "13px",
                                      fontStyle: "italic",
                                      color: "rgba(240,224,192,0.55)",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    {book.author}
                                  </div>
                                  {book.seriesName && (
                                    <div
                                      style={{
                                        fontFamily: "var(--font-crimson)",
                                        fontSize: "12px",
                                        color: "rgba(212,168,67,0.5)",
                                        fontStyle: "italic",
                                        marginBottom: "5px",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {book.seriesPosition != null
                                        ? `Book ${book.seriesPosition}${book.seriesTotal ? ` of ${book.seriesTotal}` : ""} — ${book.seriesName}`
                                        : book.seriesName}
                                    </div>
                                  )}
                                </div>

                                {/* Badges */}
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "5px",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    flexShrink: 0,
                                  }}
                                >
                                  {book.format && <FormatBadge format={book.format} />}
                                  {libbyCard && <LibbyAvailBadge result={availability[book.id]} />}
                                  {book.rating != null && book.rating > 0 && (
                                    <StarRating rating={book.rating} />
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </section>

            {/* ── Section 2: Next in Series ── */}
            {seriesGaps.length > 0 && (
              <section>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "24px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid rgba(212,168,67,0.1)",
                  }}
                >
                  <span style={{ fontSize: "14px" }}>✦</span>
                  <span
                    style={{
                      fontFamily: "var(--font-cinzel)",
                      fontSize: "11px",
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "rgba(212,168,67,0.7)",
                    }}
                  >
                    Next in Series
                  </span>
                </div>

                {addError && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "10px 16px",
                      background: "rgba(248,113,113,0.08)",
                      border: "1px solid rgba(248,113,113,0.25)",
                      borderRadius: "8px",
                      color: "#f87171",
                      fontFamily: "var(--font-crimson)",
                      fontSize: "13px",
                    }}
                  >
                    {addError}
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {seriesGaps.map((gap) => (
                    <div
                      key={gap.seriesName}
                      style={{
                        background: "rgba(212,168,67,0.04)",
                        border: "1px solid rgba(212,168,67,0.22)",
                        borderTop: "3px solid rgba(212,168,67,0.45)",
                        borderRadius: "12px",
                        padding: "20px",
                        boxShadow: "0 0 20px rgba(212,168,67,0.06)",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-cinzel)",
                          fontSize: "10px",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "#d4a843",
                          marginBottom: "10px",
                        }}
                      >
                        {gap.seriesName}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-crimson)",
                          fontSize: "14px",
                          color: "#f0e0c0",
                          marginBottom: "4px",
                          lineHeight: 1.4,
                        }}
                      >
                        You finished{" "}
                        <em>{gap.lastBook.title}</em>
                        {gap.lastBook.seriesPosition != null &&
                          ` (Book ${gap.lastBook.seriesPosition})`}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-crimson)",
                          fontSize: "13px",
                          fontStyle: "italic",
                          color: "rgba(240,224,192,0.5)",
                          marginBottom: "16px",
                        }}
                      >
                        Book {gap.nextPosition}
                        {gap.seriesTotal ? ` of ${gap.seriesTotal}` : ""} is next —{" "}
                        not yet in your library
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          style={GOLD_BTN}
                          onClick={() => {
                            const q = `${gap.seriesName} book ${gap.nextPosition}`;
                            window.open(
                              `https://books.google.com/books?q=${encodeURIComponent(q)}`,
                              "_blank"
                            );
                          }}
                        >
                          <Search size={10} />
                          Search
                        </button>

                        <button
                          style={{
                            ...GREEN_BTN,
                            opacity: addingGap === gap.seriesName ? 0.6 : 1,
                          }}
                          disabled={addingGap === gap.seriesName}
                          onClick={() => addNextBookToTBR(gap)}
                        >
                          {addingGap === gap.seriesName ? (
                            <>
                              <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                              Adding…
                            </>
                          ) : (
                            <>
                              <Plus size={10} />
                              Add to TBR
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state when both sections are empty */}
            {tbrBooks.length === 0 && seriesGaps.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 40px",
                  color: "rgba(240,224,192,0.3)",
                }}
              >
                <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.4 }}>
                  📚
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-cinzel)",
                    fontSize: "13px",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                  }}
                >
                  Your queue is empty
                </div>
                <div style={{ fontStyle: "italic", fontSize: "15px" }}>
                  <Link
                    href="/import"
                    style={{ color: "#d4a843", textDecoration: "none" }}
                  >
                    Import books
                  </Link>{" "}
                  to start building your reading queue.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Spin keyframe for loader */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
