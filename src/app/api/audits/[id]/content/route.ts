import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: auditId } = await params;

  // Ownership check
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: { project: { select: { userId: true } } },
  });
  if (!audit || audit.project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findings = await prisma.contentFinding.findMany({
    where: { auditId },
    include: { page: { select: { url: true } } },
    orderBy: [{ pageId: 'asc' }, { rule: 'asc' }],
  });

  return NextResponse.json({
    score: audit.scoreStructure ?? null,
    findings,
  });
}
