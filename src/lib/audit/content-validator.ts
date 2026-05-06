/**
 * content-validator.ts
 * --------------------
 * 10 hard rules that score how easily AI engines can extract answers from a page.
 *
 * Each rule returns a ContentRuleResult:
 *   - rule        — machine key
 *   - passed      — boolean
 *   - severity    — 'critical' | 'warning' | 'info'
 *   - evidence    — excerpt / element that triggered the finding
 *   - fixSuggestion — actionable recommendation
 */

import * as cheerio from 'cheerio';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RuleKey =
  | 'single_h1'
  | 'heading_hierarchy'
  | 'faq_block'
  | 'tldr_summary'
  | 'paragraph_length'
  | 'list_present'
  | 'question_headings'
  | 'comparison_table'
  | 'answer_first'
  | 'font_size';

export type Severity = 'critical' | 'warning' | 'info';

export interface ContentRuleResult {
  rule: RuleKey;
  passed: boolean;
  severity: Severity;
  evidence: string | null;
  fixSuggestion: string;
}

export interface ContentAuditResult {
  url: string;
  findings: ContentRuleResult[];
  score: number; // 0–100
  passedCount: number;
  failedCount: number;
}

// ─── Rule weights for scoring (higher = more AEO impact) ─────────────────────

export const RULE_WEIGHTS: Record<RuleKey, number> = {
  single_h1:          1.5,  // critical — AI needs a clear page title signal
  heading_hierarchy:  1.2,  // AI uses headings to build answer structure
  faq_block:          1.8,  // highest AEO signal — AI directly cites FAQ content
  tldr_summary:       1.5,  // AI prefers answer-first pages
  answer_first:       1.4,  // closely related — first paragraph answers the headline
  paragraph_length:   1.1,  // long paragraphs are hard to cite verbatim
  list_present:       1.2,  // lists are highly citable
  question_headings:  1.3,  // question headings = directly indexable by AI QA engines
  comparison_table:   0.9,  // nice-to-have, context dependent
  font_size:          0.6,  // optional CWV tie-in, low AEO weight
};

// ─── Rule severity ────────────────────────────────────────────────────────────

export const RULE_SEVERITY: Record<RuleKey, Severity> = {
  faq_block:          'critical',
  single_h1:          'critical',
  tldr_summary:       'critical',
  answer_first:       'critical',
  heading_hierarchy:  'warning',
  paragraph_length:   'warning',
  list_present:       'warning',
  question_headings:  'warning',
  comparison_table:   'info',
  font_size:          'info',
};

// ─── Helper utilities ─────────────────────────────────────────────────────────

/** Truncate a string for use as evidence */
function trunc(s: string, max = 120): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/** Count approximate lines in a paragraph (80 chars ≈ 1 line) */
function estimateLines(text: string): number {
  return Math.ceil(text.trim().length / 80);
}

/** Extract visible text from an element, stripping tags */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visibleText($: ReturnType<typeof cheerio.load>, el: any): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

// ─── Rule implementations ────────────────────────────────────────────────────

/**
 * Rule 1 — Single H1
 * A page should have exactly one <h1>. Multiple H1s confuse AI topic extraction.
 * Zero H1s mean the page has no clear title signal.
 */
export function checkSingleH1(html: string): ContentRuleResult {
  const $ = cheerio.load(html);
  const h1s = $('h1');
  const count = h1s.length;

  if (count === 1) {
    return {
      rule: 'single_h1',
      passed: true,
      severity: RULE_SEVERITY.single_h1,
      evidence: trunc(h1s.first().text()),
      fixSuggestion: '',
    };
  }

  if (count === 0) {
    return {
      rule: 'single_h1',
      passed: false,
      severity: RULE_SEVERITY.single_h1,
      evidence: null,
      fixSuggestion:
        'Add a single <h1> tag that clearly states the page topic. AI engines use the H1 as the primary title signal for citation.',
    };
  }

  // count > 1
  const texts = h1s.map((_, el) => trunc($(el).text(), 60)).get();
  return {
    rule: 'single_h1',
    passed: false,
    severity: RULE_SEVERITY.single_h1,
    evidence: `${count} H1s found: "${texts.join('", "')}"`,
    fixSuggestion:
      `Consolidate to a single <h1>. Found ${count} H1s — AI engines may struggle to determine the primary topic. Keep the most descriptive one and demote others to H2.`,
  };
}

/**
 * Rule 2 — Heading hierarchy
 * H2s must appear before H3s; no skipped levels (e.g. H1 → H3).
 * Skipped levels break the outline AI uses to segment page content.
 */
export function checkHeadingHierarchy(html: string): ContentRuleResult {
  const $ = cheerio.load(html);
  const headings = $('h1, h2, h3, h4, h5, h6').toArray();

  const violations: string[] = [];
  let prevLevel = 0;

  for (const el of headings) {
    const tag = el.tagName.toLowerCase();
    const level = parseInt(tag[1], 10);
    // Skipped level = jumped more than 1 level down (e.g. h1 → h3)
    if (prevLevel > 0 && level > prevLevel + 1) {
      const text = trunc($(el).text(), 60);
      violations.push(`${tag.toUpperCase()} "${text}" after H${prevLevel}`);
    }
    prevLevel = level;
  }

  if (violations.length === 0) {
    return {
      rule: 'heading_hierarchy',
      passed: true,
      severity: RULE_SEVERITY.heading_hierarchy,
      evidence: `${headings.length} headings with valid hierarchy`,
      fixSuggestion: '',
    };
  }

  return {
    rule: 'heading_hierarchy',
    passed: false,
    severity: RULE_SEVERITY.heading_hierarchy,
    evidence: violations.slice(0, 3).join('; '),
    fixSuggestion:
      'Fix skipped heading levels. AI engines use heading hierarchy to build a structured outline of your content. Jumping from H1 to H3 breaks this outline.',
  };
}

/**
 * Rule 3 — FAQ block detected
 * Looks for: FAQPage JSON-LD, or visual FAQ patterns (DL/DT, details/summary,
 * repeated question-answer pairs in lists, or headings with "?" followed by paragraphs).
 */
export function checkFaqBlock(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  // Check 1: FAQPage JSON-LD schema
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    try {
      const data = JSON.parse($(el).html() ?? '{}');
      const types: string[] = Array.isArray(data)
        ? data.map((d: Record<string, unknown>) => String(d['@type'] ?? ''))
        : [String(data['@type'] ?? '')];
      if (types.some((t) => t === 'FAQPage' || t.includes('FAQ'))) {
        return {
          rule: 'faq_block',
          passed: true,
          severity: RULE_SEVERITY.faq_block,
          evidence: 'FAQPage JSON-LD schema detected',
          fixSuggestion: '',
        };
      }
      // Check for mainEntity with Questions
      const entities = Array.isArray(data?.mainEntity) ? data.mainEntity : [];
      if (entities.some((e: Record<string, unknown>) => String(e['@type']) === 'Question')) {
        return {
          rule: 'faq_block',
          passed: true,
          severity: RULE_SEVERITY.faq_block,
          evidence: `FAQPage with ${entities.length} Question entities in JSON-LD`,
          fixSuggestion: '',
        };
      }
    } catch {
      // ignore parse errors
    }
  }

  // Check 2: <details>/<summary> FAQ accordion pattern
  const detailsCount = $('details').length;
  if (detailsCount >= 2) {
    return {
      rule: 'faq_block',
      passed: true,
      severity: RULE_SEVERITY.faq_block,
      evidence: `${detailsCount} <details> accordion elements detected (visual FAQ pattern)`,
      fixSuggestion: '',
    };
  }

  // Check 3: DL/DT/DD definition list pattern (common FAQ markup)
  const dlCount = $('dl').length;
  const dtCount = $('dt').length;
  if (dlCount >= 1 && dtCount >= 2) {
    return {
      rule: 'faq_block',
      passed: true,
      severity: RULE_SEVERITY.faq_block,
      evidence: `${dtCount} DT terms in DL list (FAQ-style definition list)`,
      fixSuggestion: '',
    };
  }

  // Check 4: Headings that end with "?" — visual FAQ pattern
  const questionHeadings = $('h2, h3').filter((_, el) =>
    $(el).text().trim().endsWith('?')
  );
  if (questionHeadings.length >= 2) {
    return {
      rule: 'faq_block',
      passed: true,
      severity: RULE_SEVERITY.faq_block,
      evidence: `${questionHeadings.length} question-style headings ending in "?" (visual FAQ pattern)`,
      fixSuggestion: '',
    };
  }

  // No FAQ detected
  return {
    rule: 'faq_block',
    passed: false,
    severity: RULE_SEVERITY.faq_block,
    evidence: null,
    fixSuggestion:
      'Add a FAQ section with FAQPage JSON-LD schema. AI Overviews directly quote FAQ content — this is the single highest-ROI addition for AEO. Add 3–5 Q&A pairs that match your target keywords.',
  };
}

/**
 * Rule 4 — TL;DR / summary paragraph at top
 * Looks for a summary block in the first 600 chars of body content:
 *   - Element with class/id containing "tldr", "summary", "intro", "abstract"
 *   - A <strong> or <b> block in the first paragraph
 *   - The first <p> is ≤ 3 sentences (answer-first indicator)
 */
export function checkTldrSummary(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  // Check 1: explicit summary/tldr element
  const summaryEl = $(
    '[class*="tldr"], [class*="summary"], [class*="intro"], [class*="abstract"], ' +
    '[id*="tldr"], [id*="summary"], [id*="intro"], [id*="abstract"]'
  ).first();
  if (summaryEl.length) {
    return {
      rule: 'tldr_summary',
      passed: true,
      severity: RULE_SEVERITY.tldr_summary,
      evidence: trunc(summaryEl.text()),
      fixSuggestion: '',
    };
  }

  // Check 2: first paragraph is short (≤ 3 sentences) = answer-first
  const firstP = $('article p, main p, .content p, #content p, p').first();
  if (firstP.length) {
    const text = firstP.text().trim();
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length <= 3 && text.length >= 40) {
      return {
        rule: 'tldr_summary',
        passed: true,
        severity: RULE_SEVERITY.tldr_summary,
        evidence: trunc(text),
        fixSuggestion: '',
      };
    }
  }

  // Check 3: strong/em at start = bolded summary
  const boldSummary = $('p strong:first-child, p b:first-child').first();
  if (boldSummary.length) {
    return {
      rule: 'tldr_summary',
      passed: true,
      severity: RULE_SEVERITY.tldr_summary,
      evidence: trunc(boldSummary.text()),
      fixSuggestion: '',
    };
  }

  return {
    rule: 'tldr_summary',
    passed: false,
    severity: RULE_SEVERITY.tldr_summary,
    evidence: null,
    fixSuggestion:
      'Add a TL;DR or summary paragraph in the first 100 words. AI engines prioritise pages that answer the query immediately. Use a <div class="tldr"> block or keep the first paragraph to 1–2 sentences.',
  };
}

/**
 * Rule 5 — Paragraph length ≤ 4 lines (~320 chars)
 * Checks that no more than 30% of paragraphs exceed 4 visual lines.
 * Long paragraphs are harder for AI to cite verbatim.
 */
export function checkParagraphLength(html: string): ContentRuleResult {
  const $ = cheerio.load(html);
  const paragraphs = $('p').toArray().filter((el) => {
    const text = $(el).text().trim();
    return text.length > 40; // skip tiny/empty paragraphs
  });

  if (paragraphs.length === 0) {
    return {
      rule: 'paragraph_length',
      passed: true,
      severity: RULE_SEVERITY.paragraph_length,
      evidence: 'No substantial paragraphs found',
      fixSuggestion: '',
    };
  }

  const longParas = paragraphs.filter((el) => {
    const text = $(el).text();
    return estimateLines(text) > 4;
  });

  const ratio = longParas.length / paragraphs.length;

  if (ratio <= 0.3) {
    return {
      rule: 'paragraph_length',
      passed: true,
      severity: RULE_SEVERITY.paragraph_length,
      evidence: `${longParas.length}/${paragraphs.length} paragraphs exceed 4 lines (${Math.round(ratio * 100)}%)`,
      fixSuggestion: '',
    };
  }

  // Get the longest offending paragraph as evidence
  const worst = longParas.reduce((a, b) =>
    $(a).text().length > $(b).text().length ? a : b
  );

  return {
    rule: 'paragraph_length',
    passed: false,
    severity: RULE_SEVERITY.paragraph_length,
    evidence: `${longParas.length}/${paragraphs.length} paragraphs (${Math.round(ratio * 100)}%) exceed 4 lines. Longest: "${trunc($(worst).text(), 80)}"`,
    fixSuggestion:
      'Break long paragraphs into ≤4 lines each. AI engines prefer short, citable paragraphs. Split dense text at natural topic boundaries and use subheadings to separate sections.',
  };
}

/**
 * Rule 6 — Bullet/numbered lists present
 * Lists are highly citable by AI — steps, features, pros/cons.
 * At least one <ul> or <ol> with ≥ 2 items expected.
 */
export function checkListPresent(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  const lists = $('ul, ol').filter((_, el) => {
    return $(el).find('li').length >= 2;
  });

  if (lists.length > 0) {
    const totalItems = lists
      .map((_, el) => $(el).find('li').length)
      .get()
      .reduce((a: number, b: number) => a + b, 0);
    return {
      rule: 'list_present',
      passed: true,
      severity: RULE_SEVERITY.list_present,
      evidence: `${lists.length} list(s) with ${totalItems} total items`,
      fixSuggestion: '',
    };
  }

  return {
    rule: 'list_present',
    passed: false,
    severity: RULE_SEVERITY.list_present,
    evidence: null,
    fixSuggestion:
      'Add bullet or numbered lists. AI engines frequently cite list-formatted content verbatim. Convert feature descriptions, steps, or key points into lists.',
  };
}

/**
 * Rule 7 — Question-style headings (how/what/why/when/which/is/can/does)
 * These headings directly align with AI query formats.
 * At least 1 question-style H2/H3 expected on informational pages.
 */
export function checkQuestionHeadings(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  const QUESTION_PREFIXES = /^(how|what|why|when|which|who|is|can|does|do|should|will|are|was|were)\b/i;

  const questionH = $('h2, h3').filter((_, el) => {
    const text = $(el).text().trim();
    return QUESTION_PREFIXES.test(text) || text.endsWith('?');
  });

  if (questionH.length >= 1) {
    const examples = questionH
      .map((_, el) => trunc($(el).text(), 50))
      .get()
      .slice(0, 3);
    return {
      rule: 'question_headings',
      passed: true,
      severity: RULE_SEVERITY.question_headings,
      evidence: `${questionH.length} question-style heading(s): "${examples.join('", "')}"`,
      fixSuggestion: '',
    };
  }

  return {
    rule: 'question_headings',
    passed: false,
    severity: RULE_SEVERITY.question_headings,
    evidence: null,
    fixSuggestion:
      'Rewrite at least one H2/H3 as a question (e.g. "What is…?", "How does…?"). AI engines match queries to question-format headings and are more likely to cite pages that directly answer the query in their structure.',
  };
}

/**
 * Rule 8 — Tables for comparisons
 * Comparison tables are highly citable for product/service queries.
 * Only flagged as warning if the page appears to be comparison/feature content
 * (has words like "vs", "compare", "features", "pricing" in headings).
 * Pages without comparison intent are not penalised.
 */
export function checkComparisonTable(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  const hasTables = $('table').length > 0;

  if (hasTables) {
    const tableCount = $('table').length;
    const rowCount = $('table tr').length;
    return {
      rule: 'comparison_table',
      passed: true,
      severity: RULE_SEVERITY.comparison_table,
      evidence: `${tableCount} table(s) with ${rowCount} rows`,
      fixSuggestion: '',
    };
  }

  // Check if this page has comparison intent
  const COMPARISON_SIGNALS = /\b(vs\.?|versus|compar|feature|pricing|plan|alternative)\b/i;
  const headingTexts = $('h1, h2, h3').map((_, el) => $(el).text()).get().join(' ');
  const hasComparisonIntent = COMPARISON_SIGNALS.test(headingTexts);

  if (!hasComparisonIntent) {
    // Page doesn't look like a comparison page — pass with info
    return {
      rule: 'comparison_table',
      passed: true,
      severity: RULE_SEVERITY.comparison_table,
      evidence: 'No comparison intent detected — table not required',
      fixSuggestion: '',
    };
  }

  return {
    rule: 'comparison_table',
    passed: false,
    severity: RULE_SEVERITY.comparison_table,
    evidence: 'Comparison content detected but no table found',
    fixSuggestion:
      'Add an HTML <table> for comparison content. AI engines prefer structured tabular data for "X vs Y" queries and are more likely to cite it in AI Overviews.',
  };
}

/**
 * Rule 9 — Answer-first paragraph structure
 * The first paragraph after an H1 or H2 should directly answer the heading.
 * Heuristic: first paragraph mentions keywords from the nearest preceding heading.
 */
export function checkAnswerFirst(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  // Find first H1 or H2
  const heading = $('h1, h2').first();
  if (!heading.length) {
    return {
      rule: 'answer_first',
      passed: false,
      severity: RULE_SEVERITY.answer_first,
      evidence: null,
      fixSuggestion:
        'Add an H1 heading and ensure the first paragraph directly answers it.',
    };
  }

  const headingText = heading.text().trim().toLowerCase();
  const headingWords = headingText
    .split(/\W+/)
    .filter((w) => w.length > 3); // meaningful words only

  // Find first paragraph after the heading (next sibling or nearby)
  let firstPara = heading.next('p');
  if (!firstPara.length) {
    firstPara = $('article p, main p, .content p, p').first();
  }

  if (!firstPara.length) {
    return {
      rule: 'answer_first',
      passed: false,
      severity: RULE_SEVERITY.answer_first,
      evidence: `H1: "${trunc(headingText, 60)}" — no following paragraph found`,
      fixSuggestion:
        'Add a paragraph immediately after your H1 that directly answers the page topic.',
    };
  }

  const paraText = firstPara.text().toLowerCase();
  const sentences = paraText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const firstSentence = sentences[0] ?? '';

  // Check if first sentence mentions ≥1 keyword from heading
  const matchCount = headingWords.filter((w) => firstSentence.includes(w)).length;
  const matchRatio = headingWords.length > 0 ? matchCount / headingWords.length : 0;

  if (matchRatio >= 0.3 || sentences.length <= 2) {
    return {
      rule: 'answer_first',
      passed: true,
      severity: RULE_SEVERITY.answer_first,
      evidence: trunc(firstPara.text()),
      fixSuggestion: '',
    };
  }

  return {
    rule: 'answer_first',
    passed: false,
    severity: RULE_SEVERITY.answer_first,
    evidence: `H1: "${trunc(headingText, 60)}" → first para: "${trunc(firstPara.text(), 80)}"`,
    fixSuggestion:
      'Start the first paragraph with a direct answer to the page headline. AI engines use the first 1–2 sentences as the citation snippet. Lead with the answer, then explain.',
  };
}

/**
 * Rule 10 — Readable font size / contrast (optional CWV tie-in)
 * Checks for inline font-size < 12px in style attributes or <font size="1/2">.
 * This is a heuristic — real CWV requires browser execution.
 * Passes if no suspicious tiny font markup is found.
 */
export function checkFontSize(html: string): ContentRuleResult {
  const $ = cheerio.load(html);

  const tinyFont: string[] = [];

  // Check inline style font-size < 12px
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') ?? '';
    const match = style.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt|em|rem)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      let px = value;
      if (unit === 'pt') px = value * 1.333;
      if (unit === 'em' || unit === 'rem') px = value * 16;
      if (px < 12) {
        tinyFont.push(`${match[0]} on <${el.tagName}>`);
      }
    }
  });

  // Check <font size="1"> or <font size="2"> (old HTML)
  $('font[size]').each((_, el) => {
    const size = parseInt($(el).attr('size') ?? '3', 10);
    if (size <= 2) {
      tinyFont.push(`<font size="${size}">`);
    }
  });

  if (tinyFont.length === 0) {
    return {
      rule: 'font_size',
      passed: true,
      severity: RULE_SEVERITY.font_size,
      evidence: 'No tiny font sizes detected in inline styles',
      fixSuggestion: '',
    };
  }

  return {
    rule: 'font_size',
    passed: false,
    severity: RULE_SEVERITY.font_size,
    evidence: `Tiny fonts found: ${tinyFont.slice(0, 3).join(', ')}`,
    fixSuggestion:
      'Remove font sizes below 12px. Poor readability signals reduce AI citation likelihood. Use a CSS class instead of inline styles, minimum 16px body text.',
  };
}

// ─── Main auditor ─────────────────────────────────────────────────────────────

/**
 * Run all 10 rules against a page's HTML.
 * Returns findings + a weighted score.
 */
export function auditPageContent(html: string, url: string): ContentAuditResult {
  const findings: ContentRuleResult[] = [
    checkSingleH1(html),
    checkHeadingHierarchy(html),
    checkFaqBlock(html),
    checkTldrSummary(html),
    checkParagraphLength(html),
    checkListPresent(html),
    checkQuestionHeadings(html),
    checkComparisonTable(html),
    checkAnswerFirst(html),
    checkFontSize(html),
  ];

  const score = calcContentScore(findings);
  const passedCount = findings.filter((f) => f.passed).length;
  const failedCount = findings.filter((f) => !f.passed).length;

  return { url, findings, score, passedCount, failedCount };
}

/**
 * Calculate weighted content score 0–100.
 * Each rule contributes (weight / totalWeight) * 100 if passed.
 */
export function calcContentScore(findings: ContentRuleResult[]): number {
  const totalWeight = Object.values(RULE_WEIGHTS).reduce((a, b) => a + b, 0);

  const earned = findings
    .filter((f) => f.passed)
    .reduce((sum, f) => sum + (RULE_WEIGHTS[f.rule] ?? 1), 0);

  return Math.round((earned / totalWeight) * 100);
}

/**
 * Human-readable rule labels for the UI
 */
export const RULE_LABELS: Record<RuleKey, string> = {
  single_h1:          'Single H1',
  heading_hierarchy:  'Heading hierarchy',
  faq_block:          'FAQ block',
  tldr_summary:       'TL;DR / summary',
  paragraph_length:   'Paragraph length ≤ 4 lines',
  list_present:       'Lists present',
  question_headings:  'Question-style headings',
  comparison_table:   'Comparison table',
  answer_first:       'Answer-first structure',
  font_size:          'Readable font size',
};
