'use client';

import { useState } from 'react';

type AiCheck = {
  id: string;
  keyword: string;
  provider: string;
  ourDomainCited: boolean;
  ourPosition: number | null;
  allCitedDomains: string[];
};

type Props = {
  checks: AiCheck[];
  domain: string;
};

export default function AuditResults({ checks, domain }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (checks.length === 0) return null;

  // Group by keyword
  const byKeyword = checks.reduce<Record<string, AiCheck[]>>((acc, c) => {
    acc[c.keyword] = acc[c.keyword] ?? [];
    acc[c.keyword].push(c);
    return acc;
  }, {});

  const keywords = Object.keys(byKeyword);
  const citedCount = keywords.filter((kw) =>
    byKeyword[kw].some((c) => c.ourDomainCited),
  ).length;

  // Tally all competitor domains across all keywords
  const competitorTally = checks
    .flatMap((c) => c.allCitedDomains.filter((d) => d !== domain))
    .reduce<Record<string, number>>((acc, d) => {
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});
  const topCompetitors = Object.entries(competitorTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="mt-6 space-y-6">
      {/* Summary bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="font-semibold mb-4">AI Citation Results</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-slate-800/60 p-4">
            <div className="text-2xl font-bold text-white">{keywords.length}</div>
            <div className="text-xs text-slate-400 mt-1">Keywords checked</div>
          </div>
          <div className={`rounded-lg p-4 ${citedCount > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            <div className={`text-2xl font-bold ${citedCount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {citedCount}/{keywords.length}
            </div>
            <div className="text-xs text-slate-400 mt-1">Keywords where you&apos;re cited</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-4">
            <div className="text-2xl font-bold text-white">{topCompetitors.length}</div>
            <div className="text-xs text-slate-400 mt-1">Competing domains seen</div>
          </div>
        </div>
      </div>

      {/* Per-keyword breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="font-semibold mb-4">Keyword Breakdown</h2>
        <div className="space-y-3">
          {keywords.map((kw) => {
            const kwChecks = byKeyword[kw];
            const cited = kwChecks.some((c) => c.ourDomainCited);
            const position = kwChecks.find((c) => c.ourPosition != null)?.ourPosition;
            // Union all cited domains across runs
            const allDomains = [...new Set(kwChecks.flatMap((c) => c.allCitedDomains))];
            const competitors = allDomains.filter((d) => d !== domain);
            const isOpen = expanded === kw;

            return (
              <div key={kw} className="rounded-lg border border-slate-700/50 overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : kw)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${cited ? 'text-emerald-400' : 'text-red-400'}`}>
                      {cited ? '✓' : '✗'}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{kw}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {cited && position != null && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-300 rounded-full px-2 py-0.5">
                        #{position} in citations
                      </span>
                    )}
                    {!cited && (
                      <span className="text-xs bg-red-500/20 text-red-300 rounded-full px-2 py-0.5">
                        Not cited
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{competitors.length} competitors</span>
                    <span className="text-slate-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded: competing domains */}
                {isOpen && (
                  <div className="border-t border-slate-700/50 px-4 py-3 bg-slate-800/20">
                    {competitors.length === 0 ? (
                      <p className="text-xs text-slate-500">No competing domains found in AI Overview.</p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-400 mb-2">
                          Domains cited instead of <span className="text-white font-medium">{domain}</span>:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {competitors.map((d) => (
                            <span
                              key={d}
                              className={`text-xs rounded-full px-3 py-1 font-mono ${
                                d === domain
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-700/60 text-slate-300'
                              }`}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                        {/* Provider detail */}
                        <div className="mt-3 space-y-1">
                          {kwChecks.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="uppercase font-mono bg-slate-700/40 rounded px-1.5 py-0.5">
                                {c.provider}
                              </span>
                              <span>
                                {c.ourDomainCited
                                  ? `✓ cited at position #${c.ourPosition}`
                                  : `✗ not cited`}
                              </span>
                              <span>·</span>
                              <span>{c.allCitedDomains.length} domains in answer</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top competing domains */}
      {topCompetitors.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold mb-4">
            Top Domains Cited Instead of You
          </h2>
          <div className="space-y-2">
            {topCompetitors.map(([d, count], i) => (
              <div key={d} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-5 text-right">{i + 1}</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-200">{d}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500/60"
                    style={{ width: `${Math.round((count / keywords.length) * 100)}px` }}
                  />
                  <span className="text-xs text-slate-400">
                    {count}/{keywords.length} keywords
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
