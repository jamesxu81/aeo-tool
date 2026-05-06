import * as cheerio from 'cheerio';

export interface ParsedPage {
  url: string;
  title: string;
  h1: string;
  metaDescription: string;
  wordCount: number;
  hasSchemaJsonLd: boolean;
  schemaTypes: string[];
  lang: string;
  canonicalUrl: string;
  ogTitle: string;
  statusCode: number;
}

export function parsePage(html: string, url: string, statusCode = 200): ParsedPage {
  const $ = cheerio.load(html);

  // Title
  const title = $('title').first().text().trim() || '';

  // H1
  const h1 = $('h1').first().text().trim() || '';

  // Meta description
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  // OG title
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || '';

  // Canonical
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || '';

  // Lang
  const lang = $('html').attr('lang')?.trim() || '';

  // Word count — strip scripts/styles, get text
  $('script, style, nav, footer, header').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').filter(Boolean).length : 0;

  // Schema JSON-LD
  const schemaTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item['@type']) {
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          schemaTypes.push(...types);
        }
      }
    } catch {
      // Ignore invalid JSON-LD
    }
  });

  return {
    url,
    title,
    h1,
    metaDescription,
    wordCount,
    hasSchemaJsonLd: schemaTypes.length > 0,
    schemaTypes,
    lang,
    canonicalUrl,
    ogTitle,
    statusCode,
  };
}
