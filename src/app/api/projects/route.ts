import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const domainRe = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().regex(domainRe),
  keywords: z.array(z.string().min(1).max(200)).min(1).max(20),
  competitors: z.array(z.string().regex(domainRe)).max(2).default([]),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { keywords: true, competitors: true, audits: true } } },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Ensure user row exists (JIT-sync from Clerk; webhook would also do this)
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@clerk.placeholder` },
  });

  const { name, domain, keywords, competitors } = parsed.data;

  const project = await prisma.project.create({
    data: {
      userId,
      name,
      domain: domain.toLowerCase(),
      keywords: { create: keywords.map((term) => ({ term })) },
      competitors: { create: competitors.map((d) => ({ domain: d.toLowerCase() })) },
    },
  });

  return NextResponse.json({ id: project.id }, { status: 201 });
}
