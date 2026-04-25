"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { Upload, Search, BookOpen, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ─────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────── */
type Phase = "idle" | "parsing" | "previewing" | "importing" | "done";
type AppStatus = "tbr-owned" | "tbr-not-owned" | "reading" | "read" | "dnf";

interface GoodreadsRow {
  Title: string;
  Author: string;
  "My Rating": string;
  "Date Read": string;
  Bookshelves: string;
  "Exclusive Shelf": string;
  ISBN: string;
  "Number of Pages": string;
  "Year Published": string;
}

interface IsbnBook {
  title: string;
  author: string;
  coverUrl: string | null;
  googleBooksId: string;
  year: string | null;
  pageCount: number | null;
}

interface InsertRow {
  title: string;
  author: string | null;
  cover_url: string | null;
  google_books_id: string | null;
  status: string;
  date_finished: string | null;
  format: string;
  page_count: number | null;
  shelf_number: number;
  sort_order: number;
}

type RefreshPhase = "idle" | "parsing" | "analyzing" | "reviewing" | "importing" | "done";

interface RatingChange {
  id: string;
  title: string;
  author: string | null;
  oldRating: number | null;
  newRating: number;
}

/* ─────────────────────────────────────────────────────────
   OverDrive / Libby types
───────────────────────────────────────────────────────── */
interface ODLoan {
  id: string;
  title: { text: string };
  firstCreatorName?: string;
  covers?: { cover150Wide?: { href: string }; cover300Wide?: { href: string } };
  expires?: string;
  formats?: { id: string }[];
  seriesInfo?: { name: string; readingOrder?: number; totalCount?: number };
}

interface ODHold {
  id: string;
  title: { text: string };
  firstCreatorName?: string;
  covers?: { cover150Wide?: { href: string }; cover300Wide?: { href: string } };
  formats?: { id: string }[];
  seriesInfo?: { name: string; readingOrder?: number; totalCount?: number };
}

function odFormat(formats?: { id: string }[]): { format: string | null; format_source: string } {
  const ids = (formats ?? []).map((f) => f.id);
  if (ids.some((id) => id.startsWith("audiobook"))) return { format: "audiobook", format_source: "libby-loan" };
  return { format: "ebook", format_source: "libby-loan" };
}

function odCover(covers?: ODLoan["covers"]): string | null {
  const raw = covers?.cover300Wide?.href ?? covers?.cover150Wide?.href;
  return raw ? raw.replace(/^http:\/\//, "https://") : null;
}

function odTitle(t: ODLoan["title"] | undefined): string {
  if (!t) return "Unknown Title";
  if (typeof t === "string") return t as string;
  return (t as { text?: string }).text ?? "Unknown Title";
}

function mapLoanToRow(l: ODLoan) {
  const { format, format_source } = odFormat(l.formats);
  return {
    title: odTitle(l.title),
    author: l.firstCreatorName ?? "Unknown",
    cover_url: odCover(l.covers),
    google_books_id: l.id,
    status: "reading",
    format,
    format_source,
    return_date: l.expires ?? null,
    series_name: l.seriesInfo?.name ?? null,
    series_position: l.seriesInfo?.readingOrder ?? null,
    series_total: l.seriesInfo?.totalCount ?? null,
  };
}

function mapHoldToRow(h: ODHold) {
  const { format, format_source } = odFormat(h.formats);
  return {
    title: odTitle(h.title),
    author: h.firstCreatorName ?? "Unknown",
    cover_url: odCover(h.covers),
    google_books_id: h.id,
    status: "tbr-not-owned",
    format,
    format_source: format_source.replace("loan", "hold"),
    series_name: h.seriesInfo?.name ?? null,
    series_position: h.seriesInfo?.readingOrder ?? null,
    series_total: h.seriesInfo?.totalCount ?? null,
  };
}

/* ─────────────────────────────────────────────────────────
   Pure helpers
───────────────────────────────────────────────────────── */
/** Normalise a raw Google Books image URL:
 *  - HTTPS
 *  - Remove the page-curl 3-D effect (&edge=curl)
 *  - Remove tracking noise (&source=gbs_api)
 *  Resolution is handled by bestGoogleCover() picking extraLarge/large/medium
 *  before thumbnail — so we never need to rewrite the zoom value here. */
function cleanCoverUrl(raw: string): string {
  return raw
    .replace(/^http:\/\//, "https://")
    .replace(/&edge=curl/g, "")
    .replace(/&source=gbs_api/g, "");
}

/** Pick the best available Google Books cover URL from an imageLinks object,
 *  preferring the highest-resolution source. */
function bestGoogleCover(imageLinks: Record<string, string> | undefined): string | undefined {
  if (!imageLinks) return undefined;
  return (
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail
  );
}

/** Try to get a real cover from Open Library using the book's ISBN.
 *  Returns null if Open Library doesn't have it (redirects to placeholder). */
async function openLibraryCover(identifiers: Array<{ type: string; identifier: string }> | undefined): Promise<string | null> {
  if (!identifiers?.length) return null;
  const isbn = (identifiers.find(i => i.type === "ISBN_13") ?? identifiers.find(i => i.type === "ISBN_10"))?.identifier;
  if (!isbn) return null;
  try {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    const res = await fetch(url);
    // Open Library redirects to a placeholder when no cover exists
    if (res.ok && !res.redirected) return url;
  } catch { /* ignore */ }
  return null;
}

/** Strip all parenthetical content from titles (e.g. Goodreads series info). */
function stripSeriesFromTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)/g, "").trim();
}

function extractSeriesFromTitle(title: string): { seriesName: string; position: number } | null {
  const m = title.match(
    /\(([^)]+?)(?:,\s*(?:book|vol\.?|volume|part|#)?\s*)([\d.]+)\s*\)/i
  );
  if (!m) return null;
  const position = parseFloat(m[2]);
  if (isNaN(position)) return null;
  return { seriesName: m[1].trim(), position };
}

function stripIsbn(raw: string): string | null {
  const match = raw?.match(/^="?([0-9X]+)"?$/);
  return match ? match[1] : (raw?.trim() || null);
}

function convertDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/\//g, "-");
  // Must match YYYY-MM-DD exactly; reject "0000-00-00", year-only, etc.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (s === "0000-00-00") return null;
  return s;
}


function convertRating(raw: string): number | null {
  const n = parseInt(raw, 10);
  return n > 0 && n <= 5 ? n : null;
}

function mapStatus(row: GoodreadsRow): AppStatus {
  const shelf = (row["Exclusive Shelf"] ?? "").toLowerCase().trim();
  if (shelf === "read") return "read";
  if (shelf === "currently-reading") return "reading";
  return "tbr-owned";
}

function resolveFormat(fmt: string): { format: string; format_source: string | null } {
  if (fmt === "ebook-kindle") return { format: "ebook", format_source: "kindle" };
  if (fmt === "ebook-libby") return { format: "ebook", format_source: "libby" };
  if (fmt === "audiobook") return { format: "audiobook", format_source: null };
  return { format: "physical", format_source: null };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Mirrors BookSpine formula in page.tsx: 30–39px per spine */
function calcImportSpineWidth(author: string | null): number {
  const code = (author ?? "").charCodeAt(0);
  return 30 + (isNaN(code) ? 0 : code % 10);
}

const DEFAULT_SHELF_WIDTH = 820; // px — conservative; ~900px container minus padding

/** Pack rows onto shelves, assigning shelf_number and sort_order. */
function assignShelves(rows: Omit<InsertRow, "shelf_number" | "sort_order">[]): InsertRow[] {
  let shelf = 0;
  let used = 0;
  const shelfCounts: number[] = [0];
  return rows.map((row) => {
    const w = calcImportSpineWidth(row.author);
    if (used + w > DEFAULT_SHELF_WIDTH && used > 0) {
      shelf++;
      used = 0;
      shelfCounts[shelf] = 0;
    }
    const sort_order = shelfCounts[shelf]++;
    used += w;
    return { ...row, shelf_number: shelf, sort_order };
  });
}

/* ─────────────────────────────────────────────────────────
   Atmospheric components (inlined from page.tsx)
───────────────────────────────────────────────────────── */
function CeilingGlow() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "45vh", pointerEvents: "none", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% -5%, rgba(220,160,40,0.38) 0%, rgba(180,100,20,0.18) 25%, rgba(100,60,10,0.06) 55%, transparent 75%)",
      }} />
    </div>
  );
}

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
   Shared style helpers
───────────────────────────────────────────────────────── */
const SECTION_HEADING: React.CSSProperties = {
  fontFamily: "var(--font-cinzel)",
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "rgba(212,168,67,0.7)",
  marginBottom: "20px",
};

const GOLD_BUTTON: React.CSSProperties = {
  padding: "10px 24px",
  background: "rgba(212,168,67,0.15)",
  border: "1px solid rgba(212,168,67,0.4)",
  borderRadius: "8px",
  fontFamily: "var(--font-cinzel)",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#d4a843",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  transition: "all 0.2s ease",
};

const STATUS_LABELS: Record<AppStatus, string> = {
  "tbr-owned":     "TBR (Own)",
  "tbr-not-owned": "TBR (Want)",
  reading:         "Reading",
  read:            "Read",
  dnf:             "DNF",
};

/* ─────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────── */
export default function ImportPage() {
  const router = useRouter();

  /* Phase */
  const [phase, setPhase] = useState<Phase>("idle");

  /* Active tab */
  const [activeTab, setActiveTab] = useState<"import" | "refresh" | "libby">("import");

  /* Libby */
  const [libbyToken, setLibbyToken] = useState<string | null>(null);
  const [libbyInputCode, setLibbyInputCode] = useState(""); // code the user types from Libby
  const [libbyCards, setLibbyCards] = useState<{ advantageKey: string; websiteId: number; cardName: string }[]>([]);
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const [libbyPhase, setLibbyPhase] = useState<"setup" | "code" | "importing" | "done">("setup");
  const [libbyLoansSynced, setLibbyLoansSynced] = useState(0);
  const [libbyHoldsSynced, setLibbyHoldsSynced] = useState(0);
  const [libbyUpdated, setLibbyUpdated] = useState(0);
  const [libbySkipped, setLibbySkipped] = useState(0);
  const [libbyError, setLibbyError] = useState<string | null>(null);

  /* CSV */
  const [parsedRows, setParsedRows] = useState<GoodreadsRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Refresh mode */
  const [refreshPhase, setRefreshPhase] = useState<RefreshPhase>("idle");
  const [refreshParsed, setRefreshParsed] = useState<GoodreadsRow[]>([]);
  const [refreshIsDragging, setRefreshIsDragging] = useState(false);
  const refreshFileRef = useRef<HTMLInputElement>(null);
  const [refreshNew, setRefreshNew] = useState<GoodreadsRow[]>([]);
  const [ratingChanges, setRatingChanges] = useState<RatingChange[]>([]);
  const [selectedNew, setSelectedNew] = useState<Set<number>>(new Set());
  const [selectedRatingIds, setSelectedRatingIds] = useState<Set<string>>(new Set());
  const [refreshTotal, setRefreshTotal] = useState(0);
  const [refreshDone, setRefreshDone] = useState(0);
  const [refreshCovers, setRefreshCovers] = useState(0);
  const [refreshSummary, setRefreshSummary] = useState<{ imported: number; ratingsUpdated: number } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  /* Import progress */
  const [importTotal, setImportTotal] = useState(0);
  const [importDone, setImportDone] = useState(0);
  const [coversFound, setCoversFound] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const [summary, setSummary] = useState<{ total: number; covers: number; dupes: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  /* Shelf repack */
  const [repacking, setRepacking] = useState(false);
  const [repackDone, setRepackDone] = useState(false);
  const [repackError, setRepackError] = useState<string | null>(null);

  /* Title fix */
  const [fixingTitles, setFixingTitles] = useState(false);
  const [fixTitlesDone, setFixTitlesDone] = useState<number | null>(null);
  const [fixTitlesError, setFixTitlesError] = useState<string | null>(null);

  /* Utilities collapsed state */
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);

  /* Dedupe */
  const [deduping, setDeduping] = useState(false);
  const [dedupeDone, setDedupeDone] = useState<number | null>(null);
  const [dedupeError, setDedupeError] = useState<string | null>(null);

  /* Cover refresh */
  const [coverRefreshing, setCoverRefreshing] = useState(false);
  const [coverRefreshTotal, setCoverRefreshTotal] = useState(0);
  const [coverRefreshDone, setCoverRefreshDone] = useState(0);
  const [coverRefreshUpdated, setCoverRefreshUpdated] = useState<number | null>(null);
  const [coverRefreshError, setCoverRefreshError] = useState<string | null>(null);

  /* Backfill page counts */
  const [backfillPCRunning, setBackfillPCRunning] = useState(false);
  const [backfillPCTotal, setBackfillPCTotal] = useState(0);
  const [backfillPCDone, setBackfillPCDone] = useState(0);
  const [backfillPCResult, setBackfillPCResult] = useState<number | null>(null);
  const [backfillPCError, setBackfillPCError] = useState<string | null>(null);

  /* ISBN */
  const [isbnInput, setIsbnInput] = useState("");
  const [isbnLoading, setIsbnLoading] = useState(false);
  const [isbnResult, setIsbnResult] = useState<IsbnBook | null>(null);
  const [isbnNotFound, setIsbnNotFound] = useState(false);
  const [isbnFormat, setIsbnFormat] = useState("physical");
  const [isbnStatus, setIsbnStatus] = useState<AppStatus>("tbr-owned");
  const [isbnAdding, setIsbnAdding] = useState(false);
  const [isbnAlreadyExists, setIsbnAlreadyExists] = useState(false);

  /* ── Libby: load saved credentials from localStorage on mount ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("libbyAuth");
      if (saved) {
        const { token, cards, selectedCardKey: savedKey } = JSON.parse(saved);
        if (token && cards?.length) {
          setLibbyToken(token);
          setLibbyCards(cards);
          setSelectedCardKey(savedKey ?? cards[0].advantageKey);
        }
      }
    } catch { /* ignore */ }
  }, []);

  function libbyCardLabel(key: string | null) {
    const card = libbyCards.find((c) => c.advantageKey === key);
    return card?.cardName ?? key ?? "your library";
  }

  async function safeJson(res: Response): Promise<Record<string, unknown>> {
    try {
      const text = await res.text();
      if (!text.trim()) return {};
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  async function importLibbyData(loans: ODLoan[], holds: ODHold[]) {
    // Fetch broader existing set for title+author dedup in addition to google_books_id dedup
    const { data: existing } = await supabase
      .from("books")
      .select("id, google_books_id, title, author, status");

    const byId = new Map(
      (existing ?? []).filter(r => r.google_books_id)
        .map(r => [r.google_books_id as string, r as { id: string; status: string }])
    );
    const byKey = new Map(
      (existing ?? []).map(r => [
        `${(r.title ?? "").toLowerCase().trim()}::${(r.author ?? "").toLowerCase().trim()}`,
        r as { id: string; status: string }
      ])
    );

    const loanRows: ReturnType<typeof mapLoanToRow>[] = [];
    const holdRows: ReturnType<typeof mapHoldToRow>[] = [];
    const loanUpdates: Array<{ id: string; u: Record<string, unknown> }> = [];
    let skipped = 0;

    for (const loan of loans) {
      const mapped = mapLoanToRow(loan);
      const key = `${mapped.title.toLowerCase().trim()}::${(mapped.author ?? "").toLowerCase().trim()}`;
      const match = byId.get(loan.id) ?? byKey.get(key);
      if (!match) {
        loanRows.push(mapped);
      } else if (match.status === "tbr-owned" || match.status === "tbr-not-owned") {
        // Upgrade existing TBR book to reflect active Libby loan
        loanUpdates.push({ id: match.id, u: {
          status: "reading",
          format: mapped.format,
          format_source: mapped.format_source,
          return_date: mapped.return_date ?? null,
          google_books_id: loan.id,
        }});
      } else {
        skipped++;
      }
    }
    for (const hold of holds) {
      const mapped = mapHoldToRow(hold);
      const key = `${mapped.title.toLowerCase().trim()}::${(mapped.author ?? "").toLowerCase().trim()}`;
      const match = byId.get(hold.id) ?? byKey.get(key);
      if (!match) holdRows.push(mapped);
      else skipped++;
    }

    if (loanRows.length > 0) {
      const { error: le } = await supabase.from("books").insert(loanRows);
      if (le) console.error("[libby insert loans]", le.message, le.details, le.hint);
    }
    if (holdRows.length > 0) {
      const { error: he } = await supabase.from("books").insert(holdRows);
      if (he) console.error("[libby insert holds]", he.message, he.details, he.hint);
    }
    for (const { id, u } of loanUpdates) {
      await supabase.from("books").update(u).eq("id", id);
    }

    // Replace OverDrive CDN cover URLs with permanent covers from Google Books / Open Library.
    // If neither source has the cover, the OverDrive URL stays as a fallback.
    const allNewRows = [...loanRows, ...holdRows];
    for (const row of allNewRows) {
      try {
        const cleanTitle = row.title.replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/[^\w\s'-]/g, " ").trim();
        const cleanAuthor = (row.author ?? "").trim();
        const authorLastName = cleanAuthor.split(" ").pop() ?? cleanAuthor;
        const titleKeyword = cleanTitle.split(" ").filter(w => !["the","a","an"].includes(w.toLowerCase()))[0] ?? cleanTitle.split(" ")[0];

        type GbItem = { volumeInfo?: { title?: string; pageCount?: number; imageLinks?: Record<string, string>; industryIdentifiers?: Array<{ type: string; identifier: string }> } };

        let bestCoverUrl: string | null = null;
        let bestPageCount: number | null = null;
        for (const q of [`intitle:"${cleanTitle}" inauthor:${authorLastName}`, `${cleanTitle} ${cleanAuthor}`, `intitle:"${cleanTitle}"`, cleanTitle]) {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
          if (!res.ok) continue;
          const items: GbItem[] = (await res.json()).items ?? [];
          const item = items.find(i => i?.volumeInfo?.imageLinks && (i.volumeInfo.title ?? "").toLowerCase().includes(titleKeyword.toLowerCase()))
            ?? items.find(i => i?.volumeInfo?.imageLinks) ?? items[0];
          const raw = bestGoogleCover(item?.volumeInfo?.imageLinks);
          if (raw) {
            bestCoverUrl = cleanCoverUrl(raw);
            bestPageCount = item?.volumeInfo?.pageCount ?? null;
            break;
          }
          if (!bestCoverUrl && item?.volumeInfo?.industryIdentifiers) {
            bestCoverUrl = await openLibraryCover(item.volumeInfo.industryIdentifiers);
            if (bestCoverUrl) {
              bestPageCount = item?.volumeInfo?.pageCount ?? null;
              break;
            }
          }
        }
        const updates: Record<string, unknown> = {};
        if (bestCoverUrl) updates.cover_url = bestCoverUrl;
        if (bestPageCount) updates.page_count = bestPageCount;
        if (Object.keys(updates).length > 0) {
          await supabase.from("books").update(updates).eq("google_books_id", row.google_books_id);
        }
      } catch { /* fail silently */ }
    }

    setLibbyLoansSynced(loanRows.length);
    setLibbyHoldsSynced(holdRows.length);
    setLibbyUpdated(loanUpdates.length);
    setLibbySkipped(skipped);
    // Repack shelves so newly added books get proper shelf_number/sort_order
    await handleRepackShelves();
    setLibbyPhase("done");
  }

  async function handleLibbyConnect() {
    setLibbyError(null);
    setLibbyPhase("code");
    setLibbyInputCode("");

    const res = await fetch("/api/libby/auth", { method: "POST" });
    const data = await safeJson(res);

    if (!res.ok || !data.token) {
      const dbg = data.debug ? ` [${JSON.stringify(data.debug)}]` : "";
      setLibbyError(((data.error as string) ?? "Could not reach Libby servers. Try again.") + dbg);
      setLibbyPhase("setup");
      return;
    }

    setLibbyToken(data.token as string);
  }

  async function handleLibbyClone() {
    if (!libbyToken || !libbyInputCode.trim()) return;
    setLibbyError(null);
    setLibbyPhase("importing");

    const res = await fetch("/api/libby/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: libbyToken, code: libbyInputCode.trim() }),
    });
    const data = await safeJson(res);
    console.log("[libby clone]", JSON.stringify({ cards: data.cards, loansCount: (data.loans as unknown[])?.length, holdsCount: (data.holds as unknown[])?.length, debug: data.debug }));

    if (!res.ok) {
      const dbg = data.debug ? ` [${JSON.stringify(data.debug)}]` : "";
      setLibbyError(((data.error as string) ?? "Clone failed. Check the code and try again.") + dbg);
      setLibbyPhase("code");
      return;
    }

    const cards = (data.cards as typeof libbyCards) ?? [];
    const cardKey = cards[0]?.advantageKey ?? null;
    setLibbyCards(cards);
    setSelectedCardKey(cardKey);
    localStorage.setItem("libbyAuth", JSON.stringify({ token: libbyToken, cards, selectedCardKey: cardKey }));

    // Persist token to Supabase so the morning cron job can use it
    try {
      await supabase.from("libby_tokens").upsert(
        { id: 1, token: libbyToken!, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    } catch { /* non-critical */ }

    await importLibbyData(
      (data.loans as ODLoan[]) ?? [],
      (data.holds as ODHold[]) ?? []
    );
  }

  async function handleReSync() {
    if (!libbyToken) return;
    setLibbyError(null);
    setLibbyPhase("importing");

    const res = await fetch("/api/libby/sync", { headers: { Authorization: `Bearer ${libbyToken}` } });
    const data = await safeJson(res);

    if (!res.ok) {
      const isAuthError = res.status === 401 || res.status === 403 || (data.error as string) === "auth_expired";
      if (isAuthError) {
        // Token expired — clear credentials so user is prompted to reconnect
        setLibbyToken(null);
        setLibbyCards([]);
        setSelectedCardKey(null);
        localStorage.removeItem("libbyAuth");
        setLibbyError("Your Libby session has expired. Click Connect to sync again.");
      } else {
        setLibbyError((data.message as string) ?? "Sync failed — could not reach Libby servers.");
      }
      setLibbyPhase("setup");
      return;
    }

    await importLibbyData(
      (data.loans as ODLoan[]) ?? [],
      (data.holds as ODHold[]) ?? []
    );
  }

  async function handleLibbySync() {
    // kept for compatibility — routes to the right handler
    if (libbyToken) {
      await handleReSync();
    } else {
      await handleLibbyConnect();
    }
  }


  /* ── CSV: file ingestion ── */
  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) return;
    setPhase("parsing");
    const reader = new FileReader();
    reader.onload = (e) => {
      // Strip UTF-8 BOM if present — Goodreads CSVs often include one
      let text = e.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const result = Papa.parse<GoodreadsRow>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      setParsedRows(result.data.filter((r) => r.Title?.trim()));
      setPhase("previewing");
    };
    reader.readAsText(file, "UTF-8");
  }

  /* ── CSV: cover fetch per row ── */
  async function fetchCoverForRow(row: GoodreadsRow): Promise<{ cover_url: string | null; google_books_id: string | null; page_count: number | null }> {
    const isbn = stripIsbn(row.ISBN);
    const q = isbn ? `isbn:${isbn}` : `${row.Title} ${row.Author}`;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const item = data.items?.[0];
      if (!item) return { cover_url: null, google_books_id: null, page_count: null };
      const raw = bestGoogleCover(item.volumeInfo?.imageLinks);
      return {
        cover_url: raw ? cleanCoverUrl(raw) : null,
        google_books_id: item.id ?? null,
        page_count: item.volumeInfo?.pageCount ?? null,
      };
    } catch {
      return { cover_url: null, google_books_id: null, page_count: null };
    }
  }

  /* ── CSV: import orchestration ── */
  async function handleImportConfirm() {
    setPhase("importing");
    setImportError(null);

    // Single query: fetch all existing title+author pairs
    const { data: existing, error: existingError } = await supabase
      .from("books").select("title, author");
    if (existingError) console.error("Failed to fetch existing books:", existingError.message);
    const existingSet = new Set<string>(
      (existing ?? []).map((r) =>
        `${(r.title ?? "").toLowerCase().trim()}::${(r.author ?? "").toLowerCase().trim()}`
      )
    );

    // Partition into dupes vs. rows to import
    let dupeCount = 0;
    const rowsToImport = parsedRows.filter((row) => {
      const key = `${row.Title.toLowerCase().trim()}::${row.Author.toLowerCase().trim()}`;
      if (existingSet.has(key)) { dupeCount++; return false; }
      return true;
    });

    setDuplicatesSkipped(dupeCount);
    setImportTotal(rowsToImport.length);
    setImportDone(0);
    setCoversFound(0);

    // Phase 1: fetch covers in chunks of 10, accumulate all rows
    type BaseRow = Omit<InsertRow, "shelf_number" | "sort_order">;
    const allRows: BaseRow[] = [];
    let coverCount = 0;

    for (const chunk of chunkArray(rowsToImport, 10)) {
      const covers = await Promise.all(chunk.map(fetchCoverForRow));
      for (let i = 0; i < chunk.length; i++) {
        const { cover_url, google_books_id, page_count } = covers[i];
        if (cover_url) coverCount++;
        allRows.push({
          title: stripSeriesFromTitle(chunk[i].Title.trim()),
          author: chunk[i].Author.trim() || null,
          cover_url,
          google_books_id,
          status: mapStatus(chunk[i]),
          date_finished: convertDate(chunk[i]["Date Read"]),
          format: "physical",
          page_count,
        });
      }
      setImportDone((prev) => prev + chunk.length);
      setCoversFound(coverCount);
    }

    // Phase 2: assign shelf_number + sort_order across the full list
    const rowsWithShelves = assignShelves(allRows);

    // Phase 3: insert in batches of 50
    for (const batch of chunkArray(rowsWithShelves, 50)) {
      const { error: insertError } = await supabase.from("books").insert(batch);
      if (insertError) {
        console.error("Batch insert failed:", insertError.message, insertError.details);
        setImportError(`Insert failed: ${insertError.message}`);
      }
    }

    setSummary({ total: rowsToImport.length, covers: coverCount, dupes: dupeCount });
    setPhase("done");
  }

  /* ── ISBN: look up ── */
  async function handleIsbnSearch() {
    if (!isbnInput.trim()) return;
    setIsbnLoading(true);
    setIsbnResult(null);
    setIsbnNotFound(false);
    setIsbnAlreadyExists(false);
    try {
      const cleanIsbn = isbnInput.trim().replace(/-/g, "").replace(/\s/g, "");
      const res = await fetch(`/api/search?q=isbn:${encodeURIComponent(cleanIsbn)}`);
      const data = await res.json();
      const item = data.items?.[0];
      if (!item) { setIsbnNotFound(true); return; }
      const vi = item.volumeInfo;
      const raw: string | undefined = vi.imageLinks?.thumbnail ?? vi.imageLinks?.smallThumbnail;
      setIsbnResult({
        title: vi.title ?? "Unknown Title",
        author: vi.authors?.[0] ?? "Unknown Author",
        coverUrl: raw ? cleanCoverUrl(raw) : null,
        googleBooksId: item.id,
        year: vi.publishedDate?.substring(0, 4) ?? null,
        pageCount: vi.pageCount ?? null,
      });
    } finally {
      setIsbnLoading(false);
    }
  }

  /* ── ISBN: add to library ── */
  async function handleIsbnAdd() {
    if (!isbnResult) return;
    setIsbnAdding(true);
    setIsbnAlreadyExists(false);

    // Duplicate check by google_books_id
    const { data: dup } = await supabase
      .from("books")
      .select("id")
      .eq("google_books_id", isbnResult.googleBooksId)
      .limit(1);
    if (dup && dup.length > 0) {
      setIsbnAlreadyExists(true);
      setIsbnAdding(false);
      return;
    }

    const { format, format_source } = resolveFormat(isbnFormat);

    // Extract series info from title before inserting
    const parsedSeries = extractSeriesFromTitle(isbnResult.title);

    const { data: inserted } = await supabase.from("books").insert({
      title: isbnResult.title,
      author: isbnResult.author,
      cover_url: isbnResult.coverUrl,
      google_books_id: isbnResult.googleBooksId,
      status: isbnStatus,
      format,
      format_source,
      page_count: isbnResult.pageCount ?? null,
      series_name: parsedSeries?.seriesName ?? null,
      series_position: parsedSeries?.position ?? null,
    }).select("id").single();

    // Fetch better page count + series position from volumes API
    if (inserted?.id) {
      try {
        const res = await fetch(`/api/books/${encodeURIComponent(isbnResult.googleBooksId)}`);
        if (res.ok) {
          const fetched = await res.json();
          const dbUpdates: Record<string, unknown> = {};
          if (!isbnResult.pageCount && fetched.pageCount) dbUpdates.page_count = fetched.pageCount;
          if (!parsedSeries && fetched.seriesPosition != null) {
            dbUpdates.series_position = fetched.seriesPosition;
            const p = extractSeriesFromTitle(isbnResult.title);
            if (p) { dbUpdates.series_name = p.seriesName; }
          }
          if (Object.keys(dbUpdates).length > 0) {
            await supabase.from("books").update(dbUpdates).eq("id", inserted.id);
          }
        }
      } catch { /* non-critical */ }
    }

    router.push("/");
  }

  /* ── Shelf repack ── */
  async function handleRepackShelves() {
    setRepacking(true);
    setRepackDone(false);
    setRepackError(null);

    // Fetch all books ordered by current shelf/sort so relative order is preserved
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, status, shelf_number, sort_order")
      .order("shelf_number", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error || !data) {
      setRepackError(error?.message ?? "Failed to fetch books");
      setRepacking(false);
      return;
    }

    // Assign shelves across the full list
    const packed = assignShelves(
      data.map((b) => ({
        title: "", author: b.author ?? null,
        cover_url: null, google_books_id: null,
        status: "", date_finished: null, format: "", page_count: null,
      }))
    );

    // Build upsert rows: only id + shelf_number + sort_order
    const rows = data.map((b, i) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      status: b.status,
      shelf_number: packed[i].shelf_number,
      sort_order: packed[i].sort_order,
    }));

    const { error: upsertError } = await supabase
      .from("books")
      .upsert(rows, { onConflict: "id" });

    if (upsertError) {
      setRepackError(upsertError.message);
    } else {
      setRepackDone(true);
    }
    setRepacking(false);
  }

  /* ── Fix titles ── */
  async function handleFixTitles() {
    setFixingTitles(true);
    setFixTitlesDone(null);
    setFixTitlesError(null);

    const { data, error } = await supabase.from("books").select("id, title, author, status");
    if (error || !data) {
      setFixTitlesError(error?.message ?? "Failed to fetch books");
      setFixingTitles(false);
      return;
    }

    const dirty = data.filter((b) => b.title !== stripSeriesFromTitle(b.title));
    if (dirty.length === 0) {
      setFixTitlesDone(0);
      setFixingTitles(false);
      return;
    }

    const rows = dirty.map((b) => ({
      id: b.id,
      title: stripSeriesFromTitle(b.title),
      author: b.author,
      status: b.status,
    }));

    const { error: upsertError } = await supabase.from("books").upsert(rows, { onConflict: "id" });
    if (upsertError) {
      setFixTitlesError(upsertError.message);
    } else {
      setFixTitlesDone(dirty.length);
    }
    setFixingTitles(false);
  }

  /* ── Refresh: parse CSV ── */
  function handleRefreshFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) return;
    setRefreshPhase("parsing");
    setRefreshError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      let text = e.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const result = Papa.parse<GoodreadsRow>(text, {
        header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
      });
      const parsed = result.data.filter((r) => r.Title?.trim());
      setRefreshParsed(parsed);
      setRefreshPhase("analyzing");
      await analyzeRefreshDiff(parsed);
    };
    reader.readAsText(file, "UTF-8");
  }

  /* ── Refresh: diff against library ── */
  async function analyzeRefreshDiff(parsed: GoodreadsRow[]) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, rating");
    if (error || !data) {
      setRefreshError(error?.message ?? "Failed to fetch library");
      setRefreshPhase("idle");
      return;
    }

    const existingMap = new Map<string, { id: string; rating: number | null }>();
    for (const b of data) {
      const key = `${(b.title ?? "").toLowerCase().trim()}::${(b.author ?? "").toLowerCase().trim()}`;
      existingMap.set(key, { id: b.id, rating: b.rating });
    }

    const newBooks: GoodreadsRow[] = [];
    const changes: RatingChange[] = [];

    for (const row of parsed) {
      const cleanTitle = stripSeriesFromTitle(row.Title.trim());
      const key = `${cleanTitle.toLowerCase()}::${row.Author.toLowerCase().trim()}`;
      if (!existingMap.has(key)) {
        newBooks.push(row);
      } else {
        const existing = existingMap.get(key)!;
        const newRating = convertRating(row["My Rating"]);
        if (newRating !== null && newRating !== existing.rating) {
          changes.push({ id: existing.id, title: cleanTitle, author: row.Author || null, oldRating: existing.rating, newRating });
        }
      }
    }

    setRefreshNew(newBooks);
    setRatingChanges(changes);
    setSelectedNew(new Set(newBooks.map((_, i) => i)));
    setSelectedRatingIds(new Set(changes.map((c) => c.id)));
    setRefreshPhase("reviewing");
  }

  /* ── Refresh: confirm import ── */
  async function handleRefreshConfirm() {
    setRefreshPhase("importing");
    setRefreshError(null);

    const toImport = refreshNew.filter((_, i) => selectedNew.has(i));
    const toUpdateRatings = ratingChanges.filter((c) => selectedRatingIds.has(c.id));

    setRefreshTotal(toImport.length);
    setRefreshDone(0);
    setRefreshCovers(0);

    // Import new books
    type BaseRow = Omit<InsertRow, "shelf_number" | "sort_order">;
    const allRows: BaseRow[] = [];
    let coverCount = 0;

    for (const chunk of chunkArray(toImport, 10)) {
      const covers = await Promise.all(chunk.map(fetchCoverForRow));
      for (let i = 0; i < chunk.length; i++) {
        const { cover_url, google_books_id, page_count } = covers[i];
        if (cover_url) coverCount++;
        allRows.push({
          title: stripSeriesFromTitle(chunk[i].Title.trim()),
          author: chunk[i].Author.trim() || null,
          cover_url, google_books_id,
          status: mapStatus(chunk[i]),
          date_finished: convertDate(chunk[i]["Date Read"]),
          format: "physical",
          page_count,
        });
      }
      setRefreshDone((prev) => prev + chunk.length);
      setRefreshCovers(coverCount);
    }

    if (allRows.length > 0) {
      // Find highest existing shelf to append after
      const { data: shelfData } = await supabase
        .from("books").select("shelf_number").order("shelf_number", { ascending: false }).limit(1);
      const startShelf = (shelfData?.[0]?.shelf_number ?? -1) + 1;
      const packed = assignShelves(allRows).map((r) => ({ ...r, shelf_number: r.shelf_number + startShelf }));
      for (const batch of chunkArray(packed, 50)) {
        const { error: insertError } = await supabase.from("books").insert(batch);
        if (insertError) setRefreshError(`Insert failed: ${insertError.message}`);
      }
    }

    // Update ratings
    let ratingsUpdated = 0;
    for (const change of toUpdateRatings) {
      const { error } = await supabase.from("books").update({ rating: change.newRating }).eq("id", change.id);
      if (!error) ratingsUpdated++;
    }

    setRefreshSummary({ imported: toImport.length, ratingsUpdated });
    setRefreshPhase("done");
  }

  /* ── Deduplicate library ── */
  async function handleDedupe() {
    setDeduping(true);
    setDedupeDone(null);
    setDedupeError(null);

    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, created_at")
      .order("created_at", { ascending: true });

    if (error || !data) {
      setDedupeError(error?.message ?? "Failed to fetch books");
      setDeduping(false);
      return;
    }

    // Group by normalized title::author, keep the earliest, collect the rest to delete
    const seen = new Map<string, string>(); // key → id to keep
    const toDelete: string[] = [];

    for (const b of data) {
      const key = `${(b.title ?? "").toLowerCase().trim()}::${(b.author ?? "").toLowerCase().trim()}`;
      if (seen.has(key)) {
        toDelete.push(b.id);
      } else {
        seen.set(key, b.id);
      }
    }

    if (toDelete.length === 0) {
      setDedupeDone(0);
      setDeduping(false);
      return;
    }

    // Delete in batches of 50
    for (const batch of chunkArray(toDelete, 50)) {
      const { error: delError } = await supabase.from("books").delete().in("id", batch);
      if (delError) {
        setDedupeError(delError.message);
        setDeduping(false);
        return;
      }
    }

    setDedupeDone(toDelete.length);
    setDeduping(false);
  }

  /* ── Refresh all covers ── */
  async function handleRefreshCovers() {
    setCoverRefreshing(true);
    setCoverRefreshDone(0);
    setCoverRefreshUpdated(null);
    setCoverRefreshError(null);

    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, google_books_id, format_source");

    if (error || !data) {
      setCoverRefreshError(error?.message ?? "Failed to fetch books");
      setCoverRefreshing(false);
      return;
    }

    setCoverRefreshTotal(data.length);

    // Small delay between API calls to stay well within Google Books rate limits
    const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

    // Helper: fetch cover for a known Google Books ID via the volumes endpoint.
    // This is preferred over search for manually-added books because it returns the
    // exact edition the user chose — search can match a different edition with no cover.
    async function coverFromBookId(googleBooksId: string): Promise<string | null> {
      try {
        const res = await fetch(`/api/books/${encodeURIComponent(googleBooksId)}`);
        if (!res.ok) return null;
        const json = await res.json();
        if (json.error === "rate_limited") throw new Error("rate_limited");
        const raw = bestGoogleCover(json.imageLinks ?? undefined);
        return raw ? cleanCoverUrl(raw) : null;
      } catch (e) {
        if ((e as Error).message === "rate_limited") throw e;
        return null;
      }
    }

    // Helper: search Google Books with multiple fallback query strategies,
    // then fall back to Open Library if Google Books has no cover.
    async function searchGoogleBooksCover(title: string, author: string | null): Promise<string | null> {
      // Normalise: strip smart quotes / special punctuation that can break matching
      const cleanTitle = title.replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/[^\w\s'-]/g, " ").trim();
      const cleanAuthor = (author ?? "").replace(/[\u2018\u2019\u201c\u201d]/g, "'").trim();
      const authorLastName = cleanAuthor.split(" ").pop() ?? cleanAuthor;
      const titleKeyword = cleanTitle.split(" ").filter(w => !["the","a","an"].includes(w.toLowerCase()))[0] ?? cleanTitle.split(" ")[0];

      type GbItem = { volumeInfo?: { title?: string; imageLinks?: Record<string, string>; industryIdentifiers?: Array<{ type: string; identifier: string }> } };

      const queries = [
        `intitle:"${cleanTitle}" inauthor:${authorLastName}`,
        `${cleanTitle} ${cleanAuthor}`,
        `intitle:"${cleanTitle}"`,
        cleanTitle,
      ];

      for (const q of queries) {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
          if (res.status === 429) throw new Error("rate_limited");
          if (!res.ok) continue;
          const json = await res.json();
          if (json.error === "rate_limited") throw new Error("rate_limited");
          const items: GbItem[] = json.items ?? [];

          // Find the best-matching item that has an imageLinks entry
          const item: GbItem | undefined =
            items.find(i => i?.volumeInfo?.imageLinks && (i.volumeInfo.title ?? "").toLowerCase().includes(titleKeyword.toLowerCase()))
            ?? items.find(i => i?.volumeInfo?.imageLinks);

          if (!item) continue;

          const raw = bestGoogleCover(item?.volumeInfo?.imageLinks);
          if (raw) return cleanCoverUrl(raw);

          // No Google Books cover — try Open Library with ISBN from this result
          if (item?.volumeInfo?.industryIdentifiers) {
            const olCover = await openLibraryCover(item.volumeInfo.industryIdentifiers);
            if (olCover) return olCover;
          }
        } catch (e) {
          if ((e as Error).message === "rate_limited") throw e;
          /* try next query */
        }
      }
      return null;
    }

    const updates: { id: string; cover_url: string }[] = [];
    let rateLimited = false;

    for (let i = 0; i < data.length; i++) {
      if (rateLimited) break;

      const book = data[i];
      const isLibby = (book.format_source as string | null)?.startsWith("libby") ?? false;

      try {
        let cover_url: string | null = null;

        if (!isLibby && book.google_books_id) {
          // Non-Libby books: use the stored Google Books ID to get the exact edition's cover.
          // Only fall back to search if the direct lookup has no imageLinks.
          cover_url = await coverFromBookId(book.google_books_id as string);
          if (!cover_url) {
            await delay(300);
            cover_url = await searchGoogleBooksCover(book.title as string, book.author as string | null);
          }
        } else {
          // Libby books (or books with no google_books_id): always search by title+author.
          cover_url = await searchGoogleBooksCover(book.title as string, book.author as string | null);
        }

        if (cover_url) updates.push({ id: book.id as string, cover_url });
      } catch (e) {
        if ((e as Error).message === "rate_limited") {
          rateLimited = true;
          setCoverRefreshError("Google Books rate limit reached — covers updated so far have been saved. Try again in a few minutes.");
          break;
        }
      }

      setCoverRefreshDone(i + 1);

      // Pace requests: 350 ms between each book to stay under quota
      if (i < data.length - 1) await delay(350);
    }

    // Apply cover updates sequentially to Supabase
    let updated = 0;
    for (const { id, cover_url } of updates) {
      const { error: upErr } = await supabase.from("books").update({ cover_url }).eq("id", id);
      if (!upErr) updated++;
    }

    setCoverRefreshUpdated(updated);
    setCoverRefreshing(false);
  }

  /* ── Backfill page counts ── */
  async function handleBackfillPageCounts() {
    setBackfillPCRunning(true);
    setBackfillPCResult(null);
    setBackfillPCError(null);
    try {
      const { data: books } = await supabase
        .from("books")
        .select("id, title, author, google_books_id")
        .is("page_count", null);
      if (!books?.length) { setBackfillPCResult(0); setBackfillPCRunning(false); return; }
      setBackfillPCTotal(books.length);
      setBackfillPCDone(0);
      let updated = 0;
      for (const book of books) {
        let pageCount: number | null = null;
        try {
          // Direct volume lookup for non-Libby books
          const gid = book.google_books_id as string | null;
          if (gid && !gid.startsWith("OD:")) {
            const r = await fetch(`/api/books/${encodeURIComponent(gid)}`);
            if (r.ok) pageCount = (await r.json()).pageCount ?? null;
          }
          // Fall back to title+author search
          if (!pageCount) {
            const q = `${book.title} ${book.author ?? ""}`.trim();
            const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (r.ok) pageCount = (await r.json()).items?.[0]?.volumeInfo?.pageCount ?? null;
          }
          if (pageCount) {
            await supabase.from("books").update({ page_count: pageCount }).eq("id", book.id);
            updated++;
          }
        } catch { /* skip individual failures */ }
        setBackfillPCDone(prev => prev + 1);
        await new Promise(r => setTimeout(r, 200));
      }
      setBackfillPCResult(updated);
    } catch (e) {
      setBackfillPCError(String(e));
    } finally {
      setBackfillPCRunning(false);
    }
  }

  /* ── render ── */
  const progressPct = importTotal > 0 ? (importDone / importTotal) * 100 : 0;

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "linear-gradient(170deg,#1a1530 0%,#2d1b4e 35%,#1e1340 70%,#170e2e 100%)", color: "#f0e0c0" }}
    >
      <div className="page-vignette" />
      <CeilingGlow />
      <FloatingParticles />

      <div style={{ position: "relative", zIndex: 2, maxWidth: "860px", margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "40px" }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-crimson)", fontSize: "14px", fontStyle: "italic",
              color: "#d4a843", textDecoration: "none", opacity: 0.75,
              display: "inline-flex", alignItems: "center", gap: "4px",
            }}
          >
            ← Return to Library
          </Link>
          <h1 style={{
            fontFamily: "var(--font-cinzel)",
            fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
            color: "#f0e0c0",
            letterSpacing: "0.08em",
            marginTop: "12px",
            marginBottom: "8px",
            textShadow: "0 0 40px rgba(212,168,67,0.3)",
          }}>
            Import Your Library
          </h1>
          <p style={{ fontFamily: "var(--font-crimson)", fontSize: "16px", color: "rgba(240,224,192,0.5)", fontStyle: "italic" }}>
            Add books from Goodreads or by ISBN
          </p>
        </div>

        {/* ── Tab toggle ── */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "36px", flexWrap: "wrap" }}>
          {(["import", "refresh", "libby"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 22px",
                borderRadius: "999px",
                fontFamily: "var(--font-cinzel)",
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                border: "1px solid",
                transition: "all 0.2s",
                borderColor: activeTab === tab ? "rgba(212,168,67,0.5)" : "rgba(212,168,67,0.15)",
                background: activeTab === tab ? "rgba(212,168,67,0.15)" : "transparent",
                color: activeTab === tab ? "#d4a843" : "rgba(240,224,192,0.35)",
              }}
            >
              {tab === "import" ? "New Import" : tab === "refresh" ? "Refresh from Goodreads" : "☽ Sync Libby"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            SECTION 1 — GOODREADS CSV
        ══════════════════════════════════════════ */}
        <section style={{ display: activeTab === "import" ? "block" : "none" }}>
          <h2 style={SECTION_HEADING}>Goodreads CSV Import</h2>

          {/* Drop zone — visible when idle or parsing */}
          {(phase === "idle" || phase === "parsing") && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? "rgba(212,168,67,0.9)" : "rgba(212,168,67,0.3)"}`,
                borderRadius: "12px",
                padding: "56px 24px",
                textAlign: "center",
                background: isDragging ? "rgba(212,168,67,0.06)" : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {phase === "parsing" ? (
                <Loader2 size={32} className="animate-spin" style={{ color: "rgba(212,168,67,0.5)", margin: "0 auto 12px" }} />
              ) : (
                <Upload size={32} style={{ color: "rgba(212,168,67,0.5)", margin: "0 auto 12px", display: "block" }} />
              )}
              <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "13px", color: "#f0e0c0", marginBottom: "6px" }}>
                {phase === "parsing" ? "Parsing CSV…" : "Drop your Goodreads CSV here"}
              </p>
              <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.4)", fontStyle: "italic" }}>
                {phase === "parsing" ? "" : "or click to browse"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Preview table */}
          {phase === "previewing" && (
            <div>
              <p style={{
                fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em",
                color: "#d4a843", textTransform: "uppercase", marginBottom: "16px",
              }}>
                Found {parsedRows.length} {parsedRows.length === 1 ? "book" : "books"}
              </p>

              <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid rgba(212,168,67,0.15)", marginBottom: "16px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-crimson)" }}>
                  <thead>
                    <tr style={{ background: "rgba(212,168,67,0.08)", borderBottom: "1px solid rgba(212,168,67,0.2)" }}>
                      {["Title", "Author", "Shelf", "Date Read", "Status"].map((col) => (
                        <th key={col} style={{
                          padding: "10px 14px", textAlign: "left",
                          fontFamily: "var(--font-cinzel)", fontSize: "9px",
                          letterSpacing: "0.15em", color: "rgba(212,168,67,0.7)",
                          textTransform: "uppercase", whiteSpace: "nowrap",
                        }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 20).map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                        }}
                      >
                        <td style={{
                          padding: "8px 14px", fontSize: "14px", color: "#f0e0c0",
                          maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{row.Title}</td>
                        <td style={{ padding: "8px 14px", fontSize: "13px", color: "rgba(240,224,192,0.7)", fontStyle: "italic", whiteSpace: "nowrap" }}>{row.Author}</td>
                        <td style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(240,224,192,0.55)", whiteSpace: "nowrap" }}>
                          {row["Exclusive Shelf"] || "—"}
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(240,224,192,0.45)", whiteSpace: "nowrap" }}>
                          {convertDate(row["Date Read"]) ?? "—"}
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(240,224,192,0.55)", whiteSpace: "nowrap" }}>
                          {mapStatus(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedRows.length > 20 && (
                <p style={{
                  fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic",
                  color: "rgba(240,224,192,0.35)", textAlign: "center", marginBottom: "20px",
                }}>
                  … and {parsedRows.length - 20} more
                </p>
              )}

              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={handleImportConfirm} style={GOLD_BUTTON}>
                  <BookOpen size={14} />
                  Import {parsedRows.length} Books
                </button>
                <button
                  onClick={() => { setParsedRows([]); setPhase("idle"); }}
                  style={{
                    background: "none", border: "none", fontFamily: "var(--font-crimson)",
                    fontSize: "13px", color: "rgba(240,224,192,0.35)", cursor: "pointer", fontStyle: "italic",
                  }}
                >
                  Choose a different file
                </button>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {phase === "importing" && (
            <div style={{ padding: "32px 0" }}>
              <p style={{
                fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em",
                color: "#d4a843", marginBottom: "16px", textTransform: "uppercase",
              }}>
                Importing {importDone} of {importTotal}…
              </p>
              <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg,#d4a843,#f0c060)",
                  borderRadius: "999px",
                  transition: "width 0.3s ease",
                  boxShadow: "0 0 8px rgba(212,168,67,0.5)",
                }} />
              </div>
              <p style={{
                fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic",
                color: "rgba(240,224,192,0.45)", marginTop: "10px",
              }}>
                {coversFound} cover{coversFound !== 1 ? "s" : ""} found
                {duplicatesSkipped > 0 ? ` · ${duplicatesSkipped} duplicates skipped` : ""}
              </p>
              {importError && (
                <p style={{
                  fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic",
                  color: "rgba(248,113,113,0.85)", marginTop: "10px",
                }}>
                  ⚠ {importError}
                </p>
              )}
            </div>
          )}

          {/* Done summary */}
          {phase === "done" && importError && (
            <p style={{
              fontFamily: "var(--font-crimson)", fontSize: "14px", fontStyle: "italic",
              color: "rgba(248,113,113,0.85)", marginBottom: "16px",
            }}>
              ⚠ Some books may not have been saved: {importError}. Check the browser console for details.
            </p>
          )}
          {phase === "done" && summary && (
            <div style={{
              padding: "36px",
              borderRadius: "12px",
              background: "rgba(212,168,67,0.06)",
              border: "1px solid rgba(212,168,67,0.2)",
              textAlign: "center",
            }}>
              <Sparkles size={28} style={{ color: "#d4a843", margin: "0 auto 16px", display: "block" }} />
              <h3 style={{
                fontFamily: "var(--font-cinzel)", fontSize: "14px", letterSpacing: "0.1em",
                color: "#f0e0c0", marginBottom: "12px",
              }}>
                Import Complete
              </h3>
              <p style={{ fontFamily: "var(--font-crimson)", fontSize: "16px", color: "rgba(240,224,192,0.8)", lineHeight: 1.6 }}>
                {summary.total} {summary.total === 1 ? "book" : "books"} imported
                {" · "}{summary.covers} cover{summary.covers !== 1 ? "s" : ""} found
                {" · "}{summary.dupes} duplicate{summary.dupes !== 1 ? "s" : ""} skipped
              </p>
              <Link
                href="/"
                style={{
                  display: "inline-block", marginTop: "24px",
                  fontFamily: "var(--font-cinzel)", fontSize: "11px",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#d4a843", textDecoration: "none",
                }}
              >
                ← Return to Library
              </Link>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════
            REFRESH FROM GOODREADS
        ══════════════════════════════════════════ */}
        {activeTab === "refresh" && (
          <section>
            <h2 style={SECTION_HEADING}>Refresh from Goodreads</h2>

            {/* Drop zone */}
            {(refreshPhase === "idle" || refreshPhase === "parsing") && (
              <div
                onDragOver={(e) => { e.preventDefault(); setRefreshIsDragging(true); }}
                onDragLeave={() => setRefreshIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setRefreshIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleRefreshFile(f); }}
                onClick={() => refreshFileRef.current?.click()}
                style={{
                  border: `2px dashed ${refreshIsDragging ? "rgba(212,168,67,0.9)" : "rgba(212,168,67,0.3)"}`,
                  borderRadius: "12px", padding: "56px 24px", textAlign: "center",
                  background: refreshIsDragging ? "rgba(212,168,67,0.06)" : "rgba(255,255,255,0.02)",
                  cursor: "pointer", transition: "all 0.2s ease",
                }}
              >
                {refreshPhase === "parsing"
                  ? <Loader2 size={32} className="animate-spin" style={{ color: "rgba(212,168,67,0.5)", margin: "0 auto 12px", display: "block" }} />
                  : <Upload size={32} style={{ color: "rgba(212,168,67,0.5)", margin: "0 auto 12px", display: "block" }} />
                }
                <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "13px", color: "#f0e0c0", marginBottom: "6px" }}>
                  {refreshPhase === "parsing" ? "Parsing CSV…" : "Drop your latest Goodreads CSV here"}
                </p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.4)", fontStyle: "italic" }}>
                  {refreshPhase === "parsing" ? "" : "We\u2019ll find what\u2019s new since your last import"}
                </p>
                <input ref={refreshFileRef} type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRefreshFile(f); }} />
              </div>
            )}

            {/* Analyzing spinner */}
            {refreshPhase === "analyzing" && (
              <div style={{ padding: "48px 0", textAlign: "center" }}>
                <Loader2 size={28} className="animate-spin" style={{ color: "rgba(212,168,67,0.5)", margin: "0 auto 16px", display: "block" }} />
                <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em", color: "#d4a843", textTransform: "uppercase" }}>
                  Comparing with your library…
                </p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.4)", fontStyle: "italic", marginTop: "8px" }}>
                  {refreshParsed.length} books in CSV
                </p>
              </div>
            )}

            {/* Review screen */}
            {refreshPhase === "reviewing" && (
              <div>
                {refreshNew.length === 0 && ratingChanges.length === 0 ? (
                  <div style={{ padding: "48px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)", borderRadius: "12px" }}>
                    <Sparkles size={24} style={{ color: "#d4a843", margin: "0 auto 12px", display: "block" }} />
                    <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "13px", color: "#f0e0c0", marginBottom: "6px" }}>Your library is up to date</p>
                    <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.4)", fontStyle: "italic" }}>
                      No new books or rating changes found in this CSV.
                    </p>
                    <button onClick={() => { setRefreshPhase("idle"); setRefreshParsed([]); }} style={{ ...GOLD_BUTTON, marginTop: "20px" }}>
                      Try another file
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

                    {/* New books list */}
                    {refreshNew.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em", color: "#d4a843", textTransform: "uppercase" }}>
                            {refreshNew.length} new {refreshNew.length === 1 ? "book" : "books"} found
                          </p>
                          <div style={{ display: "flex", gap: "12px" }}>
                            <button onClick={() => setSelectedNew(new Set(refreshNew.map((_, i) => i)))}
                              style={{ background: "none", border: "none", fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(212,168,67,0.6)", cursor: "pointer" }}>
                              Select all
                            </button>
                            <button onClick={() => setSelectedNew(new Set())}
                              style={{ background: "none", border: "none", fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.35)", cursor: "pointer" }}>
                              None
                            </button>
                          </div>
                        </div>
                        <div style={{ border: "1px solid rgba(212,168,67,0.15)", borderRadius: "8px", overflow: "hidden" }}>
                          {refreshNew.map((row, i) => (
                            <div key={i}
                              onClick={() => setSelectedNew(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; })}
                              style={{
                                display: "flex", alignItems: "center", gap: "12px",
                                padding: "10px 14px", cursor: "pointer",
                                borderBottom: i < refreshNew.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                background: selectedNew.has(i) ? "rgba(212,168,67,0.05)" : "transparent",
                                transition: "background 0.15s",
                              }}
                            >
                              <div style={{
                                width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0,
                                border: `1px solid ${selectedNew.has(i) ? "rgba(212,168,67,0.7)" : "rgba(212,168,67,0.25)"}`,
                                background: selectedNew.has(i) ? "rgba(212,168,67,0.25)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {selectedNew.has(i) && <span style={{ color: "#d4a843", fontSize: "11px", lineHeight: 1 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "#f0e0c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {stripSeriesFromTitle(row.Title.trim())}
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(212,168,67,0.7)", fontStyle: "italic" }}>
                                  {row.Author}
                                </p>
                              </div>
                              <span style={{ fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.1em", color: "rgba(240,224,192,0.35)", textTransform: "uppercase", flexShrink: 0 }}>
                                {mapStatus(row)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rating changes list */}
                    {ratingChanges.length > 0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em", color: "#d4a843", textTransform: "uppercase" }}>
                            {ratingChanges.length} rating {ratingChanges.length === 1 ? "change" : "changes"} detected
                          </p>
                          <div style={{ display: "flex", gap: "12px" }}>
                            <button onClick={() => setSelectedRatingIds(new Set(ratingChanges.map((c) => c.id)))}
                              style={{ background: "none", border: "none", fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(212,168,67,0.6)", cursor: "pointer" }}>
                              Select all
                            </button>
                            <button onClick={() => setSelectedRatingIds(new Set())}
                              style={{ background: "none", border: "none", fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.35)", cursor: "pointer" }}>
                              None
                            </button>
                          </div>
                        </div>
                        <div style={{ border: "1px solid rgba(212,168,67,0.15)", borderRadius: "8px", overflow: "hidden" }}>
                          {ratingChanges.map((change, ci) => (
                            <div key={change.id}
                              onClick={() => setSelectedRatingIds(prev => { const s = new Set(prev); s.has(change.id) ? s.delete(change.id) : s.add(change.id); return s; })}
                              style={{
                                display: "flex", alignItems: "center", gap: "12px",
                                padding: "10px 14px", cursor: "pointer",
                                borderBottom: ci < ratingChanges.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                background: selectedRatingIds.has(change.id) ? "rgba(212,168,67,0.05)" : "transparent",
                                transition: "background 0.15s",
                              }}
                            >
                              <div style={{
                                width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0,
                                border: `1px solid ${selectedRatingIds.has(change.id) ? "rgba(212,168,67,0.7)" : "rgba(212,168,67,0.25)"}`,
                                background: selectedRatingIds.has(change.id) ? "rgba(212,168,67,0.25)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {selectedRatingIds.has(change.id) && <span style={{ color: "#d4a843", fontSize: "11px", lineHeight: 1 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "#f0e0c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {change.title}
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(212,168,67,0.7)", fontStyle: "italic" }}>
                                  {change.author}
                                </p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                <span style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.4)" }}>
                                  {change.oldRating ? "★".repeat(change.oldRating) : "—"}
                                </span>
                                <span style={{ color: "rgba(212,168,67,0.4)", fontSize: "12px" }}>→</span>
                                <span style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "#f59e0b" }}>
                                  {"★".repeat(change.newRating)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action row */}
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={handleRefreshConfirm}
                        disabled={selectedNew.size === 0 && selectedRatingIds.size === 0}
                        style={{ ...GOLD_BUTTON, opacity: (selectedNew.size === 0 && selectedRatingIds.size === 0) ? 0.4 : 1 }}
                      >
                        <BookOpen size={14} />
                        {selectedNew.size > 0 && selectedRatingIds.size > 0
                          ? `Add ${selectedNew.size} ${selectedNew.size === 1 ? "book" : "books"} · Update ${selectedRatingIds.size} ${selectedRatingIds.size === 1 ? "rating" : "ratings"}`
                          : selectedNew.size > 0
                          ? `Add ${selectedNew.size} ${selectedNew.size === 1 ? "book" : "books"}`
                          : `Update ${selectedRatingIds.size} ${selectedRatingIds.size === 1 ? "rating" : "ratings"}`
                        }
                      </button>
                      <button onClick={() => { setRefreshPhase("idle"); setRefreshParsed([]); }}
                        style={{ background: "none", border: "none", fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.35)", cursor: "pointer", fontStyle: "italic" }}>
                        Choose a different file
                      </button>
                    </div>
                    {refreshError && (
                      <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>⚠ {refreshError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Progress bar */}
            {refreshPhase === "importing" && (
              <div style={{ padding: "32px 0" }}>
                <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em", color: "#d4a843", marginBottom: "16px", textTransform: "uppercase" }}>
                  {refreshTotal > 0 ? `Importing ${refreshDone} of ${refreshTotal}…` : "Updating ratings…"}
                </p>
                {refreshTotal > 0 && (
                  <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${(refreshDone / refreshTotal) * 100}%`,
                      background: "linear-gradient(90deg,#d4a843,#f0c060)",
                      borderRadius: "999px", transition: "width 0.3s ease",
                      boxShadow: "0 0 8px rgba(212,168,67,0.5)",
                    }} />
                  </div>
                )}
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.45)", marginTop: "10px" }}>
                  {refreshCovers} cover{refreshCovers !== 1 ? "s" : ""} found
                </p>
              </div>
            )}

            {/* Done */}
            {refreshPhase === "done" && refreshSummary && (
              <div style={{ padding: "36px", borderRadius: "12px", background: "rgba(212,168,67,0.06)", border: "1px solid rgba(212,168,67,0.2)", textAlign: "center" }}>
                <Sparkles size={28} style={{ color: "#d4a843", margin: "0 auto 16px", display: "block" }} />
                <h3 style={{ fontFamily: "var(--font-cinzel)", fontSize: "14px", letterSpacing: "0.1em", color: "#f0e0c0", marginBottom: "12px" }}>
                  Library Refreshed
                </h3>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "16px", color: "rgba(240,224,192,0.8)", lineHeight: 1.6 }}>
                  {refreshSummary.imported > 0 && `${refreshSummary.imported} new ${refreshSummary.imported === 1 ? "book" : "books"} added`}
                  {refreshSummary.imported > 0 && refreshSummary.ratingsUpdated > 0 && " · "}
                  {refreshSummary.ratingsUpdated > 0 && `${refreshSummary.ratingsUpdated} ${refreshSummary.ratingsUpdated === 1 ? "rating" : "ratings"} updated`}
                  {refreshSummary.imported === 0 && refreshSummary.ratingsUpdated === 0 && "Nothing to update"}
                </p>
                <Link href="/" style={{ display: "inline-block", marginTop: "24px", fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#d4a843", textDecoration: "none" }}>
                  ← Return to Library
                </Link>
              </div>
            )}
          </section>
        )}

        {activeTab === "import" && <><hr style={{ border: "none", borderTop: "1px solid rgba(212,168,67,0.15)", margin: "52px 0" }} />

        {/* ══════════════════════════════════════════
            SECTION 2 — MANUAL ISBN ENTRY
        ══════════════════════════════════════════ */}
        <section>
          <h2 style={SECTION_HEADING}>Manual ISBN Entry</h2>

          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(212,168,67,0.15)",
            borderRadius: "12px",
            padding: "28px",
          }}>
            {/* ISBN input row */}
            <div style={{ display: "flex", gap: "10px", alignItems: "stretch" }}>
              <input
                value={isbnInput}
                onChange={(e) => setIsbnInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIsbnSearch()}
                placeholder="978-0-385-73795-1"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(212,168,67,0.25)", borderRadius: "8px",
                  padding: "10px 14px", fontFamily: "var(--font-crimson)",
                  fontSize: "16px", color: "#f0e0c0", outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                onClick={handleIsbnSearch}
                disabled={isbnLoading}
                style={{ ...GOLD_BUTTON, flexShrink: 0 }}
              >
                {isbnLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Look Up
              </button>
            </div>

            {/* Not found */}
            {isbnNotFound && (
              <p style={{
                fontFamily: "var(--font-crimson)", fontSize: "14px", fontStyle: "italic",
                color: "rgba(248,113,113,0.8)", marginTop: "12px",
              }}>
                No book found for that ISBN. Try searching by title on the main shelf.
              </p>
            )}

            {/* Preview card */}
            {isbnResult && (
              <div style={{
                display: "flex", gap: "20px", marginTop: "20px",
                padding: "18px", background: "rgba(212,168,67,0.04)",
                borderRadius: "8px", border: "1px solid rgba(212,168,67,0.1)",
                flexWrap: "wrap",
              }}>
                {/* Cover */}
                <div style={{
                  width: "72px", height: "104px", flexShrink: 0,
                  borderRadius: "4px", overflow: "hidden",
                  background: "linear-gradient(160deg,#2a1a40,#1a0f2e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isbnResult.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={isbnResult.coverUrl}
                      alt={isbnResult.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ color: "#d4a843", opacity: 0.3, fontFamily: "var(--font-cinzel)", fontSize: "18px" }}>✦</span>
                  )}
                </div>

                {/* Metadata + controls */}
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "13px", color: "#f0e0c0", marginBottom: "2px" }}>
                    {isbnResult.title}
                  </p>
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "#d4a843", fontStyle: "italic", marginBottom: "2px" }}>
                    {isbnResult.author}
                  </p>
                  {isbnResult.year && (
                    <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.4)", marginBottom: "16px" }}>
                      {isbnResult.year}
                    </p>
                  )}

                  {/* Format pills */}
                  <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.15em", color: "rgba(212,168,67,0.5)", textTransform: "uppercase", marginBottom: "8px" }}>Format</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                    {[
                      { key: "physical",     label: "Physical" },
                      { key: "ebook-kindle", label: "Kindle" },
                      { key: "ebook-libby",  label: "Libby" },
                      { key: "audiobook",    label: "Audiobook" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setIsbnFormat(opt.key)}
                        style={{
                          padding: "4px 12px", borderRadius: "999px",
                          fontSize: "11px", fontFamily: "var(--font-cinzel)",
                          letterSpacing: "0.08em", cursor: "pointer",
                          background: isbnFormat === opt.key ? "rgba(212,168,67,0.22)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isbnFormat === opt.key ? "rgba(212,168,67,0.5)" : "rgba(255,255,255,0.1)"}`,
                          color: isbnFormat === opt.key ? "#d4a843" : "rgba(240,224,192,0.45)",
                          transition: "all 0.15s",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Status pills */}
                  <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.15em", color: "rgba(212,168,67,0.5)", textTransform: "uppercase", marginBottom: "8px" }}>Status</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "18px" }}>
                    {(["tbr-owned", "tbr-not-owned", "reading", "read", "dnf"] as AppStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setIsbnStatus(s)}
                        style={{
                          padding: "4px 12px", borderRadius: "999px",
                          fontSize: "11px", fontFamily: "var(--font-cinzel)",
                          letterSpacing: "0.08em", cursor: "pointer",
                          background: isbnStatus === s ? "rgba(212,168,67,0.18)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isbnStatus === s ? "rgba(212,168,67,0.4)" : "rgba(255,255,255,0.08)"}`,
                          color: isbnStatus === s ? "#f0c060" : "rgba(240,224,192,0.4)",
                          transition: "all 0.15s",
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  {/* Already exists warning */}
                  {isbnAlreadyExists && (
                    <p style={{
                      fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic",
                      color: "rgba(253,186,116,0.85)", marginBottom: "12px",
                    }}>
                      This book is already in your library.
                    </p>
                  )}

                  {/* Add button */}
                  <button onClick={handleIsbnAdd} disabled={isbnAdding} style={GOLD_BUTTON}>
                    {isbnAdding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                    Add to Library
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        </>}

        {/* ══════════════════════════════════════════
            SECTION 3 — SYNC LIBBY
        ══════════════════════════════════════════ */}
        {activeTab === "libby" && (
          <section style={{ maxWidth: "480px" }}>
            <h2 style={SECTION_HEADING}>Sync from Libby</h2>

            {/* Already connected banner */}
            {libbyToken && libbyCards.length > 0 && libbyPhase === "setup" && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: "12px", padding: "10px 16px", marginBottom: "20px",
                background: "rgba(20,120,80,0.12)", border: "1px solid rgba(109,204,154,0.25)",
                borderRadius: "8px",
              }}>
                <span style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "#6dcc9a" }}>
                  ✓ Connected to Libby{libbyCards.length > 1 ? ` · ${libbyCards.length} library cards` : libbyCards.length === 1 ? ` · ${libbyCards[0].cardName}` : ""}
                </span>
                <button
                  onClick={() => { setLibbyToken(null); setLibbyCards([]); setSelectedCardKey(null); localStorage.removeItem("libbyAuth"); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-cinzel)", fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(240,224,192,0.3)" }}
                >
                  Disconnect
                </button>
              </div>
            )}

            {/* Setup phase */}
            {libbyPhase === "setup" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.55)", lineHeight: 1.6 }}>
                  {libbyToken
                    ? "Sync your latest loans and holds from Libby."
                    : "Click Connect — we'll show you a code to enter in your Libby app."}
                </p>
                {libbyError && (
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "#f87171", fontStyle: "italic" }}>
                    ⚠ {libbyError}
                  </p>
                )}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={handleLibbyConnect} style={{ ...GOLD_BUTTON, alignSelf: "flex-start" }}>
                    {libbyToken ? "Re-connect" : "Connect with Libby"}
                  </button>
                  {libbyToken && (
                    <button onClick={handleReSync} style={{ ...GOLD_BUTTON, alignSelf: "flex-start" }}>
                      Sync Now
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Code entry phase — user reads code from Libby and types it here */}
            {libbyPhase === "code" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.7)", lineHeight: 1.8 }}>
                  <strong style={{ color: "rgba(240,224,192,0.9)", fontStyle: "normal" }}>In Libby:</strong> Copy To Another Device → choose <strong style={{ color: "#d4a843", fontStyle: "normal" }}>Sonos Speaker</strong> (or any listed device) → Libby will display an 8-digit code.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontFamily: "var(--font-cinzel)", fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(212,168,67,0.6)" }}>
                    Enter code from Libby
                  </label>
                  <input
                    value={libbyInputCode}
                    onChange={(e) => setLibbyInputCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="12345678"
                    maxLength={8}
                    style={{
                      fontFamily: "var(--font-cinzel)", fontSize: "28px", letterSpacing: "0.3em",
                      background: "rgba(212,168,67,0.06)", border: "1px solid rgba(212,168,67,0.3)",
                      borderRadius: "8px", padding: "16px 20px", color: "#f0e0c0",
                      outline: "none", width: "100%", textAlign: "center",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={handleLibbyClone}
                    disabled={libbyInputCode.length < 8}
                    style={{ ...GOLD_BUTTON, opacity: libbyInputCode.length < 8 ? 0.4 : 1 }}
                  >
                    Sync Library
                  </button>
                  <button onClick={() => setLibbyPhase("setup")} style={{ ...GOLD_BUTTON, background: "none", borderColor: "rgba(212,168,67,0.2)", color: "rgba(212,168,67,0.4)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Importing phase */}
            {libbyPhase === "importing" && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "24px 0", fontFamily: "var(--font-cinzel)", fontSize: "11px", letterSpacing: "0.15em", color: "rgba(240,224,192,0.5)" }}>
                <Loader2 size={16} className="animate-spin" />
                Importing your books…
              </div>
            )}

            {/* Done phase */}
            {libbyPhase === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ padding: "20px 24px", background: "rgba(20,120,80,0.12)", border: "1px solid rgba(109,204,154,0.3)", borderRadius: "12px" }}>
                  <p style={{ fontFamily: "var(--font-cinzel)", fontSize: "13px", letterSpacing: "0.08em", color: "#6dcc9a", marginBottom: "8px" }}>
                    ✓ Sync complete
                  </p>
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)" }}>
                    {libbyLoansSynced > 0 || libbyHoldsSynced > 0
                      ? `${libbyLoansSynced} new loan${libbyLoansSynced !== 1 ? "s" : ""} and ${libbyHoldsSynced} new hold${libbyHoldsSynced !== 1 ? "s" : ""} added${libbyCards.length > 1 ? ` (${libbyCards.length} library cards)` : libbyCards.length === 1 ? ` (${libbyCards[0].cardName})` : ""}.`
                      : "No new books — your library is already up to date."}
                  </p>
                  {libbyUpdated > 0 && (
                    <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.55)", marginTop: "4px" }}>
                      {libbyUpdated} existing book{libbyUpdated !== 1 ? "s" : ""} updated to active loan status.
                    </p>
                  )}
                  {libbySkipped > 0 && (
                    <p style={{ fontFamily: "var(--font-crimson)", fontSize: "14px", color: "rgba(240,224,192,0.4)", marginTop: "4px" }}>
                      {libbySkipped} book{libbySkipped !== 1 ? "s" : ""} already in library (skipped).
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => { setLibbyPhase("setup"); setLibbyError(null); }} style={GOLD_BUTTON}>
                    Sync Again
                  </button>
                  <button onClick={() => router.push("/")} style={{ ...GOLD_BUTTON, background: "rgba(109,204,154,0.15)", borderColor: "rgba(109,204,154,0.4)", color: "#6dcc9a" }}>
                    Return to Library
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Divider */}
        <hr style={{ border: "none", borderTop: "1px solid rgba(212,168,67,0.15)", margin: "52px 0" }} />

        {/* ══════════════════════════════════════════
            UTILITIES
        ══════════════════════════════════════════ */}
        <section>
          <button
            onClick={() => setUtilitiesOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "20px",
            }}
          >
            <span style={{ ...SECTION_HEADING, marginBottom: 0 }}>Library Utilities</span>
            <span style={{
              fontFamily: "var(--font-cinzel)", fontSize: "9px",
              color: "rgba(212,168,67,0.5)",
              transform: utilitiesOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              display: "inline-block",
            }}>▼</span>
          </button>
          {utilitiesOpen && <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Reorganize Shelves */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)",
              borderRadius: "12px", padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            }}>
              <div>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)", marginBottom: "2px" }}>Reorganize Shelves</p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.35)" }}>
                  Redistribute all books evenly across shelves.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {repackDone && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(109,204,154,0.85)", fontStyle: "italic" }}>✓ Done</p>}
                {repackError && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>⚠ {repackError}</p>}
                <button onClick={handleRepackShelves} disabled={repacking} style={GOLD_BUTTON}>
                  {repacking ? <Loader2 size={13} className="animate-spin" /> : null}
                  {repacking ? "Reorganizing…" : "Run"}
                </button>
              </div>
            </div>

            {/* Fix Titles */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)",
              borderRadius: "12px", padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            }}>
              <div>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)", marginBottom: "2px" }}>Fix Book Titles</p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.35)" }}>
                  Strip Goodreads series suffixes like &ldquo;(Series, #1)&rdquo; from titles.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {fixTitlesDone !== null && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(109,204,154,0.85)", fontStyle: "italic" }}>{fixTitlesDone === 0 ? "✓ Already clean" : `✓ Fixed ${fixTitlesDone}`}</p>}
                {fixTitlesError && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>⚠ {fixTitlesError}</p>}
                <button onClick={handleFixTitles} disabled={fixingTitles} style={GOLD_BUTTON}>
                  {fixingTitles ? <Loader2 size={13} className="animate-spin" /> : null}
                  {fixingTitles ? "Fixing…" : "Run"}
                </button>
              </div>
            </div>

            {/* Remove Duplicates */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)",
              borderRadius: "12px", padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            }}>
              <div>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)", marginBottom: "2px" }}>Remove Duplicates</p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.35)" }}>
                  Matches by title + author. Keeps the earliest entry, removes the rest.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {dedupeDone !== null && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(109,204,154,0.85)", fontStyle: "italic" }}>{dedupeDone === 0 ? "✓ None found" : `✓ Removed ${dedupeDone}`}</p>}
                {dedupeError && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>⚠ {dedupeError}</p>}
                <button onClick={handleDedupe} disabled={deduping} style={GOLD_BUTTON}>
                  {deduping ? <Loader2 size={13} className="animate-spin" /> : null}
                  {deduping ? "Scanning…" : "Run"}
                </button>
              </div>
            </div>

            {/* Refresh Covers */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)",
              borderRadius: "12px", padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)", marginBottom: "2px" }}>Refresh All Covers</p>
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.35)" }}>
                    Fetch clean, high-res Google Books covers for every book — no curl effect.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  {coverRefreshUpdated !== null && !coverRefreshing && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(109,204,154,0.85)", fontStyle: "italic" }}>✓ {coverRefreshUpdated} updated</p>}
                  {coverRefreshError && <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>⚠ {coverRefreshError}</p>}
                  <button onClick={handleRefreshCovers} disabled={coverRefreshing} style={GOLD_BUTTON}>
                    {coverRefreshing ? <Loader2 size={13} className="animate-spin" /> : null}
                    {coverRefreshing ? `${coverRefreshDone} / ${coverRefreshTotal}` : "Run"}
                  </button>
                </div>
              </div>
              {coverRefreshing && coverRefreshTotal > 0 && (
                <div style={{ marginTop: "16px", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${(coverRefreshDone / coverRefreshTotal) * 100}%`,
                    background: "linear-gradient(90deg,#d4a843,#f0c060)", borderRadius: "999px",
                    transition: "width 0.3s ease", boxShadow: "0 0 8px rgba(212,168,67,0.4)",
                  }} />
                </div>
              )}
            </div>

            {/* Backfill Page Counts */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,168,67,0.15)",
              borderRadius: "12px", padding: "20px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            }}>
              <div>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "15px", color: "rgba(240,224,192,0.75)", marginBottom: "2px" }}>Backfill Page Counts</p>
                <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", fontStyle: "italic", color: "rgba(240,224,192,0.35)" }}>
                  Fetch page counts from Google Books for all books currently missing them.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                {backfillPCRunning && (
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(240,224,192,0.6)", fontStyle: "italic" }}>
                    {backfillPCDone} / {backfillPCTotal}
                  </p>
                )}
                {backfillPCResult !== null && !backfillPCRunning && (
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(109,204,154,0.85)", fontStyle: "italic" }}>
                    ✓ Updated {backfillPCResult}
                  </p>
                )}
                {backfillPCError && (
                  <p style={{ fontFamily: "var(--font-crimson)", fontSize: "13px", color: "rgba(248,113,113,0.85)", fontStyle: "italic" }}>
                    ⚠ {backfillPCError}
                  </p>
                )}
                <button onClick={handleBackfillPageCounts} disabled={backfillPCRunning} style={GOLD_BUTTON}>
                  {backfillPCRunning ? <Loader2 size={13} className="animate-spin" /> : null}
                  {backfillPCRunning ? `${backfillPCDone} / ${backfillPCTotal}` : "Run"}
                </button>
              </div>
            </div>

          </div>}
        </section>


      </div>
    </div>
  );
}
