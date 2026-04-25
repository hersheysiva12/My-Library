import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q?.trim()) return NextResponse.json({ items: [] });

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&key=${process.env.GOOGLE_BOOKS_API_KEY}&maxResults=12&printType=books`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const errorBody = res.status === 429
        ? { error: "rate_limited", message: "Too many requests — try again in a moment." }
        : { error: "api_error", message: "Search unavailable." };
      return NextResponse.json(errorBody, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
