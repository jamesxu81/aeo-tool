import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { stripe, REPORT_PRICE_CENTS, REPORT_PRODUCT_NAME } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const s = stripe();
  if (!s) {
    return NextResponse.json(
      { error: 'Payments not configured (STRIPE_SECRET_KEY missing)' },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const projectId = String(form.get('projectId') || '');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (project.paid) return NextResponse.redirect(new URL(`/app/projects/${project.id}`, req.url), 303);

  const origin = req.headers.get('origin') || new URL(req.url).origin;

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: REPORT_PRICE_CENTS,
          product_data: {
            name: REPORT_PRODUCT_NAME,
            description: `AEO report for ${project.domain}`,
          },
        },
      },
    ],
    success_url: `${origin}/app/projects/${project.id}?checkout=success`,
    cancel_url: `${origin}/app/projects/${project.id}?checkout=cancelled`,
    client_reference_id: project.id,
    metadata: { projectId: project.id, userId },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { stripeCheckoutId: session.id },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe returned no URL' }, { status: 500 });
  }
  return NextResponse.redirect(session.url, 303);
}
