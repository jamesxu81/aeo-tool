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

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: { select: { userId: true } },
      recommendations: { orderBy: { priority: 'asc' } },
    },
  });

  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (audit.project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ recommendations: audit.recommendations });
}
