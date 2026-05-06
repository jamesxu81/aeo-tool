import { getTopPages } from './sitemap';
import { crawlPages } from './fetcher';
import { ParsedPage } from './parser';
import { isAllowed } from './robots';

export interface CrawlResult {
  domain: string;
  pages: ParsedPage[];
  totalFound: number;
  crawledCount: number;
  durationMs: number;
}

export async function crawlDomain(
  domain: string,
  options: {
    limit?: number;
    onProgress?: (msg: string) => void;
  } = {}
): Promise<CrawlResult> {
  const { limit = 50, onProgress } = options;
  const start = Date.now();

  onProgress?.(`🔍 Discovering pages for ${domain}…`);

  // Gap fix: check if AEOBot is allowed to crawl root before proceeding
  const rootAllowed = await isAllowed(domain, '/');
  if (!rootAllowed) {
    onProgress?.(`🚫 ${domain} blocks AEOBot in robots.txt — crawl skipped`);
    return { domain, pages: [], totalFound: 0, crawledCount: 0, durationMs: Date.now() - start };
  }

  const rawUrls = await getTopPages(domain, limit);
  // Filter out non-HTML URLs (XML sitemaps, PDFs, etc.) that sneak through
  const NON_HTML = /\.(xml|json|pdf|zip|gz|csv|rss|atom)(\/.*)?(\?.*)?$/i;
  const urls = rawUrls.filter(u => !NON_HTML.test(new URL(u).pathname));
  onProgress?.(`📄 Found ${urls.length} URLs to crawl`);

  const pages = await crawlPages(domain, urls, onProgress);

  return {
    domain,
    pages,
    totalFound: urls.length,
    crawledCount: pages.length,
    durationMs: Date.now() - start,
  };
}
