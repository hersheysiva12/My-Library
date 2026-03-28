# Virtual Library App — Project Brief & CLAUDE.md

> **How to use this file:** This document serves two purposes. First, read the Project Brief section to understand the full scope of what we're building. Then, once you've set up your Next.js project, save this entire file as `CLAUDE.md` in your project root — Claude Code will read it at the start of every session so you never have to re-explain the project.

---

## PART 1: PROJECT BRIEF

### What We're Building

A personal virtual library app that consolidates all of a user's books — Kindle, physical, audiobooks, and Libby/OverDrive loans — into a single beautiful interface that looks like a real bookshelf. The app includes personal reading records, TBR (to-be-read) management, series tracking, and an AI agent layer that proactively notifies the user about new releases and Libby hold opportunities.

### Core Problem Being Solved

The user owns books across multiple fragmented platforms (Kindle, Audible, physical, Libby) with no single place to track what they own, what they've read, what they want to read next, and what sequels are coming. Managing holds on Libby and tracking new releases from favorite authors is entirely manual today.

---

## PART 2: FEATURE SCOPE

### ✅ Core App Features

**Visual Bookshelf UI**
- Homepage displays book covers in a grid styled to look like a real wooden bookshelf
- Warm, library-aesthetic design with book spines, cover art, and shelf styling
- Book covers fetched from Google Books API
- Filter/sort by: format, read status, series, author, rating

**Book Records**
Each book stores:
- Title, author, cover image URL
- Format: kindle / physical / audiobook / libby
- Status: owned / tbr / reading / finished
- My rating (1–5 stars)
- My review (freeform text)
- Date finished
- Is part of series (boolean)
- Series name
- Series position (e.g. Book 2 of 5)

**Book Detail Panel**
- Click any book cover → slide-out panel on the right
- Edit all fields above inline
- Mark as finished with a date picker
- Shows series context (what comes before/after)

**TBR Management**
- Dedicated TBR view showing all books with status = 'tbr'
- Drag-and-drop reordering to set reading priority
- "Next in Series" section: books where the user finished the previous entry but doesn't own the next one

**Series Tracking**
- Auto-detect gaps in series (owns Book 1 and 3 but not Book 2)
- Surface unowned sequels to finished series

### 🟡 Import Flows

**Goodreads CSV Import** (primary import for Kindle library)
- User exports from Goodreads (Account → Import/Export)
- Upload CSV → preview table → confirm → bulk insert into database
- Maps Goodreads columns to app schema

**ISBN Entry for Physical Books**
- Type in ISBN → auto-populate metadata from Google Books API
- Confirm → save to database

**Manual Add**
- Search by title via Google Books API
- Select from results → add to library with format/status

### 🤖 Agentic Layer (AI Notifications)

**Trigger 1: "Finished a Book" Hold Reminder**
- When user marks a book as "finished" in the app:
  1. Check if it's part of a series
  2. If yes, look up whether the next book is available on Libby (via OverDrive API)
  3. Send email: "You finished [Book X]! [Book Y] is next in the series. It's [available now / X people ahead of you] on Libby. Place your hold here: [deep link]"

**Trigger 2: Weekly New Release Digest**
- Runs every Monday via a scheduled cron job
- Gets all unique authors from the user's library
- Searches Google Books API for books published in the last 30 days by those authors
- Filters out books the user already owns
- Claude API writes a friendly digest email summarizing what's new
- Sent via Resend

**Trigger 3: TBR Intelligence Email**
- Weekly email from the Claude API analyzing the full TBR list
- Recommends what to read next based on:
  - Libby availability right now (prioritize free books)
  - Series completion status
  - Patterns from past reviews (genre, length, mood)

**Notification delivery:** Email via Resend API (not autonomous actions — the agent recommends, the user acts)

---

## PART 3: TECH STACK

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Full-stack framework, easy Vercel deploy |
| Styling | Tailwind CSS | Fast, utility-first styling |
| Database | Supabase (PostgreSQL) | Free tier, real-time, built-in auth |
| Book Data | Google Books API | Covers, metadata, author info, free |
| Book Data (fallback) | Open Library API | Better series/sequel metadata |
| Email | Resend API | Simple transactional email, free tier |
| AI Agent | Anthropic Claude API | Digest writing, TBR recommendations |
| Cron Jobs | Vercel Cron | Scheduled weekly agent jobs |
| Deployment | Vercel | Free tier, GitHub integration |
| Code Editor | Claude Code | Agentic coding via terminal |

### External APIs Needed
- Google Books API key (console.cloud.google.com → enable Books API)
- Supabase project URL + anon key
- Resend API key (resend.com)
- Anthropic API key (console.anthropic.com)
- OverDrive/Libby API (unofficial, for hold availability checks)

### Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_BOOKS_API_KEY=
RESEND_API_KEY=
ANTHROPIC_API_KEY=
NOTIFICATION_EMAIL=
```

---

## PART 4: DATABASE SCHEMA

### books table
```sql
CREATE TABLE books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_url TEXT,
  isbn TEXT,
  google_books_id TEXT,
  status TEXT CHECK (status IN ('owned', 'tbr', 'reading', 'finished')),
  format TEXT CHECK (format IN ('kindle', 'physical', 'audiobook', 'libby')),
  my_rating INTEGER CHECK (my_rating BETWEEN 1 AND 5),
  my_review TEXT,
  date_finished DATE,
  is_series BOOLEAN DEFAULT FALSE,
  series_name TEXT,
  series_position INTEGER,
  total_series_books INTEGER,
  genre TEXT,
  page_count INTEGER,
  published_year INTEGER
);
```

### notification_log table (to avoid duplicate emails)
```sql
CREATE TABLE notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  type TEXT,
  book_id UUID REFERENCES books(id),
  message TEXT
);
```

---

## PART 5: ARCHITECTURE OVERVIEW

```
[Frontend — Next.js]
    ├── / (homepage)           → Visual bookshelf grid
    ├── /tbr                   → TBR list with drag-and-drop
    ├── /import                → CSV upload + ISBN entry
    └── /book/[id]             → Book detail (or slide panel)

[API Routes — Next.js]
    ├── /api/books             → CRUD operations
    ├── /api/search            → Google Books API proxy
    ├── /api/import            → Goodreads CSV parser
    ├── /api/agent             → Claude API call for recommendations
    └── /api/cron/weekly       → New release + TBR digest (Vercel Cron)

[Database — Supabase]
    ├── books table
    └── notification_log table

[Scheduled Agent — Vercel Cron, runs Mondays]
    ├── Query all authors from books table
    ├── Search Google Books for recent releases
    ├── Call Claude API to write digest
    └── Send email via Resend

[Event-Driven Agent — triggers on book status change]
    ├── Detect "finished" status update
    ├── Look up next in series
    ├── Check Libby availability
    └── Send hold reminder email via Resend
```

---

## PART 6: BUILD PLAN (4 Weeks)

### Week 1: Foundation
- [ ] Set up Next.js project with TypeScript + Tailwind
- [ ] Create Supabase project and run schema SQL
- [ ] Build visual bookshelf homepage with hardcoded sample data
- [ ] Connect Google Books API search
- [ ] Wire up "Add to Library" → saves to Supabase
- [ ] Load books from Supabase on startup

### Week 2: Book Management
- [ ] Book detail slide-out panel (edit all fields)
- [ ] Status management (owned/tbr/reading/finished)
- [ ] Star rating + review input
- [ ] Series fields (name, position, total books)
- [ ] Goodreads CSV import flow
- [ ] ISBN manual entry

### Week 3: TBR & Series Intelligence
- [ ] TBR view with drag-and-drop reorder
- [ ] "Next in Series" section (owned prev, not next)
- [ ] Series gap detection
- [ ] Filter/sort controls on bookshelf

### Week 4: Agent + Deploy
- [ ] Claude API integration (/api/agent route)
- [ ] "Finished book" trigger → hold reminder email
- [ ] Vercel Cron weekly new release monitor
- [ ] Weekly TBR digest email
- [ ] Push to GitHub
- [ ] Deploy to Vercel + set environment variables
- [ ] Activate cron jobs

---

## PART 7: CLAUDE CODE WORKFLOW

### Starting Each Session
```bash
cd my-library
claude
```
Claude Code will read this CLAUDE.md file automatically every session.

### Useful Claude Code Commands
- Type naturally in the terminal to describe what you want
- `/undo` — reverse the last change
- `Escape` — interrupt Claude if going in the wrong direction
- `claude doctor` — diagnose configuration issues
- In a second terminal tab: `npm run dev` to preview at localhost:3000

### Commit After Each Phase
```bash
git add .
git commit -m "phase 1: visual bookshelf complete"
```

### Golden Rules for Prompting Claude Code
1. **One feature at a time** — don't ask for 5 things at once
2. **Be specific** — "warm oak wood texture with drop shadows" beats "make it look better"
3. **Paste errors directly** — "I got this error: [paste]" and it will fix it
4. **Review diffs before approving** — Claude Code shows what it's changing
5. **Commit when something works** — gives you a fallback if you break it later

---

## PART 8: SAMPLE PROMPTS FOR EACH PHASE

Use these as starting points — paste them directly into Claude Code.

### Phase 1: Visual Bookshelf
```
Build a homepage that looks like a warm wooden bookshelf. Display books in a 
grid with their cover images, titles, and authors. Use Tailwind CSS for styling. 
Fetch book cover images from the Google Books API. Use hardcoded sample data 
for 8 books for now — we'll connect the database later. Make it visually 
beautiful and warm, like a real library.
```

### Phase 1: Search + Add
```
Add a search bar at the top of the bookshelf. When I type a book title and 
press enter, call the Google Books API and show a results dropdown. When I 
click a result, add it to a local state array and render it on the shelf.
```

### Phase 2: Supabase Connection
```
Connect the app to Supabase. Create a books table with these columns: id, 
title, author, cover_url, isbn, status (owned/tbr/reading/finished), format 
(kindle/physical/audiobook/libby), my_rating (1-5), my_review, date_finished, 
is_series (boolean), series_name, series_position, total_series_books. Update 
the bookshelf to load from Supabase and save new books there.
```

### Phase 2: Book Detail Panel
```
When I click a book cover, open a slide-out panel on the right side. Show all 
the book's details and let me edit: status, format, star rating (1-5), review 
text, date finished (date picker), series name, and series position. Save 
changes to Supabase on blur or with a Save button.
```

### Phase 3: Goodreads Import
```
Add an import page at /import. Let me upload a Goodreads CSV export file. 
Parse it, show me a preview table of the first 20 books, and on confirmation 
bulk-insert everything into the Supabase books table. Map Goodreads columns 
(Title, Author, My Rating, Date Read, Bookshelves, ISBN) to my schema.
```

### Phase 4: Hold Reminder Agent
```
When I mark a book's status as 'finished', trigger a server action that:
1. Checks if the book is part of a series (is_series = true)
2. Queries Supabase for the next book in that series (series_position + 1)
3. If I don't own it, sends me an email via the Resend API saying which book 
   is next and linking to Libby search for that title
4. Logs the notification to the notification_log table

Use my RESEND_API_KEY and NOTIFICATION_EMAIL from environment variables.
```

### Phase 4: Weekly Cron Agent
```
Create a Vercel cron job that runs every Monday at 8am. Create the route at 
/api/cron/weekly. It should:
1. Query all unique authors from my Supabase books table
2. For each author, search Google Books API for books published in the last 30 days
3. Filter out any books already in my database
4. Call the Anthropic Claude API to write a friendly email digest summarizing 
   new releases I might want
5. Send the email via Resend

Also create a vercel.json file that schedules this cron to run every Monday.
```

---

## PART 9: KEY DESIGN DECISIONS & TRADEOFFS

**Why notifications instead of autonomous hold-placing:**
Libby/OverDrive has no official public API for end users, and autonomous actions on third-party platforms raise ToS concerns. Human-in-the-loop is also the right design pattern for agentic AI right now — the agent recommends, the user approves.

**Why Goodreads CSV instead of Kindle API:**
Amazon has no public Kindle library API. Goodreads export is the most reliable one-time import path for an existing library.

**Why Vercel Cron instead of a separate backend:**
Keeps infrastructure simple for a first project. Vercel's free tier supports cron jobs and all API routes in one deployment.

**Why Supabase:**
Free tier is generous, it includes auth if you want to add it later, and it has a visual dashboard to inspect your data during development.
