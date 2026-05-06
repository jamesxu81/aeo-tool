import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { chromium } from 'playwright';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: auditId } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: { select: { userId: true, domain: true } },
      report: true,
    },
  });

  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (audit.project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!audit.report) return NextResponse.json({ error: 'Report not ready yet — complete an audit first' }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3003}`;
  const reportUrl = `${baseUrl}/api/audits/${auditId}/report-html?token=${audit.report.shareToken}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
      printBackground: true,
    });

    await browser.close();

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="aeo-report-${audit.project.domain.replace(/[^a-z0-9]/gi, '-')}-${auditId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error('[report-pdf] generation failed:', e);
    return NextResponse.json(
      { error: `PDF generation failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 },
    );
  }
}
