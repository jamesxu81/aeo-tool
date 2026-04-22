import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null; // middleware already protects — belt + braces

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { keywords: true, competitors: true, _count: { select: { audits: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your projects</h1>
        <Link
          href="/app/projects/new"
          className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
        >
          + New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
          <p>No projects yet.</p>
          <p className="mt-2 text-sm">Start by creating one — pick a domain and 1–20 keywords.</p>
          <Link
            href="/app/projects/new"
            className="mt-5 inline-block rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/app/projects/${p.id}`}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-slate-600"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs ' +
                    (p.paid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300')
                  }
                >
                  {p.paid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400">{p.domain}</p>
              <p className="mt-3 text-xs text-slate-500">
                {p.keywords.length} keywords · {p.competitors.length} competitors ·{' '}
                {p._count.audits} audits
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
