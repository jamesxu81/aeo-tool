import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const STEPS = [
  'Crawling domain',
  'Checking schema markup',
  'Analysing content quality',
  'Evaluating E-E-A-T signals',
  'Running AI citation checks',
  'Auditing competitors',
  'Building report',
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const audit = await prisma.audit.findFirst({
    where: { id, project: { userId } },
    include: { jobLogs: { orderBy: { createdAt: 'asc' } } },
  });

  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Compute progress 0–100
  let progress = 0;
  if (audit.status === 'DONE') {
    progress = 100;
  } else if (audit.status === 'RUNNING') {
    // Scale log count against expected total steps × 2 (start + done per step)
    const expectedLogs = STEPS.length * 2;
    progress = Math.min(90, Math.round((audit.jobLogs.length / expectedLogs) * 90));
  } else if (audit.status === 'FAILED') {
    // Freeze at last known progress
    const expectedLogs = STEPS.length * 2;
    progress = Math.min(90, Math.round((audit.jobLogs.length / expectedLogs) * 90));
  }

  return NextResponse.json({
    id: audit.id,
    status: audit.status,
    progress,
    errorMessage: audit.errorMessage,
    startedAt: audit.startedAt,
    finishedAt: audit.finishedAt,
    steps: STEPS,
    logs: audit.jobLogs.map((l) => ({ message: l.message, createdAt: l.createdAt })),
  });
}
