# Act Fairly

A complete, searchable database of every dispute filed with the Irish Residential Tenancies Board (RTB). Built with **Next.js** + **Supabase**.

## Features

- **Complete RTB Database** — All publicly available dispute records from rtb.ie
- **Searchable** — Search by name, address, DR number, TR number, or date range
- **League Table** — Identifies repeat parties (landlords & tenants) across disputes
- **Party Profiles** — Deduplicated records with full dispute history
- **Admin Panel** — Protected admin area for managing sync and settings
- **AI Enhancement** — (Coming soon) AI-powered PDF analysis for dispute summaries and outcomes
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
3. Run `supabase/schema.sql` — creates the core tables
4. Run `supabase/admin-schema.sql` — creates the admin settings table

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
```

### 4. Run Locally

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Initial Data Sync

Navigate to the **Admin** tab, log in, and click **Start Sync** to begin downloading dispute records. The sync is rate-limited to be respectful of the source.

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

## Database Schema

- **disputes** — Core dispute records with party info, dates, PDF links
- **parties** — Deduplicated people/entities with dispute counts
- **dispute_parties** — Join table linking parties to disputes
- **scrape_jobs** — Tracks sync progress and history
- **admin_settings** — Configuration store for API keys and settings

## Roadmap

- [ ] AI PDF analysis (extract dispute values, compensation, summaries)
- [ ] Property address extraction from PDFs
- [ ] Email alerts for new disputes involving watched parties
- [ ] Export to CSV/Excel
- [ ] Dispute type categorisation via AI

## License

This project collects and presents publicly available data from the RTB as permitted under Irish law. All dispute records are published by the RTB in accordance with the Residential Tenancies Acts.

---

*A free, open-source service by [rentle.ai](https://rentle.ai)*
