export interface Book {
  id: string | number;
  title: string;
  author: string;
  coverGradient?: string;
  coverUrl?: string;
  glowColor: string;
  spineColor: string;
  accentColor: string;
  status: "read" | "reading" | "tbr" | "owned";
  rating?: number;
  /** The Google Books volume ID — stored separately from the Supabase row ID. */
  googleBooksId?: string;
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
}
