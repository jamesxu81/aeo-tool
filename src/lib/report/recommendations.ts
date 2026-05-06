/**
 * recommendations.ts
 * ------------------
 * Generates a prioritised list of actionable recommendations from audit results.
 * Impact × Effort matrix: priority = impact * (6 - effort) — higher is better.
 *
 * Reads real findings from DB and maps them to a curated playbook of fixes.
 * Returns top 10 sorted by priority.
 */

import type { PrismaClient } from '@prisma/client';

export interface RecommendationItem {
  category: 'schema' | 'content' | 'eeat' | 'citations';
  title: string;
  description: string;
  impact: number;  // 1–5
  effort: number;  // 1–5
  priority: number; // impact * (6 - effort)
}

/** Static playbook — each entry has a trigger condition and fixed impact/effort */
const PLAYBOOK: Array<{
  category: RecommendationItem['category'];
  title: string;
  description: string;
  impact: number;
  effort: number;
  trigger: (ctx: AuditContext) => boolean;
}> = [
  // ── Schema ───────────────────────────────────────────────────────────────
  {
    category: 'schema',
    title: 'Add FAQPage schema to key landing pages',
    description: 'FAQPage JSON-LD is the #1 signal for AI citation. Add it to your top pages with 3–5 Q&As matching your target keywords. AI assistants directly quote from FAQ schema.',
    impact: 5, effort: 2,
    trigger: (ctx) => !ctx.schemaTypes.includes('FAQPage'),
  },
  {
    category: 'schema',
    title: 'Add HowTo schema to tutorial/guide pages',
    description: 'HowTo schema helps AI assistants surface your step-by-step guides. Implement for any process-oriented content with 3+ distinct steps.',
    impact: 4, effort: 2,
    trigger: (ctx) => !ctx.schemaTypes.includes('HowTo'),
  },
  {
    category: 'schema',
    title: 'Add Article schema with author and datePublished',
    description: 'Article schema with datePublished signals recency — a key ranking factor for AI answers. Include author Person schema for E-E-A-T bonus.',
    impact: 4, effort: 2,
    trigger: (ctx) => !ctx.schemaTypes.includes('Article'),
  },
  {
    category: 'schema',
    title: 'Fix Organization schema with sameAs links',
    description: 'Organization schema needs sameAs linking to your Wikipedia, Wikidata, LinkedIn, and Crunchbase profiles. This is how AI engines resolve brand identity.',
    impact: 5, effort: 3,
    trigger: (ctx) => ctx.schemaFailures.includes('Organization') || !ctx.schemaTypes.includes('Organization'),
  },
  {
    category: 'schema',
    title: 'Add BreadcrumbList schema for site structure',
    description: 'BreadcrumbList helps AI engines understand your content hierarchy. Implement on all pages below the homepage.',
    impact: 3, effort: 2,
    trigger: (ctx) => !ctx.schemaTypes.includes('BreadcrumbList'),
  },

  // ── Content ───────────────────────────────────────────────────────────────
  {
    category: 'content',
    title: 'Rewrite introductions to answer-first format',
    description: 'AI assistants prefer "direct answer, then detail" structure. Move your core answer into the first 50 words of every page. This dramatically increases citation probability.',
    impact: 5, effort: 2,
    trigger: (ctx) => ctx.contentFailures.includes('answer_first'),
  },
  {
    category: 'content',
    title: 'Add FAQ blocks to top 5 pages',
    description: 'Pages with FAQ sections are cited 3× more often. Add collapsible FAQ with 5–8 questions per page, using exact question phrases from your keyword research.',
    impact: 5, effort: 3,
    trigger: (ctx) => ctx.contentFailures.includes('faq_block'),
  },
  {
    category: 'content',
    title: 'Rewrite headings as questions',
    description: 'Question-format headings (H2/H3) match AI query patterns directly. Convert at least 50% of your section headings to "What is...", "How do...", "Why does..." format.',
    impact: 4, effort: 2,
    trigger: (ctx) => ctx.contentFailures.includes('question_headings'),
  },
  {
    category: 'content',
    title: 'Add TL;DR summaries to long-form pages',
    description: 'AI engines often extract the first concise summary they find. Add a 2–3 sentence TL;DR at the top of every page over 800 words.',
    impact: 4, effort: 1,
    trigger: (ctx) => ctx.contentFailures.includes('tldr_summary'),
  },
  {
    category: 'content',
    title: 'Add comparison tables to category pages',
    description: 'Structured comparison tables are frequently cited verbatim by AI engines. Add feature/pricing comparison tables to product and category pages.',
    impact: 4, effort: 3,
    trigger: (ctx) => ctx.contentFailures.includes('comparison_table'),
  },
  {
    category: 'content',
    title: 'Fix pages missing a single clear H1',
    description: 'Multiple H1s or missing H1 confuses AI content extraction. Every page must have exactly one H1 matching the primary keyword for that page.',
    impact: 3, effort: 1,
    trigger: (ctx) => ctx.contentFailures.includes('single_h1'),
  },
  {
    category: 'content',
    title: 'Add bulleted/numbered lists to dense paragraphs',
    description: 'AI assistants prefer structured lists over dense paragraphs. Break up any paragraph over 150 words into a list. Aim for at least one list per page.',
    impact: 3, effort: 1,
    trigger: (ctx) => ctx.contentFailures.includes('list_present'),
  },

  // ── E-E-A-T ───────────────────────────────────────────────────────────────
  {
    category: 'eeat',
    title: 'Create author bio pages with credentials',
    description: 'AI engines heavily weight author expertise. Create /author/[name] pages with bio, credentials, publications, and social links. Link these from every article.',
    impact: 5, effort: 3,
    trigger: (ctx) => ctx.eeatFailures.includes('author_page'),
  },
  {
    category: 'eeat',
    title: 'Add Person schema to author bio pages',
    description: 'Person JSON-LD on author pages creates machine-readable expertise signals. Include jobTitle, alumniOf, knowsAbout, and sameAs (LinkedIn, Google Scholar).',
    impact: 4, effort: 2,
    trigger: (ctx) => ctx.eeatFailures.includes('author_schema'),
  },
  {
    category: 'eeat',
    title: 'Add visible date-modified to all articles',
    description: 'Recency is a primary AI answer ranking factor. Display "Last updated: [date]" prominently. Update articles every 6–12 months even with minor additions.',
    impact: 4, effort: 1,
    trigger: (ctx) => ctx.eeatFailures.includes('last_updated'),
  },
  {
    category: 'eeat',
    title: 'Create a comprehensive About page',
    description: 'AI engines use About pages to establish brand credibility. Include company history, team, mission, and media coverage. Link to Wikipedia/Crunchbase profiles.',
    impact: 3, effort: 2,
    trigger: (ctx) => ctx.eeatFailures.includes('about_page'),
  },
  {
    category: 'eeat',
    title: 'Add outbound links to authoritative sources',
    description: 'Linking to Wikipedia, .gov, .edu, and industry authorities signals content quality to AI engines. Add 3–5 authoritative outbound links per major content page.',
    impact: 3, effort: 2,
    trigger: (ctx) => ctx.eeatFailures.includes('outbound_authority_links'),
  },

  // ── Citations ─────────────────────────────────────────────────────────────
  {
    category: 'citations',
    title: 'Optimise top-missed keywords with FAQ content',
    description: 'Your competitors are being cited for keywords where you are not. Create dedicated FAQ landing pages targeting these keywords with expert-level Q&A content.',
    impact: 5, effort: 3,
    trigger: (ctx) => ctx.missedKeywords > 0,
  },
  {
    category: 'citations',
    title: 'Build topic cluster pages for uncited keywords',
    description: 'Create comprehensive "hub" pages covering each uncited keyword topic in depth (2,000+ words). Link related sub-pages to create topic authority.',
    impact: 4, effort: 4,
    trigger: (ctx) => ctx.missedKeywords > 2,
  },
  {
    category: 'citations',
    title: 'Add AI-readable definitions to key term pages',
    description: 'For every primary keyword, add a clear 1–2 sentence definition at the top of the page. AI engines prefer sites that explicitly define terms they are answering about.',
    impact: 4, effort: 1,
    trigger: (ctx) => ctx.citationRate < 0.3,
  },
];

interface AuditContext {
  schemaTypes: string[];
  schemaFailures: string[];
  contentFailures: string[];
  eeatFailures: string[];
  missedKeywords: number;
  citationRate: number; // 0–1
}

export async function buildRecommendations(
  prisma: PrismaClient,
  auditId: string,
): Promise<RecommendationItem[]> {
  // Gather context from DB
  const [schemaFindings, contentFindings, eeatSignals, aiChecks] = await Promise.all([
    prisma.schemaFinding.findMany({ where: { auditId }, select: { schemaType: true, valid: true } }),
    prisma.contentFinding.findMany({ where: { auditId }, select: { rule: true, passed: true } }),
    prisma.eeatSignal.findMany({ where: { auditId }, select: { signal: true, passed: true } }),
    prisma.aiCheck.findMany({ where: { auditId }, select: { ourDomainCited: true } }),
  ]);

  const schemaTypes = Array.from(new Set(schemaFindings.filter((f) => f.valid).map((f) => f.schemaType)));
  const schemaFailures = schemaFindings.filter((f) => !f.valid).map((f) => f.schemaType);
  const contentFailures = contentFindings.filter((f) => !f.passed).map((f) => f.rule);
  const eeatFailures = eeatSignals.filter((f) => !f.passed).map((f) => f.signal);
  const citationRate = aiChecks.length > 0
    ? aiChecks.filter((c) => c.ourDomainCited).length / aiChecks.length
    : 0;
  const missedKeywords = aiChecks.filter((c) => !c.ourDomainCited).length;

  const ctx: AuditContext = { schemaTypes, schemaFailures, contentFailures, eeatFailures, missedKeywords, citationRate };

  // Filter triggered recommendations and compute priority
  const recs: RecommendationItem[] = PLAYBOOK
    .filter((r) => r.trigger(ctx))
    .map((r) => ({
      category: r.category,
      title: r.title,
      description: r.description,
      impact: r.impact,
      effort: r.effort,
      priority: r.impact * (6 - r.effort),
    }));

  // Sort by priority desc, take top 10
  recs.sort((a, b) => b.priority - a.priority);
  return recs.slice(0, 10);
}

/** Save recommendations to DB (batch upsert) */
export async function saveRecommendations(
  prisma: PrismaClient,
  auditId: string,
  recs: RecommendationItem[],
): Promise<void> {
  // Delete old recommendations first (idempotent rebuild)
  await prisma.recommendation.deleteMany({ where: { auditId } });
  if (recs.length === 0) return;
  await prisma.recommendation.createMany({
    data: recs.map((r) => ({
      auditId,
      category: r.category,
      title: r.title,
      description: r.description,
      impact: r.impact,
      effort: r.effort,
      priority: r.priority,
    })),
  });
}
