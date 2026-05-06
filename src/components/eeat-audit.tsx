'use client'

import { useEffect, useState } from 'react'

interface EeatSignal {
  id: string
  signal: string
  label: string
  passed: boolean
  severity: string
  evidence: string | null
  value: string | null
  fixSuggestion: string | null
}

interface EeatAuditProps {
  auditId: string
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border border-red-500/30',
  warning:  'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  info:     'bg-blue-500/20 text-blue-300 border border-blue-500/30',
}

const SIGNAL_WEIGHT_LABEL: Record<string, string> = {
  author_schema:             'Highest impact',
  author_page:               'High impact',
  https:                     'High impact',
  about_page:                'Medium impact',
  contact_info:              'Medium impact',
  last_updated:              'Medium impact',
  outbound_authority_links:  'Medium impact',
  privacy_policy:            'Lower impact',
  terms_of_service:          'Lower impact',
}

function ScoreGauge({ score }: { score: number }) {
  const colour = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 45
  const offset = circumference * (1 - score / 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#374151" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="45" fill="none"
          stroke={colour} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="60" y="60" textAnchor="middle" dominantBaseline="middle"
          fill={colour} fontSize="22" fontWeight="bold">{score}</text>
        <text x="60" y="78" textAnchor="middle" fill="#9ca3af" fontSize="10">/100</text>
      </svg>
      <span className="text-sm text-gray-400">E-E-A-T Score</span>
    </div>
  )
}

export function EeatAudit({ auditId }: EeatAuditProps) {
  const [signals, setSignals] = useState<EeatSignal[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/audits/${auditId}/eeat`)
      .then(r => r.json())
      .then(data => {
        setSignals(data.signals ?? [])
        setScore(data.score ?? null)
      })
      .finally(() => setLoading(false))
  }, [auditId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Loading E-E-A-T signals…
      </div>
    )
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-3">🔍</div>
        <p className="font-medium text-gray-300">No E-E-A-T data yet</p>
        <p className="text-sm mt-1">Run an audit to detect authority and trust signals.</p>
      </div>
    )
  }

  const passed = signals.filter(s => s.passed).length
  const failed = signals.filter(s => !s.passed)
  const criticalFails = failed.filter(s => s.severity === 'critical')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-6 bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        {score !== null && <ScoreGauge score={score} />}
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-white">E-E-A-T Signals</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {passed}/{signals.length} signals passing
              {criticalFails.length > 0 && (
                <span className="ml-2 text-red-400">· {criticalFails.length} critical issue{criticalFails.length !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Passing', count: passed, colour: 'text-green-400' },
              { label: 'Failing', count: signals.length - passed, colour: 'text-red-400' },
              { label: 'Critical', count: criticalFails.length, colour: 'text-orange-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900/60 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${s.colour}`}>{s.count}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signals table */}
      <div className="space-y-2">
        {signals.map(signal => (
          <div
            key={signal.id}
            className={`rounded-lg border transition-colors ${
              signal.passed
                ? 'border-green-500/20 bg-green-500/5'
                : signal.severity === 'critical'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-gray-700 bg-gray-800/30'
            }`}
          >
            {/* Row header */}
            <button
              onClick={() => setExpanded(expanded === signal.id ? null : signal.id)}
              className="w-full flex items-center gap-3 p-4 text-left"
            >
              {/* Pass/fail icon */}
              <span className="text-lg flex-shrink-0">
                {signal.passed ? '✅' : signal.severity === 'critical' ? '🔴' : '🟡'}
              </span>

              {/* Label */}
              <span className="flex-1 font-medium text-sm text-gray-200">{signal.label}</span>

              {/* Impact badge */}
              <span className="text-xs text-gray-500 hidden sm:block">
                {SIGNAL_WEIGHT_LABEL[signal.signal] ?? ''}
              </span>

              {/* Severity badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[signal.severity] ?? ''}`}>
                {signal.severity}
              </span>

              {/* Value pill */}
              {signal.value && (
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                  {signal.value}
                </span>
              )}

              {/* Expand chevron */}
              {(!signal.passed || signal.evidence) && (
                <svg
                  className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${expanded === signal.id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {/* Expanded detail */}
            {expanded === signal.id && (
              <div className="px-4 pb-4 pt-0 space-y-2 border-t border-gray-700/50">
                {signal.evidence && (
                  <div className="text-xs text-gray-400 bg-gray-900/60 rounded p-2 font-mono break-all">
                    {signal.evidence}
                  </div>
                )}
                {!signal.passed && signal.fixSuggestion && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-blue-400 flex-shrink-0">💡</span>
                    <span className="text-gray-300">{signal.fixSuggestion}</span>
                  </div>
                )}
                {signal.passed && (
                  <div className="text-xs text-green-400">✓ This signal is passing — no action needed.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
