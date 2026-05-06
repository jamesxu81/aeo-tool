import { describe, it, expect } from 'vitest';
import {
  checkSingleH1,
  checkHeadingHierarchy,
  checkFaqBlock,
  checkTldrSummary,
  checkParagraphLength,
  checkListPresent,
  checkQuestionHeadings,
  checkComparisonTable,
  checkAnswerFirst,
  checkFontSize,
  auditPageContent,
  calcContentScore,
  RULE_WEIGHTS,
} from '../content-validator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const wrap = (body: string) => `<html><body>${body}</body></html>`;

// ─── Rule 1: Single H1 ────────────────────────────────────────────────────────

describe('checkSingleH1', () => {
  it('passes with exactly one H1', () => {
    const r = checkSingleH1(wrap('<h1>Best Power Tools</h1><p>Content here.</p>'));
    expect(r.passed).toBe(true);
    expect(r.evidence).toContain('Best Power Tools');
  });

  it('fails with zero H1s', () => {
    const r = checkSingleH1(wrap('<h2>Section</h2><p>No H1 anywhere.</p>'));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('critical');
    expect(r.fixSuggestion).toMatch(/single.*h1/i);
  });

  it('fails with multiple H1s', () => {
    const r = checkSingleH1(wrap('<h1>Title One</h1><h1>Title Two</h1><h1>Title Three</h1>'));
    expect(r.passed).toBe(false);
    expect(r.evidence).toContain('3 H1s');
    expect(r.fixSuggestion).toMatch(/consolidate/i);
  });
});

// ─── Rule 2: Heading hierarchy ────────────────────────────────────────────────

describe('checkHeadingHierarchy', () => {
  it('passes valid hierarchy h1→h2→h3', () => {
    const r = checkHeadingHierarchy(wrap(
      '<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails when H1 jumps to H3 (skipped H2)', () => {
    const r = checkHeadingHierarchy(wrap(
      '<h1>Title</h1><h3>Skipped H2!</h3>'
    ));
    expect(r.passed).toBe(false);
    expect(r.evidence).toContain('H3');
    expect(r.evidence).toContain('after H1');
  });

  it('passes single heading with no following headings', () => {
    const r = checkHeadingHierarchy(wrap('<h1>Only Heading</h1><p>Content.</p>'));
    expect(r.passed).toBe(true);
  });

  it('fails h2→h4 skip', () => {
    const r = checkHeadingHierarchy(wrap(
      '<h1>A</h1><h2>B</h2><h4>D — skipped H3</h4>'
    ));
    expect(r.passed).toBe(false);
  });
});

// ─── Rule 3: FAQ block ────────────────────────────────────────────────────────

describe('checkFaqBlock', () => {
  it('passes with FAQPage JSON-LD schema', () => {
    const schema = JSON.stringify({ '@type': 'FAQPage', mainEntity: [] });
    const r = checkFaqBlock(wrap(
      `<script type="application/ld+json">${schema}</script>`
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/FAQPage JSON-LD/i);
  });

  it('passes with <details> accordion elements (≥2)', () => {
    const r = checkFaqBlock(wrap(
      '<details><summary>Q1?</summary><p>A1.</p></details>' +
      '<details><summary>Q2?</summary><p>A2.</p></details>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/accordion/i);
  });

  it('passes with question-style H2s ending in ?', () => {
    const r = checkFaqBlock(wrap(
      '<h2>What is AEO?</h2><p>AEO stands for…</p>' +
      '<h2>How does it work?</h2><p>It works by…</p>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/question-style/i);
  });

  it('passes with DL/DT definition list', () => {
    const r = checkFaqBlock(wrap(
      '<dl><dt>Q1?</dt><dd>A1.</dd><dt>Q2?</dt><dd>A2.</dd></dl>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails with no FAQ signals', () => {
    const r = checkFaqBlock(wrap('<h1>About us</h1><p>We are a company.</p>'));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('critical');
    expect(r.fixSuggestion).toMatch(/FAQ section/i);
  });
});

// ─── Rule 4: TL;DR summary ────────────────────────────────────────────────────

describe('checkTldrSummary', () => {
  it('passes with .tldr class element', () => {
    const r = checkTldrSummary(wrap(
      '<div class="tldr">AI can extract answers when…</div><p>More content.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('passes with .summary class element', () => {
    const r = checkTldrSummary(wrap(
      '<div class="summary">This page explains how to optimise for AI search.</div>'
    ));
    expect(r.passed).toBe(true);
  });

  it('passes when first paragraph is short (≤3 sentences)', () => {
    const r = checkTldrSummary(wrap(
      '<p>AEO helps your content appear in AI Overviews. It focuses on structure.</p>' +
      '<p>Here is much more detail about the topic that goes on and on with many sentences and clauses and subclauses to pad things out.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails with no summary and long first paragraph', () => {
    const longPara = 'This is a very long introductory paragraph that does not get to the point quickly. '.repeat(4);
    const r = checkTldrSummary(wrap(`<p>${longPara}</p>`));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('critical');
  });
});

// ─── Rule 5: Paragraph length ─────────────────────────────────────────────────

describe('checkParagraphLength', () => {
  it('passes when all paragraphs are short', () => {
    const r = checkParagraphLength(wrap(
      '<p>Short paragraph one.</p><p>Short paragraph two.</p><p>Short para three.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails when more than 30% of paragraphs are too long', () => {
    const longText = 'word '.repeat(100); // ~500 chars = ~6 lines
    const r = checkParagraphLength(wrap(
      `<p>${longText}</p><p>${longText}</p><p>${longText}</p><p>Short.</p>`
    ));
    expect(r.passed).toBe(false);
    expect(r.fixSuggestion).toMatch(/break long paragraphs/i);
  });

  it('passes with no substantial paragraphs', () => {
    const r = checkParagraphLength(wrap('<p>Hi.</p>'));
    expect(r.passed).toBe(true);
  });
});

// ─── Rule 6: List present ─────────────────────────────────────────────────────

describe('checkListPresent', () => {
  it('passes with a UL containing ≥2 items', () => {
    const r = checkListPresent(wrap(
      '<ul><li>Feature one</li><li>Feature two</li><li>Feature three</li></ul>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/list/i);
  });

  it('passes with an OL', () => {
    const r = checkListPresent(wrap(
      '<ol><li>Step 1</li><li>Step 2</li></ol>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails with no lists', () => {
    const r = checkListPresent(wrap('<p>Only prose content here.</p>'));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('warning');
  });

  it('fails when list has only 1 item', () => {
    const r = checkListPresent(wrap('<ul><li>Only one item</li></ul>'));
    expect(r.passed).toBe(false);
  });
});

// ─── Rule 7: Question headings ────────────────────────────────────────────────

describe('checkQuestionHeadings', () => {
  it('passes with "How to…" H2', () => {
    const r = checkQuestionHeadings(wrap(
      '<h1>Guide</h1><h2>How to get started</h2><p>Content.</p>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/How to get started/i);
  });

  it('passes with H3 ending in ?', () => {
    const r = checkQuestionHeadings(wrap(
      '<h1>About</h1><h3>Is this right for me?</h3><p>Content.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('passes with "What is…" heading', () => {
    const r = checkQuestionHeadings(wrap('<h2>What is structured data?</h2>'));
    expect(r.passed).toBe(true);
  });

  it('fails with only declarative headings', () => {
    const r = checkQuestionHeadings(wrap(
      '<h1>Title</h1><h2>About the product</h2><h2>Key features</h2>'
    ));
    expect(r.passed).toBe(false);
    expect(r.fixSuggestion).toMatch(/rewrite/i);
  });
});

// ─── Rule 8: Comparison table ─────────────────────────────────────────────────

describe('checkComparisonTable', () => {
  it('passes with a table', () => {
    const r = checkComparisonTable(wrap(
      '<table><tr><th>Plan</th><th>Price</th></tr><tr><td>Free</td><td>$0</td></tr></table>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/table/i);
  });

  it('passes (no penalty) if no table and no comparison intent', () => {
    const r = checkComparisonTable(wrap(
      '<h1>About us</h1><p>We build great software.</p>'
    ));
    expect(r.passed).toBe(true);
    expect(r.evidence).toMatch(/not required/i);
  });

  it('fails if comparison intent but no table', () => {
    const r = checkComparisonTable(wrap(
      '<h1>Us vs competitors</h1><p>Here is how we compare to alternatives.</p>'
    ));
    expect(r.passed).toBe(false);
    expect(r.fixSuggestion).toMatch(/HTML.*table/i);
  });
});

// ─── Rule 9: Answer-first ─────────────────────────────────────────────────────

describe('checkAnswerFirst', () => {
  it('passes when first paragraph references heading keywords', () => {
    const r = checkAnswerFirst(wrap(
      '<h1>How to optimise for AI search</h1>' +
      '<p>Optimising for AI search requires structured content that AI engines can cite.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('passes when first paragraph is very short (≤2 sentences)', () => {
    const r = checkAnswerFirst(wrap(
      '<h1>Power tools guide</h1>' +
      '<p>Power tools make DIY faster.</p>'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails with no heading', () => {
    const r = checkAnswerFirst(wrap('<p>Just some text with no heading.</p>'));
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('critical');
  });
});

// ─── Rule 10: Font size ───────────────────────────────────────────────────────

describe('checkFontSize', () => {
  it('passes with no tiny font styles', () => {
    const r = checkFontSize(wrap('<p style="font-size: 16px">Normal text.</p>'));
    expect(r.passed).toBe(true);
  });

  it('fails with inline font-size: 8px', () => {
    const r = checkFontSize(wrap('<p style="font-size: 8px">Tiny text.</p>'));
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/8px/);
  });

  it('fails with <font size="1">', () => {
    const r = checkFontSize(wrap('<font size="1">Old style tiny text.</font>'));
    expect(r.passed).toBe(false);
  });

  it('passes with no font styles at all', () => {
    const r = checkFontSize(wrap('<p>Plain text, no styles.</p>'));
    expect(r.passed).toBe(true);
  });
});

// ─── Full audit + score ───────────────────────────────────────────────────────

describe('auditPageContent + calcContentScore', () => {
  it('returns 10 findings for any page', () => {
    const result = auditPageContent(wrap('<h1>Test</h1><p>Hello.</p>'), 'https://example.com');
    expect(result.findings).toHaveLength(10);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('scores 100 for a perfect page', () => {
    const perfectHtml = `
      <html><body>
        <div class="tldr">AEO helps you rank in AI search results.</div>
        <h1>How to Optimise for AI Search</h1>
        <p>AEO optimisation ensures your content is cited by AI engines like Google AI Overviews.</p>
        <h2>What is AEO?</h2>
        <p>AEO is Answer Engine Optimisation.</p>
        <h2>How does it work?</h2>
        <p>It works by structuring content clearly.</p>
        <h3>Key steps</h3>
        <ul><li>Step one</li><li>Step two</li><li>Step three</li></ul>
        <table><tr><th>Feature</th><th>Value</th></tr><tr><td>Speed</td><td>Fast</td></tr></table>
        <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is AEO?","acceptedAnswer":{"@type":"Answer","text":"AEO is…"}}]}</script>
      </body></html>
    `;
    const result = auditPageContent(perfectHtml, 'https://example.com/guide');
    expect(result.passedCount).toBeGreaterThanOrEqual(8);
    expect(result.score).toBeGreaterThan(75);
  });

  it('score of all-failing page is 0', () => {
    const findings = Object.keys(RULE_WEIGHTS).map((rule) => ({
      rule: rule as any,
      passed: false,
      severity: 'warning' as const,
      evidence: null,
      fixSuggestion: 'fix it',
    }));
    expect(calcContentScore(findings)).toBe(0);
  });

  it('passedCount and failedCount are consistent', () => {
    const result = auditPageContent(wrap('<h1>Test</h1>'), 'https://example.com');
    expect(result.passedCount + result.failedCount).toBe(10);
  });
});
