import * as cheerio from 'cheerio'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EeatSignalKey =
  | 'https'
  | 'author_page'
  | 'author_schema'
  | 'about_page'
  | 'contact_info'
  | 'last_updated'
  | 'privacy_policy'
  | 'terms_of_service'
  | 'outbound_authority_links'

export type Severity = 'critical' | 'warning' | 'info'

export interface EeatFinding {
  signal: EeatSignalKey
  label: string
  passed: boolean
  severity: Severity
  evidence: string | null
  value: string | null
  fixSuggestion: string | null
}

export interface EeatAuditInput {
  domain: string                        // e.g. "mitre10.co.nz"
  homepageUrl: string                   // e.g. "https://mitre10.co.nz"
  homepageHtml: string                  // raw HTML of homepage
  crawledUrls: string[]                 // all URLs crawled in this audit
  crawledHtmlMap: Record<string, string> // url → html for content pages
}

export interface EeatAuditResult {
  findings: EeatFinding[]
  score: number  // 0–100
}

// ─── Authority domains for outbound link scoring ─────────────────────────────

const AUTHORITY_DOMAINS = new Set([
  'wikipedia.org', 'gov.nz', 'govt.nz', 'gov.au', 'gov.uk', 'gov',
  'nist.gov', 'nih.gov', 'cdc.gov', 'who.int', 'un.org',
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com',
  'nytimes.com', 'wsj.com', 'ft.com', 'bloomberg.com', 'forbes.com',
  'harvard.edu', 'stanford.edu', 'mit.edu', 'oxford.ac.uk', 'cambridge.ac.uk',
  'scholar.google.com', 'pubmed.ncbi.nlm.nih.gov', 'doi.org',
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com',
  'mdn.web', 'developer.mozilla.org', 'w3.org', 'schema.org',
])

function isAuthorityDomain(href: string): boolean {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
  const authDomainList = Array.from(AUTHORITY_DOMAINS)
  return authDomainList.some(d => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

// ─── Individual signal checkers ───────────────────────────────────────────────

function checkHttps(domain: string, homepageUrl: string): EeatFinding {
  const passed = homepageUrl.startsWith('https://')
  return {
    signal: 'https',
    label: 'HTTPS enabled',
    passed,
    severity: 'critical',
    evidence: passed ? homepageUrl : `Site loaded over HTTP: ${homepageUrl}`,
    value: null,
    fixSuggestion: passed
      ? null
      : 'Enable HTTPS via your hosting provider or a free Let\'s Encrypt certificate. Google and AI engines penalise non-HTTPS sites for trust.',
  }
}

function checkAuthorPage(crawledUrls: string[], crawledHtmlMap: Record<string, string>): EeatFinding {
  const authorPatterns = [/\/author\//i, /\/authors\//i, /\/team\//i, /\/about\/team/i, /\/people\//i, /\/staff\//i]
  const authorUrl = crawledUrls.find(u => authorPatterns.some(p => p.test(u)))

  // Also check for author links in any page
  let linkedAuthorUrl: string | null = null
  if (!authorUrl) {
    for (const [, html] of Object.entries(crawledHtmlMap)) {
      const $ = cheerio.load(html)
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (authorPatterns.some(p => p.test(href))) {
          linkedAuthorUrl = href
          return false
        }
      })
      if (linkedAuthorUrl) break
    }
  }

  const found = authorUrl || linkedAuthorUrl
  return {
    signal: 'author_page',
    label: 'Author / team page exists',
    passed: !!found,
    severity: 'critical',
    evidence: found || null,
    value: null,
    fixSuggestion: found
      ? null
      : 'Create an /about/team or /authors page listing contributors with names, photos, credentials and social profiles. AI engines use author pages to evaluate E-E-A-T.',
  }
}

function checkAuthorSchema(crawledHtmlMap: Record<string, string>): EeatFinding {
  let found: string | null = null
  let foundUrl: string | null = null

  for (const [url, html] of Object.entries(crawledHtmlMap)) {
    const $ = cheerio.load(html)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}')
        const items = Array.isArray(data['@graph']) ? data['@graph'] : [data]
        for (const item of items) {
          const type = String(item['@type'] || '')
          if (type.includes('Person') || type.includes('Author')) {
            found = item.name || 'Person schema found'
            foundUrl = url
            return false
          }
          // Check author property on Article
          if (item.author) {
            const author = Array.isArray(item.author) ? item.author[0] : item.author
            if (author?.['@type'] === 'Person' || author?.name) {
              found = `Article author: ${author.name || 'Person'}`
              foundUrl = url
              return false
            }
          }
        }
      } catch { /* skip malformed */ }
    })
    if (found) break
  }

  return {
    signal: 'author_schema',
    label: 'Author schema (Person) present',
    passed: !!found,
    severity: 'critical',
    evidence: foundUrl ? `${found} — found at ${foundUrl}` : null,
    value: null,
    fixSuggestion: found
      ? null
      : 'Add Person schema to author profile pages and Article schema with a nested author object on blog posts. Include name, url, image, sameAs (LinkedIn, Twitter). This is the #1 E-E-A-T signal for AI citation.',
  }
}

function checkAboutPage(crawledUrls: string[], crawledHtmlMap: Record<string, string>): EeatFinding {
  const aboutPatterns = [/\/about(?:[\/-]|$)/i, /\/who-we-are/i, /\/our-story/i, /\/company/i]
  const aboutUrl = crawledUrls.find(u => aboutPatterns.some(p => p.test(u)))

  let linkedAboutUrl: string | null = null
  if (!aboutUrl) {
    for (const [, html] of Object.entries(crawledHtmlMap)) {
      const $ = cheerio.load(html)
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (aboutPatterns.some(p => p.test(href))) {
          linkedAboutUrl = href
          return false
        }
      })
      if (linkedAboutUrl) break
    }
  }

  const found = aboutUrl || linkedAboutUrl
  return {
    signal: 'about_page',
    label: 'About page exists',
    passed: !!found,
    severity: 'warning',
    evidence: found || null,
    value: null,
    fixSuggestion: found
      ? null
      : 'Create an /about page describing your organisation, mission, history, and credentials. AI engines use About pages to establish entity identity and trustworthiness.',
  }
}

function checkContactInfo(homepageHtml: string, crawledHtmlMap: Record<string, string>): EeatFinding {
  const contactPatterns = {
    email: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
    phone: /(?:\+?[\d\s\-().]{7,15})/,
    contactPage: /\/contact(?:[\/-]|$)/i,
  }

  // Check all pages for contact signals
  const allHtml = [homepageHtml, ...Object.values(crawledHtmlMap)]
  const allUrls = Object.keys(crawledHtmlMap)

  const contactUrl = allUrls.find(u => contactPatterns.contactPage.test(u))

  let emailFound: string | null = null
  let phoneFound: string | null = null

  for (const html of allHtml) {
    const $ = cheerio.load(html)
    const text = $('footer, header, [class*="contact"], [id*="contact"]').text()
    const emailMatch = text.match(contactPatterns.email)
    const phoneMatch = text.match(contactPatterns.phone)
    if (emailMatch) emailFound = emailMatch[0]
    if (phoneMatch) phoneFound = phoneMatch[0].trim()
    if (emailFound || phoneFound) break
  }

  const passed = !!(contactUrl || emailFound || phoneFound)
  const evidence = [contactUrl, emailFound, phoneFound].filter(Boolean).join(' | ') || null

  return {
    signal: 'contact_info',
    label: 'Contact information present',
    passed,
    severity: 'warning',
    evidence,
    value: null,
    fixSuggestion: passed
      ? null
      : 'Add a /contact page and include an email address or phone number in your footer. Contact info is a basic trust signal that AI engines check for E-E-A-T.',
  }
}

function checkLastUpdated(crawledHtmlMap: Record<string, string>): EeatFinding {
  const datePatterns = [
    // meta tags
    /name="(?:article:modified_time|last-modified|date)"\s+content="([^"]+)"/i,
    /property="(?:article:modified_time|og:updated_time)"\s+content="([^"]+)"/i,
    // schema
    /"dateModified"\s*:\s*"([^"]+)"/,
    /"datePublished"\s*:\s*"([^"]+)"/,
    // visible text patterns
    /(?:updated?|modified|published|last\s+(?:updated?|modified))[:\s]+([A-Z][a-z]+ \d{1,2},?\s+\d{4})/i,
    /(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4})/,
  ]

  let foundDate: string | null = null
  let foundUrl: string | null = null
  let pagesWithDates = 0

  for (const [url, html] of Object.entries(crawledHtmlMap)) {
    for (const pattern of datePatterns) {
      const match = html.match(pattern)
      if (match) {
        pagesWithDates++
        if (!foundDate) {
          foundDate = match[1] || match[0]
          foundUrl = url
        }
        break
      }
    }
  }

  const total = Object.keys(crawledHtmlMap).length
  const passed = pagesWithDates > 0

  return {
    signal: 'last_updated',
    label: 'Last-updated timestamp on content pages',
    passed,
    severity: 'warning',
    evidence: foundUrl ? `Found on ${foundUrl}: ${foundDate}` : null,
    value: total > 0 ? `${pagesWithDates}/${total} pages have date signals` : null,
    fixSuggestion: passed
      ? null
      : 'Add datePublished and dateModified to your Article schema, and display "Last updated: [date]" visibly on content pages. Fresh timestamps significantly improve AI citation rates.',
  }
}

function checkPrivacyPolicy(crawledUrls: string[], homepageHtml: string): EeatFinding {
  const privacyPatterns = [/\/privacy(?:[\/-]|$)/i, /\/privacy-policy/i, /\/gdpr/i, /\/data-protection/i]
  const found = crawledUrls.find(u => privacyPatterns.some(p => p.test(u)))

  // Also check homepage footer links
  let linkedInFooter = false
  if (!found) {
    const $ = cheerio.load(homepageHtml)
    $('footer a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (privacyPatterns.some(p => p.test(href))) {
        linkedInFooter = true
        return false
      }
    })
  }

  const passed = !!(found || linkedInFooter)
  return {
    signal: 'privacy_policy',
    label: 'Privacy policy linked from footer',
    passed,
    severity: 'info',
    evidence: found || null,
    value: null,
    fixSuggestion: passed
      ? null
      : 'Create a /privacy-policy page and link to it from your footer. Required by law (GDPR, Privacy Act 2020 NZ) and a basic trust signal.',
  }
}

function checkTermsOfService(crawledUrls: string[], homepageHtml: string): EeatFinding {
  const tosPatterns = [/\/terms(?:[\/-]|$)/i, /\/terms-of-service/i, /\/terms-and-conditions/i, /\/tos/i, /\/legal/i]
  const found = crawledUrls.find(u => tosPatterns.some(p => p.test(u)))

  let linkedInFooter = false
  if (!found) {
    const $ = cheerio.load(homepageHtml)
    $('footer a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (tosPatterns.some(p => p.test(href))) {
        linkedInFooter = true
        return false
      }
    })
  }

  const passed = !!(found || linkedInFooter)
  return {
    signal: 'terms_of_service',
    label: 'Terms of service linked from footer',
    passed,
    severity: 'info',
    evidence: found || null,
    value: null,
    fixSuggestion: passed
      ? null
      : 'Create a /terms page and link to it from your footer. Together with a privacy policy, this signals a legitimate, accountable organisation.',
  }
}

function checkOutboundAuthorityLinks(crawledHtmlMap: Record<string, string>, domain: string): EeatFinding {
  const authorityLinks = new Set<string>()
  const MIN_AUTHORITY_LINKS = 3

  for (const [, html] of Object.entries(crawledHtmlMap)) {
    const $ = cheerio.load(html)
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (!href.startsWith('http')) return
      try {
        const url = new URL(href)
        const host = url.hostname.replace(/^www\./, '')
        // Skip internal links
        if (host === domain || host.endsWith('.' + domain)) return
        if (isAuthorityDomain(href)) {
          authorityLinks.add(host)
        }
      } catch { /* skip */ }
    })
  }

  const count = authorityLinks.size
  const passed = count >= MIN_AUTHORITY_LINKS
  const examples = Array.from(authorityLinks).slice(0, 5).join(', ')

  return {
    signal: 'outbound_authority_links',
    label: 'Outbound links to authority domains',
    passed,
    severity: 'info',
    evidence: count > 0 ? `Found: ${examples}` : null,
    value: `${count} authority domain${count !== 1 ? 's' : ''} linked`,
    fixSuggestion: passed
      ? null
      : `Add citations to authoritative sources (Wikipedia, government sites, academic papers, major publications). Currently linking to ${count} authority domain${count !== 1 ? 's' : ''} — aim for ${MIN_AUTHORITY_LINKS}+. AI engines use outbound authority links as a trust signal.`,
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS: Record<EeatSignalKey, number> = {
  author_schema:             2.0,  // #1 E-E-A-T signal for AI citation
  author_page:               1.8,  // establishes entity identity
  https:                     1.8,  // critical trust signal
  about_page:                1.4,  // entity identity
  contact_info:              1.2,  // legitimacy signal
  last_updated:              1.2,  // freshness = trustworthiness
  privacy_policy:            0.8,  // compliance baseline
  terms_of_service:          0.6,  // compliance baseline
  outbound_authority_links:  1.0,  // citation quality signal
}

export function calcEeatScore(findings: EeatFinding[]): number {
  let weightedPassed = 0
  let totalWeight = 0

  for (const f of findings) {
    const w = SIGNAL_WEIGHTS[f.signal] ?? 1.0
    totalWeight += w
    if (f.passed) weightedPassed += w
  }

  if (totalWeight === 0) return 0
  return Math.round((weightedPassed / totalWeight) * 100)
}

// ─── Main audit function ──────────────────────────────────────────────────────

export function auditEeat(input: EeatAuditInput): EeatAuditResult {
  const {
    domain,
    homepageUrl,
    homepageHtml,
    crawledUrls,
    crawledHtmlMap,
  } = input

  const findings: EeatFinding[] = [
    checkHttps(domain, homepageUrl),
    checkAuthorPage(crawledUrls, crawledHtmlMap),
    checkAuthorSchema(crawledHtmlMap),
    checkAboutPage(crawledUrls, crawledHtmlMap),
    checkContactInfo(homepageHtml, crawledHtmlMap),
    checkLastUpdated(crawledHtmlMap),
    checkPrivacyPolicy(crawledUrls, homepageHtml),
    checkTermsOfService(crawledUrls, homepageHtml),
    checkOutboundAuthorityLinks(crawledHtmlMap, domain),
  ]

  const score = calcEeatScore(findings)
  return { findings, score }
}
