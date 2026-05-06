/**
 * schema-validator.ts
 * -------------------
 * Validates JSON-LD structured data blocks against schema.org rules.
 *
 * Supported types: Article, FAQPage, HowTo, Product, Organization,
 *                  BreadcrumbList, Person
 *
 * For each block we check:
 *  1. Required fields are present and non-empty
 *  2. Recommended fields (AEO-relevant) are present
 *  3. Field-level value rules (e.g. datePublished is a valid ISO date)
 *
 * Output: SchemaFindingResult[] — one per JSON-LD block found on the page.
 * If NO JSON-LD at all, we return a single finding with type='None' as an
 * opportunity flag so the UI can show "Add schema markup".
 *
 * Score formula (0–100):
 *   score = (coverage × 0.4) + (validity × 0.4) + (quality × 0.2)
 *
 *   coverage = % of pages with at least one real schema block
 *   validity = weighted % of found schemas with no required-field errors
 *   quality  = weighted % of found schemas with all recommended fields
 *
 *   Each schema type has a weight in SCHEMA_TYPE_WEIGHTS (1.0 = baseline).
 *   Tier 1 types (FAQPage, Article, HowTo) count 1.5× toward the score.
 */

export interface SchemaFindingResult {
  schemaType: string;
  valid: boolean;
  missingFields: string[];
  issues: string[];
  fixSuggestion: string;
  rawJson: Record<string, unknown>;
}

// ── AEO Impact Weights ────────────────────────────────────────────────────────
// Adjust these to tune how much each schema type contributes to the score.
// 1.5 = Tier 1 (highest AEO impact), 1.0 = standard, 0.7 = low direct impact.

export const SCHEMA_TYPE_WEIGHTS: Record<string, number> = {
  FAQPage: 1.5,        // AI Overviews quote FAQ verbatim — highest impact
  Article: 1.5,        // Primary citation signal: author + date = trust
  HowTo: 1.4,          // Step-by-step content is the #2 most-cited AI format
  Product: 1.3,        // Critical for ecommerce AEO (offers, ratings)
  Person: 1.2,         // E-E-A-T authorship signal
  Organization: 1.2,   // Entity identity + sameAs → Wikidata resolution
  BreadcrumbList: 0.7, // Structural signal, rarely cited directly
  LocalBusiness: 1.0,  // Context-dependent
};

// ── Score weights (must sum to 1) ─────────────────────────────────────────────
export const SCORE_WEIGHTS = {
  coverage: 0.4,  // % of pages that have at least one real schema
  validity: 0.4,  // % of schemas with no required-field errors (type-weighted)
  quality: 0.2,   // % of schemas with all recommended fields present (type-weighted)
} as const;

// ── Rule definitions ──────────────────────────────────────────────────────────

interface TypeRule {
  required: string[];
  recommended: string[];
  validators?: Record<string, (val: unknown) => string | null>;
  fixSuggestion: string;
}

const RULES: Record<string, TypeRule> = {
  Article: {
    required: ['headline', 'author', 'datePublished'],
    recommended: ['image', 'dateModified', 'publisher', 'description', 'url', 'mainEntityOfPage'],
    validators: {
      headline: (v) =>
        typeof v === 'string' && v.length > 0
          ? null
          : 'headline must be a non-empty string',
      headline_length: (v) =>
        typeof v === 'string' && v.length > 110
          ? `headline is ${(v as string).length} chars — Google recommends ≤110`
          : null,
      datePublished: (v) =>
        typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
          ? null
          : 'datePublished must be ISO 8601 (e.g. 2024-01-15)',
      author: (v) => {
        if (!v) return 'author is required';
        const a = v as Record<string, unknown>;
        if (typeof a === 'object' && !Array.isArray(a)) {
          if (!a['@type']) return 'author should have @type (Person or Organization)';
          if (!a.name) return 'author.name is required';
        }
        return null;
      },
    },
    fixSuggestion:
      'Add Article schema with headline, author (with @type Person/Organization + name), and datePublished in ISO 8601 format.',
  },

  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
    validators: {
      mainEntity: (v) => {
        if (!Array.isArray(v) || v.length === 0)
          return 'mainEntity must be a non-empty array of Question objects';
        for (const q of v as Record<string, unknown>[]) {
          if (q['@type'] !== 'Question') return 'Each mainEntity item must have @type: "Question"';
          if (!q.name) return 'Each Question must have a name (the question text)';
          const ans = q.acceptedAnswer as Record<string, unknown> | undefined;
          if (!ans) return 'Each Question must have an acceptedAnswer';
          if (ans['@type'] !== 'Answer') return 'acceptedAnswer must have @type: "Answer"';
          if (!ans.text) return 'acceptedAnswer.text is required';
        }
        return null;
      },
    },
    fixSuggestion:
      'Add FAQPage schema with mainEntity array. Each item: { "@type": "Question", "name": "Q?", "acceptedAnswer": { "@type": "Answer", "text": "A." } }',
  },

  HowTo: {
    required: ['name', 'step'],
    recommended: ['description', 'image', 'totalTime', 'estimatedCost', 'supply', 'tool'],
    validators: {
      name: (v) =>
        typeof v === 'string' && v.length > 0 ? null : 'name must be a non-empty string',
      step: (v) => {
        if (!Array.isArray(v) || v.length === 0)
          return 'step must be a non-empty array of HowToStep objects';
        for (const s of v as Record<string, unknown>[]) {
          if (!s['@type'] || s['@type'] !== 'HowToStep')
            return 'Each step must have @type: "HowToStep"';
          if (!s.name && !s.text)
            return 'Each HowToStep must have either name or text describing the step';
        }
        return null;
      },
      totalTime: (v) => {
        if (!v) return null; // recommended, skip if absent
        if (typeof v !== 'string' || !/^PT/.test(v as string))
          return 'totalTime should be in ISO 8601 duration format (e.g. "PT30M", "PT1H30M")';
        return null;
      },
    },
    fixSuggestion:
      'Add HowTo schema with name, and step array where each step has @type "HowToStep" and a name/text. Include totalTime (e.g. "PT30M") and image for maximum AEO impact.',
  },

  Product: {
    required: ['name'],
    recommended: ['image', 'description', 'sku', 'brand', 'offers', 'aggregateRating'],
    validators: {
      name: (v) =>
        typeof v === 'string' && v.length > 0 ? null : 'name must be a non-empty string',
      offers: (v) => {
        if (!v) return null; // recommended, not required — just warn if present but malformed
        const o = (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
        if (!o['@type']) return 'offers should have @type: "Offer"';
        if (!o.price && o.price !== 0) return 'offers.price is strongly recommended';
        if (!o.priceCurrency) return 'offers.priceCurrency is required (e.g. "USD")';
        return null;
      },
    },
    fixSuggestion:
      'Add Product schema with name, image, description, and offers block containing price, priceCurrency, and availability. Add aggregateRating for maximum AEO visibility.',
  },

  Organization: {
    // sameAs is REQUIRED — it links your entity to Wikidata/Wikipedia for AI resolution
    required: ['name', 'sameAs'],
    recommended: ['url', 'logo', 'contactPoint', 'address', 'foundingDate', 'numberOfEmployees'],
    validators: {
      name: (v) =>
        typeof v === 'string' && v.length > 0 ? null : 'name must be a non-empty string',
      sameAs: (v) => {
        if (!v || (Array.isArray(v) && (v as unknown[]).length === 0))
          return 'sameAs is required — add URLs to your LinkedIn, Twitter/X, Wikipedia, Wikidata, and Crunchbase profiles. This is how AI engines resolve your brand entity.';
        return null;
      },
      logo: (v) => {
        if (!v) return null;
        const l = v as Record<string, unknown>;
        if (typeof l === 'object' && l['@type'] !== 'ImageObject')
          return 'logo should use @type: "ImageObject" with a url property';
        return null;
      },
    },
    fixSuggestion:
      'Add Organization schema with name, sameAs (array of profile URLs: LinkedIn, Twitter/X, Wikipedia, Wikidata, Crunchbase), url, and logo (ImageObject). sameAs is critical for AI entity resolution.',
  },

  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
    validators: {
      itemListElement: (v) => {
        if (!Array.isArray(v) || v.length === 0)
          return 'itemListElement must be a non-empty array';
        for (const item of v as Record<string, unknown>[]) {
          if (item['@type'] !== 'ListItem') return 'Each item must have @type: "ListItem"';
          if (item.position === undefined) return 'Each ListItem needs a position (1, 2, 3…)';
          if (!item.name && !item.item) return 'Each ListItem needs name or item.name';
        }
        return null;
      },
    },
    fixSuggestion:
      'Add BreadcrumbList with itemListElement array. Each: { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://…" }',
  },

  Person: {
    required: ['name'],
    recommended: ['url', 'image', 'jobTitle', 'sameAs', 'knowsAbout', 'worksFor'],
    validators: {
      name: (v) =>
        typeof v === 'string' && v.length > 0 ? null : 'name must be a non-empty string',
      sameAs: (v) => {
        if (!v) return null; // recommended on Person (not required like Organization)
        if (!Array.isArray(v) || (v as unknown[]).length === 0)
          return 'sameAs should be an array of profile URLs (LinkedIn, Twitter/X, etc.)';
        return null;
      },
    },
    fixSuggestion:
      'Add Person schema with name, jobTitle, image, url, and sameAs links to LinkedIn/Twitter for strong E-E-A-T signals. Add worksFor (Organization) and knowsAbout for topic authority.',
  },
};

const SUPPORTED_TYPES = new Set(Object.keys(RULES));

// ── Core validator ────────────────────────────────────────────────────────────

/**
 * Validate a single parsed JSON-LD object.
 * Handles @graph unwrapping and @type arrays.
 */
export function validateBlock(block: Record<string, unknown>): SchemaFindingResult[] {
  // Unwrap @graph
  if (Array.isArray(block['@graph'])) {
    return (block['@graph'] as Record<string, unknown>[]).flatMap(validateBlock);
  }

  const rawType = block['@type'];
  const types: string[] = Array.isArray(rawType)
    ? rawType.map(String)
    : typeof rawType === 'string'
    ? [rawType]
    : [];

  // Strip URL prefix e.g. "https://schema.org/Article" → "Article"
  const normalised = types.map((t) => t.replace(/^https?:\/\/schema\.org\//, ''));
  const supportedType = normalised.find((t) => SUPPORTED_TYPES.has(t));

  if (!supportedType) {
    // Unknown / unsupported type — return info only, not a failure
    return [
      {
        schemaType: normalised[0] ?? 'Unknown',
        valid: true,
        missingFields: [],
        issues: [],
        fixSuggestion: '',
        rawJson: block,
      },
    ];
  }

  const rule = RULES[supportedType];
  const missingFields: string[] = [];
  const issues: string[] = [];

  // Check required fields
  for (const field of rule.required) {
    const val = block[field];
    if (val === undefined || val === null || val === '') {
      missingFields.push(field);
    }
  }

  // Check recommended fields (warn, not fail)
  for (const field of rule.recommended) {
    if (block[field] === undefined || block[field] === null) {
      issues.push(`Missing recommended field: ${field}`);
    }
  }

  // Run field-level validators
  if (rule.validators) {
    for (const [key, fn] of Object.entries(rule.validators)) {
      // Strip _suffix from synthetic validator keys like "headline_length"
      const realKey = key.includes('_') && !block[key] ? key.split('_')[0] : key;
      const error = fn(block[realKey]);
      if (error) issues.push(error);
    }
  }

  const valid = missingFields.length === 0 && !issues.some((i) => !i.startsWith('Missing recommended'));

  return [
    {
      schemaType: supportedType,
      valid,
      missingFields,
      issues,
      fixSuggestion: valid ? '' : rule.fixSuggestion,
      rawJson: block,
    },
  ];
}

/**
 * Parse all <script type="application/ld+json"> blocks from raw HTML
 * and validate each one.
 *
 * If no JSON-LD found, returns a single "opportunity" finding.
 */
export function auditPageSchema(html: string, url: string): SchemaFindingResult[] {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const findings: SchemaFindingResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown> | Record<string, unknown>[];
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      for (const block of blocks) {
        findings.push(...validateBlock(block));
      }
    } catch {
      findings.push({
        schemaType: 'ParseError',
        valid: false,
        missingFields: [],
        issues: [`JSON-LD parse error on ${url}: ${raw.slice(0, 80)}…`],
        fixSuggestion: 'Fix JSON syntax in <script type="application/ld+json"> block.',
        rawJson: { raw },
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      schemaType: 'None',
      valid: false,
      missingFields: [],
      issues: ['No JSON-LD structured data found on this page'],
      fixSuggestion:
        'Add at least one JSON-LD block. For blog posts use Article, for product pages use Product, for the homepage use Organization + sameAs.',
      rawJson: {},
    });
  }

  return findings;
}

/**
 * Summarise findings for an entire audit into a 0–100 score.
 *
 * Formula: (coverage × 0.4) + (validity × 0.4) + (quality × 0.2)
 *
 * - coverage: % of pages that have ≥1 real schema block
 * - validity: type-weighted % of schemas with no required-field errors
 * - quality:  type-weighted % of schemas with all recommended fields present
 *
 * @param findings   Flat array of all SchemaFindingResult across all pages
 * @param pageCount  Optional — { withSchema, total } page counts for coverage.
 *                   If omitted, coverage is estimated from the findings themselves.
 */
export function calcSchemaScore(
  findings: SchemaFindingResult[],
  pageCount?: { withSchema: number; total: number },
): number {
  if (findings.length === 0) return 0;

  const real = findings.filter(
    (f) => f.schemaType !== 'None' && f.schemaType !== 'ParseError',
  );

  // ── Coverage ────────────────────────────────────────────────────────────────
  let coverage = 0;
  if (pageCount && pageCount.total > 0) {
    coverage = pageCount.withSchema / pageCount.total;
  } else {
    // Fallback: pages with schema vs total unique pages inferred from findings
    // (rough estimate when pageCount not provided — works for unit tests)
    const totalPages = findings.length > 0 ? 1 : 0; // can't infer pages from flat array
    const pagesWithSchema = real.length > 0 ? 1 : 0;
    coverage = totalPages > 0 ? pagesWithSchema / totalPages : 0;
  }

  if (real.length === 0) {
    // No real schema at all — only coverage component applies
    return Math.round(coverage * SCORE_WEIGHTS.coverage * 100);
  }

  // ── Validity (type-weighted) ─────────────────────────────────────────────────
  // A schema is valid if it has no missing required fields and no non-recommended issues
  let weightedValidSum = 0;
  let weightedTotalSum = 0;

  for (const f of real) {
    const w = SCHEMA_TYPE_WEIGHTS[f.schemaType] ?? 1.0;
    weightedTotalSum += w;
    if (f.valid) weightedValidSum += w;
  }

  const validity = weightedTotalSum > 0 ? weightedValidSum / weightedTotalSum : 0;

  // ── Quality (type-weighted) ──────────────────────────────────────────────────
  // Quality = no missing recommended fields (issues that start with "Missing recommended")
  let weightedQualitySum = 0;

  for (const f of real) {
    const w = SCHEMA_TYPE_WEIGHTS[f.schemaType] ?? 1.0;
    const hasRecommendedGaps = f.issues.some((i) => i.startsWith('Missing recommended'));
    if (!hasRecommendedGaps) weightedQualitySum += w;
  }

  const quality = weightedTotalSum > 0 ? weightedQualitySum / weightedTotalSum : 0;

  // ── Final score ──────────────────────────────────────────────────────────────
  const score =
    coverage * SCORE_WEIGHTS.coverage * 100 +
    validity * SCORE_WEIGHTS.validity * 100 +
    quality * SCORE_WEIGHTS.quality * 100;

  return Math.round(Math.min(100, Math.max(0, score)));
}
