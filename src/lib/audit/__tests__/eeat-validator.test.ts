import { describe, it, expect } from 'vitest'
import { auditEeat, calcEeatScore, type EeatAuditInput } from '../eeat-validator'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<EeatAuditInput> = {}): EeatAuditInput {
  return {
    domain: 'example.com',
    homepageUrl: 'https://example.com',
    homepageHtml: '<html><body><footer><a href="/privacy-policy">Privacy</a><a href="/terms">Terms</a></footer></body></html>',
    crawledUrls: ['https://example.com', 'https://example.com/about', 'https://example.com/contact'],
    crawledHtmlMap: {
      'https://example.com': '<html><body><footer><a href="/privacy-policy">Privacy</a><a href="/terms">Terms</a></footer></body></html>',
      'https://example.com/about': '<html><body><h1>About Us</h1></body></html>',
      'https://example.com/contact': '<html><body><p>Email: hello@example.com</p></body></html>',
    },
    ...overrides,
  }
}

// ─── HTTPS ────────────────────────────────────────────────────────────────────

describe('HTTPS signal', () => {
  it('passes for https:// URL', () => {
    const result = auditEeat(makeInput({ homepageUrl: 'https://example.com' }))
    const f = result.findings.find(f => f.signal === 'https')!
    expect(f.passed).toBe(true)
    expect(f.severity).toBe('critical')
  })

  it('fails for http:// URL', () => {
    const result = auditEeat(makeInput({ homepageUrl: 'http://example.com' }))
    const f = result.findings.find(f => f.signal === 'https')!
    expect(f.passed).toBe(false)
    expect(f.fixSuggestion).toBeTruthy()
  })
})

// ─── Author page ─────────────────────────────────────────────────────────────

describe('Author page signal', () => {
  it('passes when /author/ URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/author/jane'],
    }))
    const f = result.findings.find(f => f.signal === 'author_page')!
    expect(f.passed).toBe(true)
    expect(f.evidence).toContain('author')
  })

  it('passes when /team/ URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/about/team'],
    }))
    const f = result.findings.find(f => f.signal === 'author_page')!
    expect(f.passed).toBe(true)
  })

  it('fails when no author/team URLs found', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/products'],
      crawledHtmlMap: { 'https://example.com': '<html><body></body></html>' },
    }))
    const f = result.findings.find(f => f.signal === 'author_page')!
    expect(f.passed).toBe(false)
    expect(f.fixSuggestion).toBeTruthy()
  })
})

// ─── Author schema ────────────────────────────────────────────────────────────

describe('Author schema signal', () => {
  it('passes when Person schema is present', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Person","name":"Jane Smith","url":"https://example.com/author/jane"}
    </script></head></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com/author/jane': html },
    }))
    const f = result.findings.find(f => f.signal === 'author_schema')!
    expect(f.passed).toBe(true)
    expect(f.evidence).toContain('Jane Smith')
  })

  it('passes when Article has nested author Person', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Article","headline":"Test","author":{"@type":"Person","name":"Bob Jones"}}
    </script></head></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com/blog/post': html },
    }))
    const f = result.findings.find(f => f.signal === 'author_schema')!
    expect(f.passed).toBe(true)
  })

  it('fails when no Person schema anywhere', () => {
    const result = auditEeat(makeInput({
      crawledHtmlMap: {
        'https://example.com': '<html><body><p>No schema here</p></body></html>',
      },
    }))
    const f = result.findings.find(f => f.signal === 'author_schema')!
    expect(f.passed).toBe(false)
    expect(f.fixSuggestion).toContain('Person schema')
  })
})

// ─── About page ───────────────────────────────────────────────────────────────

describe('About page signal', () => {
  it('passes when /about URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/about'],
    }))
    const f = result.findings.find(f => f.signal === 'about_page')!
    expect(f.passed).toBe(true)
  })

  it('passes when /company URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/company'],
    }))
    const f = result.findings.find(f => f.signal === 'about_page')!
    expect(f.passed).toBe(true)
  })

  it('fails when no about-type page found', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/products'],
      crawledHtmlMap: { 'https://example.com': '<html><body></body></html>' },
    }))
    const f = result.findings.find(f => f.signal === 'about_page')!
    expect(f.passed).toBe(false)
  })
})

// ─── Contact info ─────────────────────────────────────────────────────────────

describe('Contact info signal', () => {
  it('passes when email in footer', () => {
    const html = '<html><body><footer>Email: hello@example.com</footer></body></html>'
    const result = auditEeat(makeInput({
      homepageHtml: html,
      crawledHtmlMap: { 'https://example.com': html },
    }))
    const f = result.findings.find(f => f.signal === 'contact_info')!
    expect(f.passed).toBe(true)
    expect(f.evidence).toContain('hello@example.com')
  })

  it('passes when /contact URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/contact'],
    }))
    const f = result.findings.find(f => f.signal === 'contact_info')!
    expect(f.passed).toBe(true)
  })

  it('fails when no contact info found', () => {
    const result = auditEeat(makeInput({
      homepageHtml: '<html><body><footer></footer></body></html>',
      crawledUrls: ['https://example.com'],
      crawledHtmlMap: { 'https://example.com': '<html><body></body></html>' },
    }))
    const f = result.findings.find(f => f.signal === 'contact_info')!
    expect(f.passed).toBe(false)
  })
})

// ─── Last updated ─────────────────────────────────────────────────────────────

describe('Last updated signal', () => {
  it('passes when dateModified in JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Article","dateModified":"2025-01-15"}
    </script></head></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com/blog': html },
    }))
    const f = result.findings.find(f => f.signal === 'last_updated')!
    expect(f.passed).toBe(true)
  })

  it('passes when og:updated_time meta tag present', () => {
    const html = `<html><head><meta property="og:updated_time" content="2025-03-01T10:00:00Z"/></head></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com/post': html },
    }))
    const f = result.findings.find(f => f.signal === 'last_updated')!
    expect(f.passed).toBe(true)
  })

  it('fails when no date signals anywhere', () => {
    const result = auditEeat(makeInput({
      crawledHtmlMap: {
        'https://example.com': '<html><body><p>No dates here</p></body></html>',
      },
    }))
    const f = result.findings.find(f => f.signal === 'last_updated')!
    expect(f.passed).toBe(false)
  })
})

// ─── Privacy policy ───────────────────────────────────────────────────────────

describe('Privacy policy signal', () => {
  it('passes when /privacy-policy URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/privacy-policy'],
    }))
    const f = result.findings.find(f => f.signal === 'privacy_policy')!
    expect(f.passed).toBe(true)
  })

  it('passes when privacy linked in footer', () => {
    const html = '<html><body><footer><a href="/privacy">Privacy Policy</a></footer></body></html>'
    const result = auditEeat(makeInput({
      homepageHtml: html,
      crawledUrls: ['https://example.com'],
    }))
    const f = result.findings.find(f => f.signal === 'privacy_policy')!
    expect(f.passed).toBe(true)
  })

  it('fails when no privacy page found', () => {
    const result = auditEeat(makeInput({
      homepageHtml: '<html><body><footer></footer></body></html>',
      crawledUrls: ['https://example.com'],
    }))
    const f = result.findings.find(f => f.signal === 'privacy_policy')!
    expect(f.passed).toBe(false)
  })
})

// ─── Terms of service ─────────────────────────────────────────────────────────

describe('Terms of service signal', () => {
  it('passes when /terms URL is crawled', () => {
    const result = auditEeat(makeInput({
      crawledUrls: ['https://example.com', 'https://example.com/terms'],
    }))
    const f = result.findings.find(f => f.signal === 'terms_of_service')!
    expect(f.passed).toBe(true)
  })

  it('fails when no terms page found', () => {
    const result = auditEeat(makeInput({
      homepageHtml: '<html><body><footer></footer></body></html>',
      crawledUrls: ['https://example.com'],
    }))
    const f = result.findings.find(f => f.signal === 'terms_of_service')!
    expect(f.passed).toBe(false)
  })
})

// ─── Outbound authority links ─────────────────────────────────────────────────

describe('Outbound authority links signal', () => {
  it('passes when 3+ authority domains linked', () => {
    const html = `<html><body>
      <a href="https://wikipedia.org/wiki/SEO">Wikipedia</a>
      <a href="https://gov.nz/policy">NZ Govt</a>
      <a href="https://reuters.com/article/1">Reuters</a>
    </body></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com': html },
    }))
    const f = result.findings.find(f => f.signal === 'outbound_authority_links')!
    expect(f.passed).toBe(true)
    expect(f.value).toContain('3')
  })

  it('fails when fewer than 3 authority domains', () => {
    const html = `<html><body>
      <a href="https://wikipedia.org/wiki/SEO">Wikipedia</a>
    </body></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com': html },
    }))
    const f = result.findings.find(f => f.signal === 'outbound_authority_links')!
    expect(f.passed).toBe(false)
  })

  it('does not count internal links as authority', () => {
    const html = `<html><body>
      <a href="https://example.com/about">Internal</a>
      <a href="https://example.com/contact">Also Internal</a>
    </body></html>`
    const result = auditEeat(makeInput({
      crawledHtmlMap: { 'https://example.com': html },
    }))
    const f = result.findings.find(f => f.signal === 'outbound_authority_links')!
    expect(f.passed).toBe(false)
    expect(f.value).toContain('0')
  })
})

// ─── Score calculation ────────────────────────────────────────────────────────

describe('calcEeatScore', () => {
  it('returns 100 when all signals pass', () => {
    const findings = [
      { signal: 'https' as const, passed: true, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
      { signal: 'author_schema' as const, passed: true, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
      { signal: 'author_page' as const, passed: true, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
    ]
    expect(calcEeatScore(findings)).toBe(100)
  })

  it('returns 0 when all signals fail', () => {
    const findings = [
      { signal: 'https' as const, passed: false, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
      { signal: 'author_schema' as const, passed: false, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
    ]
    expect(calcEeatScore(findings)).toBe(0)
  })

  it('weights high-impact signals more', () => {
    // author_schema (2.0) passes, terms_of_service (0.6) fails
    const findings = [
      { signal: 'author_schema' as const, passed: true, severity: 'critical' as const, label: '', evidence: null, value: null, fixSuggestion: null },
      { signal: 'terms_of_service' as const, passed: false, severity: 'info' as const, label: '', evidence: null, value: null, fixSuggestion: null },
    ]
    const score = calcEeatScore(findings)
    // 2.0 / (2.0 + 0.6) = 76.9 → 77
    expect(score).toBe(77)
  })

  it('returns 0 for empty findings', () => {
    expect(calcEeatScore([])).toBe(0)
  })
})
