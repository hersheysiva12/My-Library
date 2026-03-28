"use client";

import { useState } from "react";
import { Moon, Sparkles, BookOpen, Stars } from "lucide-react";
import { Book } from "@/app/types";
import SearchBar from "@/app/components/SearchBar";

const INITIAL_BOOKS: Book[] = [
  {
    id: 1,
    title: "The Name of the Wind",
    author: "Patrick Rothfuss",
    coverGradient: "linear-gradient(160deg, #6b1a1a 0%, #3d0c0c 40%, #8b2020 100%)",
    glowColor: "rgba(180, 30, 30, 0.7)",
    spineColor: "#6b1a1a",
    accentColor: "#d4a843",
    status: "read",
    rating: 5,
  },
  {
    id: 2,
    title: "Jonathan Strange & Mr Norrell",
    author: "Susanna Clarke",
    coverGradient: "linear-gradient(160deg, #0f1e4a 0%, #1a2d6b 40%, #0a1230 100%)",
    glowColor: "rgba(30, 60, 160, 0.7)",
    spineColor: "#0f1e4a",
    accentColor: "#a8c0e8",
    status: "read",
    rating: 5,
  },
  {
    id: 3,
    title: "A Wizard of Earthsea",
    author: "Ursula K. Le Guin",
    coverGradient: "linear-gradient(160deg, #0d3d2a 0%, #1a6040 40%, #0a2d1e 100%)",
    glowColor: "rgba(20, 120, 80, 0.7)",
    spineColor: "#0d3d2a",
    accentColor: "#6dcc9a",
    status: "read",
    rating: 5,
  },
  {
    id: 4,
    title: "The Shadow of the Wind",
    author: "Carlos Ruiz Zafón",
    coverGradient: "linear-gradient(160deg, #6b3a0a 0%, #4a2206 40%, #8b5010 100%)",
    glowColor: "rgba(180, 100, 20, 0.7)",
    spineColor: "#6b3a0a",
    accentColor: "#f0c060",
    status: "read",
    rating: 4,
  },
  {
    id: 5,
    title: "Piranesi",
    author: "Susanna Clarke",
    coverGradient: "linear-gradient(160deg, #3d1a6b 0%, #5e1a8b 40%, #2a0d4a 100%)",
    glowColor: "rgba(100, 30, 180, 0.7)",
    spineColor: "#3d1a6b",
    accentColor: "#c084fc",
    status: "reading",
  },
  {
    id: 6,
    title: "The House in the Cerulean Sea",
    author: "TJ Klune",
    coverGradient: "linear-gradient(160deg, #0d4a4a 0%, #0f6b6b 40%, #0a3535 100%)",
    glowColor: "rgba(20, 130, 140, 0.7)",
    spineColor: "#0d4a4a",
    accentColor: "#67e8f9",
    status: "tbr",
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{ color: star <= rating ? "#d4a843" : "rgba(255,255,255,0.2)", fontSize: "11px" }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Book["status"] }) {
  const config = {
    read: { label: "Read", bg: "rgba(20, 120, 80, 0.3)", border: "rgba(109, 204, 154, 0.5)", text: "#6dcc9a" },
    reading: { label: "Reading", bg: "rgba(100, 30, 180, 0.3)", border: "rgba(192, 132, 252, 0.5)", text: "#c084fc" },
    tbr: { label: "TBR", bg: "rgba(180, 100, 20, 0.3)", border: "rgba(240, 192, 96, 0.5)", text: "#f0c060" },
  };
  const c = config[status];
  return (
    <span
      className="text-[9px] tracking-widest px-1.5 py-0.5 rounded-full uppercase"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontFamily: "var(--font-cinzel)" }}
    >
      {c.label}
    </span>
  );
}

function BookCard({ book }: { book: Book }) {
  return (
    <div className="group flex flex-col items-center gap-2">
      {/* Book Cover */}
      <div
        className="relative w-[120px] h-[180px] rounded-r-md rounded-l-sm cursor-pointer
          transition-all duration-300 ease-out group-hover:-translate-y-5 overflow-hidden"
        style={{
          background: book.coverGradient ?? "#1a0f2e",
          boxShadow: `3px 3px 10px rgba(0,0,0,0.7), inset 3px 0 8px rgba(0,0,0,0.4)`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            `0 0 30px 8px ${book.glowColor}, 3px 3px 10px rgba(0,0,0,0.7), inset 3px 0 8px rgba(0,0,0,0.4)`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            `3px 3px 10px rgba(0,0,0,0.7), inset 3px 0 8px rgba(0,0,0,0.4)`;
        }}
      >
        {book.coverUrl ? (
          // Real cover from Google Books
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          // CSS gradient cover
          <>
            {/* Book spine shadow */}
            <div
              className="absolute left-0 top-0 w-[6px] h-full rounded-l-sm opacity-60"
              style={{ background: "linear-gradient(to right, rgba(0,0,0,0.6), transparent)" }}
            />
            {/* Decorative lines */}
            <div className="absolute inset-3 flex flex-col justify-between">
              <div className="w-full h-[1px] opacity-30" style={{ background: book.accentColor }} />
              <div className="flex flex-col gap-1.5 items-center">
                <div className="w-8 h-[1px] opacity-40" style={{ background: book.accentColor }} />
                <div
                  className="w-5 h-5 opacity-25 flex items-center justify-center"
                  style={{ border: `1px solid ${book.accentColor}`, borderRadius: "50%" }}
                >
                  <div className="w-2 h-2 rounded-full opacity-60" style={{ background: book.accentColor }} />
                </div>
                <div className="w-8 h-[1px] opacity-40" style={{ background: book.accentColor }} />
              </div>
              <div className="w-full h-[1px] opacity-30" style={{ background: book.accentColor }} />
            </div>
            {/* Title on cover */}
            <div className="absolute inset-0 flex items-center justify-center px-3">
              <p
                className="text-center text-[10px] leading-tight font-semibold tracking-wide opacity-90"
                style={{
                  fontFamily: "var(--font-cinzel)",
                  color: book.accentColor,
                  textShadow: `0 0 8px ${book.accentColor}`,
                }}
              >
                {book.title}
              </p>
            </div>
            {/* Gloss overlay */}
            <div
              className="absolute inset-0 rounded-r-md opacity-10"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)" }}
            />
          </>
        )}
      </div>

      {/* Book Info Below */}
      <div className="flex flex-col items-center gap-1 w-[130px]">
        <p
          className="text-center text-[11px] leading-tight font-semibold"
          style={{ fontFamily: "var(--font-cinzel)", color: "#f5e6c8" }}
        >
          {book.title}
        </p>
        <p
          className="text-center text-[10px] italic opacity-70"
          style={{ fontFamily: "var(--font-crimson)", color: "#d4a843" }}
        >
          {book.author}
        </p>
        <div className="flex flex-col items-center gap-1">
          <StatusBadge status={book.status} />
          {book.rating && <StarRating rating={book.rating} />}
        </div>
      </div>
    </div>
  );
}

function WoodenShelf() {
  return (
    <div className="relative w-full h-6 mt-2">
      <div
        className="absolute inset-0 rounded-sm"
        style={{
          background: "linear-gradient(to bottom, #a0714f 0%, #8b5e3c 30%, #6b4423 70%, #5c3317 100%)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,200,120,0.2)",
        }}
      />
      <div
        className="absolute inset-0 opacity-20 rounded-sm overflow-hidden"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(0,0,0,0.3) 40px,rgba(0,0,0,0.3) 41px),repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(255,200,100,0.1) 80px,rgba(255,200,100,0.1) 82px)`,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-sm"
        style={{ background: "linear-gradient(to right, #4a2a10, #6b3a1a, #8b5530, #6b3a1a, #4a2a10)" }}
      />
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-sm opacity-40"
        style={{ background: "linear-gradient(to right, transparent, rgba(255,200,120,0.5), transparent)" }}
      />
    </div>
  );
}

function Starfield() {
  const stars = [
    { top: "8%", left: "5%", size: 1.5, delay: "0s", duration: "4s" },
    { top: "15%", left: "20%", size: 1, delay: "1s", duration: "3s" },
    { top: "5%", left: "40%", size: 2, delay: "0.5s", duration: "5s" },
    { top: "12%", left: "60%", size: 1, delay: "2s", duration: "3.5s" },
    { top: "7%", left: "75%", size: 1.5, delay: "0.8s", duration: "4.5s" },
    { top: "20%", left: "88%", size: 1, delay: "1.5s", duration: "3s" },
    { top: "3%", left: "92%", size: 2, delay: "0.3s", duration: "5s" },
    { top: "18%", left: "48%", size: 1, delay: "2.5s", duration: "4s" },
    { top: "25%", left: "10%", size: 1.5, delay: "1.2s", duration: "3.8s" },
    { top: "10%", left: "32%", size: 1, delay: "0.7s", duration: "4.2s" },
    { top: "30%", left: "70%", size: 1, delay: "1.8s", duration: "3.3s" },
    { top: "22%", left: "55%", size: 1.5, delay: "0.4s", duration: "5.2s" },
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: "rgba(255, 230, 150, 0.8)",
            boxShadow: `0 0 ${star.size * 3}px rgba(255, 200, 100, 0.6)`,
            animation: `twinkle ${star.duration} ${star.delay} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

// Split books into rows of 3
function toShelves(books: Book[], perShelf = 3): Book[][] {
  const shelves: Book[][] = [];
  for (let i = 0; i < books.length; i += perShelf) {
    shelves.push(books.slice(i, i + perShelf));
  }
  return shelves;
}

export default function HomePage() {
  const [books, setBooks] = useState<Book[]>(INITIAL_BOOKS);

  function handleAddBook(book: Book) {
    setBooks((prev) => {
      // Prevent duplicates
      if (prev.some((b) => b.id === book.id)) return prev;
      return [...prev, book];
    });
  }

  const shelves = toShelves(books);
  const readCount = books.filter((b) => b.status === "read").length;
  const readingCount = books.filter((b) => b.status === "reading").length;

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #2a1040 0%, #1a0f2e 35%, #0d0a1a 70%)",
      }}
    >
      <Starfield />

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 100%, rgba(180, 100, 20, 0.15) 0%, transparent 70%)",
        }}
      />

      <main className="relative z-10 flex flex-col items-center px-8 py-12 max-w-4xl mx-auto">

        {/* Header */}
        <header className="flex flex-col items-center gap-4 mb-10">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
            style={{
              background: "radial-gradient(circle, #f0c060 0%, #d4a843 50%, #a07020 100%)",
              boxShadow: "0 0 30px 10px rgba(212, 168, 67, 0.35), 0 0 60px 20px rgba(212, 168, 67, 0.15)",
              animation: "float 6s ease-in-out infinite",
            }}
          >
            <Moon className="w-8 h-8" style={{ color: "#2a1a04" }} />
          </div>

          <h1
            className="text-5xl md:text-6xl text-center tracking-widest"
            style={{
              fontFamily: "var(--font-cinzel)",
              color: "#d4a843",
              textShadow: "0 0 20px rgba(212, 168, 67, 0.5), 0 0 60px rgba(212, 168, 67, 0.2)",
              letterSpacing: "0.15em",
            }}
          >
            My Library
          </h1>

          <div className="flex items-center gap-3 w-full max-w-xs">
            <div className="flex-1 h-[1px]" style={{ background: "linear-gradient(to right, transparent, #d4a843)" }} />
            <Sparkles className="w-4 h-4" style={{ color: "#d4a843", opacity: 0.8 }} />
            <div className="flex-1 h-[1px]" style={{ background: "linear-gradient(to left, transparent, #d4a843)" }} />
          </div>

          <p
            className="text-lg italic tracking-wider opacity-70"
            style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8" }}
          >
            A Magical Collection
          </p>

          {/* Stats — live from state */}
          <div className="flex gap-8 mt-2">
            {[
              { label: "Volumes", value: books.length },
              { label: "Read", value: readCount },
              { label: "In Progress", value: readingCount },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span
                  className="text-2xl font-semibold"
                  style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843" }}
                >
                  {stat.value}
                </span>
                <span
                  className="text-xs tracking-widest uppercase opacity-60"
                  style={{ fontFamily: "var(--font-cinzel)", color: "#f5e6c8" }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </header>

        {/* Search Bar */}
        <div className="w-full mb-10">
          <SearchBar onAddBook={handleAddBook} />
        </div>

        {/* Bookshelf Section */}
        <section className="w-full">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-5 h-5" style={{ color: "#d4a843" }} />
            <h2
              className="text-lg tracking-widest uppercase"
              style={{ fontFamily: "var(--font-cinzel)", color: "#d4a843", opacity: 0.9 }}
            >
              The Shelves
            </h2>
            <div className="flex-1 h-[1px] opacity-30" style={{ background: "#d4a843" }} />
          </div>

          {shelves.map((shelf, shelfIdx) => {
            const isFirst = shelfIdx === 0;
            const isLast = shelfIdx === shelves.length - 1;
            return (
              <div
                key={shelfIdx}
                className="relative px-6 pt-6 pb-0"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(212,168,67,0.08)",
                  borderTop: isFirst ? undefined : "none",
                  borderRadius: isFirst && isLast ? "4px" : isFirst ? "4px 4px 0 0" : isLast ? "0 0 4px 4px" : "0",
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "radial-gradient(ellipse at 50% 100%, rgba(180,100,20,0.08) 0%, transparent 60%)",
                  }}
                />
                <div className="relative flex justify-center gap-10 flex-wrap">
                  {shelf.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
                <WoodenShelf />
              </div>
            );
          })}
        </section>

        <footer className="mt-16 flex flex-col items-center gap-2 opacity-40">
          <div className="flex items-center gap-2">
            <div className="w-12 h-[1px]" style={{ background: "#d4a843" }} />
            <Stars className="w-3 h-3" style={{ color: "#d4a843" }} />
            <div className="w-12 h-[1px]" style={{ background: "#d4a843" }} />
          </div>
          <p
            className="text-xs tracking-widest italic"
            style={{ fontFamily: "var(--font-crimson)", color: "#f5e6c8" }}
          >
            &ldquo;A reader lives a thousand lives before he dies.&rdquo;
          </p>
        </footer>
      </main>
    </div>
  );
}
