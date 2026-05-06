/**
 * run-content-audit.ts
 * ---------------------
 * Orchestrator for the audit.content job step.
 *
 * For each crawled page in this audit:
 *  1. Re-fetch HTML via plain axios (no Playwright — browser is closed after crawl)
 *  2. Run auditPageContent() — 10 rules
 *  3. Persist ContentFinding rows to DB
 *  4. Update audit.scoreStructure
 *  5. Return summary stats
 */

import type { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { UA } from '../crawler/robots';
import { auditPageContent, calcContentScore } from './content-validator';

export interface ContentAuditSummary {
  pagesChecked: number;
  totalRules: number;
  passedRules: number;
  score: number; // 0–100 (average across pages)
  criticalFailures: number;
}

export async function runContentAudit(
  prisma: PrismaClient,
  auditId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<ContentAuditSummary> {
  const log = async (msg: string) => {
    if (onProgress) await onProgress(msg);
  };

  const pages = await prisma.page.findMany({
    where: { auditId },
    orderBy: { createdAt: 'asc' },
  });

  if (pages.length === 0) {
    await log('⚠️  No pages found for this audit — skipping content audit');
    return { pagesChecked: 0, totalRules: 0, passedRules: 0, score: 0, criticalFailures: 0 };
  }

  await log(`📝 Analysing content quality on ${pages.length} pages…`);

  let totalPassed = 0;
  let totalRules = 0;
  let criticalFailures = 0;
  const pageScores: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    await log(`Content ${i + 1}/${pages.length}: ${page.url}`);

    let html = '';
    try {
      const res = await axios.get<string>(page.url, {
        timeout: 10_000,
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        responseType: 'text',
        maxContentLength: 2 * 1024 * 1024,
      });
      html = typeof res.data === 'string' ? res.data : String(res.data);
    } catch {
      await log(`⚠️  Could not re-fetch ${page.url} — skipping content audit for this page`);
      continue;
    }

    const result = auditPageContent(html, page.url);

    // Persist findings
    await prisma.contentFinding.createMany({
      skipDuplicates: true,
      data: result.findings.map((f) => ({
        auditId,
        pageId: page.id,
        rule: f.rule,
        passed: f.passed,
        severity: f.severity,
        evidence: f.evidence ?? null,
        fixSuggestion: f.fixSuggestion || null,
      })),
    });

    totalPassed += result.passedCount;
    totalRules += result.findings.length;
    criticalFailures += result.findings.filter(
      (f) => !f.passed && f.severity === 'critical',
    ).length;
    pageScores.push(result.score);
  }

  // Average score across all pages
  const score =
    pageScores.length > 0
      ? Math.round(pageScores.reduce((a, b) => a + b, 0) / pageScores.length)
      : 0;

  // Persist score on audit row
  await prisma.audit.update({
    where: { id: auditId },
    data: { scoreStructure: score },
  });

  return {
    pagesChecked: pageScores.length,
    totalRules,
    passedRules: totalPassed,
    score,
    criticalFailures,
  };
}
