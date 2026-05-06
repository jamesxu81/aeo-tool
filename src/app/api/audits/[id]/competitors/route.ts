import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: auditId } = await params;

  // Verify audit belongs to user
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: { select: { userId: true, domain: true } },
      competitorAudits: { include: { competitor: true } },
      aiChecks: { select: { keyword: true, ourDomainCited: true, allCitedDomains: true, provider: true } },
    },
  });

  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (audit.project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Build citation gap: for each competitor, how often they appear in AI citations
  const citationMap: Record<string, { cited: number; total: number }> = {};
  for (const check of audit.aiChecks) {
    for (const domain of (check.allCitedDomains as string[])) {
      if (!citationMap[domain]) citationMap[domain] = { cited: 0, total: 0 };
      citationMap[domain].cited += 1;
    }
    // total = number of checks (each is an opportunity to be cited)
    const key = '_total';
    if (!citationMap[key]) citationMap[key] = { cited: 0, total: 0 };
    citationMap[key].total += 1;
  }
  const totalChecks = citationMap['_total']?.total ?? audit.aiChecks.length;

  return NextResponse.json({
    auditId,
    yourDomain: audit.project.domain,
    yourScores: {
      schema: audit.scoreSchema ?? null,
      content: audit.scoreStructure ?? null,
      eeat: audit.scoreEeat ?? null,
      citation: audit.scoreCitation ?? null,
      total: audit.scoreTotal ?? null,
    },
    competitors: audit.competitorAudits.map((ca) => ({
      id: ca.id,
      domain: ca.domain,
      status: ca.status,
      errorMessage: ca.errorMessage,
      scores: {
        schema: ca.scoreSchema,
        content: ca.scoreContent,
        eeat: ca.scoreEeat,
        citation: ca.citationCount > 0 ? Math.round((ca.citationCount / Math.max(totalChecks, 1)) * 100) : 0,
      },
      pagesCrawled: ca.pagesCrawled,
      citationCount: ca.citationCount,
      topCitedKeywords: ca.topCitedKeywords,
      // Deltas vs your domain (positive = you're ahead)
      deltas: {
        schema: (audit.scoreSchema ?? 0) - (ca.scoreSchema ?? 0),
        content: (audit.scoreStructure ?? 0) - (ca.scoreContent ?? 0),
        eeat: (audit.scoreEeat ?? 0) - (ca.scoreEeat ?? 0),
      },
    })),
    citationLeaderboard: Object.entries(citationMap)
      .filter(([k]) => k !== '_total')
      .sort((a, b) => b[1].cited - a[1].cited)
      .slice(0, 15)
      .map(([domain, { cited }]) => ({
        domain,
        citations: cited,
        rate: totalChecks > 0 ? Math.round((cited / totalChecks) * 100) : 0,
      })),
  });
}
