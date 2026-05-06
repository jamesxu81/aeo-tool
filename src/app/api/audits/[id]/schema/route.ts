import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: auditId } = await params;
  const prisma2 = prisma;

  // Verify ownership
  const audit = await prisma2.audit.findUnique({
    where: { id: auditId },
    include: { project: { select: { userId: true } } },
  });
  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (audit.project.userId !== userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const findings = await prisma2.schemaFinding.findMany({
    where: { auditId },
    include: { page: { select: { url: true, title: true } } },
    orderBy: [{ valid: 'asc' }, { schemaType: 'asc' }],
  });

  return NextResponse.json({
    auditId,
    scoreSchema: audit.scoreSchema,
    findings,
  });
}
