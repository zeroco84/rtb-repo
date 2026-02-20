# RTB Dispute Database

A comprehensive, searchable database of every dispute filed with the Irish Residential Tenancies Board (RTB). Built on **Next.js** + **Supabase** with an **iOS 26 Liquid Glass** design language.

## Features

- **Full RTB Scraper** — Automatically downloads all dispute records from rtb.ie via their FacetWP API
- **Searchable Database** — Search by name, address, DR number, TR number, date range
- **League Table** — Identifies repeat offenders (landlords & tenants) with podium display
- **Party Tracking** — Deduplicated party records with dispute history
- **Daily Auto-Sync** — CRON job runs daily at 3am UTC to pull new records
- **AI Enhancement** — (Future) AI agent scans PDFs to extract dispute values, compensation amounts, and summaries
- **Liquid Glass UI** — Dark mode with glassmorphism, ambient gradients, and smooth animations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Scraping | RTB FacetWP API + Cheerio |
| Deployment | Vercel (recommended) |
| Design | iOS 26 Liquid Glass |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a Supabase project at https://supabase.com
2. Go to the **SQL Editor** in your Supabase dashboard
3. Run the migration script:

```bash
# Copy the contents of supabase/schema.sql and paste into the SQL Editor
cat supabase/schema.sql
```

4. Copy your Supabase credentials:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon Key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service Role Key** → `SUPABASE_SERVICE_ROLE_KEY` (found under Settings > API)

### 3. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

**.env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-secret-for-cron-auth
```

### 4. Run Locally

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Trigger First Sync

Navigate to the **Data Sync** tab and click **Start Sync**. This will:
1. Fetch a security nonce from rtb.ie
2. Paginate through all dispute records
3. Parse and store each record in Supabase
4. Create deduplicated party records
5. Build the league table

## Deployment to Vercel

```bash
npx vercel
```

Set the environment variables in your Vercel project settings. The CRON job in `vercel.json` will automatically run daily at 3am UTC.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/stats` | GET | Dashboard statistics |
| `/api/disputes` | GET | Search/list disputes (with filtering & pagination) |
| `/api/parties` | GET | League table (search, filter by type, min disputes) |
| `/api/parties/[id]` | GET | Party detail with dispute history |
| `/api/scrape` | GET | Get latest scrape job status |
| `/api/scrape` | POST | Start a new scrape job |
| `/api/cron` | GET | CRON endpoint for daily sync |

## Database Schema

- **disputes** — Core dispute records with party info, dates, PDF links
- **parties** — Deduplicated people/entities with dispute counts
- **dispute_parties** — Join table linking parties to disputes
- **scrape_jobs** — Tracks scraping progress and history

## How the Scraper Works

The scraper is ported from the Ruby `RtbSearchService` in rentle-1. It:

1. Fetches `rtb.ie/disputes/dispute-outcomes-and-orders/adjudication-and-tribunal-orders`
2. Extracts a FacetWP nonce from the page HTML
3. POSTs to `/wp-json/facetwp/v1/refresh` with pagination parameters
4. Parses the returned HTML using Cheerio (like Nokogiri for Node.js)
5. Extracts: heading, DR number, TR number, date, PDF links
6. Parses the heading to identify applicant/respondent names and roles
7. Upserts into Supabase with deduplication on DR number

## Future Enhancements

- [ ] AI PDF analysis (extract dispute values, compensation, summaries)
- [ ] Date of birth tracking (if available in records)
- [ ] Property address extraction from PDFs
- [ ] Email alerts for new disputes involving watched parties
- [ ] Export to CSV/Excel
- [ ] Dispute type categorization via AI
