import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/books/[id]
 * Fetches a single Google Books volume by ID and returns its pageCount.
 * Used by the backfill process to populate page_count for existing books.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?key=${process.env.GOOGLE_BOOKS_API_KEY}&fields=volumeInfo/pageCount`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return NextResponse.json({ pageCount: null });
    const data = await res.json();
    return NextResponse.json({ pageCount: (data.volumeInfo?.pageCount as number) ?? null });
  } catch {
    return NextResponse.json({ pageCount: null });
  }
}
