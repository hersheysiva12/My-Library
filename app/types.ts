export interface Book {
  id: string | number;
  title: string;
  author: string;
  coverGradient?: string;
  coverUrl?: string;
  glowColor: string;
  spineColor: string;
  accentColor: string;
  status: "tbr-owned" | "tbr-not-owned" | "reading" | "read" | "dnf";
  rating?: number;
  /** The Google Books volume ID — stored separately from the Supabase row ID. */
  googleBooksId?: string;
  format?: "ebook" | "physical" | "audiobook";
  formatSource?: string;       // "Libby" | "Kindle" | "Spotify" | "Audible"
  startDate?: string;          // ISO date "YYYY-MM-DD"
  dateFinished?: string;
  review?: string;
  seriesName?: string;
  seriesPosition?: number;
  seriesTotal?: number;
  returnDate?: string;         // for Libby loans
  shelfNumber?: number;
}

/** Shape of a row in the Supabase `books` table. */
export interface DbBook {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  google_books_id: string | null;
  status: string;
  rating: number | null;
  created_at: string;
  format: string | null;
  format_source: string | null;
  start_date: string | null;
  date_finished: string | null;
  review: string | null;
  series_name: string | null;
  series_position: number | null;
  series_total: number | null;
  return_date: string | null;
  sort_order: number | null;
  shelf_number: number | null;
  tbr_order: number | null;
}
