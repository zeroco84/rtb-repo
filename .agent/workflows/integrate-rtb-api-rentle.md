---
description: Integrate Act Fairly RTB API into Rentle to replace direct RTB website scraping
---

# Integrate Act Fairly RTB API

## Context

The Rentle app (rentle-1) currently calls the RTB website directly to search dispute records for tenant screening. We've built a dedicated API at **actfairly.com** that provides enhanced, AI-analysed RTB data. This integration replaces the direct RTB scraping with calls to our own API, which offers:

- **No rate limits** (1,000 req/hr for our account)
- **AI-analysed data** — outcomes, award amounts, dispute types, summaries
- **Party-level aggregation** — total disputes, net awards for/against
- **Structured JSON** — clean, easily digestible responses
- **Tenant name search** — search across all 20,000+ RTB disputes

## API Credentials

- **Base URL:** `https://actfairly.com/api/v1`
- **API Key:** `rtb_live_9f4611ec2b67265c211c553bb8be46d641ca8fb73cbf4ea4`
- **Auth Header:** `Authorization: Bearer rtb_live_9f4611ec2b67265c211c553bb8be46d641ca8fb73cbf4ea4`
- **Rate Limit:** 1,000 requests/hour

Store the API key in Rails credentials or environment variables as `ACTFAIRLY_API_KEY`.

## API Endpoints

### 1. Search by Tenant Name (Primary Use Case)
```
GET /api/v1/disputes?name={tenant_name}&per_page=25
```
Returns disputes where the tenant appears as applicant OR respondent.

**Response:**
```json
{
  "data": [
    {
      "dr_no": "DR0724-97609",
      "heading": "Applicant Landlord: ... – Respondent Tenant: John Smith",
      "date": "2024-11-24",
      "applicant": { "name": "Some Landlord", "role": "Landlord" },
      "respondent": { "name": "John Smith", "role": "Tenant" },
      "analysis": {
        "summary": "Tenant failed to pay rent for 3 months...",
        "outcome": "Upheld",
        "dispute_type": "Rent Arrears",
        "compensation_amount": 5200,
        "cost_order": 0,
        "property_address": "123 Main St, Dublin 4",
        "processed_at": "2026-02-21T..."
      },
      "pdf_urls": ["https://www.rtb.ie/...pdf"]
    }
  ],
  "meta": { "page": 1, "per_page": 25, "total": 3, "total_pages": 1 }
}
```

### 2. Full-Text Search
```
GET /api/v1/search?q={query}&type=all&limit=10
```
Searches across both disputes and parties. Returns combined results.

### 3. Get Single Dispute
```
GET /api/v1/disputes/{dr_no}
```
Full details including AI analysis, linked parties with their net awards, and PDF URLs.

### 4. Search Parties
```
GET /api/v1/parties?q={name}&type=Tenant
```
Search party records with aggregated stats.

### 5. Get Party Profile
```
GET /api/v1/parties/{uuid}
```
Full party profile with awards breakdown and complete dispute history.

## Query Parameters for /disputes

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full text search across all fields |
| `name` | string | Search by party name (applicant or respondent) |
| `dr_no` | string | Filter by DR number |
| `outcome` | string | Upheld, Partially Upheld, Dismissed, Withdrawn, Settled, Other |
| `type` | string | Rent Arrears, Deposit Retention, Breach of Obligations, etc. |
| `date_from` | ISO date | Filter disputes after this date |
| `date_to` | ISO date | Filter disputes before this date |
| `min_award` | integer | Minimum compensation amount (€) |
| `max_award` | integer | Maximum compensation amount (€) |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Results per page (default: 25, max: 100) |
| `sort` | string | date, award, name |
| `order` | string | asc, desc |

## Implementation Steps

1. **Add API key to Rails credentials:**
   ```
   ACTFAIRLY_API_KEY=rtb_live_9f4611ec2b67265c211c553bb8be46d641ca8fb73cbf4ea4
   ```

2. **Create a service class** (e.g., `app/services/rtb_lookup_service.rb`) that:
   - Makes HTTP GET requests to the Act Fairly API
   - Passes the API key in the Authorization header
   - Parses the JSON response
   - Returns structured Ruby objects

3. **Replace existing RTB scraping code** with calls to this service.

4. **Key fields to extract for tenant screening:**
   - `analysis.outcome` — was the dispute upheld against them?
   - `analysis.compensation_amount` — how much were they ordered to pay?
   - `analysis.dispute_type` — what kind of dispute (rent arrears is a red flag)
   - Total number of disputes for this person
   - Whether they appear as respondent (bad) vs applicant (neutral/good)

## Example Ruby Service

```ruby
class RtbLookupService
  BASE_URL = "https://actfairly.com/api/v1"
  API_KEY = ENV["ACTFAIRLY_API_KEY"]

  def self.search_tenant(name)
    response = HTTParty.get(
      "#{BASE_URL}/disputes",
      query: { name: name, per_page: 50, sort: "date", order: "desc" },
      headers: { "Authorization" => "Bearer #{API_KEY}" }
    )
    return nil unless response.success?
    JSON.parse(response.body)
  end

  def self.search_party(name)
    response = HTTParty.get(
      "#{BASE_URL}/parties",
      query: { q: name },
      headers: { "Authorization" => "Bearer #{API_KEY}" }
    )
    return nil unless response.success?
    JSON.parse(response.body)
  end
end
```

## Error Handling

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (missing/invalid params) |
| 401 | Invalid or missing API key |
| 403 | Account deactivated |
| 429 | Rate limit exceeded (1,000/hr) |
| 500 | Server error |

All errors return: `{ "error": "message", "status": code }`
