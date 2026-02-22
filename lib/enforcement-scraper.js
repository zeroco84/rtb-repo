/**
 * RTB Enforcement Orders Scraper
 * Scrapes Court Decisions & Enforcement Orders from rtb.ie
 * Uses the same FacetWP API pattern as the disputes scraper
 */

import * as cheerio from 'cheerio';

const RTB_BASE_URL = 'https://rtb.ie/disputes/dispute-outcomes-and-orders/court-decisions-enforcement-orders';
const RTB_API_URL = 'https://rtb.ie/wp-json/facetwp/v1/refresh';
const RTB_TEMPLATE = 'court_decisions_enforcement_of_orders';
const REQUEST_TIMEOUT = 20000;

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
 * Fetch the CSRF nonce from the RTB enforcement orders page
 */
async function fetchNonce() {
    try {
        const response = await fetchWithRedirects(RTB_BASE_URL);
        if (!response.ok) return null;

        const html = await response.text();
        const match = html.match(/"nonce":"([^"]+)"/);
        return match ? match[1] : null;
    } catch (error) {
        console.error('[EnforcementScraper] Failed to fetch nonce:', error.message);
        return null;
    }
}

/**
 * Call the FacetWP API for enforcement orders
 */
async function callFacetApi(nonce, page = 1, searchTerm = '') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const facets = {
            search: searchTerm,
            court_decisions_enforcement_of_orders_year: [],
        };

        const body = {
            action: 'facetwp_refresh',
            data: {
                facets,
                frozen_facets: {},
                http_params: {
                    get: searchTerm ? { '_search': searchTerm } : {},
                    uri: 'disputes/dispute-outcomes-and-orders/court-decisions-enforcement-orders',
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
            console.warn(`[EnforcementScraper] HTTP ${response.status} for page ${page}: ${response.statusText}`);
            return null;
        }

        const json = await response.json();
        return json;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`[EnforcementScraper] API call failed for page ${page}:`, error.message);
        return null;
    }
}

/**
 * Parse the "X v Y" heading into applicant/respondent names
 */
function parseVsHeading(heading) {
    const result = { applicant_name: null, respondent_name: null };
    if (!heading) return result;

    // Enforcement orders use "A v B" format (not "Applicant Landlord : A – Respondent Tenant : B")
    const match = heading.match(/^(.+?)\s+v\s+(.+)$/i);
    if (match) {
        result.applicant_name = match[1].trim();
        result.respondent_name = match[2].trim();
    }

    return result;
}

/**
 * Parse HTML results from the FacetWP API into structured enforcement order records
 */
function parseResults(html) {
    const $ = cheerio.load(html);
    const articles = $('article.court-decisions-enforcement-of-orders-item');
    const results = [];

    articles.each((_, article) => {
        const $article = $(article);

        // Heading / parties
        const heading = $article.find('h3.heading-xs').text().trim();

        // Fields: Court Ref No., PRTB No.
        const fields = $article.find('div.field');
        const courtRefNo = extractFieldValue($, fields, 'Court Ref No.');
        const prtbNo = extractFieldValue($, fields, 'PRTB No.');

        // Date
        const dateEl = $article.find('time');
        const dateText = dateEl.length > 0 ? dateEl.first().text().trim() : null;
        const dateAttr = dateEl.length > 0 ? dateEl.first().attr('datetime') : null;

        // Subject (in footer)
        const footerFields = $article.find('.footer .field');
        const subject = extractFieldValue($, footerFields, 'Subject') ||
            extractFieldValue($, fields, 'Subject');

        // PDF link
        let pdfUrl = null;
        let pdfLabel = null;
        $article.find('a.download-link, a.text-link').each((_, link) => {
            const $link = $(link);
            const url = $link.attr('href');
            const label = $link.text().trim();
            if (url) {
                pdfUrl = url;
                pdfLabel = label;
            }
        });

        // Parse parties from "X v Y" heading
        const parties = parseVsHeading(heading);

        // Parse date
        let orderDate = null;
        if (dateAttr) {
            orderDate = dateAttr.split('T')[0];
        } else if (dateText) {
            try {
                const parsed = new Date(dateText);
                if (!isNaN(parsed.getTime())) {
                    orderDate = parsed.toISOString().split('T')[0];
                }
            } catch {
                // Leave as null
            }
        }

        results.push({
            heading,
            court_ref_no: courtRefNo,
            prtb_no: prtbNo,
            order_date: orderDate,
            subject,
            pdf_url: pdfUrl,
            pdf_label: pdfLabel,
            ...parties,
            raw_html: $.html($article),
        });
    });

    return results;
}

/**
 * Extract a field value from the record card
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

    const pager = apiResponse.settings?.pager;
    if (pager) {
        return pager.total_pages || 0;
    }

    if (apiResponse.template) {
        const $ = cheerio.load(apiResponse.template);
        const totalText = $('[data-page]').last().attr('data-page');
        if (totalText) return parseInt(totalText, 10);
    }

    return 0;
}

/**
 * Main scraper: Fetch all enforcement order records, page by page
 * Returns an async generator that yields batches of records
 * @param {Object} options - { startPage, endPage, onProgress }
 */
export async function* scrapeAllEnforcementOrders({ startPage = 1, endPage = null, onProgress } = {}) {
    console.log(`[EnforcementScraper] Starting scrape from page ${startPage}...`);

    const BASE_DELAY_MS = 3000;
    const MAX_RETRIES = 3;
    let consecutiveErrors = 0;

    // Step 1: Get nonce
    const nonce = await fetchNonce();
    if (!nonce) {
        throw new Error('Could not connect to RTB enforcement orders page - failed to get nonce');
    }

    // Step 2: Fetch first page to get total count
    const firstPage = await callFacetApi(nonce, 1);
    if (!firstPage || !firstPage.template) {
        throw new Error('RTB enforcement orders API failed on first page');
    }

    const totalPages = getTotalPages(firstPage);
    const totalResults = firstPage.settings?.pager?.total_rows || 0;
    const lastPage = endPage ? Math.min(endPage, totalPages) : totalPages;

    console.log(`[EnforcementScraper] Total: ${totalResults} results across ${totalPages} pages. Processing pages ${startPage} to ${lastPage}`);

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

    // Step 3: Fetch remaining pages
    const fromPage = startPage <= 1 ? 2 : startPage;
    for (let page = fromPage; page <= lastPage; page++) {
        const delay = BASE_DELAY_MS * (1 + consecutiveErrors);
        await new Promise(resolve => setTimeout(resolve, delay));

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const pageData = await callFacetApi(nonce, page);
                if (pageData && pageData.template) {
                    const results = parseResults(pageData.template);
                    yield { page, results, totalPages, totalResults };
                    consecutiveErrors = 0;
                    success = true;
                    break;
                } else {
                    console.warn(`[EnforcementScraper] No data for page ${page}, attempt ${attempt}/${MAX_RETRIES}`);
                }
            } catch (error) {
                console.error(`[EnforcementScraper] Error on page ${page} (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
            }

            if (attempt < MAX_RETRIES) {
                const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[EnforcementScraper] Retrying page ${page} in ${backoff / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        if (!success) {
            consecutiveErrors++;
            console.warn(`[EnforcementScraper] Failed all retries for page ${page}, skipping (${consecutiveErrors} consecutive errors)`);

            if (consecutiveErrors >= 5) {
                console.error(`[EnforcementScraper] Too many consecutive errors (${consecutiveErrors}), stopping scrape`);
                break;
            }
        }

        if (onProgress) {
            onProgress({ totalPages, totalResults, currentPage: page });
        }
    }

    console.log('[EnforcementScraper] Scrape complete');
}

export { parseVsHeading, parseResults };
