'use client'

import { useEffect, useState } from 'react'

interface Recommendation {
  id: string
  category: string
  title: string
  description: string
  impact: number
  effort: number
  priority: number
}

function ImpactBadge({ value }: { value: number }) {
  const label = value >= 4 ? 'High' : value >= 3 ? 'Medium' : 'Low'
  const cls = value >= 4 ? 'bg-red-500/15 text-red-400' : value >= 3 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-gray-700 text-gray-400'
  return <span className={`${cls} text-xs px-2 py-0.5 rounded-full font-medium`}>Impact: {label}</span>
}

function EffortBadge({ value }: { value: number }) {
  const label = value <= 2 ? 'Low' : value <= 3 ? 'Medium' : 'High'
  const cls = value <= 2 ? 'bg-green-500/15 text-green-400' : value <= 3 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-orange-500/15 text-orange-400'
  return <span className={`${cls} text-xs px-2 py-0.5 rounded-full font-medium`}>Effort: {label}</span>
}

const CATEGORY_ICONS: Record<string, string> = {
  schema: '🏷️',
  content: '📝',
  eeat: '🛡️',
  citation: '🤖',
  technical: '⚙️',
}

export function Recommendations({ auditId, onDownloadPdf }: { auditId: string; onDownloadPdf?: () => void }) {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch(`/api/audits/${auditId}/recommendations`)
      .then((r) => r.json())
      .then((d) => setRecs(d.recommendations ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [auditId])

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try {
      const res = await fetch(`/api/audits/${auditId}/report.pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'PDF generation failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aeo-report-${auditId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onDownloadPdf?.()
    } catch (e) {
      alert('Failed to download PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const categories = ['all', ...Array.from(new Set(recs.map((r) => r.category)))]
  const filtered = filter === 'all' ? recs : recs.filter((r) => r.category === filter)

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Loading recommendations…</div>
  if (error) return <div className="text-red-400 text-sm py-8 text-center">Failed to load: {error}</div>

  return (
    <div className="space-y-6">
      {/* Header + download */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Top Recommendations</h3>
          <p className="text-xs text-gray-400 mt-0.5">Sorted by impact × effort priority score</p>
        </div>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {pdfLoading ? (
            <><span className="animate-spin">⏳</span> Generating…</>
          ) : (
            <><span>📄</span> Download PDF Report</>
          )}
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">💡</div>
          <div className="text-gray-300 font-medium">No recommendations yet</div>
          <div className="text-gray-500 text-sm mt-1">Run a full audit to generate personalised recommendations.</div>
        </div>
      ) : (
        <>
          {/* Impact × Effort matrix overview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="text-green-400 font-medium text-sm mb-1">🚀 Quick Wins</div>
              <div className="text-xs text-gray-400 mb-3">High impact · Low effort</div>
              <div className="space-y-1">
                {recs.filter((r) => r.impact >= 4 && r.effort <= 2).slice(0, 3).map((r) => (
                  <div key={r.id} className="text-xs text-gray-300 truncate">· {r.title}</div>
                ))}
                {recs.filter((r) => r.impact >= 4 && r.effort <= 2).length === 0 && (
                  <div className="text-xs text-gray-600">None identified</div>
                )}
              </div>
            </div>
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <div className="text-yellow-400 font-medium text-sm mb-1">📅 Plan Next</div>
              <div className="text-xs text-gray-400 mb-3">High impact · Higher effort</div>
              <div className="space-y-1">
                {recs.filter((r) => r.impact >= 4 && r.effort >= 3).slice(0, 3).map((r) => (
                  <div key={r.id} className="text-xs text-gray-300 truncate">· {r.title}</div>
                ))}
                {recs.filter((r) => r.impact >= 4 && r.effort >= 3).length === 0 && (
                  <div className="text-xs text-gray-600">None identified</div>
                )}
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors capitalize ${
                  filter === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {CATEGORY_ICONS[cat] ?? '🔧'} {cat === 'all' ? `All (${recs.length})` : cat}
              </button>
            ))}
          </div>

          {/* Recommendation list */}
          <div className="space-y-3">
            {filtered.map((rec, i) => (
              <div key={rec.id} className="bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-xl p-4 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {rec.priority}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm mb-1">{rec.title}</div>
                    <div className="text-xs text-gray-400 mb-2 leading-relaxed">{rec.description}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <ImpactBadge value={rec.impact} />
                      <EffortBadge value={rec.effort} />
                      <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full capitalize">
                        {CATEGORY_ICONS[rec.category] ?? '🔧'} {rec.category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
