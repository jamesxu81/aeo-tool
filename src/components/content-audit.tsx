'use client';

import { useEffect, useState } from 'react';
import { RULE_LABELS, RULE_WEIGHTS, type RuleKey } from '@/lib/audit/content-validator';

interface ContentFinding {
  id: string;
  rule: string;
  passed: boolean;
  severity: string;
  evidence: string | null;
  fixSuggestion: string | null;
  page: { url: string };
}

interface ApiResponse {
  score: number | null;
  findings: ContentFinding[];
}

// Group findings by rule across all pages
interface RuleSummary {
  rule: RuleKey;
  label: string;
  weight: number;
  passedCount: number;
  failedCount: number;
  severity: string;
  failures: ContentFinding[];
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border border-red-500/30',
  warning:  'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  info:     'bg-slate-500/20 text-slate-300 border border-slate-500/30',
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function ScoreGauge({ score }: { score: number }) {
  const colour =
    score >= 75 ? 'text-emerald-400' :
    score >= 50 ? 'text-amber-400' :
    'text-red-400';

  const ring =
    score >= 75 ? 'stroke-emerald-400' :
    score >= 50 ? 'stroke-amber-400' :
    'stroke-red-400';

  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="8"
          className={ring}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="53" textAnchor="middle" className={`text-lg font-bold fill-current ${colour}`} fontSize="18">
          {score}
        </text>
      </svg>
      <span className="text-xs text-slate-400">Content score</span>
    </div>
  );
}

export function ContentAudit({ auditId }: { auditId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/audits/${auditId}/content`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Failed to load content audit'))
      .finally(() => setLoading(false));
  }, [auditId]);

  if (loading) return <p className="text-sm text-slate-400 py-6 text-center">Loading content audit…</p>;
  if (error)   return <p className="text-sm text-red-400 py-6 text-center">{error}</p>;
  if (!data)   return null;

  if (data.findings.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center">
        <p className="text-sm text-slate-400">No content findings yet — run an audit to see results.</p>
      </div>
    );
  }

  // Build per-rule summaries
  const ruleMap = new Map<string, RuleSummary>();
  for (const f of data.findings) {
    if (!ruleMap.has(f.rule)) {
      ruleMap.set(f.rule, {
        rule: f.rule as RuleKey,
        label: RULE_LABELS[f.rule as RuleKey] ?? f.rule,
        weight: RULE_WEIGHTS[f.rule as RuleKey] ?? 1,
        passedCount: 0,
        failedCount: 0,
        severity: f.severity,
        failures: [],
      });
    }
    const s = ruleMap.get(f.rule)!;
    if (f.passed) s.passedCount++;
    else { s.failedCount++; s.failures.push(f); }
  }

  const rules = Array.from(ruleMap.values()).sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.weight - a.weight
  );

  const totalPages = new Set(data.findings.map((f) => f.page.url)).size;
  const criticalFailed = rules.filter((r) => r.severity === 'critical' && r.failedCount > 0).length;

  const toggle = (rule: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rule)) next.delete(rule); else next.add(rule);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        {data.score !== null && <ScoreGauge score={data.score} />}
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <div className="text-2xl font-bold text-white">{totalPages}</div>
            <div className="text-slate-400">pages analysed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">
              {rules.filter((r) => r.failedCount === 0).length}
            </div>
            <div className="text-slate-400">rules passing</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{criticalFailed}</div>
            <div className="text-slate-400">critical failures</div>
          </div>
        </div>
      </div>

      {/* Rules table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 text-xs font-medium text-slate-500 border-b border-slate-800 uppercase tracking-wide">
          <span>Rule</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Pages passing</span>
          <span />
        </div>

        {rules.map((r) => {
          const allPassed = r.failedCount === 0;
          const isOpen = expanded.has(r.rule);

          return (
            <div key={r.rule} className="border-b border-slate-800 last:border-0">
              <button
                className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                onClick={() => !allPassed && toggle(r.rule)}
                disabled={allPassed}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    allPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {allPassed ? '✓' : '✗'}
                  </span>
                  <span className="font-medium text-sm truncate">{r.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${SEVERITY_BADGE[r.severity] ?? ''}`}>
                    {r.severity}
                  </span>
                </div>
                <span className="text-xs text-slate-500 self-center text-right">×{r.weight.toFixed(1)}</span>
                <span className={`text-sm self-center text-right font-mono ${
                  allPassed ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {r.passedCount}/{r.passedCount + r.failedCount}
                </span>
                <span className="text-slate-500 self-center text-right text-xs">
                  {!allPassed ? (isOpen ? '▲' : '▼') : ''}
                </span>
              </button>

              {/* Expanded failures */}
              {isOpen && r.failures.length > 0 && (
                <div className="border-t border-slate-800 bg-slate-950/40 divide-y divide-slate-800/50">
                  {r.failures.slice(0, 10).map((f) => (
                    <div key={f.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={f.page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:underline truncate"
                        >
                          {f.page.url}
                        </a>
                      </div>
                      {f.evidence && (
                        <p className="text-xs text-slate-400 font-mono bg-slate-900 rounded px-2 py-1 line-clamp-2">
                          {f.evidence}
                        </p>
                      )}
                      {f.fixSuggestion && (
                        <p className="text-xs text-amber-300/80">
                          💡 {f.fixSuggestion}
                        </p>
                      )}
                    </div>
                  ))}
                  {r.failures.length > 10 && (
                    <p className="px-4 py-2 text-xs text-slate-500">
                      +{r.failures.length - 10} more pages with this issue
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
