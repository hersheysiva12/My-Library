"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { Book } from "@/app/types";

interface GoogleBooksResult {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

interface SearchBarProps {
  onAddBook: (book: Book) => void;
}

// Cycles through a palette of cover styles for API results that have no cover image
const gradientPalette = [
  { coverGradient: "linear-gradient(160deg, #4a1942 0%, #2d0d2a 40%, #6b2560 100%)", glowColor: "rgba(140,40,150,0.7)", spineColor: "#4a1942", accentColor: "#e879f9" },
  { coverGradient: "linear-gradient(160deg, #1a3a4a 0%, #0d2030 40%, #1e4f6b 100%)", glowColor: "rgba(30,100,160,0.7)", spineColor: "#1a3a4a", accentColor: "#7dd3fc" },
  { coverGradient: "linear-gradient(160deg, #2d3a0d 0%, #1a2206 40%, #3d5010 100%)", glowColor: "rgba(80,140,20,0.7)", spineColor: "#2d3a0d", accentColor: "#a3e635" },
  { coverGradient: "linear-gradient(160deg, #4a2a0d 0%, #2d1806 40%, #6b3e10 100%)", glowColor: "rgba(160,90,20,0.7)", spineColor: "#4a2a0d", accentColor: "#fdba74" },
  { coverGradient: "linear-gradient(160deg, #0d2a3a 0%, #061820 40%, #0f3d52 100%)", glowColor: "rgba(20,100,130,0.7)", spineColor: "#0d2a3a", accentColor: "#5eead4" },
];

let paletteIndex = 0;
function nextPaletteEntry() {
  const entry = gradientPalette[paletteIndex % gradientPalette.length];
  paletteIndex++;
  return entry;
}

export default function SearchBar({ onAddBook }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleBooksResult[]>([]);
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
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.items ?? []);
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
    const rawThumb = volumeInfo.imageLinks?.thumbnail ?? volumeInfo.imageLinks?.smallThumbnail;
    // Upgrade to https to avoid mixed-content warnings
    const coverUrl = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined;

    const palette = nextPaletteEntry();
    const book: Book = {
      id: item.id,
      title: volumeInfo.title,
      author: volumeInfo.authors?.[0] ?? "Unknown Author",
      coverUrl,
      ...palette,
      status: "tbr",
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
          placeholder="Search for a book… press Enter"
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
          ) : results.length === 0 ? (
            <div className="py-6 text-center opacity-40" style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8", fontSize: "0.9rem" }}>
              No tomes found.
            </div>
          ) : (
            results.map((item) => {
              const { volumeInfo } = item;
              const thumb = volumeInfo.imageLinks?.smallThumbnail?.replace(/^http:\/\//, "https://");
              const author = volumeInfo.authors?.[0] ?? "Unknown Author";
              const added = addedIds.has(item.id);

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

                  {/* Add button */}
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
