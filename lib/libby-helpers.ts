/**
 * Shared OverDrive / Libby helper types and mapping functions.
 * Used by both app/import/page.tsx (client) and app/api/cron/libby-sync/route.ts (server).
 */

export interface ODLoan {
  id: string;
  title: { text: string } | string;
  firstCreatorName?: string;
  covers?: { cover150Wide?: { href: string }; cover300Wide?: { href: string } };
  expires?: string;
  formats?: { id: string }[];
  seriesInfo?: { name: string; readingOrder?: number; totalCount?: number };
}

export interface ODHold {
  id: string;
  title: { text: string } | string;
  firstCreatorName?: string;
  covers?: { cover150Wide?: { href: string }; cover300Wide?: { href: string } };
  formats?: { id: string }[];
  seriesInfo?: { name: string; readingOrder?: number; totalCount?: number };
}

export function odFormat(formats?: { id: string }[]): { format: string; format_source: string } {
  const ids = (formats ?? []).map((f) => f.id);
  if (ids.some((id) => id.startsWith("audiobook"))) {
    return { format: "audiobook", format_source: "libby-loan" };
  }
  return { format: "ebook", format_source: "libby-loan" };
}

export function odCover(covers?: ODLoan["covers"]): string | null {
  const raw = covers?.cover300Wide?.href ?? covers?.cover150Wide?.href;
  return raw ? raw.replace(/^http:\/\//, "https://") : null;
}

export function odTitle(t: ODLoan["title"] | undefined): string {
  if (!t) return "Unknown Title";
  if (typeof t === "string") return t;
  return (t as { text?: string }).text ?? "Unknown Title";
}

export function mapLoanToRow(l: ODLoan) {
  const { format, format_source } = odFormat(l.formats);
  return {
    title: odTitle(l.title),
    author: l.firstCreatorName ?? "Unknown",
    cover_url: odCover(l.covers),
    google_books_id: l.id,
    status: "reading",
    format,
    format_source,
    return_date: (l as { expires?: string }).expires ?? null,
    series_name: l.seriesInfo?.name ?? null,
    series_position: l.seriesInfo?.readingOrder ?? null,
    series_total: l.seriesInfo?.totalCount ?? null,
  };
}

export function mapHoldToRow(h: ODHold) {
  const { format, format_source } = odFormat(h.formats);
  return {
    title: odTitle(h.title),
    author: h.firstCreatorName ?? "Unknown",
    cover_url: odCover(h.covers),
    google_books_id: h.id,
    status: "tbr-not-owned",
    format,
    format_source: format_source.replace("loan", "hold"),
    series_name: h.seriesInfo?.name ?? null,
    series_position: h.seriesInfo?.readingOrder ?? null,
    series_total: h.seriesInfo?.totalCount ?? null,
  };
}

/**
 * Partitions loans/holds into new inserts, TBR-to-loan updates, and skips.
 * Returns counts for logging.
 */
export function partitionLibbyBooks(
  loans: ODLoan[],
  holds: ODHold[],
  existing: Array<{ id: string; google_books_id: string | null; title: string | null; author: string | null; status: string }>
) {
  const byId = new Map(
    existing
      .filter(r => r.google_books_id)
      .map(r => [r.google_books_id as string, r])
  );
  const byKey = new Map(
    existing.map(r => [
      `${(r.title ?? "").toLowerCase().trim()}::${(r.author ?? "").toLowerCase().trim()}`,
      r,
    ])
  );

  const loanRows: ReturnType<typeof mapLoanToRow>[] = [];
  const holdRows: ReturnType<typeof mapHoldToRow>[] = [];
  const loanUpdates: Array<{ id: string; u: Record<string, unknown> }> = [];
  let skipped = 0;

  for (const loan of loans) {
    const mapped = mapLoanToRow(loan);
    const key = `${mapped.title.toLowerCase().trim()}::${(mapped.author ?? "").toLowerCase().trim()}`;
    const match = byId.get(loan.id) ?? byKey.get(key);
    if (!match) {
      loanRows.push(mapped);
    } else if (match.status === "tbr-owned" || match.status === "tbr-not-owned") {
      loanUpdates.push({
        id: match.id,
        u: {
          status: "reading",
          format: mapped.format,
          format_source: mapped.format_source,
          return_date: mapped.return_date ?? null,
          google_books_id: loan.id,
        },
      });
    } else {
      skipped++;
    }
  }

  for (const hold of holds) {
    const mapped = mapHoldToRow(hold);
    const key = `${mapped.title.toLowerCase().trim()}::${(mapped.author ?? "").toLowerCase().trim()}`;
    const match = byId.get(hold.id) ?? byKey.get(key);
    if (!match) holdRows.push(mapped);
    else skipped++;
  }

  return { loanRows, holdRows, loanUpdates, skipped };
}
