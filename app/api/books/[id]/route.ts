import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/books/[id]
 * Fetches a single Google Books volume by ID.
 * Returns pageCount and imageLinks so callers can get the definitive cover
 * for a known edition without risking a wrong-edition mismatch from search.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?key=${process.env.GOOGLE_BOOKS_API_KEY}&fields=volumeInfo/pageCount,volumeInfo/imageLinks,volumeInfo/seriesInfo`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const errBody = res.status === 429
        ? { pageCount: null, imageLinks: null, seriesPosition: null, seriesId: null, error: "rate_limited" }
        : { pageCount: null, imageLinks: null, seriesPosition: null, seriesId: null };
      return NextResponse.json(errBody, { status: res.status });
    }
    const data = await res.json();
    const vi = data.volumeInfo ?? {};
    const rawNum = vi.seriesInfo?.bookDisplayNumber;
    const seriesPosition = rawNum != null ? parseFloat(rawNum) || null : null;
    const seriesId: string | null = vi.seriesInfo?.volumeSeries?.[0]?.seriesId ?? null;
    return NextResponse.json({
      pageCount: (vi.pageCount as number) ?? null,
      imageLinks: (vi.imageLinks as Record<string, string>) ?? null,
      seriesPosition,
      seriesId,
    });
  } catch {
    return NextResponse.json({ pageCount: null, imageLinks: null, seriesPosition: null, seriesId: null });
  }
}
