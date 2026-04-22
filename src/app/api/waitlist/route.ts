import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waitlistSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = waitlistSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, domain, keywordCount, role, source } = parsed.data;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const ua = req.headers.get('user-agent') || null;

  try {
    const stmt = db().prepare(
      `INSERT INTO waitlist (email, domain, keyword_count, role, source, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      email.toLowerCase().trim(),
      domain ? domain.toLowerCase().trim() : null,
      keywordCount ?? null,
      role ?? null,
      source ?? null,
      ua,
      ip,
    );

    // Optional: Resend confirmation email (skip gracefully if not configured)
    if (process.env.RESEND_API_KEY) {
      // Placeholder: wired in a later card when key is available.
      console.log(`[waitlist] would send confirmation to ${email}`);
    } else {
      console.log(`[waitlist] signup id=${result.lastInsertRowid} email=${email}`);
    }

    return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[waitlist] insert failed:', msg);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
