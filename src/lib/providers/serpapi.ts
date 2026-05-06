/**
 * SerpAPI provider — google_ai_overview engine
 *
 * Runs the same query 3× and takes the union of cited domains
 * to handle non-determinism in AI Overviews.
 *
 * Disclosure: Results are fetched via SerpAPI, not live Google Search UI.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GoogleSearch } = require('google-search-results-nodejs') as {
  GoogleSearch: new (apiKey: string) => {
    json: (params: Record<string, unknown>, cb: (data: Record<string, unknown>) => void) => void;
  };
};

const RUNS = 3; // run each query 3× and union results

export interface ProviderResult {
  provider: 'serpapi';
  keyword: string;
  ourDomainCited: boolean;
  ourPosition: number | null;
  allCitedDomains: string[];
  rawResponse: unknown;
}

/** Extract the root domain from a URL or hostname string */
function rootDomain(raw: string): string {
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^www\./, '');
  }
}

/** Parse cited sources from a SerpAPI AI overview response */
function parseCitations(data: Record<string, unknown>): string[] {
  const domains: string[] = [];

  // AI overview sources array
  const aiOverview = data['ai_overview'] as Record<string, unknown> | undefined;
  if (aiOverview) {
    const sources = (aiOverview['sources'] ?? aiOverview['references']) as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(sources)) {
      for (const src of sources) {
        const link = (src['link'] ?? src['url'] ?? src['domain']) as string | undefined;
        if (link) domains.push(rootDomain(link));
      }
    }
  }

  // Fallback: organic results with sitelinks
  const organic = data['organic_results'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(organic) && domains.length === 0) {
    for (const r of organic.slice(0, 5)) {
      const link = r['link'] as string | undefined;
      if (link) domains.push(rootDomain(link));
    }
  }

  return Array.from(new Set(domains)); // deduplicate
}

/** Run a single SerpAPI query and return cited domains */
async function runOnce(keyword: string): Promise<{ domains: string[]; raw: unknown }> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error('SERPAPI_KEY is not set');

  const client = new GoogleSearch(apiKey);
  return new Promise((resolve, reject) => {
    client.json(
      {
        engine: 'google',
        q: keyword,
        num: 10,
        gl: 'us',
        hl: 'en',
      },
      (data: Record<string, unknown>) => {
        if (data['error']) {
          reject(new Error(String(data['error'])));
          return;
        }
        resolve({ domains: parseCitations(data), raw: data });
      },
    );
  });
}

/**
 * Run keyword query RUNS times and union the cited domains.
 * Returns structured result for the given domain.
 */
export async function checkWithSerpApi(
  keyword: string,
  ourDomain: string,
): Promise<ProviderResult> {
  const normalizedDomain = rootDomain(ourDomain);
  const allRaw: unknown[] = [];
  const unionDomains = new Set<string>();

  for (let i = 0; i < RUNS; i++) {
    try {
      const { domains, raw } = await runOnce(keyword);
      allRaw.push(raw);
      domains.forEach((d) => unionDomains.add(d));
      // Small delay between runs to avoid rate limiting
      if (i < RUNS - 1) await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      // If one run fails, log and continue with remaining runs
      console.warn(`[serpapi] run ${i + 1} failed for "${keyword}":`, err);
      allRaw.push({ error: String(err) });
    }
  }

  const allCitedDomains = Array.from(unionDomains);
  const position = allCitedDomains.indexOf(normalizedDomain);

  return {
    provider: 'serpapi',
    keyword,
    ourDomainCited: position !== -1,
    ourPosition: position !== -1 ? position + 1 : null, // 1-based
    allCitedDomains,
    rawResponse: allRaw,
  };
}
