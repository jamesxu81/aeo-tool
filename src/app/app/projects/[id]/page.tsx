import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import AuditProgress from '@/components/audit-progress';
import RunAuditButton from '@/components/run-audit-button';
import AuditResults from '@/components/audit-results';
import { CrawledPages } from '@/components/crawled-pages';
import { ProjectTabs } from '@/components/project-tabs';
import { SchemaAudit } from '@/components/schema-audit';
import { EeatAudit } from '@/components/eeat-audit';
import { ContentAudit } from '@/components/content-audit';
import { CompetitorAudit } from '@/components/competitor-audit';
import { Recommendations } from '@/components/recommendations';

const STATUS_BADGE: Record<string, string> = {
  QUEUED:  'bg-amber-500/20 text-amber-300',
  RUNNING: 'bg-blue-500/20 text-blue-300',
  DONE:    'bg-emerald-500/20 text-emerald-300',
  FAILED:  'bg-red-500/20 text-red-300',
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auditId?: string; checkout?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { auditId, checkout, tab = 'overview' } = await searchParams;
  const { userId } = await auth();
  if (!userId) return null;

  let project = await prisma.project.findFirst({
    where: { id, userId },
    include: { keywords: true, competitors: true, audits: { orderBy: { createdAt: 'desc' } } },
  });
  if (!project) notFound();

  // Latest DONE audit
  const latestDoneAudit = project.audits.find((a) => a.status === 'DONE');

  // Fetch AI checks
  const aiChecks = latestDoneAudit
    ? await prisma.aiCheck.findMany({
        where: { auditId: latestDoneAudit.id },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  // Fetch crawled pages — scoped to the latest DONE audit only
  const pages = latestDoneAudit
    ? await prisma.page.findMany({
        where: { auditId: latestDoneAudit.id },
        orderBy: { crawledAt: 'desc' },
        take: 200,
      })
    : [];

  // Fetch schema findings count for tab badge
  const schemaFindingsCount = latestDoneAudit
    ? await prisma.schemaFinding.count({ where: { auditId: latestDoneAudit.id } })
    : 0;

  // Fetch content findings count for tab badge
  const contentFindingsCount = latestDoneAudit
    ? await prisma.contentFinding.count({ where: { auditId: latestDoneAudit.id } })
    : 0;

  // Fetch E-E-A-T signals count for tab badge
  const eeatSignalsCount = latestDoneAudit
    ? await prisma.eeatSignal.count({ where: { auditId: latestDoneAudit.id } })
    : 0;

  // Verify Stripe session on redirect
  let paymentStatus: 'confirmed' | 'processing' | 'error' | null = null;
  if (checkout === 'success' && !project.paid) {
    try {
      const s = (await import('@/lib/stripe')).stripe();
      if (!s) {
        paymentStatus = 'error';
      } else if (project.stripeCheckoutId) {
        const session = await s.checkout.sessions.retrieve(project.stripeCheckoutId);
        if (session.payment_status === 'paid') {
          await prisma.project.update({ where: { id: project.id }, data: { paid: true } });
          project = { ...project, paid: true };
          paymentStatus = 'confirmed';
        } else {
          paymentStatus = 'processing';
        }
      } else {
        paymentStatus = 'error';
      }
    } catch (e) {
      console.error('[project-page] stripe verify failed:', e);
      paymentStatus = 'error';
    }
  } else if (checkout === 'success' && project.paid) {
    paymentStatus = 'confirmed';
  }

  // Auto-resume progress bar
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const activeAuditId =
    auditId ??
    project.audits.find(
      (a) =>
        (a.status === 'RUNNING' || a.status === 'QUEUED') &&
        a.createdAt > thirtyMinAgo,
    )?.id;

  return (
    <div>
      {/* Payment banners */}
      {paymentStatus === 'confirmed' && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
          ✅ Payment confirmed — your project is unlocked and ready to audit.
        </div>
      )}
      {paymentStatus === 'processing' && (
        <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-300">
          ⏳ Payment is still processing — please refresh in a moment.
        </div>
      )}
      {paymentStatus === 'error' && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          ⚠️ We couldn&apos;t verify your payment automatically. Contact support with reference:{' '}
          <code className="font-mono">{project.stripeCheckoutId ?? 'N/A'}</code>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-slate-400">{project.domain}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs ${
            project.paid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
          }`}>
            {project.paid ? '✓ Paid' : 'Unpaid'}
          </span>
          {!project.paid ? (
            <form action="/api/checkout" method="POST">
              <input type="hidden" name="projectId" value={project.id} />
              <button
                type="submit"
                className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
              >
                Pay $99 &amp; unlock audit
              </button>
            </form>
          ) : (
            <RunAuditButton projectId={project.id} />
          )}
        </div>
      </div>

      {/* Live progress bar */}
      {activeAuditId && <AuditProgress auditId={activeAuditId} />}

      {/* Tabs */}
      <ProjectTabs
        activeTab={tab}
        projectId={project.id}
        counts={{
          pages: pages.length,
          aiChecks: aiChecks.length,
          audits: project.audits.length,
          schemaFindings: schemaFindingsCount,
          contentFindings: contentFindingsCount,
          eeatSignals: eeatSignalsCount,
        }}
      />

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-6 mt-6">
          {/* AI results */}
          {!activeAuditId && (
            <AuditResults checks={aiChecks} domain={project.domain} />
          )}
          {/* Keywords + Competitors */}
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="font-semibold">Keywords ({project.keywords.length})</h2>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {project.keywords.map((k) => (
                  <li key={k.id} className="rounded bg-slate-800/50 px-2 py-1">{k.term}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="font-semibold">Competitors ({project.competitors.length})</h2>
              <ul className="mt-3 space-y-1 text-sm text-slate-300">
                {project.competitors.map((c) => (
                  <li key={c.id} className="rounded bg-slate-800/50 px-2 py-1">{c.domain}</li>
                ))}
                {project.competitors.length === 0 && (
                  <li className="text-slate-500">No competitors added</li>
                )}
              </ul>
            </section>
          </div>
        </div>
      )}

      {tab === 'pages' && (
        <div className="mt-6">
          <CrawledPages
            pages={pages.map((p) => ({
              ...p,
              schemaTypes: p.schemaTypes as string[],
              crawledAt: p.crawledAt.toISOString(),
            }))}
            domain={project.domain}
          />
        </div>
      )}

      {tab === 'schema' && (
        <div className="mt-6">
          {latestDoneAudit ? (
            <SchemaAudit auditId={latestDoneAudit.id} />
          ) : (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No completed audit yet — run an audit to see schema findings.
            </p>
          )}
        </div>
      )}

      {tab === 'content' && (
        <div className="mt-6">
          {latestDoneAudit ? (
            <ContentAudit auditId={latestDoneAudit.id} />
          ) : (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No completed audit yet — run an audit to see content findings.
            </p>
          )}
        </div>
      )}

      {tab === 'eeat' && (
        <div className="mt-6">
          {latestDoneAudit ? (
            <EeatAudit auditId={latestDoneAudit.id} />
          ) : (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No completed audit yet — run an audit to see E-E-A-T signals.
            </p>
          )}
        </div>
      )}

      {tab === 'ai-checks' && (
        <div className="mt-6">
          <AuditResults checks={aiChecks} domain={project.domain} />
        </div>
      )}

      {tab === 'competitors' && (
        <div className="mt-6">
          {latestDoneAudit ? (
            <CompetitorAudit auditId={latestDoneAudit.id} />
          ) : (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No completed audit yet — run an audit to see competitor comparisons.
            </p>
          )}
        </div>
      )}

      {tab === 'recommendations' && (
        <div className="mt-6">
          {latestDoneAudit ? (
            <Recommendations auditId={latestDoneAudit.id} />
          ) : (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No completed audit yet — run an audit to generate recommendations.
            </p>
          )}
        </div>
      )}

      {tab === 'audits' && (
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold mb-3">Audit History ({project.audits.length})</h2>
          {project.audits.length === 0 ? (
            <p className="text-sm text-slate-500">No audits yet.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-300">
              {project.audits.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded bg-slate-800/50 px-2 py-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[a.status] ?? ''}`}>
                    {a.status}
                  </span>
                  <span className="text-slate-500 text-xs">{a.createdAt.toISOString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-8">
        <Link href="/app" className="text-sm text-slate-400 hover:text-white">
          ← Back to projects
        </Link>
      </div>
    </div>
  );
}
