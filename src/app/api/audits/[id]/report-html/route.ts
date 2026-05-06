import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public shareable HTML report — authenticated by shareToken
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: auditId } = await params;
  const token = req.nextUrl.searchParams.get('token');

  const report = await prisma.report.findFirst({
    where: { auditId, shareToken: token ?? undefined },
    include: {
      audit: {
        include: {
          project: { include: { keywords: true, competitors: true } },
          competitorAudits: { include: { competitor: true } },
          recommendations: { orderBy: { priority: 'asc' }, take: 10 },
          aiChecks: { select: { keyword: true, provider: true, ourDomainCited: true, ourPosition: true } },
        },
      },
    },
  });

  if (!report) {
    return new NextResponse('<html><body><h1>Report not found</h1></body></html>', {
      status: 404, headers: { 'Content-Type': 'text/html' },
    });
  }

  const { audit } = report;
  const { project } = audit;
  const score = report.scoreTotal ?? 0;
  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  // Citation matrix: keyword × provider
  const keywords = project.keywords.map((k) => k.keyword);
  const providers = ['serpapi', 'perplexity', 'openai'];
  const citationMatrix: Record<string, Record<string, boolean>> = {};
  for (const kw of keywords) {
    citationMatrix[kw] = {};
    for (const p of providers) {
      const check = audit.aiChecks.find((c) => c.keyword === kw && c.provider === p);
      citationMatrix[kw][p] = check?.ourDomainCited ?? false;
    }
  }

  const deltaRow = (label: string, yours: number | null, theirs: number | null) => {
    const y = yours ?? 0;
    const t = theirs ?? 0;
    const diff = y - t;
    const color = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#94a3b8';
    const sign = diff > 0 ? '+' : '';
    return `<tr>
      <td style="padding:6px 8px;color:#94a3b8;font-size:13px">${label}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:600">${y}</td>
      <td style="padding:6px 8px;text-align:center">${t}</td>
      <td style="padding:6px 8px;text-align:center;color:${color};font-weight:600">${sign}${diff}</td>
    </tr>`;
  };

  const effortLabel = (e: number) => e <= 2 ? 'Low' : e <= 3 ? 'Medium' : 'High';
  const impactLabel = (i: number) => i >= 4 ? 'High' : i >= 3 ? 'Medium' : 'Low';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>AEO Report — ${project.domain}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;max-width:900px;margin:auto}
    h1{font-size:28px;font-weight:700;margin-bottom:4px}
    h2{font-size:18px;font-weight:600;margin:32px 0 12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;font-size:12px}
    .card{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:16px}
    .score-ring{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:4px solid ${scoreColor};font-size:26px;font-weight:700;color:${scoreColor}}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #334155}
    td{border-bottom:1px solid #1e293b}
    .badge-yes{background:#166534;color:#86efac;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
    .badge-no{background:#374151;color:#9ca3af;padding:2px 8px;border-radius:9999px;font-size:11px}
    .pill-impact{background:#312e81;color:#a5b4fc;padding:2px 6px;border-radius:4px;font-size:11px}
    .pill-effort{background:#1c1917;color:#a8a29e;padding:2px 6px;border-radius:4px;font-size:11px}
    .footer{margin-top:48px;color:#475569;font-size:11px;border-top:1px solid #1e293b;padding-top:16px}
  </style>
</head>
<body>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px">
    <div>
      <h1>${project.domain}</h1>
      <div style="color:#64748b;font-size:14px;margin-top:4px">AEO Audit Report · ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
    </div>
    <div style="text-align:center">
      <div class="score-ring">${score}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">AEO Score</div>
    </div>
  </div>

  <!-- Score Breakdown -->
  <h2>Score Breakdown</h2>
  <div class="card" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center">
    ${[
      ['Schema', audit.scoreSchema],
      ['Content', audit.scoreStructure],
      ['E-E-A-T', audit.scoreEeat],
      ['Citations', audit.scoreCitation],
    ].map(([label, val]) => `
      <div>
        <div style="font-size:28px;font-weight:700;color:${(val as number|null ?? 0) >= 70 ? '#22c55e' : (val as number|null ?? 0) >= 40 ? '#f59e0b' : '#ef4444'}">${val ?? '—'}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${label}</div>
      </div>`).join('')}
  </div>

  <!-- AI Citation Matrix -->
  <h2>AI Citation Matrix</h2>
  <div class="card">
    <table>
      <thead><tr>
        <th>Keyword</th>
        <th>Google AI Overview</th>
        <th>Perplexity</th>
        <th>ChatGPT</th>
      </tr></thead>
      <tbody>
        ${keywords.map((kw) => `<tr>
          <td style="padding:8px;font-size:13px">${kw}</td>
          ${providers.map((p) => `<td style="padding:8px;text-align:center">
            ${citationMatrix[kw]?.[p]
              ? '<span class="badge-yes">✓ Cited</span>'
              : '<span class="badge-no">Not cited</span>'}
          </td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:11px;color:#475569;margin-top:12px">* ChatGPT results are approximate via API, not the UI. Results may vary from what you see in ChatGPT.com.</p>
  </div>

  <!-- Competitor Comparison -->
  ${audit.competitorAudits.length > 0 ? `
  <h2>Competitor Comparison</h2>
  ${audit.competitorAudits.map((ca) => `
  <div class="card">
    <div style="font-weight:600;margin-bottom:12px">${ca.domain} <span style="color:#64748b;font-size:12px;font-weight:400">${ca.status === 'done' ? `· ${ca.pagesCrawled} pages crawled` : `· ${ca.status}`}</span></div>
    ${ca.status === 'done' ? `
    <table>
      <thead><tr><th>Dimension</th><th>You</th><th>Competitor</th><th>Delta</th></tr></thead>
      <tbody>
        ${deltaRow('Schema', audit.scoreSchema, ca.scoreSchema)}
        ${deltaRow('Content', audit.scoreStructure, ca.scoreContent)}
        ${deltaRow('E-E-A-T', audit.scoreEeat, ca.scoreEeat)}
      </tbody>
    </table>` : `<p style="color:#64748b;font-size:13px">${ca.errorMessage ?? 'Audit pending'}</p>`}
  </div>`).join('')}` : ''}

  <!-- Top Recommendations -->
  <h2>Top Recommendations</h2>
  <div class="card">
    ${audit.recommendations.length === 0
      ? '<p style="color:#64748b;font-size:13px">No recommendations generated yet.</p>'
      : audit.recommendations.map((rec, i) => `
    <div style="padding:12px 0;${i < audit.recommendations.length - 1 ? 'border-bottom:1px solid #334155' : ''}">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="background:#312e81;color:#a5b4fc;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${i + 1}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px;margin-bottom:2px">${rec.title}</div>
          <div style="color:#94a3b8;font-size:12px;margin-bottom:6px">${rec.description}</div>
          <div style="display:flex;gap:6px">
            <span class="pill-impact">Impact: ${impactLabel(rec.impact)}</span>
            <span class="pill-effort">Effort: ${effortLabel(rec.effort)}</span>
            <span style="color:#64748b;font-size:11px;padding:2px 6px">${rec.category}</span>
          </div>
        </div>
      </div>
    </div>`).join('')}
  </div>

  <div class="footer">
    <p>Generated by AEO Tool · <a href="https://aeo-tool.vercel.app" style="color:#6366f1">aeo-tool.vercel.app</a> · Shareable link: /share/${report.shareToken}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
