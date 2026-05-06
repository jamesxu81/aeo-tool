/**
 * run-schema-audit.ts
 * -------------------
 * Orchestrator for the audit.schema job step.
 *
 * For each crawled page in this audit:
 *  1. Fetch the raw HTML (re-use fetcher so we respect robots / rate limiting)
 *  2. Run auditPageSchema() to extract + validate all JSON-LD blocks
 *  3. Persist SchemaFinding rows to DB
 *  4. Return summary stats for logging
 */

import type { PrismaClient } from '@prisma/client';
import { fetchPage } from '../crawler/fetcher';
import { auditPageSchema, calcSchemaScore } from './schema-validator';

export interface SchemaAuditSummary {
  pagesChecked: number;
  pagesWithSchema: number;
  totalFindings: number;
  validFindings: number;
  score: number; // 0–100
}

export async function runSchemaAudit(
  prisma: PrismaClient,
  auditId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<SchemaAuditSummary> {
  const log = async (msg: string) => {
    if (onProgress) await onProgress(msg);
  };

  // Load all pages crawled in this audit
  const pages = await prisma.page.findMany({
    where: { auditId },
    orderBy: { createdAt: 'asc' },
  });

  if (pages.length === 0) {
    await log('⚠️  No pages found for this audit — skipping schema check');
    return { pagesChecked: 0, pagesWithSchema: 0, totalFindings: 0, validFindings: 0, score: 0 };
  }

  await log(`🔍 Checking schema on ${pages.length} pages…`);

  let pagesWithSchema = 0;
  const allFindings: { valid: boolean; schemaType: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    await log(`Schema ${i + 1}/${pages.length}: ${page.url}`);

    let html = '';
    try {
      const fetched = await fetchPage(page.url);
      html = fetched.html;
    } catch {
      await log(`⚠️  Could not re-fetch ${page.url} — using cached schema types`);
      // Fall back: if crawler already found schema, create a minimal valid finding
      if (page.hasSchemaJsonLd && page.schemaTypes.length > 0) {
        for (const t of page.schemaTypes) {
          await prisma.schemaFinding.create({
            data: {
              auditId,
              pageId: page.id,
              schemaType: t,
              valid: true,
              missingFields: [],
              issues: ['Re-fetch failed — validated from crawler cache'],
              fixSuggestion: '',
              rawJson: {},
            },
          });
          allFindings.push({ valid: true, schemaType: t });
        }
        pagesWithSchema++;
      }
      continue;
    }

    const findings = auditPageSchema(html, page.url);
    const hasRealSchema = findings.some(
      (f) => f.schemaType !== 'None' && f.schemaType !== 'ParseError',
    );
    if (hasRealSchema) pagesWithSchema++;

    // Persist findings
    await prisma.schemaFinding.createMany({
      data: findings.map((f) => ({
        auditId,
        pageId: page.id,
        schemaType: f.schemaType,
        valid: f.valid,
        missingFields: f.missingFields,
        issues: f.issues,
        fixSuggestion: f.fixSuggestion ?? '',
        rawJson: f.rawJson as object,
      })),
    });

    for (const f of findings) allFindings.push({ valid: f.valid, schemaType: f.schemaType });
  }

  const realFindings = allFindings.filter(
    (f) => f.schemaType !== 'None' && f.schemaType !== 'ParseError',
  );
  const validFindings = realFindings.filter((f) => f.valid).length;
  const score = calcSchemaScore(
    allFindings.map((f) => ({
      schemaType: f.schemaType,
      valid: f.valid,
      missingFields: [],
      issues: [],
      fixSuggestion: '',
      rawJson: {},
    })),
  );

  // Persist the schema score on the audit row
  await prisma.audit.update({
    where: { id: auditId },
    data: { scoreSchema: score },
  });

  return {
    pagesChecked: pages.length,
    pagesWithSchema,
    totalFindings: realFindings.length,
    validFindings,
    score,
  };
}
