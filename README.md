# Act Fairly

A complete, searchable database of every dispute and court enforcement order filed with the Irish Residential Tenancies Board (RTB). Built with **Next.js** + **Supabase**.

## Features

- **Complete RTB Database** — All publicly available dispute records from rtb.ie
- **Court Enforcement Orders** — Scraped and linked to existing dispute records
- **Searchable** — Search by name, address, DR number, court ref, or date range
- **League Table** — Identifies repeat parties (landlords & tenants) across disputes and enforcement orders
- **Party Profiles** — Deduplicated records with full case history (disputes + enforcement orders)
- **AI Analysis** — Gemini-powered PDF analysis for dispute summaries, outcomes, and compensation amounts
- **Enforcement AI** — Court order analysis with outcome extraction and cost orders
- **Admin Panel** — Protected admin area for managing sync, AI processing, and settings
- **Public API** — Authenticated REST API for third-party integrations
- **Modern UI** — Dark mode with glassmorphism, ambient gradients, and smooth animations

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
3. Run `supabase/schema.sql` — creates core tables (disputes, parties, dispute_parties, scrape_jobs)
4. Run `supabase/admin-schema.sql` — creates the admin settings and API users tables
5. Run `supabase/enforcement-schema.sql` — creates enforcement orders, enforcement_parties join table

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

**.env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=your-admin-password
CRON_SECRET=your-secret-for-cron-auth
GEMINI_API_KEY=your-gemini-api-key
```

### 4. Run Locally

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Initial Data Sync

Navigate to the **Admin** tab, log in, and click **Start Sync** to begin downloading dispute records. Scroll down to **Enforcement Orders Sync** to scrape court enforcement orders. Both use the RTB's FacetWP API and are rate-limited to be respectful of the source.

## Deployment

The app can be deployed to any platform that supports Next.js (Render, Railway, Coolify, etc.).

### Render

A `render.yaml` blueprint is included. Create a new Web Service, connect your repo, and add the environment variables.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `ADMIN_PASSWORD` | Yes | Password for the admin panel |
| `CRON_SECRET` | No | Secret to authenticate daily auto-sync |
| `GEMINI_API_KEY` | No | Google Gemini API key for AI analysis |

## Database Schema

- **disputes** — Core dispute records with party info, dates, PDF links, and AI analysis
- **enforcement_orders** — Court enforcement orders with AI analysis fields
- **parties** — Deduplicated people/entities with combined dispute + enforcement counts
- **dispute_parties** — Join table linking parties to disputes
- **enforcement_parties** — Join table linking parties to enforcement orders
- **scrape_jobs** — Tracks sync progress and history (disputes and enforcement)
- **admin_settings** — Configuration store for API keys and settings
- **api_users** — API key management for the public REST API

## API

The public REST API is available at `/api/v1/`. Authentication is via API key (issued from the Admin panel).

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/disputes` | Search and list disputes |
| `GET /api/v1/disputes/:dr_no` | Get dispute details by DR number |
| `GET /api/v1/parties` | Search and list parties |
| `GET /api/v1/parties/:id` | Party detail with dispute + enforcement history |
| `GET /api/v1/search` | Full-text search across all records |

## Roadmap

- [x] AI PDF analysis (extract dispute values, compensation, summaries)
- [x] Court enforcement orders scraping and AI analysis
- [x] Party linking across disputes and enforcement orders
- [x] Public REST API with key management
- [ ] Email alerts for new disputes involving watched parties
- [ ] Export to CSV/Excel
- [ ] Push notifications for new enforcement orders

## License

This project collects and presents publicly available data from the RTB as permitted under Irish law. All dispute records are published by the RTB in accordance with the Residential Tenancies Acts.

---

*A free, open-source service by [rentle.ai](https://rentle.ai)*

