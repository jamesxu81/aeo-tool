import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM || 'AEO Tool <onboarding@resend.dev>';

let _resend: Resend | null = null;

function client(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendWaitlistConfirmation(email: string, domain?: string | null) {
  const r = client();
  if (!r) {
    console.log(`[email] RESEND_API_KEY not set — skipping confirmation for ${email}`);
    return { skipped: true as const };
  }

  const greeting = domain ? ` We’ve flagged <b>${domain}</b> as your site.` : '';
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:520px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">You're on the AEO waitlist ✅</h2>
  <p>Thanks for signing up.${greeting}</p>
  <p>When private beta opens, you'll be first in line — plus <b>$50 off</b> your first report.</p>
  <p style="color:#475569;font-size:14px;margin-top:32px">
    Meanwhile, think about the 10–20 keywords you most want to check against ChatGPT / Perplexity / Google AI Overview. Those become the first report's target list.
  </p>
  <p style="color:#94a3b8;font-size:12px;margin-top:40px">
    You can reply to this email and a human will read it.
  </p>
</body></html>`;

  try {
    const res = await r.emails.send({
      from: FROM,
      to: email,
      subject: "You're on the AEO waitlist",
      html,
    });
    if (res.error) {
      console.error('[email] resend error:', res.error);
      return { sent: false as const, error: res.error.message };
    }
    console.log(`[email] confirmation sent to ${email} (id=${res.data?.id})`);
    return { sent: true as const, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[email] send exception:', msg);
    return { sent: false as const, error: msg };
  }
}
