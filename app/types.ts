export interface Book {
  id: string | number;
  title: string;
  author: string;
  coverGradient?: string;
  coverUrl?: string;
  glowColor: string;
  spineColor: string;
  accentColor: string;
  status: "read" | "reading" | "tbr";
  rating?: number;
}
