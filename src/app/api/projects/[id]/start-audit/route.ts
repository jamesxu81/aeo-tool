import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueAudit } from '@/lib/queue';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!project.paid) return NextResponse.json({ error: 'Payment required' }, { status: 402 });

  // Expire stale QUEUED/RUNNING audits older than 30 minutes (stuck from previous crashes)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.audit.updateMany({
    where: {
      projectId: id,
      status: { in: ['QUEUED', 'RUNNING'] },
      createdAt: { lt: thirtyMinAgo },
    },
    data: { status: 'FAILED', errorMessage: 'Timed out — stale job auto-expired', finishedAt: new Date() },
  });

  // Prevent duplicate active audits (only recent ones now)
  const existing = await prisma.audit.findFirst({
    where: {
      projectId: id,
      status: { in: ['QUEUED', 'RUNNING'] },
      createdAt: { gte: thirtyMinAgo },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An audit is already in progress', auditId: existing.id },
      { status: 409 },
    );
  }

  // Create audit record
  const audit = await prisma.audit.create({ data: { projectId: id } });

  // Enqueue — if this fails, delete the audit record so the user can retry
  try {
    await enqueueAudit(audit.id);
  } catch (err) {
    await prisma.audit.delete({ where: { id: audit.id } }).catch(() => {});
    console.error('[start-audit] enqueue failed:', err);
    return NextResponse.json({ error: 'Failed to start audit — please try again' }, { status: 500 });
  }

  return NextResponse.json({ auditId: audit.id });
}
