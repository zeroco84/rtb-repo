/**
 * RTB Scraper Service
 * Ports the Ruby RtbSearchService to Node.js
 * Handles fetching dispute records from rtb.ie using their FacetWP API
 */

import * as cheerio from 'cheerio';

const RTB_BASE_URL = 'https://rtb.ie/disputes/dispute-outcomes-and-orders/adjudication-and-tribunal-orders';
const RTB_API_URL = 'https://rtb.ie/wp-json/facetwp/v1/refresh';
const RTB_TEMPLATE = 'adjudication_orders_and_tribunal_orders_listing';
const REQUEST_TIMEOUT = 20000; // 20 seconds

/**
 * Fetch a URL with redirect support
 */
async function fetchWithRedirects(url, maxRedirects = 5) {
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(currentUrl, {
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                },
            });

            clearTimeout(timeoutId);

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) throw new Error('Redirect without location header');
                currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
                continue;
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    throw new Error('Too many redirects');
}

/**
 * Fetch the CSRF nonce from the RTB page
 */
async function fetchNonce() {
    try {
        const response = await fetchWithRedirects(RTB_BASE_URL);
        if (!response.ok) return null;

        const html = await response.text();
        const match = html.match(/"nonce":"([^"]+)"/);
        return match ? match[1] : null;
    } catch (error) {
        console.error('[RTBScraper] Failed to fetch nonce:', error.message);
        return null;
    }
}

/**
 * Call the FacetWP API for a specific page
 */
async function callFacetApi(nonce, page = 1, searchTerm = '') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const facets = {
            search: searchTerm,
            adjudication_orders_and_tribunal_orders_date: [],
        };

        const body = {
            action: 'facetwp_refresh',
            data: {
                facets,
                frozen_facets: {},
                http_params: {
                    get: searchTerm ? { '_search': searchTerm } : {},
                    uri: 'disputes/dispute-outcomes-and-orders/adjudication-and-tribunal-orders',
                    url_vars: {},
                },
                template: RTB_TEMPLATE,
                extras: { counts: true, pager: true },
                soft_refresh: 0,
                is_bfcache: 0,
                first_load: 0,
                paged: page,
            },
        };

        const response = await fetch(RTB_API_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[RTBScraper] HTTP ${response.status} for page ${page}: ${response.statusText}`);
            return null;
        }

        const json = await response.json();
        return json;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`[RTBScraper] API call failed for page ${page}:`, error.message);
        return null;
    }
}

/**
 * Parse the heading to extract applicant/respondent details
 * Format: "Applicant [Role] : [Name] – Respondent [Role] : [Name]"
 */
function parseHeading(heading) {
    const result = {
        applicant_name: null,
        applicant_role: null,
        respondent_name: null,
        respondent_role: null,
    };

    if (!heading) return result;

    // Try to match: "Applicant Landlord : Name – Respondent Tenant : Name"
    // or "Applicant Tenant : Name – Respondent Landlord : Name"
    const pattern = /Applicant\s+(Landlord|Tenant|Tenants?)\s*:\s*(.+?)\s*[–\-]\s*Respondent\s+(Landlord|Tenant|Tenants?)\s*:\s*(.+)/i;
    const match = heading.match(pattern);

    if (match) {
        result.applicant_role = match[1].replace(/s$/i, ''); // Normalize "Tenants" -> "Tenant"
        result.applicant_name = match[2].trim();
        result.respondent_role = match[3].replace(/s$/i, '');
        result.respondent_name = match[4].trim();
    }

    return result;
}

/**
 * Parse HTML results from the FacetWP API into structured records
 */
function parseResults(html) {
    const $ = cheerio.load(html);
    const articles = $('article.adjudication-orders-and-tribunal-orders-item');
    const results = [];

    articles.each((_, article) => {
        const $article = $(article);
        const heading = $article.find('h3.heading-xs').text().trim();

        // Extract field values
        const fields = $article.find('div.field');
        const drNo = extractFieldValue($, fields, 'DR No.');
        const trNo = extractFieldValue($, fields, 'TR No.');

        // Date
        const dateEl = $article.find('time');
        const dateText = dateEl.length > 0 ? dateEl.first().text().trim() : null;

        // PDF links
        const pdfUrls = [];
        $article.find('a.download-link, a.text-link').each((_, link) => {
            const $link = $(link);
            const url = $link.attr('href');
            const label = $link.text().trim();
            if (url && label) {
                pdfUrls.push({ label, url });
            }
        });

        // Parse heading for party info
        const parties = parseHeading(heading);

        // Parse date
        let disputeDate = null;
        if (dateText) {
            try {
                // RTB dates are typically in "DD/MM/YYYY" or "DD Month YYYY" format
                const parsed = new Date(dateText);
                if (!isNaN(parsed.getTime())) {
                    disputeDate = parsed.toISOString().split('T')[0];
                }
            } catch {
                // Leave as null
            }
        }

        results.push({
            heading,
            dr_no: drNo,
            tr_no: trNo,
            dispute_date: disputeDate,
            ...parties,
            pdf_urls: pdfUrls,
            raw_html: $.html($article),
        });
    });

    return results;
}

/**
 * Extract a field value from the RTB card
 */
function extractFieldValue($, fields, labelText) {
    let value = null;
    fields.each((_, field) => {
        const $field = $(field);
        if ($field.text().includes(labelText)) {
            const spans = $field.find('span.data');
            if (spans.length > 0) {
                value = spans.last().text().trim();
            }
        }
    });
    return value;
}

/**
 * Get total number of pages from FacetWP pager info
 */
function getTotalPages(apiResponse) {
    if (!apiResponse) return 0;

    // FacetWP returns pager info in the response
    const pager = apiResponse.settings?.pager;
    if (pager) {
        return pager.total_pages || 0;
    }

    // Fallback: check the pager HTML if available
    if (apiResponse.template) {
        const $ = cheerio.load(apiResponse.template);
        const totalText = $('[data-page]').last().attr('data-page');
        if (totalText) return parseInt(totalText, 10);
    }

    return 0;
}

/**
 * Main scraper: Fetch all dispute records, page by page
 * Returns an async generator that yields batches of records
 * @param {Object} options - { startPage, endPage, onProgress }
 */
export async function* scrapeAllDisputes({ startPage = 1, endPage = null, onProgress } = {}) {
    console.log(`[RTBScraper] Starting scrape from page ${startPage}...`);

    // Rate limiting config — be respectful of the RTB server
    const BASE_DELAY_MS = 3000;  // 3 seconds between requests
    const MAX_RETRIES = 3;
    let consecutiveErrors = 0;

    // Step 1: Get nonce
    const nonce = await fetchNonce();
    if (!nonce) {
        throw new Error('Could not connect to RTB site - failed to get nonce');
    }

    // Step 2: Fetch first page to get total count (always need this even when resuming)
    const firstPage = await callFacetApi(nonce, 1);
    if (!firstPage || !firstPage.template) {
        throw new Error('RTB search API failed on first page');
    }

    const totalPages = getTotalPages(firstPage);
    const totalResults = firstPage.settings?.pager?.total_rows || 0;
    const lastPage = endPage ? Math.min(endPage, totalPages) : totalPages;

    console.log(`[RTBScraper] Total: ${totalResults} results across ${totalPages} pages. Processing pages ${startPage} to ${lastPage}`);

    if (onProgress) {
        onProgress({ totalPages, totalResults, currentPage: startPage - 1 });
    }

    // If starting from page 1, yield page 1 results
    if (startPage === 1) {
        const firstResults = parseResults(firstPage.template);
        yield { page: 1, results: firstResults, totalPages, totalResults };

        if (onProgress) {
            onProgress({ totalPages, totalResults, currentPage: 1 });
        }
    }

    // Step 3: Fetch pages with rate limiting and retry
    const fromPage = startPage <= 1 ? 2 : startPage;
    for (let page = fromPage; page <= lastPage; page++) {
        // Delay between requests — increases on consecutive errors
        const delay = BASE_DELAY_MS * (1 + consecutiveErrors);
        await new Promise(resolve => setTimeout(resolve, delay));

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const pageData = await callFacetApi(nonce, page);
                if (pageData && pageData.template) {
                    const results = parseResults(pageData.template);
                    yield { page, results, totalPages, totalResults };
                    consecutiveErrors = 0; // Reset on success
                    success = true;
                    break;
                } else {
                    console.warn(`[RTBScraper] No data for page ${page}, attempt ${attempt}/${MAX_RETRIES}`);
                }
            } catch (error) {
                console.error(`[RTBScraper] Error on page ${page} (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
            }

            if (attempt < MAX_RETRIES) {
                // Exponential backoff: 3s, 6s, 12s
                const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[RTBScraper] Retrying page ${page} in ${backoff / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        if (!success) {
            consecutiveErrors++;
            console.warn(`[RTBScraper] Failed all retries for page ${page}, skipping (${consecutiveErrors} consecutive errors)`);

            // If too many consecutive errors, stop entirely
            if (consecutiveErrors >= 5) {
                console.error(`[RTBScraper] Too many consecutive errors (${consecutiveErrors}), stopping scrape`);
                break;
            }
        }

        if (onProgress) {
            onProgress({ totalPages, totalResults, currentPage: page });
        }
    }

    console.log('[RTBScraper] Scrape chunk complete');
}

/**
 * Search-specific scrape (single search term, single page)
 */
export async function searchDisputes(searchTerm) {
    if (!searchTerm || !searchTerm.trim()) {
        return { results: [], total_count: 0, error: 'No search term provided' };
    }

    const nonce = await fetchNonce();
    if (!nonce) {
        return { results: [], total_count: 0, error: 'Could not connect to RTB site' };
    }

    const apiResponse = await callFacetApi(nonce, 1, searchTerm.trim());
    if (!apiResponse || !apiResponse.template) {
        return { results: [], total_count: 0, error: 'RTB search API failed' };
    }

    const results = parseResults(apiResponse.template);
    const searchUrl = `${RTB_BASE_URL}?_search=${encodeURIComponent(searchTerm.trim())}`;

    return {
        results,
        total_count: results.length,
        search_url: searchUrl,
        error: null,
    };
}

export { parseHeading, parseResults };
