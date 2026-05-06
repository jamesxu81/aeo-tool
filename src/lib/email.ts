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

export async function sendReportReady({
  to,
  domain,
  scoreTotal,
  auditId,
  shareToken,
}: {
  to: string;
  domain: string;
  scoreTotal: number;
  auditId: string;
  shareToken: string;
}) {
  const r = client();
  if (!r) {
    console.log(`[email] RESEND_API_KEY not set — skipping report-ready for ${to}`);
    return { skipped: true as const };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';
  const reportUrl = `${appUrl}/app/audits/${auditId}/report?token=${shareToken}`;

  const scoreColor = scoreTotal >= 70 ? '#16a34a' : scoreTotal >= 40 ? '#d97706' : '#dc2626';
  const grade = scoreTotal >= 80 ? 'A' : scoreTotal >= 60 ? 'B' : scoreTotal >= 40 ? 'C' : 'D';

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:520px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">Your AEO Report is Ready 📊</h2>
  <p>The audit for <b>${domain}</b> has completed.</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
    <div style="font-size:48px;font-weight:800;color:${scoreColor}">${scoreTotal}</div>
    <div style="font-size:14px;color:#64748b;margin-top:4px">AEO Score / 100 — Grade ${grade}</div>
  </div>
  <p>Your report includes:</p>
  <ul style="color:#475569">
    <li>AI citation check results (Google AI Overview)</li>
    <li>Schema markup audit</li>
    <li>Content quality analysis</li>
    <li>E-E-A-T signal evaluation</li>
    <li>Competitor comparison</li>
    <li>Top 10 prioritised recommendations</li>
  </ul>
  <a href="${reportUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:12px 0">
    View Full Report →
  </a>
  <p style="color:#94a3b8;font-size:12px;margin-top:40px">
    AEO Tool — Answer Engine Optimisation
  </p>
</body></html>`;

  try {
    const res = await r.emails.send({
      from: FROM,
      to,
      subject: `AEO Report Ready: ${domain} scored ${scoreTotal}/100`,
      html,
    });
    if (res.error) {
      console.error('[email] resend error:', res.error);
      return { sent: false as const, error: res.error.message };
    }
    console.log(`[email] report-ready sent to ${to} (id=${res.data?.id})`);
    return { sent: true as const, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error('[email] send exception:', msg);
    return { sent: false as const, error: msg };
  }
}
