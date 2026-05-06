import { Worker } from 'bullmq';
import { getRedis } from './redis';
import { getPrisma } from './prisma';
import { runAiChecks } from '../src/lib/ai-check';
import { crawlDomain } from '../src/lib/crawler';
import { runSchemaAudit } from '../src/lib/audit/run-schema-audit';
import { runContentAudit } from '../src/lib/audit/run-content-audit'
import { runEeatAudit } from '../src/lib/audit/run-eeat-audit';
import { runCompetitorAudit } from '../src/lib/audit/run-competitor-audit';
import { buildReport } from '../src/lib/report/build-report';

const AUDIT_QUEUE_NAME = 'audit';

const STEPS = [
  { key: 'crawl.domain',     label: 'Crawling domain' },
  { key: 'audit.schema',     label: 'Checking schema markup' },
  { key: 'audit.content',    label: 'Analysing content quality' },
  { key: 'audit.eeat',       label: 'Evaluating E-E-A-T signals' },
  { key: 'ai.check',         label: 'Running AI citation checks' },
  { key: 'competitor.audit', label: 'Auditing competitors' },
  { key: 'report.build',     label: 'Building report' },
];

async function logStep(auditId: string, message: string) {
  const prisma = getPrisma();
  await prisma.jobLog.create({ data: { auditId, message } });
  console.log(`[worker] ${auditId} — ${message}`);
}

const connection = getRedis();

const worker = new Worker(
  AUDIT_QUEUE_NAME,
  async (job) => {
    const { auditId } = job.data as { auditId: string };
    const prisma = getPrisma();

    // Mark RUNNING
    await prisma.audit.update({
      where: { id: auditId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // Fetch project context (domain + keywords + competitors)
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        project: {
          include: {
            keywords: true,
            competitors: true,
          },
        },
      },
    });
    if (!audit) throw new Error(`Audit ${auditId} not found`);

    const { domain, keywords, competitors } = audit.project;
    const keywordTerms = keywords.map((k) => k.term);
    const competitorDomains = competitors.map((c) => c.domain);

    // ── Step 1: crawl.domain — REAL crawler ─────────────────────────────────
    await logStep(auditId, `Started: ${STEPS[0].label}`);
    const crawlResult = await crawlDomain(domain, {
      limit: 50,
      onProgress: async (msg) => { await logStep(auditId, msg); },
    });
    // Persist pages to DB
    if (crawlResult.pages.length > 0) {
      await prisma.page.createMany({
        data: crawlResult.pages.map((p) => ({
          projectId: audit.project.id,
          auditId,
          url: p.url,
          statusCode: p.statusCode,
          title: p.title || null,
          h1: p.h1 || null,
          metaDescription: p.metaDescription || null,
          ogTitle: p.ogTitle || null,
          canonicalUrl: p.canonicalUrl || null,
          lang: p.lang || null,
          wordCount: p.wordCount,
          hasSchemaJsonLd: p.hasSchemaJsonLd,
          schemaTypes: p.schemaTypes,
        })),
        skipDuplicates: true,
      });
    }
    await logStep(
      auditId,
      `✅ Crawled ${crawlResult.crawledCount} pages from ${domain} in ${(crawlResult.durationMs / 1000).toFixed(1)}s`,
    );
    await logStep(auditId, `Done: ${STEPS[0].label}`);

    // ── Step 2: audit.schema — REAL schema validator ────────────────────────
    await logStep(auditId, `Started: ${STEPS[1].label}`);
    const schemaSummary = await runSchemaAudit(prisma, auditId, async (msg) => {
      await logStep(auditId, msg);
    });
    await logStep(
      auditId,
      `✅ Schema check: ${schemaSummary.pagesWithSchema}/${schemaSummary.pagesChecked} pages have schema, score ${schemaSummary.score}/100`,
    );
    await logStep(auditId, `Done: ${STEPS[1].label}`);

    // ── Step 3: audit.content — REAL content quality analyser ───────────────
    await logStep(auditId, `Started: ${STEPS[2].label}`);
    const contentSummary = await runContentAudit(prisma, auditId, async (msg) => {
      await logStep(auditId, msg);
    });
    await logStep(
      auditId,
      `✅ Content audit: ${contentSummary.passedRules}/${contentSummary.totalRules} rules passed across ${contentSummary.pagesChecked} pages, score ${contentSummary.score}/100`,
    );
    await logStep(auditId, `Done: ${STEPS[2].label}`);

    // ── Step 4: audit.eeat — real E-E-A-T signal detection ──────────────────
    await logStep(auditId, `Started: ${STEPS[3].label}`);
    const eeatSummary = await runEeatAudit(
      prisma,
      auditId,
      domain,
      (msg) => logStep(auditId, msg),
    );
    await logStep(
      auditId,
      `✅ E-E-A-T: ${eeatSummary.passed}/${eeatSummary.total} signals passed, score ${eeatSummary.score}/100`,
    );
    await logStep(auditId, `Done: ${STEPS[3].label}`);

    // ── Step 5: ai.check — REAL SerpAPI implementation ──────────────────────
    await logStep(auditId, `Started: ${STEPS[4].label}`);

    if (keywordTerms.length === 0) {
      await logStep(auditId, 'No keywords configured — skipping AI check');
    } else {
      const results = await runAiChecks(
        prisma,
        auditId,
        domain,
        keywordTerms,
        async (msg) => {
          await logStep(auditId, msg);
        },
      );

      const cited = results.filter((r) => r.ourDomainCited).length;
      await logStep(
        auditId,
        `AI check complete: ${cited}/${results.length} keywords cite ${domain}`,
      );
    }

    await logStep(auditId, `Done: ${STEPS[4].label}`);

    // ── Step 6: competitor.audit — REAL implementation ──────────────────────
    await logStep(auditId, `Started: ${STEPS[5].label}`);
    if (competitors.length === 0) {
      await logStep(auditId, 'No competitors configured — skipping');
    } else {
      for (const competitor of competitors) {
        try {
          await logStep(auditId, `🔍 Starting competitor audit: ${competitor.domain}`);
          const result = await runCompetitorAudit(
            prisma,
            auditId,
            competitor.id,
            competitor.domain,
            async (msg) => { await logStep(auditId, msg); },
          );
          await logStep(
            auditId,
            `✅ ${competitor.domain}: schema=${result.scoreSchema} content=${result.scoreContent} eeat=${result.scoreEeat} citations=${result.citationCount}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          await logStep(auditId, `⚠️  Competitor ${competitor.domain} failed: ${msg}`);
          // Don't throw — continue with other competitors
        }
      }
    }
    await logStep(auditId, `Done: ${STEPS[5].label}`);

    // ── Step 7: report.build — REAL implementation ───────────────────────────
    await logStep(auditId, `Started: ${STEPS[6].label}`);
    const reportResult = await buildReport(
      prisma,
      auditId,
      async (msg) => { await logStep(auditId, msg); },
    );
    await logStep(
      auditId,
      `✅ Report built: score=${reportResult.scoreTotal} recs=${reportResult.recommendationCount} email=${reportResult.emailSent ? 'sent' : 'skipped'}`,
    );
    await logStep(auditId, `Done: ${STEPS[6].label}`);

    // Mark DONE
    await prisma.audit.update({
      where: { id: auditId },
      data: { status: 'DONE', finishedAt: new Date() },
    });

    console.log(`[worker] ✅ audit ${auditId} complete`);
  },
  {
    connection,
    concurrency: 2,
    drainDelay: 30,
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  },
);

// Circuit breaker
connection.on('close', () => {
  console.warn('[worker] Redis disconnected — pausing worker');
  void worker.pause();
});
connection.on('ready', () => {
  console.log('[worker] Redis reconnected — resuming worker');
  void worker.resume();
});

// Handle job failure
worker.on('failed', async (job, err) => {
  console.error(`[worker] ❌ job failed: ${job?.id}`, err.message);
  if (!job?.data?.auditId) return;
  const prisma = getPrisma();
  await prisma.audit.update({
    where: { id: job.data.auditId },
    data: { status: 'FAILED', finishedAt: new Date(), errorMessage: err.message },
  }).catch(() => {});
  await prisma.jobLog.create({
    data: { auditId: job.data.auditId, message: `❌ Error: ${err.message}` },
  }).catch(() => {});
});

worker.on('stalled', async (jobId) => {
  console.warn(`[worker] stalled job detected: ${jobId}`);
});

console.log(`[worker] 🚀 listening on queue "${AUDIT_QUEUE_NAME}"`);

async function shutdown() {
  console.log('[worker] shutting down...');
  await worker.close();
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
