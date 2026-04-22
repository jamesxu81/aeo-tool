import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid signature';
    console.error('[stripe-webhook] verify failed:', msg);
    return NextResponse.json({ error: 'signature verification failed' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const projectId = session.client_reference_id || session.metadata?.projectId;
    if (projectId) {
      try {
        await prisma.project.update({
          where: { id: projectId },
          data: { paid: true },
        });
        console.log(`[stripe-webhook] project ${projectId} marked paid`);
      } catch (e) {
        console.error('[stripe-webhook] project update failed:', e);
      }
    }
  }

  return NextResponse.json({ received: true });
}
