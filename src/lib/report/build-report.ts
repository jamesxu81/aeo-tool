/**
 * build-report.ts
 * ---------------
 * Orchestrator for the report.build worker step.
 * 1. Computes scoreTotal from individual dimension scores
 * 2. Generates recommendations
 * 3. Creates/updates Report row with shareToken
 * 4. Sends email notification via Resend
 */

import type { PrismaClient } from '@prisma/client';
import { buildRecommendations, saveRecommendations } from './recommendations';
import { sendReportReady } from '../email';

export interface ReportSummary {
  reportId: string;
  shareToken: string;
  scoreTotal: number;
  recommendationCount: number;
  emailSent: boolean;
}

/**
 * Score weights:
 *  - Schema      25%
 *  - Content     30%
 *  - E-E-A-T     25%
 *  - Citations   20%
 */
function computeScoreTotal(audit: {
  scoreSchema: number | null;
  scoreStructure: number | null;
  scoreEeat: number | null;
  scoreCitation: number | null;
}): number {
  const schema   = audit.scoreSchema    ?? 0;
  const content  = audit.scoreStructure ?? 0;
  const eeat     = audit.scoreEeat      ?? 0;
  const citation = audit.scoreCitation  ?? 0;

  return Math.round(schema * 0.25 + content * 0.30 + eeat * 0.25 + citation * 0.20);
}

export async function buildReport(
  prisma: PrismaClient,
  auditId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<ReportSummary> {
  const log = async (msg: string) => { if (onProgress) await onProgress(msg); };

  // Load audit + project context
  const audit = await prisma.audit.findUniqueOrThrow({
    where: { id: auditId },
    include: {
      project: {
        include: { user: true },
      },
    },
  });

  // Compute citation score from AiCheck
  const aiChecks = await prisma.aiCheck.findMany({ where: { auditId } });
  let scoreCitation = 0;
  if (aiChecks.length > 0) {
    const citedCount = aiChecks.filter((c) => c.ourDomainCited).length;
    scoreCitation = Math.round((citedCount / aiChecks.length) * 100);
  }

  // Update citation score on audit row
  await prisma.audit.update({
    where: { id: auditId },
    data: { scoreCitation },
  });

  // Compute scoreTotal
  const scoreTotal = computeScoreTotal({
    scoreSchema: audit.scoreSchema,
    scoreStructure: audit.scoreStructure,
    scoreEeat: audit.scoreEeat,
    scoreCitation,
  });

  await log(`📊 Scores: schema=${audit.scoreSchema} content=${audit.scoreStructure} eeat=${audit.scoreEeat} citation=${scoreCitation} → total=${scoreTotal}`);

  // Update scoreTotal on Audit
  await prisma.audit.update({
    where: { id: auditId },
    data: { scoreTotal },
  });

  // Generate recommendations
  await log('💡 Generating recommendations…');
  const recs = await buildRecommendations(prisma, auditId);
  await saveRecommendations(prisma, auditId, recs);
  await log(`  ${recs.length} recommendations generated`);

  // Upsert Report row
  const report = await prisma.report.upsert({
    where: { auditId },
    create: {
      auditId,
      scoreTotal,
      recommendations: recs as object[],
    },
    update: {
      scoreTotal,
      recommendations: recs as object[],
      updatedAt: new Date(),
    },
  });

  // Send email notification
  let emailSent = false;
  const userEmail = audit.project.user?.email;
  if (userEmail) {
    await log(`📧 Sending report-ready email to ${userEmail}…`);
    try {
      const result = await sendReportReady({
        to: userEmail,
        domain: audit.project.domain,
        scoreTotal,
        auditId,
        shareToken: report.shareToken,
      });
      emailSent = 'sent' in result ? result.sent : false;
      if (emailSent) {
        await prisma.report.update({
          where: { id: report.id },
          data: { emailSentAt: new Date() },
        });
      }
    } catch (e) {
      await log(`⚠️  Email failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  } else {
    await log('  No user email — skipping notification');
  }

  return {
    reportId: report.id,
    shareToken: report.shareToken,
    scoreTotal,
    recommendationCount: recs.length,
    emailSent,
  };
}
