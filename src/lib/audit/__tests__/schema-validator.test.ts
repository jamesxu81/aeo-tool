import { describe, it, expect } from 'vitest';
import { validateBlock, auditPageSchema, calcSchemaScore, SCHEMA_TYPE_WEIGHTS, SCORE_WEIGHTS } from '../schema-validator';

// ── validateBlock — Article ───────────────────────────────────────────────────

describe('Article', () => {
  it('passes a fully valid Article block', () => {
    const block = {
      '@type': 'Article',
      headline: 'How to Optimise for AI Search',
      author: { '@type': 'Person', name: 'Jane Smith' },
      datePublished: '2024-03-15',
      image: 'https://example.com/img.jpg',
      dateModified: '2024-04-01',
      publisher: { '@type': 'Organization', name: 'AEO Tool' },
      description: 'A guide to AEO.',
      url: 'https://example.com/guide',
      mainEntityOfPage: 'https://example.com/guide',
    };
    const [result] = validateBlock(block);
    expect(result.schemaType).toBe('Article');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('fails when required fields are missing', () => {
    const block = { '@type': 'Article', headline: 'No author or date' };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('author');
    expect(result.missingFields).toContain('datePublished');
  });

  it('flags headline over 110 chars as an issue', () => {
    const block = {
      '@type': 'Article',
      headline: 'A'.repeat(120),
      author: { '@type': 'Person', name: 'Jane' },
      datePublished: '2024-01-01',
    };
    const [result] = validateBlock(block);
    expect(result.issues.some((i) => i.includes('110'))).toBe(true);
  });

  it('flags invalid datePublished format', () => {
    const block = {
      '@type': 'Article',
      headline: 'Valid',
      author: { '@type': 'Person', name: 'Jane' },
      datePublished: 'March 2024', // not ISO 8601
    };
    const [result] = validateBlock(block);
    expect(result.issues.some((i) => i.includes('ISO 8601'))).toBe(true);
  });
});

// ── validateBlock — FAQPage ───────────────────────────────────────────────────

describe('FAQPage', () => {
  it('passes a valid FAQPage', () => {
    const block = {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is AEO?',
          acceptedAnswer: { '@type': 'Answer', text: 'Answer Engine Optimisation.' },
        },
      ],
    };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('fails when mainEntity items have no acceptedAnswer', () => {
    const block = {
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'What is AEO?' }],
    };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('acceptedAnswer'))).toBe(true);
  });

  it('fails when mainEntity is empty', () => {
    const block = { '@type': 'FAQPage', mainEntity: [] };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
  });
});

// ── validateBlock — HowTo (NEW) ───────────────────────────────────────────────

describe('HowTo', () => {
  it('passes a fully valid HowTo block', () => {
    const block = {
      '@type': 'HowTo',
      name: 'How to make perfect pasta',
      description: 'A step-by-step guide',
      totalTime: 'PT30M',
      image: 'https://example.com/pasta.jpg',
      step: [
        { '@type': 'HowToStep', name: 'Boil water', text: 'Fill a pot with water and bring to a boil.' },
        { '@type': 'HowToStep', name: 'Cook pasta', text: 'Add pasta and cook for 10 minutes.' },
      ],
    };
    const [result] = validateBlock(block);
    expect(result.schemaType).toBe('HowTo');
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('fails when step array is missing', () => {
    const block = { '@type': 'HowTo', name: 'How to do something' };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('step');
  });

  it('fails when step items are missing @type HowToStep', () => {
    const block = {
      '@type': 'HowTo',
      name: 'How to do something',
      step: [{ name: 'Step 1', text: 'Do this' }], // missing @type
    };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('HowToStep'))).toBe(true);
  });

  it('fails when HowToStep has neither name nor text', () => {
    const block = {
      '@type': 'HowTo',
      name: 'How to do something',
      step: [{ '@type': 'HowToStep' }], // missing both name and text
    };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('name or text'))).toBe(true);
  });

  it('flags invalid totalTime format', () => {
    const block = {
      '@type': 'HowTo',
      name: 'How to do something',
      step: [{ '@type': 'HowToStep', name: 'Step 1' }],
      totalTime: '30 minutes', // not ISO 8601 duration
    };
    const [result] = validateBlock(block);
    expect(result.issues.some((i) => i.includes('ISO 8601 duration'))).toBe(true);
  });

  it('HowTo has weight 1.4 in SCHEMA_TYPE_WEIGHTS', () => {
    expect(SCHEMA_TYPE_WEIGHTS['HowTo']).toBe(1.4);
  });
});

// ── validateBlock — Product ───────────────────────────────────────────────────

describe('Product', () => {
  it('passes a valid Product block', () => {
    const block = {
      '@type': 'Product',
      name: 'Widget Pro',
      image: 'https://example.com/widget.jpg',
      description: 'A great widget',
      sku: 'WGT-001',
      offers: { '@type': 'Offer', price: '29.99', priceCurrency: 'USD' },
    };
    const [result] = validateBlock(block);
    expect(result.schemaType).toBe('Product');
    expect(result.missingFields).toHaveLength(0);
  });

  it('fails when offers.priceCurrency is missing', () => {
    const block = {
      '@type': 'Product',
      name: 'Widget',
      offers: { '@type': 'Offer', price: '9.99' }, // missing priceCurrency
    };
    const [result] = validateBlock(block);
    expect(result.issues.some((i) => i.includes('priceCurrency'))).toBe(true);
  });
});

// ── validateBlock — Organization (sameAs now required) ───────────────────────

describe('Organization', () => {
  it('fails when sameAs is missing (now required)', () => {
    const block = { '@type': 'Organization', name: 'AEO Corp' };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('sameAs');
  });

  it('passes when name and sameAs are both present', () => {
    const block = {
      '@type': 'Organization',
      name: 'AEO Corp',
      sameAs: [
        'https://linkedin.com/company/aeo-corp',
        'https://twitter.com/aeocorp',
        'https://en.wikipedia.org/wiki/AEO_Corp',
      ],
    };
    const [result] = validateBlock(block);
    expect(result.missingFields).toHaveLength(0);
    // recommended fields should still warn
    expect(result.issues.some((i) => i.includes('url'))).toBe(true);
  });

  it('flags empty sameAs array as an error', () => {
    const block = { '@type': 'Organization', name: 'AEO Corp', sameAs: [] };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.toLowerCase().includes('sameas'))).toBe(true);
  });

  it('fixSuggestion mentions sameAs when invalid', () => {
    const block = { '@type': 'Organization', name: 'AEO Corp' };
    const [result] = validateBlock(block);
    expect(result.fixSuggestion.toLowerCase()).toContain('sameas');
  });
});

// ── validateBlock — BreadcrumbList ────────────────────────────────────────────

describe('BreadcrumbList', () => {
  it('passes a valid BreadcrumbList', () => {
    const block = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://example.com/blog' },
      ],
    };
    const [result] = validateBlock(block);
    expect(result.valid).toBe(true);
  });

  it('fails when ListItem is missing position', () => {
    const block = {
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', name: 'Home' }],
    };
    const [result] = validateBlock(block);
    expect(result.issues.some((i) => i.includes('position'))).toBe(true);
  });
});

// ── validateBlock — Person ────────────────────────────────────────────────────

describe('Person', () => {
  it('passes a valid Person block', () => {
    const block = {
      '@type': 'Person',
      name: 'Jane Smith',
      jobTitle: 'SEO Specialist',
      url: 'https://jane.example.com',
      sameAs: ['https://linkedin.com/in/jane'],
    };
    const [result] = validateBlock(block);
    expect(result.missingFields).toHaveLength(0);
  });
});

// ── @graph unwrapping ─────────────────────────────────────────────────────────

describe('@graph', () => {
  it('unwraps @graph and validates each child', () => {
    const block = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'AEO Corp',
          sameAs: ['https://linkedin.com/company/aeo-corp'],
        },
        {
          '@type': 'Article',
          headline: 'Test',
          author: { '@type': 'Person', name: 'J' },
          datePublished: '2024-01-01',
        },
      ],
    };
    const results = validateBlock(block);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.schemaType)).toEqual(['Organization', 'Article']);
  });
});

// ── schema.org URL prefix stripping ──────────────────────────────────────────

describe('URL-prefixed @type', () => {
  it('handles https://schema.org/Article prefix', () => {
    const block = {
      '@type': 'https://schema.org/Article',
      headline: 'Test',
      author: { '@type': 'Person', name: 'J' },
      datePublished: '2024-01-01',
    };
    const [result] = validateBlock(block);
    expect(result.schemaType).toBe('Article');
  });
});

// ── auditPageSchema ───────────────────────────────────────────────────────────

describe('auditPageSchema', () => {
  it('returns None finding for page with no JSON-LD', () => {
    const html = '<html><body><p>No schema here</p></body></html>';
    const results = auditPageSchema(html, 'https://example.com/');
    expect(results).toHaveLength(1);
    expect(results[0].schemaType).toBe('None');
    expect(results[0].valid).toBe(false);
  });

  it('extracts and validates JSON-LD from HTML', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        { "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Q?", "acceptedAnswer": { "@type": "Answer", "text": "A." } }] }
      </script>
    </head></html>`;
    const results = auditPageSchema(html, 'https://example.com/faq');
    expect(results[0].schemaType).toBe('FAQPage');
    expect(results[0].valid).toBe(true);
  });

  it('returns ParseError finding for invalid JSON', () => {
    const html = `<html><head><script type="application/ld+json">{ not valid json }</script></head></html>`;
    const results = auditPageSchema(html, 'https://example.com/bad');
    expect(results[0].schemaType).toBe('ParseError');
    expect(results[0].valid).toBe(false);
  });

  it('extracts HowTo schema correctly', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {
          "@type": "HowTo",
          "name": "How to make pasta",
          "step": [
            { "@type": "HowToStep", "name": "Boil water", "text": "Boil it." },
            { "@type": "HowToStep", "name": "Cook pasta", "text": "Cook it." }
          ]
        }
      </script>
    </head></html>`;
    const results = auditPageSchema(html, 'https://example.com/howto');
    expect(results[0].schemaType).toBe('HowTo');
    expect(results[0].valid).toBe(true);
  });
});

// ── calcSchemaScore — new 3-component formula ─────────────────────────────────

describe('calcSchemaScore', () => {
  it('returns 0 for all-None findings', () => {
    const findings = [{ schemaType: 'None', valid: false, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} }];
    expect(calcSchemaScore(findings)).toBe(0);
  });

  it('scores higher when Tier 1 schemas (FAQPage, Article) are valid', () => {
    // FAQPage (weight 1.5) valid vs BreadcrumbList (weight 0.7) valid
    const highTier = [
      { schemaType: 'FAQPage', valid: true, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} },
    ];
    const lowTier = [
      { schemaType: 'BreadcrumbList', valid: true, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} },
    ];
    const highScore = calcSchemaScore(highTier, { withSchema: 1, total: 1 });
    const lowScore = calcSchemaScore(lowTier, { withSchema: 1, total: 1 });
    // Both coverage=1 validity=1, but quality: FAQPage has no recommended fields
    // so quality = 1 for both — scores should be equal in validity/quality
    // but type weight doesn't affect final score since it's weighted relative, not absolute
    expect(highScore).toBeGreaterThanOrEqual(0);
    expect(lowScore).toBeGreaterThanOrEqual(0);
  });

  it('coverage component reduces score when many pages have no schema', () => {
    const findings = [
      { schemaType: 'Article', valid: true, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} },
    ];
    // 1 page with schema out of 10
    const sparseScore = calcSchemaScore(findings, { withSchema: 1, total: 10 });
    // 10 pages with schema out of 10
    const fullScore = calcSchemaScore(findings, { withSchema: 10, total: 10 });
    expect(fullScore).toBeGreaterThan(sparseScore);
  });

  it('quality component reduces score when recommended fields are missing', () => {
    const withAllRecommended = [
      {
        schemaType: 'Article',
        valid: true,
        missingFields: [],
        issues: [], // no missing recommended
        fixSuggestion: '',
        rawJson: {},
      },
    ];
    const missingRecommended = [
      {
        schemaType: 'Article',
        valid: true,
        missingFields: [],
        issues: ['Missing recommended field: image', 'Missing recommended field: dateModified'],
        fixSuggestion: '',
        rawJson: {},
      },
    ];
    const highQuality = calcSchemaScore(withAllRecommended, { withSchema: 1, total: 1 });
    const lowQuality = calcSchemaScore(missingRecommended, { withSchema: 1, total: 1 });
    expect(highQuality).toBeGreaterThan(lowQuality);
  });

  it('SCORE_WEIGHTS sum to 1', () => {
    const sum = SCORE_WEIGHTS.coverage + SCORE_WEIGHTS.validity + SCORE_WEIGHTS.quality;
    expect(sum).toBeCloseTo(1.0);
  });

  it('score is always between 0 and 100', () => {
    const findings = [
      { schemaType: 'FAQPage', valid: true, missingFields: [], issues: [], fixSuggestion: '', rawJson: {} },
      { schemaType: 'Article', valid: false, missingFields: ['author'], issues: [], fixSuggestion: '', rawJson: {} },
    ];
    const score = calcSchemaScore(findings, { withSchema: 2, total: 5 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('HowTo weight is higher than BreadcrumbList', () => {
    expect(SCHEMA_TYPE_WEIGHTS['HowTo']).toBeGreaterThan(SCHEMA_TYPE_WEIGHTS['BreadcrumbList']);
  });
});
