/**
 * RTB Rent Register Scraper
 *
 * Scrapes comparable rent data from rtb.ie/rtb-rent-register/
 * via the WordPress admin-ajax.php endpoint.
 *
 * API confirmed by reverse engineering the RTB portal on 2026-03-31:
 *   Endpoint:  POST https://rtb.ie/wp-admin/admin-ajax.php
 *   Action:    comparables_calc_proxy
 *   Nonce:     fetched fresh per session from page's wp_localize_script object
 *   Payload:   JSON object with OsiLeaId, CombinedDwellingTypeCode,
 *              NumberOfBedrooms, BER (string e.g. "B2"), FloorSpace (integer m²)
 *              NOTE: BER and FloorSpace are REQUIRED — null returns 400.
 *
 * The RTB matching algorithm works as follows (per their docs):
 *   1. Exact match: same dwelling type, same bedrooms, BER within range, floor area ±10%
 *   2. Relaxed BER: matches all criteria except BER rating
 *   3. Relaxed floor area: floor area > ±10% from submitted value
 *   4. Relaxed bedrooms: ±1 bedroom from submitted value
 *   Returns up to 10 results, sorted by recency within each tier.
 *
 * SCRAPING STRATEGY:
 *   We submit a matrix of representative property profiles per LEA.
 *   Each profile (BER + floor space anchor) triggers the RTB's progressive
 *   matching, capturing the full market range for that neighbourhood and size band.
 *   The UNIQUE(rt_number) constraint deduplicates results across queries.
 */

const RTB_PAGE_URL = 'https://rtb.ie/rtb-rent-register/';
const RTB_AJAX_URL = 'https://rtb.ie/wp-admin/admin-ajax.php';
const REQUEST_TIMEOUT = 30000;
const BASE_DELAY_MS = 3000;

// ============================================
// QUERY MATRIX
// Representative property profiles that give full market coverage per LEA.
// BER and FloorSpace are required by the RTB API.
// The RTB's progressive matching means each query captures results beyond
// the exact spec — e.g. querying B2/75m² also returns B1, B3, A3 results.
// 30 profiles × 31 Dublin LEAs = 930 queries (~47 mins at 3s/request)
// ============================================
export const QUERY_MATRIX = [
  // ── Apartments (CombinedDwellingTypeCode: 101) ──────────────────────────
  // 1-bed apartments: small (40m²) and standard (55m²), three BER bands
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'A2', floorSpace: 40 },
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'A2', floorSpace: 55 },
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'B2', floorSpace: 40 },
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'B2', floorSpace: 55 },
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'C1', floorSpace: 40 },
  { dwellingTypeCode: 101, bedrooms: 1, ber: 'C1', floorSpace: 55 },
  // 2-bed apartments: standard (65m²) and large (80m²), three BER bands
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'A2', floorSpace: 65 },
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'A2', floorSpace: 80 },
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'B2', floorSpace: 65 },
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'B2', floorSpace: 80 },
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'C1', floorSpace: 65 },
  { dwellingTypeCode: 101, bedrooms: 2, ber: 'C1', floorSpace: 80 },
  // 3-bed apartments: standard (90m²) and large (110m²), three BER bands
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'A2', floorSpace: 90 },
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'A2', floorSpace: 110 },
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'B2', floorSpace: 90 },
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'B2', floorSpace: 110 },
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'C1', floorSpace: 90 },
  { dwellingTypeCode: 101, bedrooms: 3, ber: 'C1', floorSpace: 110 },
  // ── Houses (CombinedDwellingTypeCode: 100) ──────────────────────────────
  // 1-bed: rare but exists (bedsit conversions, small terraces)
  { dwellingTypeCode: 100, bedrooms: 1, ber: 'B2', floorSpace: 60 },
  { dwellingTypeCode: 100, bedrooms: 1, ber: 'C1', floorSpace: 60 },
  // 2-bed houses: standard (80m²), two BER bands
  { dwellingTypeCode: 100, bedrooms: 2, ber: 'A2', floorSpace: 80 },
  { dwellingTypeCode: 100, bedrooms: 2, ber: 'B2', floorSpace: 80 },
  { dwellingTypeCode: 100, bedrooms: 2, ber: 'C1', floorSpace: 80 },
  // 3-bed houses: standard (100m²) and large (120m²), three BER bands
  { dwellingTypeCode: 100, bedrooms: 3, ber: 'A2', floorSpace: 100 },
  { dwellingTypeCode: 100, bedrooms: 3, ber: 'B2', floorSpace: 100 },
  { dwellingTypeCode: 100, bedrooms: 3, ber: 'C1', floorSpace: 120 },
  // 4-bed houses: large (120m²) and very large (140m²)
  { dwellingTypeCode: 100, bedrooms: 4, ber: 'A2', floorSpace: 120 },
  { dwellingTypeCode: 100, bedrooms: 4, ber: 'B2', floorSpace: 140 },
  { dwellingTypeCode: 100, bedrooms: 4, ber: 'C1', floorSpace: 140 },
  // 5-bed houses: large family homes
  { dwellingTypeCode: 100, bedrooms: 5, ber: 'B2', floorSpace: 160 },
];

// ============================================
// LOCAL AUTHORITY ID MAP (confirmed from portal)
// ============================================
export const DUBLIN_LOCAL_AUTHORITIES = [
  { id: 29, name: 'DUBLIN CITY COUNTY COUNCIL' },
  { id: 28, name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL' },
  { id: 27, name: 'FINGAL COUNTY COUNCIL' },
  { id: 26, name: 'SOUTH DUBLIN COUNTY COUNCIL' },
];

// ============================================
// SESSION INITIALISER
// Fetches a fresh nonce AND session cookies from the page in one request.
// Both must be threaded through all subsequent admin-ajax.php calls.
// ============================================
async function initSession() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const resp = await fetch(RTB_PAGE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IE,en;q=0.9',
      },
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // Capture session cookies (strip attributes, keep name=value only)
    const rawCookies = resp.headers.get('set-cookie') || '';
    const cookieHeader = rawCookies
      .split(/,(?=[^;]*=)/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const html = await resp.text();
    const match = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/);
    if (!match) throw new Error('Nonce not found in page HTML');

    console.log(`[RentRegister] Session ready. Nonce: ${match[1]} | Cookies: ${cookieHeader || 'none'}`);
    return { nonce: match[1], cookie: cookieHeader };
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(`Failed to initialise session: ${err.message}`);
  }
}

// ============================================
// HEALTH CHECK
// ============================================
export async function checkHealth(nonce, cookie = '') {
  const body = new URLSearchParams({ action: 'comparables_health_check', nonce });
  const resp = await fetch(RTB_AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
  const json = await resp.json();
  return json.success === true && json.data?.status === 'Healthy';
}

// ============================================
// SINGLE SEARCH
// ============================================
async function searchComparables(nonce, cookie, { osiLeaId, dwellingTypeCode, bedrooms, ber, floorSpace }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const payload = {
      OsiLeaId: String(osiLeaId),
      DedCode: null,
      CombinedDwellingTypeCode: dwellingTypeCode,
      NumberOfBedrooms: bedrooms,
      BER: ber,
      FloorSpace: floorSpace,
    };

    const body = new URLSearchParams({
      action: 'comparables_calc_proxy',
      nonce,
      payload: JSON.stringify(payload),
    });

    const resp = await fetch(RTB_AJAX_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': RTB_PAGE_URL,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    });

    clearTimeout(timeoutId);
    if (!resp.ok) {
      console.warn(`[RentRegister] HTTP ${resp.status} LEA=${osiLeaId} ${bedrooms}bed ${ber} ${floorSpace}m²`);
      return [];
    }

    const json = await resp.json();
    if (!json.success) {
      console.warn(`[RentRegister] API error LEA=${osiLeaId}: ${json.data?.message}`);
      return [];
    }
    return json.data?.results || [];
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[RentRegister] Request failed:`, err.message);
    return [];
  }
}

// ============================================
// MAIN EXHAUSTIVE SCRAPER
// Iterates all Dublin LEAs × QUERY_MATRIX profiles
// Yields one batch per query for Supabase upsert
// ============================================
export async function* scrapeRentRegisterDublin({ leaRefs, queryMatrix = QUERY_MATRIX, onProgress } = {}) {
  console.log(`[RentRegister] Starting Dublin scrape: ${leaRefs.length} LEAs × ${queryMatrix.length} profiles = ${leaRefs.length * queryMatrix.length} queries`);
  console.log(`[RentRegister] Estimated time: ~${Math.ceil(leaRefs.length * queryMatrix.length * BASE_DELAY_MS / 60000)} minutes`);

  const { nonce, cookie } = await initSession();

  const healthy = await checkHealth(nonce, cookie);
  if (!healthy) throw new Error('[RentRegister] Backend health check failed — aborting');

  const batchId = crypto.randomUUID();
  let totalQueries = 0;
  let totalResults = 0;

  for (const lea of leaRefs) {
    for (const profile of queryMatrix) {
      if (totalQueries > 0) {
        await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS));
      }

      const label = `${lea.lea_name} | ${profile.dwellingTypeCode === 101 ? 'Apt' : 'House'} ${profile.bedrooms}bed ${profile.ber} ${profile.floorSpace}m²`;
      console.log(`[RentRegister] [${totalQueries + 1}/${leaRefs.length * queryMatrix.length}] ${label}`);

      const results = await searchComparables(nonce, cookie, {
        osiLeaId: lea.osi_lea_id,
        dwellingTypeCode: profile.dwellingTypeCode,
        bedrooms: profile.bedrooms,
        ber: profile.ber,
        floorSpace: profile.floorSpace,
      });

      totalQueries++;
      totalResults += results.length;

      yield {
        results,
        lea,
        profile,
        batchId,
        queryCount: totalQueries,
        totalResults,
      };

      if (onProgress) {
        onProgress({ totalQueries, totalResults, currentLea: lea.lea_name, profile });
      }
    }
  }

  console.log(`[RentRegister] Complete. ${totalQueries} queries, ${totalResults} raw results (deduped by rt_number on upsert).`);
}
