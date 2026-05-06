/**
 * run-competitor-audit.ts
 * -----------------------
 * Crawls a competitor domain (max 5 pages to keep cost/time low),
 * runs schema + content audits in-memory, and writes a CompetitorAudit row.
 *
 * Does NOT write per-page findings to DB — results are aggregate scores only.
 * Citation data comes from existing AiCheck.allCitedDomains (no extra API calls).
 */

import type { PrismaClient } from '@prisma/client';
import { crawlDomain } from '../crawler';
import { fetchPage } from '../crawler/fetcher';
import { auditPageSchema, calcSchemaScore, type SchemaFindingResult } from './schema-validator';
import { auditPageContent, calcContentScore } from './content-validator';
import { auditEeat, calcEeatScore } from './eeat-validator';

export interface CompetitorAuditResult {
  domain: string;
  pagesCrawled: number;
  scoreSchema: number;
  scoreContent: number;
  scoreEeat: number;
  citationCount: number;
  topCitedKeywords: string[];
}

/**
 * Run a lightweight audit on a competitor domain.
 * @param prisma  Prisma client
 * @param auditId Parent audit ID (the main project's audit)
 * @param competitorId Competitor DB record ID
 * @param domain  Competitor domain to audit
 * @param ownAuditId  The current audit ID (for fetching ai citation data)
 * @param onProgress  Optional progress callback
 */
export async function runCompetitorAudit(
  prisma: PrismaClient,
  auditId: string,
  competitorId: string,
  domain: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<CompetitorAuditResult> {
  const log = async (msg: string) => {
    if (onProgress) await onProgress(msg);
  };

  // Upsert CompetitorAudit record as "running"
  await prisma.competitorAudit.upsert({
    where: { auditId_competitorId: { auditId, competitorId } },
    create: { auditId, competitorId, domain, status: 'running' },
    update: { status: 'running', errorMessage: null },
  });

  try {
    await log(`🔍 Crawling competitor: ${domain} (max 5 pages)`);

    const crawlResult = await crawlDomain(domain, {
      limit: 5,
      onProgress: async (msg) => await log(`  ${msg}`),
    });

    const pages = crawlResult.pages;
    await log(`  Crawled ${pages.length} pages`);

    // ── Schema score (in-memory, no DB writes) ─────────────────────────────
    const allSchemaFindings: SchemaFindingResult[] = [];

    for (const page of pages) {
      try {
        const fetched = await fetchPage(page.url);
        const findings = auditPageSchema(fetched.html, page.url);
        for (const f of findings) {
          allSchemaFindings.push({
            schemaType: f.schemaType,
            valid: f.valid,
            missingFields: f.missingFields,
            issues: f.issues,
            fixSuggestion: f.fixSuggestion ?? '',
            rawJson: (f.rawJson ?? {}) as Record<string, unknown>,
          });
        }
      } catch {
        // fall back to crawler-detected schema types
        for (const t of page.schemaTypes) {
          allSchemaFindings.push({ schemaType: t, valid: true, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} as Record<string, unknown> });
        }
      }
    }
    const scoreSchema = calcSchemaScore(allSchemaFindings);

    // ── Content score (in-memory) ──────────────────────────────────────────
    const contentPageScores: number[] = [];
    for (const page of pages) {
      try {
        const fetched = await fetchPage(page.url);
        const result = auditPageContent(fetched.html, page.url);
        contentPageScores.push(result.score);
      } catch {
        /* skip */
      }
    }
    const scoreContent = contentPageScores.length > 0
      ? Math.round(contentPageScores.reduce((a, b) => a + b, 0) / contentPageScores.length)
      : 0;

    // ── E-E-A-T score (in-memory) ──────────────────────────────────────────
    let scoreEeat = 0;
    if (pages.length > 0) {
      try {
        const homepageUrl = `https://${domain}`;
        let homepageHtml = '';
        const crawledHtmlMap: Record<string, string> = {};

        for (const page of pages) {
          try {
            const fetched = await fetchPage(page.url);
            crawledHtmlMap[page.url] = fetched.html;
            if (!homepageHtml) homepageHtml = fetched.html;
          } catch { /* skip */ }
        }

        if (homepageHtml) {
          const { score } = auditEeat({
            domain,
            homepageUrl,
            homepageHtml,
            crawledUrls: Object.keys(crawledHtmlMap),
            crawledHtmlMap,
          });
          scoreEeat = score;
        }
      } catch {
        /* skip */
      }
    }

    // ── Citation count from existing AiCheck data ──────────────────────────
    const aiChecks = await prisma.aiCheck.findMany({
      where: { auditId },
      select: { keyword: true, allCitedDomains: true },
    });

    const lowerDomain = domain.toLowerCase().replace(/^www\./, '');
    const citedKeywords = new Set<string>();
    for (const check of aiChecks) {
      const cited = check.allCitedDomains.some((d) =>
        d.toLowerCase().replace(/^www\./, '').includes(lowerDomain)
      );
      if (cited) citedKeywords.add(check.keyword);
    }
    const citationCount = citedKeywords.size;
    const topCitedKeywords = Array.from(citedKeywords).slice(0, 10);

    await log(`  ✅ ${domain}: schema=${scoreSchema} content=${scoreContent} eeat=${scoreEeat} citations=${citationCount}`);

    // Update CompetitorAudit record
    await prisma.competitorAudit.update({
      where: { auditId_competitorId: { auditId, competitorId } },
      data: {
        pagesCrawled: pages.length,
        scoreSchema,
        scoreContent,
        scoreEeat,
        citationCount,
        topCitedKeywords,
        status: 'done',
      },
    });

    return { domain, pagesCrawled: pages.length, scoreSchema, scoreContent, scoreEeat, citationCount, topCitedKeywords };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await prisma.competitorAudit.update({
      where: { auditId_competitorId: { auditId, competitorId } },
      data: { status: 'failed', errorMessage: msg },
    }).catch(() => {});
    throw err;
  }
}
