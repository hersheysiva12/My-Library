/** Libby availability check via Thunder API (unofficial, no auth required).
 *  POST body: { books: { bookId: string; title: string; author: string }[]; advantageKey: string }
 *  Searches OverDrive library catalog and returns availability per book.
 */

interface InputBook {
  bookId: string;
  title: string;
  author: string;
}

interface AvailabilityResult {
  bookId: string;
  status: "available" | "holds" | "not_found";
  holdsCount?: number;
  libbyUrl?: string;
}

async function checkOne(
  book: InputBook,
  advantageKey: string,
  librarySlug: string
): Promise<AvailabilityResult> {
  try {
    const q = encodeURIComponent(`${book.title} ${book.author}`);
    const url = `https://thunder.api.overdrive.com/v2/libraries/${advantageKey}/search?query=${q}&perPage=5`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { bookId: book.bookId, status: "not_found" };

    const data = await res.json();
    const items: {
      title?: string;
      availability?: { isAvailable?: boolean; numberOfHolds?: number };
    }[] = data.items ?? [];

    if (items.length === 0) return { bookId: book.bookId, status: "not_found" };

    // Find best title match (strip subtitle after colon/em-dash for fuzzy match)
    const normalise = (s: string) =>
      s.toLowerCase().split(/[:\u2013\u2014]/)[0].trim();
    const needle = normalise(book.title);
    const match =
      items.find((i) => normalise(i.title ?? "").includes(needle)) ??
      items.find((i) => needle.includes(normalise(i.title ?? "").slice(0, 8))) ??
      items[0];

    const avail = match?.availability;
    if (!avail) return { bookId: book.bookId, status: "not_found" };

    const libbyUrl = `https://libbyapp.com/search/${librarySlug}/search/query-${encodeURIComponent(book.title)}`;

    if (avail.isAvailable) {
      return { bookId: book.bookId, status: "available", libbyUrl };
    }
    return {
      bookId: book.bookId,
      status: "holds",
      holdsCount: avail.numberOfHolds ?? 0,
      libbyUrl,
    };
  } catch {
    return { bookId: book.bookId, status: "not_found" };
  }
}

export async function POST(req: Request) {
  const { books, advantageKey, librarySlug } = await req.json() as {
    books: InputBook[];
    advantageKey: string;
    librarySlug: string;
  };

  if (!books?.length || !advantageKey) {
    return Response.json({ error: "books and advantageKey required" }, { status: 400 });
  }

  // Process in parallel batches of 5 to avoid overwhelming the API
  const BATCH = 5;
  const results: AvailabilityResult[] = [];
  for (let i = 0; i < books.length; i += BATCH) {
    const batch = books.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((b) => checkOne(b, advantageKey, librarySlug ?? advantageKey))
    );
    results.push(...batchResults);
  }

  return Response.json({ results });
}
