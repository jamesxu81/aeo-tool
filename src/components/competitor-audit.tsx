'use client'

import { useEffect, useState } from 'react'

interface CompetitorScore {
  schema: number | null
  content: number | null
  eeat: number | null
  citation: number
}

interface CompetitorData {
  id: string
  domain: string
  status: string
  errorMessage: string | null
  scores: CompetitorScore
  pagesCrawled: number
  citationCount: number
  topCitedKeywords: string[]
  deltas: { schema: number; content: number; eeat: number }
}

interface CitationEntry {
  domain: string
  citations: number
  rate: number
}

interface CompetitorResponse {
  auditId: string
  yourDomain: string
  yourScores: { schema: number | null; content: number | null; eeat: number | null; citation: number | null; total: number | null }
  competitors: CompetitorData[]
  citationLeaderboard: CitationEntry[]
}

function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0
  const color = (value ?? 0) >= 70 ? 'bg-green-500' : (value ?? 0) >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value ?? '—'}</span>
    </div>
  )
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-500 text-xs">±0</span>
  const color = value > 0 ? 'text-green-400' : 'text-red-400'
  return <span className={`${color} text-xs font-semibold`}>{value > 0 ? `+${value}` : value}</span>
}

export function CompetitorAudit({ auditId }: { auditId: string }) {
  const [data, setData] = useState<CompetitorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/audits/${auditId}/competitors`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [auditId])

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Loading competitor data…</div>
  if (error) return <div className="text-red-400 text-sm py-8 text-center">Failed to load: {error}</div>
  if (!data) return null

  const { yourScores, competitors, citationLeaderboard, yourDomain } = data

  return (
    <div className="space-y-6">
      {competitors.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🏁</div>
          <div className="text-gray-300 font-medium">No competitors configured</div>
          <div className="text-gray-500 text-sm mt-1">Add competitor domains when creating your project to see comparison data here.</div>
        </div>
      ) : (
        <>
          {/* Score comparison table */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-white">Score Comparison</h3>
              <p className="text-xs text-gray-400 mt-0.5">Your domain vs competitors across all audit dimensions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Domain</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-center">Schema</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-center">Content</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-center">E-E-A-T</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-center">Citations</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Your domain row */}
                  <tr className="border-b border-gray-700/50 bg-indigo-500/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        <span className="font-medium text-white">{yourDomain}</span>
                        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">You</span>
                      </div>
                    </td>
                    {([yourScores.schema, yourScores.content, yourScores.eeat, yourScores.citation] as (number | null)[]).map((s, i) => (
                      <td key={i} className="px-4 py-3">
                        <ScoreBar value={s} />
                      </td>
                    ))}
                  </tr>
                  {/* Competitor rows */}
                  {competitors.map((comp) => (
                    <tr key={comp.id} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                          <span className="text-gray-300">{comp.domain}</span>
                          {comp.status !== 'done' && (
                            <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{comp.status}</span>
                          )}
                        </div>
                      </td>
                      {(['schema', 'content', 'eeat', 'citation'] as const).map((dim) => (
                        <td key={dim} className="px-4 py-3">
                          {comp.status === 'done' ? (
                            <div className="space-y-1">
                              <ScoreBar value={comp.scores[dim]} />
                              {dim !== 'citation' && (
                                <div className="text-right">
                                  <DeltaBadge value={comp.deltas[dim as keyof typeof comp.deltas] ?? 0} />
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-competitor detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map((comp) => (
              <div key={comp.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-white">{comp.domain}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{comp.pagesCrawled} pages crawled</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    comp.status === 'done' ? 'bg-green-500/15 text-green-400' :
                    comp.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>{comp.status}</span>
                </div>
                {comp.status === 'done' ? (
                  <>
                    <div className="space-y-2 text-xs">
                      {(['schema', 'content', 'eeat'] as const).map((dim) => (
                        <div key={dim} className="flex items-center gap-2">
                          <span className="w-16 text-gray-400 capitalize">{dim}</span>
                          <ScoreBar value={comp.scores[dim]} />
                          <DeltaBadge value={comp.deltas[dim]} />
                        </div>
                      ))}
                    </div>
                    {comp.topCitedKeywords.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="text-xs text-gray-500 mb-1.5">Cited for keywords:</div>
                        <div className="flex flex-wrap gap-1">
                          {comp.topCitedKeywords.map((kw) => (
                            <span key={kw} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-gray-500">{comp.errorMessage ?? 'Audit in progress…'}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* AI Citation Leaderboard */}
      {citationLeaderboard.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700">
            <h3 className="font-semibold text-white">AI Citation Leaderboard</h3>
            <p className="text-xs text-gray-400 mt-0.5">Domains most cited by AI engines for your keywords</p>
          </div>
          <div className="divide-y divide-gray-700/50">
            {citationLeaderboard.map((entry, i) => (
              <div key={entry.domain} className={`flex items-center gap-3 px-5 py-3 ${entry.domain === yourDomain ? 'bg-indigo-500/5' : ''}`}>
                <span className="text-gray-600 text-xs w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${entry.domain === yourDomain ? 'text-indigo-300 font-medium' : 'text-gray-300'}`}>
                    {entry.domain}
                    {entry.domain === yourDomain && <span className="ml-1.5 text-xs bg-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded">You</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{entry.rate}%</div>
                  <div className="text-xs text-gray-500">{entry.citations} citations</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
