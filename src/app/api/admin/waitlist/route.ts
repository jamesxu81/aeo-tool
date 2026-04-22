import { NextRequest, NextResponse } from 'next/server';
import { db, WaitlistRow } from '@/lib/db';

export const runtime = 'nodejs';

function unauthorized() {
  return new NextResponse('Auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AEO Admin"' },
  });
}

function checkAuth(req: NextRequest): boolean {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASS;
  if (!expectedPass) {
    console.warn('[admin] ADMIN_PASS not set — /admin disabled');
    return false;
  }
  return user === expectedUser && pass === expectedPass;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');

  const rows = db()
    .prepare('SELECT * FROM waitlist ORDER BY created_at DESC')
    .all() as WaitlistRow[];

  if (format === 'csv') {
    const header = 'id,email,domain,keyword_count,role,source,created_at\n';
    const body = rows
      .map((r) =>
        [r.id, r.email, r.domain ?? '', r.keyword_count ?? '', r.role ?? '', r.source ?? '', r.created_at]
          .map((v) => {
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\n');
    return new NextResponse(header + body + '\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ count: rows.length, rows });
}
