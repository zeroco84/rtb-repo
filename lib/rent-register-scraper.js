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
 *   Payload:   JSON-stringified object with OsiLeaId, DwellingTypeCode, etc.
 *
 * Response shape (confirmed live):
 * {
 *   success: true,
 *   data: {
 *     results: [{
 *       localAuthority, localElectoralArea, combinedDwellingType,
 *       numberOfBedrooms, numberOfBedSpaces, rtNumber, ber,
 *       floorSpace, rentMonthCalc, score, eD_Name
 *     }]
 *   }
 * }
 */

const RTB_PAGE_URL = 'https://rtb.ie/rtb-rent-register/';
const RTB_AJAX_URL = 'https://rtb.ie/wp-admin/admin-ajax.php';
const REQUEST_TIMEOUT = 30000;
const BASE_DELAY_MS = 3000;

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
// DWELLING TYPE CODES (confirmed from portal)
// ============================================
export const DWELLING_TYPES = [
  { code: 100, name: 'House' },
  { code: 101, name: 'Apartment / Flat' },
];

// ============================================
// BER CODE MAP (confirmed from portal dropdown)
// ============================================
export const BER_RATINGS = [
  'A1', 'A2', 'A3', 'B1', 'B2', 'B3',
  'C1', 'C2', 'C3', 'D1', 'D2', 'E1', 'E2', 'F', 'G', 'Exempt'
];

// ============================================
// SESSION INITIALISER
// WordPress nonces are session-tied — we must send the same cookies
// with the page fetch AND all subsequent admin-ajax.php calls.
// Returns { nonce, cookie } to be threaded through all requests.
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

    // Capture session cookies from the response
    const rawCookies = resp.headers.get('set-cookie') || '';
    // Parse all cookie names/values, strip attributes (expires, path, etc.)
    const cookieHeader = rawCookies
      .split(/,(?=[^;]*=)/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const html = await resp.text();

    // Extract nonce from wp_localize_script JSON object
    const match = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/);
    if (!match) throw new Error('Nonce not found in page HTML');

    console.log(`[RentRegister] Session initialised. Nonce: ${match[1]} | Cookies: ${cookieHeader ? cookieHeader.substring(0, 60) + '...' : 'none'}`);
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
      ...(cookie ? { 'Cookie': cookie } : {}),
    },
    body,
  });
  const json = await resp.json();
  return json.success === true && json.data?.status === 'Healthy';
}

// ============================================
// SINGLE SEARCH
// ============================================
async function searchComparables(nonce, cookie, { osiLeaId, dwellingTypeCode, bedrooms, berRating = null, floorSpace = null }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const payload = {
      OsiLeaId: String(osiLeaId),
      DedCode: null,
      CombinedDwellingTypeCode: dwellingTypeCode,
      NumberOfBedrooms: bedrooms,
      BER: berRating,
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
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
      body,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`[RentRegister] HTTP ${resp.status} for LEA ${osiLeaId} bedrooms ${bedrooms}`);
      return [];
    }

    const json = await resp.json();

    if (!json.success) {
      console.warn(`[RentRegister] API error for LEA ${osiLeaId}: ${json.data?.message}`);
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
// LEA FETCHER
// Get all LEA options for a given Local Authority ID
// by scraping the portal's dropdown (populated dynamically)
// Used to seed rent_register_lea_ref for DLR, Fingal, South Dublin
// ============================================
export async function fetchLeaOptions(localAuthorityId) {
  // The LEA dropdown is populated client-side from the LA selection
  // We fetch the page and look for the LEA data embedded in JS
  // Alternatively: call the autoaddress REST API the portal uses
  // For now: manual seed approach (see scripts/seed-lea-ref.mjs)
  // This function is a placeholder for future automation
  throw new Error('fetchLeaOptions: use scripts/seed-lea-ref.mjs to discover LEA IDs for each LA');
}

// ============================================
// MAIN EXHAUSTIVE SCRAPER
// Iterates all Dublin LEAs × dwelling types × bedroom counts
// Yields batches of results for Supabase upsert
// ============================================
export async function* scrapeRentRegisterDublin({ leaRefs, onProgress, maxBedrooms = 5 } = {}) {
  console.log('[RentRegister] Starting Dublin rent register scrape...');

  // Step 1: Initialise session (fetches nonce + session cookies together)
  const { nonce, cookie } = await initSession();

  // Step 2: Health check (passes cookie)
  const healthy = await checkHealth(nonce, cookie);
  if (!healthy) throw new Error('[RentRegister] Backend health check failed — aborting');

  const batchId = crypto.randomUUID();
  let totalQueries = 0;
  let totalResults = 0;

  // Step 3: Iterate LEA × dwelling type × bedrooms
  for (const lea of leaRefs) {
    for (const dwellingType of DWELLING_TYPES) {
      for (let bedrooms = 1; bedrooms <= maxBedrooms; bedrooms++) {

        // Rate limit — 3 seconds between requests
        if (totalQueries > 0) {
          await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS));
        }

        console.log(`[RentRegister] Querying: ${lea.lea_name} | ${dwellingType.name} | ${bedrooms} bed`);

        // No BER or floor space filter — get all 10 results for this combination
        const results = await searchComparables(nonce, cookie, {
          osiLeaId: lea.osi_lea_id,
          dwellingTypeCode: dwellingType.code,
          bedrooms,
          berRating: null,
          floorSpace: null,
        });

        totalQueries++;
        totalResults += results.length;

        yield {
          results,
          lea,
          dwellingType,
          bedrooms,
          batchId,
          queryCount: totalQueries,
        };

        if (onProgress) {
          onProgress({ totalQueries, totalResults, currentLea: lea.lea_name, bedrooms });
        }

        // If 0 results returned for 5+ bedrooms, skip higher counts for this combo
        if (results.length === 0 && bedrooms >= 3) {
          console.log(`[RentRegister] No results for ${bedrooms} beds — skipping higher counts`);
          break;
        }
      }
    }
  }

  console.log(`[RentRegister] Complete. ${totalQueries} queries, ${totalResults} records found.`);
}
