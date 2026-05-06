import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import { isAllowed, UA } from './robots';

interface SitemapUrl {
  loc: string;
  priority?: number;
  changefreq?: string;
  lastmod?: string;
}

async function fetchSitemap(url: string): Promise<SitemapUrl[]> {
  try {
    const { data } = await axios.get<string>(url, {
      timeout: 10000,
      headers: { 'User-Agent': UA },
      responseType: 'text',
    });
    const parsed = await parseStringPromise(data, { explicitArray: false });

    // Handle sitemap index (links to other sitemaps)
    if (parsed.sitemapindex?.sitemap) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      // Prefer page/content sitemaps over product/image/news sitemaps
      const preferredOrder = (loc: string) => {
        const l = loc.toLowerCase();
        if (l.includes('page') || l.includes('content') || l.includes('post')) return 0;
        if (l.includes('product') || l.includes('image') || l.includes('news') || l.includes('video')) return 2;
        return 1;
      };
      const sorted = [...sitemaps].sort((a, b) => preferredOrder(a.loc) - preferredOrder(b.loc));

      const childUrls: SitemapUrl[] = [];
      for (const s of sorted.slice(0, 3)) {
        const child = await fetchSitemap(s.loc);
        childUrls.push(...child);
        if (childUrls.length >= 100) break; // don't fetch more than needed
      }
      return childUrls;
    }

    // Handle regular urlset
    if (parsed.urlset?.url) {
      const urls = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];
      return urls.map((u: Record<string, string>) => ({
        loc: u.loc,
        priority: u.priority ? parseFloat(u.priority) : undefined,
        changefreq: u.changefreq,
        lastmod: u.lastmod,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export async function getTopPages(domain: string, limit = 50): Promise<string[]> {
  // Try common sitemap locations
  const sitemapCandidates = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap-index.xml`,
  ];

  let urls: SitemapUrl[] = [];
  for (const candidate of sitemapCandidates) {
    urls = await fetchSitemap(candidate);
    if (urls.length > 0) break;
  }

  if (urls.length > 0) {
    // Sort by priority desc, then take top N
    const sorted = urls
      .filter((u) => u.loc?.startsWith('http'))
      .sort((a, b) => (b.priority ?? 0.5) - (a.priority ?? 0.5));

    // Filter out disallowed paths
    const allowed: string[] = [];
    for (const u of sorted) {
      try {
        const { pathname } = new URL(u.loc);
        if (await isAllowed(domain, pathname)) {
          allowed.push(u.loc);
        }
      } catch {
        // Skip malformed URLs
      }
      if (allowed.length >= limit) break;
    }
    return allowed;
  }

  // Fallback: homepage + follow links to discover up to 10 more pages
  const homepageUrl = `https://${domain}/`;
  const discovered: string[] = [homepageUrl];

  try {
    const { data } = await axios.get<string>(homepageUrl, {
      timeout: 10000,
      headers: { 'User-Agent': UA },
      responseType: 'text',
    });
    const $ = cheerio.load(data);
    const seen = new Set<string>([homepageUrl]);

    $('a[href]').each((_, el) => {
      if (discovered.length >= 11) return; // homepage + 10
      const href = $(el).attr('href') ?? '';
      try {
        const abs = new URL(href, homepageUrl).toString();
        // Only same-domain, HTML-looking paths
        if (
          abs.startsWith(`https://${domain}`) &&
          !seen.has(abs) &&
          !abs.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|css|js|xml|json)(\?|$)/i)
        ) {
          seen.add(abs);
          discovered.push(abs);
        }
      } catch {
        // ignore malformed hrefs
      }
    });
  } catch {
    // homepage fetch failed — return just the homepage
  }

  return discovered;
}
