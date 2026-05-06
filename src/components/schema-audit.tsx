'use client';

import { useEffect, useState } from 'react';

interface SchemaFinding {
  id: string;
  schemaType: string;
  valid: boolean;
  missingFields: string[];
  issues: string[];
  fixSuggestion: string;
  page: { url: string; title: string | null };
}

interface SchemaData {
  scoreSchema: number | null;
  findings: SchemaFinding[];
}

const TYPE_COLOURS: Record<string, string> = {
  Article: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  FAQPage: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  Product: 'bg-green-500/20 text-green-300 border-green-500/40',
  Organization: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  BreadcrumbList: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  Person: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  None: 'bg-red-500/20 text-red-300 border-red-500/40',
  ParseError: 'bg-red-500/20 text-red-300 border-red-500/40',
};

function typeBadge(type: string) {
  const cls = TYPE_COLOURS[type] ?? 'bg-zinc-700 text-zinc-300 border-zinc-600';
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${cls}`}>{type}</span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const colour = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#27272a" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={colour} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="bold" fill={colour}>
          {score}
        </text>
      </svg>
      <span className="text-xs text-zinc-400">Schema score</span>
    </div>
  );
}

export function SchemaAudit({ auditId }: { auditId: string }) {
  const [data, setData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'issues' | 'valid'>('all');

  useEffect(() => {
    fetch(`/api/audits/${auditId}/schema`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [auditId]);

  if (loading)
    return <p className="text-sm text-zinc-400 py-6 text-center">Loading schema findings…</p>;
  if (!data || data.findings.length === 0)
    return (
      <p className="text-sm text-zinc-400 py-6 text-center">
        No schema findings yet — run an audit first.
      </p>
    );

  const findings = data.findings.filter((f) => {
    if (filter === 'issues') return !f.valid;
    if (filter === 'valid') return f.valid;
    return true;
  });

  const total = data.findings.length;
  const validCount = data.findings.filter((f) => f.valid).length;
  const issueCount = total - validCount;
  const noneCount = data.findings.filter((f) => f.schemaType === 'None').length;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex flex-wrap gap-4 items-center">
        <ScoreRing score={data.scoreSchema ?? 0} />
        <div className="flex gap-3 flex-wrap">
          <div className="bg-zinc-800 rounded-lg px-4 py-3 text-center min-w-[80px]">
            <div className="text-xl font-bold text-white">{total}</div>
            <div className="text-xs text-zinc-400">Total</div>
          </div>
          <div className="bg-zinc-800 rounded-lg px-4 py-3 text-center min-w-[80px]">
            <div className="text-xl font-bold text-green-400">{validCount}</div>
            <div className="text-xs text-zinc-400">Valid</div>
          </div>
          <div className="bg-zinc-800 rounded-lg px-4 py-3 text-center min-w-[80px]">
            <div className="text-xl font-bold text-red-400">{issueCount}</div>
            <div className="text-xs text-zinc-400">Issues</div>
          </div>
          <div className="bg-zinc-800 rounded-lg px-4 py-3 text-center min-w-[80px]">
            <div className="text-xl font-bold text-zinc-300">{noneCount}</div>
            <div className="text-xs text-zinc-400">No schema</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'issues', 'valid'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {f === 'all' ? `All (${total})` : f === 'issues' ? `Issues (${issueCount})` : `Valid (${validCount})`}
          </button>
        ))}
      </div>

      {/* Findings list */}
      <div className="space-y-3">
        {findings.map((f) => (
          <div
            key={f.id}
            className={`border rounded-lg overflow-hidden ${
              f.valid ? 'border-zinc-700' : 'border-red-500/40'
            }`}
          >
            <button
              className="w-full flex items-start gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-left"
              onClick={() => setExpanded((e) => ({ ...e, [f.id]: !e[f.id] }))}
            >
              <span className="mt-0.5">{f.valid ? '✅' : '❌'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {typeBadge(f.schemaType)}
                  <span className="text-xs text-zinc-400 truncate">{f.page.url}</span>
                </div>
                {f.page.title && (
                  <p className="text-sm text-zinc-300 mt-0.5 truncate">{f.page.title}</p>
                )}
              </div>
              <span className="text-zinc-600 text-sm">{expanded[f.id] ? '▲' : '▼'}</span>
            </button>

            {expanded[f.id] && (
              <div className="px-4 pb-4 pt-2 bg-zinc-950 space-y-3">
                {f.missingFields.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-400 mb-1">Missing required fields</p>
                    <div className="flex flex-wrap gap-1">
                      {f.missingFields.map((field) => (
                        <span key={field} className="text-xs bg-red-900/40 text-red-300 border border-red-700/50 px-2 py-0.5 rounded font-mono">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {f.issues.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-yellow-400 mb-1">Issues &amp; recommendations</p>
                    <ul className="space-y-1">
                      {f.issues.map((issue, i) => (
                        <li key={i} className="text-xs text-zinc-300 flex gap-2">
                          <span className="text-yellow-500 shrink-0">›</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {f.fixSuggestion && (
                  <div className="bg-indigo-950/40 border border-indigo-700/40 rounded p-3">
                    <p className="text-xs font-semibold text-indigo-400 mb-1">💡 Fix suggestion</p>
                    <p className="text-xs text-zinc-300">{f.fixSuggestion}</p>
                  </div>
                )}

                {f.valid && f.issues.length === 0 && (
                  <p className="text-xs text-green-400">✓ All required and recommended fields present</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
