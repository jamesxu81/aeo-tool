import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import { auditEeat, calcEeatScore, type EeatAuditInput } from './eeat-validator'

export async function runEeatAudit(
  prisma: PrismaClient,
  auditId: string,
  domain: string,
  onProgress?: (msg: string) => void,
): Promise<{ score: number; passed: number; total: number }> {
  const log = (msg: string) => onProgress?.(msg)

  // Fetch all crawled pages for this audit
  const pages = await prisma.page.findMany({
    where: { auditId },
    select: { id: true, url: true, statusCode: true },
  })

  if (pages.length === 0) {
    log('⚠️ No crawled pages found — skipping E-E-A-T audit')
    return { score: 0, passed: 0, total: 0 }
  }

  log(`🔍 E-E-A-T audit: analysing ${pages.length} crawled pages…`)

  // Determine homepage URL
  const homepageUrl = pages[0].url.startsWith('http')
    ? new URL(pages[0].url).origin
    : `https://${domain}`

  // Fetch HTML for each page (reuse crawled content via lightweight fetch)
  const crawledHtmlMap: Record<string, string> = {}
  let homepageHtml = ''

  for (const page of pages) {
    try {
      const res = await axios.get(page.url, {
        timeout: 10_000,
        headers: { 'User-Agent': 'AEOBot/1.0' },
        maxContentLength: 2 * 1024 * 1024, // 2MB cap
      })
      const html = typeof res.data === 'string' ? res.data : String(res.data)
      crawledHtmlMap[page.url] = html
      if (!homepageHtml) homepageHtml = html
    } catch {
      log(`⚠️ Skipping ${page.url} (fetch failed)`)
    }
  }

  if (!homepageHtml) {
    log('⚠️ Could not fetch any page HTML — skipping E-E-A-T audit')
    return { score: 0, passed: 0, total: 0 }
  }

  const crawledUrls = Object.keys(crawledHtmlMap)

  const input: EeatAuditInput = {
    domain,
    homepageUrl,
    homepageHtml,
    crawledUrls,
    crawledHtmlMap,
  }

  log('🧠 Running E-E-A-T signal checks…')
  const { findings, score } = auditEeat(input)

  const passed = findings.filter(f => f.passed).length
  const total = findings.length
  log(`📊 E-E-A-T: ${passed}/${total} signals passed, score ${score}/100`)

  // Upsert findings into DB
  for (const f of findings) {
    await prisma.eeatSignal.upsert({
      where: { auditId_signal: { auditId, signal: f.signal } },
      update: {
        passed: f.passed,
        severity: f.severity,
        label: f.label,
        evidence: f.evidence,
        value: f.value,
        fixSuggestion: f.fixSuggestion,
      },
      create: {
        auditId,
        signal: f.signal,
        passed: f.passed,
        severity: f.severity,
        label: f.label,
        evidence: f.evidence,
        value: f.value,
        fixSuggestion: f.fixSuggestion,
      },
    })
  }

  // Save score to Audit row
  await prisma.audit.update({
    where: { id: auditId },
    data: { scoreEeat: score },
  })

  return { score, passed, total }
}
