import axios from 'axios';
import { chromium, Browser } from 'playwright';
import { parsePage, ParsedPage } from './parser';
import { isAllowed, UA } from './robots';

const RATE_LIMIT_MS = 500;
const FETCH_TIMEOUT_MS = 10000;
export const MAX_PAGES = 10; // hard cap for dev — raise to 50 in prod

/** URLs that are clearly not HTML pages — skip them during crawl */
const NON_HTML_PATTERN = /\.(xml|json|pdf|zip|gz|csv|rss|atom)(\/.*)?(\?.*)?$/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Single shared Playwright browser — launched once, closed after crawl
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export async function fetchPage(url: string): Promise<{ html: string; statusCode: number }> {
  try {
    const { data, status } = await axios.get<string>(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      responseType: 'text',
      maxRedirects: 5,
    });
    if (typeof data === 'string' && data.includes('<html')) {
      const { wordCount } = parsePage(data, url, status);
      if (wordCount >= 50) return { html: data, statusCode: status };
    }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status && status >= 400) return { html: '', statusCode: status };
  }

  // Playwright fallback — reuse shared browser instance
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'User-Agent': UA });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: FETCH_TIMEOUT_MS });
    const html = await page.content();
    return { html, statusCode: response?.status() ?? 200 };
  } finally {
    await page.close(); // close page, not browser
  }
}

export async function crawlPages(
  domain: string,
  urls: string[],
  onProgress?: (msg: string) => void
): Promise<ParsedPage[]> {
  const limited = urls.slice(0, MAX_PAGES);
  const results: ParsedPage[] = [];

  try {
    for (let i = 0; i < limited.length; i++) {
      const url = limited[i];
      let pathname = '/';
      try { pathname = new URL(url).pathname; } catch { continue; }

      if (!(await isAllowed(domain, pathname))) {
        onProgress?.(`⚠️ Skipping ${url} (disallowed by robots.txt)`);
        continue;
      }

      onProgress?.(`Fetching ${i + 1}/${limited.length}: ${url}`);

      try {
        const { html, statusCode } = await fetchPage(url);
        if (!html) {
          results.push({ url, title: '', h1: '', metaDescription: '', wordCount: 0,
            hasSchemaJsonLd: false, schemaTypes: [], lang: '', canonicalUrl: '', ogTitle: '', statusCode });
        } else {
          results.push(parsePage(html, url, statusCode));
        }
      } catch (err: unknown) {
        onProgress?.(`❌ Failed ${url}: ${(err as Error).message}`);
      }

      if (i < limited.length - 1) await sleep(RATE_LIMIT_MS);
    }
  } finally {
    await closeBrowser(); // always close browser after crawl
  }

  return results;
}
