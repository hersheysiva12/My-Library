"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { Book } from "@/app/types";
import { gradientPalette } from "@/lib/gradients";

function cleanCoverUrl(raw: string): string {
  return raw
    .replace(/^http:\/\//, "https://")
    .replace(/&edge=curl/g, "")
    .replace(/&source=gbs_api/g, "");
}

function bestGoogleCover(imageLinks: { extraLarge?: string; large?: string; medium?: string; thumbnail?: string; smallThumbnail?: string } | undefined): string | undefined {
  if (!imageLinks) return undefined;
  return imageLinks.extraLarge ?? imageLinks.large ?? imageLinks.medium ?? imageLinks.thumbnail ?? imageLinks.smallThumbnail;
}

interface GoogleBooksResult {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    pageCount?: number;
    imageLinks?: { extraLarge?: string; large?: string; medium?: string; thumbnail?: string; smallThumbnail?: string };
  };
}

interface SearchBarProps {
  onAddBook: (book: Book) => void;
  /** Google Books IDs already in the library — shown as already added. */
  existingGoogleIds?: string[];
}

let paletteIndex = 0;
function nextPaletteEntry() {
  const entry = gradientPalette[paletteIndex % gradientPalette.length];
  paletteIndex++;
  return entry;
}

export default function SearchBar({ onAddBook, existingGoogleIds = [] }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleBooksResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function search() {
    if (!query.trim()) return;
    setIsLoading(true);
    setIsOpen(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.message ?? "Search unavailable — try again shortly.");
        setResults([]);
      } else {
        setResults(data.items ?? []);
      }
    } catch {
      setSearchError("Could not reach the search service.");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") search();
    if (e.key === "Escape") setIsOpen(false);
  }

  function handleAdd(item: GoogleBooksResult) {
    const { volumeInfo } = item;
    const rawThumb = bestGoogleCover(volumeInfo.imageLinks);
    const coverUrl = rawThumb ? cleanCoverUrl(rawThumb) : undefined;

    const palette = nextPaletteEntry();
    const book: Book = {
      id: item.id,
      title: volumeInfo.title,
      author: volumeInfo.authors?.[0] ?? "Unknown Author",
      coverUrl,
      pageCount: volumeInfo.pageCount,
      ...palette,
      status: "tbr-owned",
    };
    onAddBook(book);
    setAddedIds((prev) => new Set(prev).add(item.id));
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      {/* Input row */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(212,168,67,0.25)",
          boxShadow: "0 0 20px rgba(212,168,67,0.05)",
        }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: "rgba(212,168,67,0.6)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search by title or author… press Enter"
          className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40"
          style={{
            fontFamily: "var(--font-crimson)",
            color: "#f5e6c8",
            fontSize: "1rem",
          }}
        />
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "rgba(212,168,67,0.6)" }} />}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
          style={{
            background: "#12091e",
            border: "1px solid rgba(212,168,67,0.2)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 20px rgba(212,168,67,0.05)",
            maxHeight: "360px",
            overflowY: "auto",
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6" style={{ color: "rgba(245,230,200,0.5)" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span style={{ fontFamily: "var(--font-crimson)", fontSize: "0.9rem" }}>Searching the archives…</span>
            </div>
          ) : searchError ? (
            <div className="py-6 text-center px-4" style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8", fontSize: "0.9rem" }}>
              <span style={{ opacity: 0.7 }}>⚠ {searchError}</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center opacity-40" style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8", fontSize: "0.9rem" }}>
              No tomes found.
            </div>
          ) : (
            results.map((item) => {
              const { volumeInfo } = item;
              const thumb = bestGoogleCover(volumeInfo.imageLinks) ? cleanCoverUrl(bestGoogleCover(volumeInfo.imageLinks)!) : undefined;
              const author = volumeInfo.authors?.[0] ?? "Unknown Author";
              const added = addedIds.has(item.id) || existingGoogleIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(212,168,67,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onClick={() => !added && handleAdd(item)}
                >
                  {/* Thumbnail */}
                  <div
                    className="w-9 h-12 shrink-0 rounded-sm overflow-hidden"
                    style={{
                      background: "linear-gradient(160deg, #2a1a40, #1a0f2e)",
                      boxShadow: "2px 2px 6px rgba(0,0,0,0.5)",
                    }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={volumeInfo.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-30 text-[8px]" style={{ color: "#d4a843", fontFamily: "var(--font-cinzel)" }}>
                        ✦
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm truncate"
                      style={{ fontFamily: "var(--font-cinzel)", color: "#f5e6c8", fontSize: "0.75rem" }}
                    >
                      {volumeInfo.title}
                    </p>
                    <p
                      className="text-xs truncate mt-0.5 italic opacity-60"
                      style={{ fontFamily: "var(--font-crimson)", color: "#d4a843" }}
                    >
                      {author}
                    </p>
                  </div>

                  {/* Add / Already added button */}
                  <button
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: added ? "rgba(109,204,154,0.2)" : "rgba(212,168,67,0.15)",
                      border: `1px solid ${added ? "rgba(109,204,154,0.4)" : "rgba(212,168,67,0.3)"}`,
                      color: added ? "#6dcc9a" : "#d4a843",
                      cursor: added ? "default" : "pointer",
                    }}
                    onClick={(e) => { e.stopPropagation(); if (!added) handleAdd(item); }}
                  >
                    {added ? (
                      <span style={{ fontSize: "10px" }}>✓</span>
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
