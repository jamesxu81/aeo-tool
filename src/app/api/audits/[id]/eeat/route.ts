import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: auditId } = await params

  // Ownership check
  const audit = await prisma.audit.findFirst({
    where: { id: auditId, project: { userId } },
    select: { id: true, scoreEeat: true },
  })
  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const signals = await prisma.eeatSignal.findMany({
    where: { auditId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ score: audit.scoreEeat ?? null, signals })
}
