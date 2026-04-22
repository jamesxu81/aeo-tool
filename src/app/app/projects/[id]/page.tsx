import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return null;

  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: { keywords: true, competitors: true, audits: { orderBy: { createdAt: 'desc' } } },
  });
  if (!project) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-slate-400">{project.domain}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              'rounded-full px-3 py-1 text-xs ' +
              (project.paid
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300')
            }
          >
            {project.paid ? 'Paid' : 'Unpaid — $99 required to run audit'}
          </span>
          {!project.paid ? (
            <form action="/api/checkout" method="POST">
              <input type="hidden" name="projectId" value={project.id} />
              <button
                type="submit"
                className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
              >
                Pay $99 & start audit
              </button>
            </form>
          ) : (
            <button
              disabled
              className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300"
              title="Audit engine arrives in card #2+"
            >
              Run audit (coming soon)
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">Keywords ({project.keywords.length})</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            {project.keywords.map((k) => (
              <li key={k.id} className="rounded bg-slate-800/50 px-2 py-1">
                {k.term}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">Competitors ({project.competitors.length})</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            {project.competitors.map((c) => (
              <li key={c.id} className="rounded bg-slate-800/50 px-2 py-1">
                {c.domain}
              </li>
            ))}
            {project.competitors.length === 0 && (
              <li className="text-slate-500">No competitors added</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="font-semibold">Audits ({project.audits.length})</h2>
        {project.audits.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No audits yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            {project.audits.map((a) => (
              <li key={a.id} className="rounded bg-slate-800/50 px-2 py-1">
                {a.status} · {a.createdAt.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <Link href="/app" className="text-sm text-slate-400 hover:text-white">
          ← Back to projects
        </Link>
      </div>
    </div>
  );
}
