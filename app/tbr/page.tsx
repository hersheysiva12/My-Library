"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  isLibbyHold: boolean;
}

interface AllBook {
  id: string;
  title: string;
  author: string | null;
  status: string;
  seriesName: string | null;
  seriesPosition: number | null;
  seriesTotal: number | null;
  seriesStatus: string | null;
  nextBookReleaseDate: string | null;
}

type SeriesGapKind = "ready" | "need-to-get" | "coming-soon";

interface SeriesGap {
  seriesName: string;
  lastBook: AllBook;
  nextPosition: number;
  seriesTotal: number | null;
  kind: SeriesGapKind;
  nextBookInLibrary?: AllBook;
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
    .replace(/&source=gbs_api/g, "");
}

function bestGoogleCover(imageLinks: Record<string, string> | undefined): string | undefined {
  if (!imageLinks) return undefined;
  return imageLinks.extraLarge ?? imageLinks.large ?? imageLinks.medium ?? imageLinks.thumbnail ?? imageLinks.smallThumbnail;
}

/* ─────────────────────────────────────────────────────────
   LibbyCoverImg — self-contained cover fetcher for Libby books
   Fetches a Google Books cover when the stored URL is missing/non-Google.
───────────────────────────────────────────────────────── */
function isGoogleCoverUrl(url: string | null): boolean {
  return !!url && (url.includes("books.google") || url.includes("googleusercontent"));
}

function LibbyCoverImg({ bookId, title, author, initialUrl }: {
  bookId: string;
  title: string;
  author: string;
  initialUrl: string | null;
}) {
  const [src, setSrc] = useState<string | null>(initialUrl);

  useEffect(() => {
    // If we already have a good Google Books URL, nothing to do
    if (isGoogleCoverUrl(src)) return;

    const controller = new AbortController();
    const q = `${title} ${author}`.trim();

    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || controller.signal.aborted) return;
        const item = (data.items ?? []).find((i: { volumeInfo?: { imageLinks?: Record<string, string> } }) => i?.volumeInfo?.imageLinks) ?? data.items?.[0];
        const raw = bestGoogleCover(item?.volumeInfo?.imageLinks);
        if (!raw) return;
        const url = cleanCoverUrl(raw);
        setSrc(url);
        // Persist to Supabase so subsequent page loads skip the fetch
        supabase.from("books").update({ cover_url: url }).eq("id", bookId).then(() => {});
      })
      .catch(() => {});

    return () => controller.abort();
  // Re-run if the book changes; src intentionally omitted to avoid loop after setSrc
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, title, author]);

  if (!src) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: "18px", opacity: 0.3 }}>
        📖
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setSrc(null)}
    />
  );
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
    isLibbyHold: row.format_source?.includes("hold") ?? false,
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
  const dateBackfillRef = useRef(false);

  /* Libby availability */
  const [libbyCard, setLibbyCard] = useState<LibbyCard | null>(null);
  const [librarySlug, setLibrarySlug] = useState<string>("");
  const [availability, setAvailability] = useState<Record<string, AvailabilityResult>>({});

  /* ── Load data ── */
  const loadAllBooks = useCallback(async () => {
    const { data } = await supabase
      .from("books")
      .select("id, title, author, status, series_name, series_position, series_total, series_status, next_book_release_date")
      .order("created_at", { ascending: true });
    if (data) {
      setAllBooks(
        (data as Pick<DbBook, "id" | "title" | "author" | "status" | "series_name" | "series_position" | "series_total" | "series_status" | "next_book_release_date">[]).map((r) => ({
          id: r.id,
          title: r.title,
          author: r.author,
          status: r.status,
          seriesName: r.series_name,
          seriesPosition: r.series_position,
          seriesTotal: r.series_total,
          seriesStatus: r.series_status,
          nextBookReleaseDate: r.next_book_release_date,
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
      // Skip series explicitly marked complete
      if (book.seriesStatus === "complete") return;
      // Skip if we've read all known books in the series
      if (book.seriesTotal != null && pos >= book.seriesTotal) return;

      const nextPos = pos + 1;
      const nextInLibrary = allBooks.find(
        (b) => b.seriesName === seriesName && b.seriesPosition === nextPos
      );

      if (nextInLibrary && (nextInLibrary.status === "tbr-owned" || nextInLibrary.status === "tbr-not-owned")) {
        // Sub-section 1: Next book already on shelf, ready to read
        gaps.push({ seriesName, lastBook: book, nextPosition: nextPos, seriesTotal: book.seriesTotal, kind: "ready", nextBookInLibrary: nextInLibrary });
      } else if (!nextInLibrary) {
        // A future release date → coming-soon; otherwise need-to-get
        const releaseDate = book.nextBookReleaseDate;
        const isFuture = releaseDate ? new Date(releaseDate) > new Date() : false;
        if (isFuture) {
          gaps.push({ seriesName, lastBook: book, nextPosition: nextPos, seriesTotal: book.seriesTotal, kind: "coming-soon" });
        } else {
          gaps.push({ seriesName, lastBook: book, nextPosition: nextPos, seriesTotal: book.seriesTotal, kind: "need-to-get" });
        }
      }
      // If nextInLibrary exists but is already read/reading/dnf, skip — they're on track
    });
    return gaps;
  }, [allBooks]);

  /* ── Auto-fetch release dates for series gaps from Google Books ── */
  useEffect(() => {
    if (dateBackfillRef.current || allBooks.length === 0) return;

    // Identify gaps that don't have a stored release date yet
    const finished = allBooks.filter(b => b.status === "read" && b.seriesName && b.seriesPosition != null);
    const highestFinished = new Map<string, { book: AllBook; pos: number }>();
    for (const b of finished) {
      const cur = highestFinished.get(b.seriesName!);
      if (!cur || b.seriesPosition! > cur.pos)
        highestFinished.set(b.seriesName!, { book: b, pos: b.seriesPosition! });
    }
    const toFetch: { book: AllBook; nextPos: number }[] = [];
    highestFinished.forEach(({ book, pos }) => {
      if (book.seriesStatus === "complete") return;
      if (book.seriesTotal != null && pos >= book.seriesTotal) return;
      // Skip only if stored date is plausible — re-fetch if date looks wrong (e.g. 1911)
      if (book.nextBookReleaseDate) {
        const storedYear = parseInt(book.nextBookReleaseDate.slice(0, 4));
        const currentYear = new Date().getFullYear();
        if (storedYear >= currentYear - 10 && storedYear <= currentYear + 10) return;
        // stored date is implausible — fall through and re-fetch
      }
      const nextInLibrary = allBooks.some(b => b.seriesName === book.seriesName && b.seriesPosition === pos + 1);
      if (!nextInLibrary) toFetch.push({ book, nextPos: pos + 1 });
    });
    if (toFetch.length === 0) return;

    dateBackfillRef.current = true;

    async function fetchReleaseDates() {
      const currentYear = new Date().getFullYear();
      for (const { book, nextPos } of toFetch) {
        // Track whether we're replacing a known-bad stored date
        const replacingBadDate = !!book.nextBookReleaseDate;
        let savedValidDate = false;
        try {
          // Include author in the query to avoid false matches on unrelated books
          const q = [book.seriesName, `book ${nextPos}`, book.author].filter(Boolean).join(" ");
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          if (res.ok) {
            const data = await res.json();
            const rawDate = data.items?.[0]?.volumeInfo?.publishedDate as string | undefined;
            if (rawDate) {
              // Normalise to YYYY-MM-DD
              let normalized: string | null = null;
              if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) normalized = rawDate;
              else if (/^\d{4}-\d{2}$/.test(rawDate)) normalized = `${rawDate}-01`;
              else if (/^\d{4}$/.test(rawDate)) normalized = `${rawDate}-07-01`;

              if (normalized) {
                const year = parseInt(normalized.slice(0, 4));
                if (year >= currentYear - 10 && year <= currentYear + 10) {
                  await supabase.from("books").update({ next_book_release_date: normalized }).eq("id", book.id);
                  setAllBooks(prev => prev.map(b => b.id === book.id ? { ...b, nextBookReleaseDate: normalized } : b));
                  savedValidDate = true;
                }
              }
            }
          }
        } catch { /* fail silently */ }

        // If we were replacing a bad stored date but couldn't find a valid one, clear it
        // so the card shows "TBD" instead of the wrong date
        if (replacingBadDate && !savedValidDate) {
          await supabase.from("books").update({ next_book_release_date: null }).eq("id", book.id);
          setAllBooks(prev => prev.map(b => b.id === book.id ? { ...b, nextBookReleaseDate: null } : b));
        }
      }
    }
    fetchReleaseDates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBooks.length]);

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
            {/* ── Libby Holds (above TBR queue) ── */}
            {(() => {
              const holdBooks  = tbrBooks.filter(b => b.isLibbyHold);
              if (holdBooks.length === 0) return null;
              return (
                <section style={{ marginBottom: "48px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px",
                    marginBottom: "20px", paddingBottom: "12px",
                    borderBottom: "1px solid rgba(147,112,219,0.2)" }}>
                    <span style={{ fontSize: "14px" }}>☽</span>
                    <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px",
                      letterSpacing: "0.2em", textTransform: "uppercase",
                      color: "rgba(147,112,219,0.8)" }}>
                      Libby Holds
                    </span>
                    <span style={{ fontFamily: "var(--font-crimson)", fontSize: "12px",
                      fontStyle: "italic", color: "rgba(147,112,219,0.4)" }}>
                      ({holdBooks.length})
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {holdBooks.map(book => (
                      <div key={book.id} style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "10px 16px",
                        background: "rgba(147,112,219,0.04)",
                        border: "1px solid rgba(147,112,219,0.18)",
                        borderRadius: "8px",
                      }}>
                        {/* Cover */}
                        <div style={{ width: "40px", height: "58px", flexShrink: 0,
                          borderRadius: "2px", overflow: "hidden",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)" }}>
                          <LibbyCoverImg
                            bookId={book.id}
                            title={book.title}
                            author={book.author}
                            initialUrl={book.coverUrl}
                          />
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-cinzel)", fontSize: "12px",
                            color: "#f0e0c0", letterSpacing: "0.04em",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            marginBottom: "3px" }}>
                            {book.title}
                          </div>
                          <div style={{ fontFamily: "var(--font-crimson)", fontSize: "13px",
                            fontStyle: "italic", color: "rgba(240,224,192,0.55)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            marginBottom: book.seriesName ? "4px" : 0 }}>
                            {book.author}
                          </div>
                          {book.seriesName && (
                            <div style={{ fontFamily: "var(--font-crimson)", fontSize: "11px",
                              color: "rgba(212,168,67,0.5)" }}>
                              {book.seriesName}{book.seriesPosition ? ` #${book.seriesPosition}` : ""}
                            </div>
                          )}
                        </div>

                        {/* Badge */}
                        <div style={{ flexShrink: 0, padding: "3px 10px", borderRadius: "999px",
                          background: "rgba(147,112,219,0.15)",
                          border: "1px solid rgba(147,112,219,0.35)",
                          fontFamily: "var(--font-cinzel)", fontSize: "9px",
                          letterSpacing: "0.1em", textTransform: "uppercase" as const,
                          color: "rgba(180,160,220,0.9)", whiteSpace: "nowrap" as const }}>
                          On Hold
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* ── Section 1: TBR List ── */}
            {(() => {
              const queueBooks = tbrBooks.filter(b => !b.isLibbyHold);
              return (
            <section id="tbr-list" style={{ marginBottom: "64px" }}>
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
                  {queueBooks.length} {queueBooks.length === 1 ? "book" : "books"}
                </span>
              </div>

              {queueBooks.length === 0 ? (
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
                        {queueBooks.map((book, i) => (
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
                                  {book.formatSource?.startsWith("libby") ? (
                                    <LibbyCoverImg
                                      bookId={book.id}
                                      title={book.title}
                                      author={book.author}
                                      initialUrl={book.coverUrl}
                                    />
                                  ) : book.coverUrl ? (
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
              );
            })()}

            {/* ── Section 2: Next in Series ── */}
            {seriesGaps.length > 0 && (() => {
              const readyGaps    = seriesGaps.filter(g => g.kind === "ready");
              const needGaps     = seriesGaps.filter(g => g.kind === "need-to-get");
              const soonGaps     = seriesGaps.filter(g => g.kind === "coming-soon");

              const CARD_GRID: React.CSSProperties = {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px",
                marginBottom: "28px",
              };

              const SubHeading = ({ label, color = "rgba(212,168,67,0.45)" }: { label: string; color?: string }) => (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "20px 0 14px" }}>
                  <div style={{ flex: 1, height: "1px", background: color }} />
                  <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.2em",
                    textTransform: "uppercase", color, whiteSpace: "nowrap" }}>{label}</span>
                  <div style={{ flex: 1, height: "1px", background: color }} />
                </div>
              );

              const SeriesCard = ({ gap }: { gap: SeriesGap }) => (
                <div
                  key={gap.seriesName}
                  style={{
                    background: "rgba(212,168,67,0.04)",
                    border: "1px solid rgba(212,168,67,0.22)",
                    borderTop: gap.kind === "ready" ? "3px solid rgba(109,204,154,0.5)"
                      : gap.kind === "coming-soon" ? "3px solid rgba(147,112,219,0.5)"
                      : "3px solid rgba(212,168,67,0.45)",
                    borderRadius: "12px",
                    padding: "20px",
                    boxShadow: "0 0 20px rgba(212,168,67,0.06)",
                  }}
                >
                  {/* Series name */}
                  <div style={{ fontFamily: "var(--font-cinzel)", fontSize: "10px",
                    letterSpacing: "0.18em", textTransform: "uppercase", color: "#d4a843", marginBottom: "10px" }}>
                    {gap.seriesName}
                  </div>

                  {/* Last read */}
                  <div style={{ fontFamily: "var(--font-crimson)", fontSize: "14px",
                    color: "#f0e0c0", marginBottom: "4px", lineHeight: 1.4 }}>
                    You finished <em>{gap.lastBook.title}</em>
                    {gap.lastBook.seriesPosition != null && ` (Book ${gap.lastBook.seriesPosition})`}
                  </div>

                  {/* Sub-text by kind */}
                  {gap.kind === "ready" && (
                    <div style={{ fontFamily: "var(--font-crimson)", fontSize: "13px",
                      fontStyle: "italic", color: "rgba(109,204,154,0.7)", marginBottom: "16px" }}>
                      Book {gap.nextPosition}{gap.seriesTotal ? ` of ${gap.seriesTotal}` : ""} is waiting on your shelf
                    </div>
                  )}
                  {gap.kind === "need-to-get" && (
                    <div style={{ fontFamily: "var(--font-crimson)", fontSize: "13px",
                      fontStyle: "italic", color: "rgba(240,224,192,0.5)", marginBottom: "16px" }}>
                      Book {gap.nextPosition}{gap.seriesTotal ? ` of ${gap.seriesTotal}` : ""} is next — not yet in your library
                      {gap.lastBook.nextBookReleaseDate && (
                        <span style={{ color: "rgba(212,168,67,0.7)" }}>
                          {" "}· Published {new Date(gap.lastBook.nextBookReleaseDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  )}
                  {gap.kind === "coming-soon" && (
                    <div style={{ fontFamily: "var(--font-crimson)", fontSize: "13px",
                      fontStyle: "italic", color: "rgba(147,112,219,0.7)", marginBottom: "16px" }}>
                      Book {gap.nextPosition}{gap.seriesTotal ? ` of ${gap.seriesTotal}` : ""} is coming
                      {gap.lastBook.nextBookReleaseDate
                        ? ` — ${new Date(gap.lastBook.nextBookReleaseDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
                        : " — TBD"}
                    </div>
                  )}

                  {/* Action buttons by kind */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {gap.kind === "ready" && (
                      <a
                        href="#tbr-list"
                        style={{ ...GREEN_BTN, textDecoration: "none" }}
                      >
                        <BookOpen size={10} />
                        View in TBR Queue
                      </a>
                    )}

                    {gap.kind === "need-to-get" && (
                      <>
                        <button
                          style={GOLD_BTN}
                          onClick={() => {
                            const q = `${gap.seriesName} book ${gap.nextPosition}`;
                            window.open(`https://books.google.com/books?q=${encodeURIComponent(q)}`, "_blank");
                          }}
                        >
                          <Search size={10} />
                          Search
                        </button>
                        <button
                          style={{ ...GREEN_BTN, opacity: addingGap === gap.seriesName ? 0.6 : 1 }}
                          disabled={addingGap === gap.seriesName}
                          onClick={() => addNextBookToTBR(gap)}
                        >
                          {addingGap === gap.seriesName ? (
                            <><Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />Adding…</>
                          ) : (
                            <><Plus size={10} />Add to TBR</>
                          )}
                        </button>
                      </>
                    )}

                    {gap.kind === "coming-soon" && (
                      <button
                        style={GOLD_BTN}
                        onClick={() => {
                          const q = `${gap.seriesName} book ${gap.nextPosition}`;
                          window.open(`https://books.google.com/books?q=${encodeURIComponent(q)}`, "_blank");
                        }}
                      >
                        <Search size={10} />
                        Check for Updates
                      </button>
                    )}
                  </div>
                </div>
              );

              return (
                <section>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px",
                    marginBottom: "8px", paddingBottom: "12px", borderBottom: "1px solid rgba(212,168,67,0.1)" }}>
                    <span style={{ fontSize: "14px" }}>✦</span>
                    <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px",
                      letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(212,168,67,0.7)" }}>
                      Next in Series
                    </span>
                  </div>

                  {addError && (
                    <div style={{ marginBottom: "16px", padding: "10px 16px",
                      background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                      borderRadius: "8px", color: "#f87171", fontFamily: "var(--font-crimson)", fontSize: "13px" }}>
                      {addError}
                    </div>
                  )}

                  {readyGaps.length > 0 && (
                    <>
                      <SubHeading label="Ready to Read" color="rgba(109,204,154,0.4)" />
                      <div style={CARD_GRID}>{readyGaps.map(g => <SeriesCard key={g.seriesName} gap={g} />)}</div>
                    </>
                  )}

                  {needGaps.length > 0 && (
                    <>
                      <SubHeading label="Need to Get" color="rgba(212,168,67,0.4)" />
                      <div style={CARD_GRID}>{needGaps.map(g => <SeriesCard key={g.seriesName} gap={g} />)}</div>
                    </>
                  )}

                  {soonGaps.length > 0 && (
                    <>
                      <SubHeading label="Coming Soon" color="rgba(147,112,219,0.4)" />
                      <div style={CARD_GRID}>{soonGaps.map(g => <SeriesCard key={g.seriesName} gap={g} />)}</div>
                    </>
                  )}
                </section>
              );
            })()}

            {/* Empty state when both sections are empty */}
            {tbrBooks.filter(b => !b.isLibbyHold).length === 0 && seriesGaps.length === 0 && (
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
