'use client'

import { useState, useMemo } from 'react'

interface Page {
  id: string
  url: string
  title: string | null
  h1: string | null
  metaDescription: string | null
  wordCount: number | null
  hasSchemaJsonLd: boolean
  schemaTypes: string[]
  statusCode: number | null
  crawledAt: string
}

interface CrawledPagesProps {
  pages: Page[]
  domain: string
}

export function CrawledPages({ pages, domain }: CrawledPagesProps) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'url' | 'wordCount' | 'status'>('url')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'schema' | 'noschema' | 'error'>('all')

  const filtered = useMemo(() => {
    let result = pages.filter((p) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        p.url.toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.h1 ?? '').toLowerCase().includes(q)
      const matchFilter =
        filter === 'all' ||
        (filter === 'schema' && p.hasSchemaJsonLd) ||
        (filter === 'noschema' && !p.hasSchemaJsonLd) ||
        (filter === 'error' && p.statusCode !== 200)
      return matchSearch && matchFilter
    })

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'url') cmp = a.url.localeCompare(b.url)
      else if (sortBy === 'wordCount') cmp = (a.wordCount ?? 0) - (b.wordCount ?? 0)
      else if (sortBy === 'status') cmp = (a.statusCode ?? 0) - (b.statusCode ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [pages, search, sortBy, sortDir, filter])

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir('asc') }
  }

  const schemaCount = pages.filter((p) => p.hasSchemaJsonLd).length
  const errorCount = pages.filter((p) => p.statusCode !== 200).length
  const avgWords = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.wordCount ?? 0), 0) / pages.length)
    : 0

  const statusBadge = (code: number | null) => {
    if (!code) return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-700 text-gray-400">—</span>
    if (code === 200) return <span className="px-1.5 py-0.5 rounded text-xs bg-green-900 text-green-300">200</span>
    if (code >= 300 && code < 400) return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">{code}</span>
    return <span className="px-1.5 py-0.5 rounded text-xs bg-red-900 text-red-300">{code}</span>
  }

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return <span className="text-gray-600 ml-1">↕</span>
    return <span className="text-indigo-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-gray-400 text-sm">No pages crawled yet.</p>
        <p className="text-gray-600 text-xs mt-1">Run an audit to discover pages from {domain}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Pages crawled', value: pages.length, icon: '📄' },
          { label: 'With schema markup', value: `${schemaCount} (${Math.round(schemaCount / pages.length * 100)}%)`, icon: '🧱' },
          { label: 'Errors', value: errorCount, icon: errorCount > 0 ? '⚠️' : '✅', red: errorCount > 0 },
          { label: 'Avg word count', value: avgWords.toLocaleString(), icon: '📝' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 mb-1">{s.icon} {s.label}</p>
            <p className={`text-xl font-bold ${s.red ? 'text-red-400' : 'text-white'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search URLs, titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        {(['all', 'schema', 'noschema', 'error'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              filter === f
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'schema' ? '✓ Has Schema' : f === 'noschema' ? '✗ No Schema' : '⚠ Errors'}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} of {pages.length}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th
                className="text-left px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort('url')}
              >
                URL {sortIcon('url')}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Title / H1</th>
              <th
                className="text-right px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort('wordCount')}
              >
                Words {sortIcon('wordCount')}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Schema</th>
              <th
                className="text-center px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort('status')}
              >
                Status {sortIcon('status')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((page) => (
              <>
                <tr
                  key={page.id}
                  onClick={() => setExpanded(expanded === page.id ? null : page.id)}
                  className="bg-gray-950 hover:bg-gray-900 cursor-pointer transition-colors"
                >
                  {/* URL */}
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-indigo-400 truncate text-xs font-mono">
                      {page.url.replace(/^https?:\/\//, '')}
                    </p>
                  </td>
                  {/* Title / H1 */}
                  <td className="px-4 py-3 max-w-sm">
                    <p className="text-white text-xs truncate">{page.title || <span className="text-gray-600">—</span>}</p>
                    {page.h1 && page.h1 !== page.title && (
                      <p className="text-gray-500 text-xs truncate mt-0.5">H1: {page.h1}</p>
                    )}
                  </td>
                  {/* Word count */}
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-mono ${
                      (page.wordCount ?? 0) < 300 ? 'text-yellow-400' :
                      (page.wordCount ?? 0) > 1000 ? 'text-green-400' : 'text-gray-300'
                    }`}>
                      {page.wordCount?.toLocaleString() ?? '—'}
                    </span>
                  </td>
                  {/* Schema */}
                  <td className="px-4 py-3">
                    {page.hasSchemaJsonLd ? (
                      <div className="flex flex-wrap gap-1">
                        {page.schemaTypes.slice(0, 2).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-xs bg-indigo-900 text-indigo-300">{t}</span>
                        ))}
                        {page.schemaTypes.length > 2 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400">+{page.schemaTypes.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {statusBadge(page.statusCode)}
                  </td>
                </tr>
                {/* Expanded row */}
                {expanded === page.id && (
                  <tr key={`${page.id}-expanded`} className="bg-gray-900">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-gray-500 mb-1">Full URL</p>
                          <a href={page.url} target="_blank" rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline break-all" onClick={e => e.stopPropagation()}>
                            {page.url}
                          </a>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Meta description</p>
                          <p className="text-gray-300">{page.metaDescription || <span className="text-gray-600">Not set</span>}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Schema types</p>
                          {page.hasSchemaJsonLd ? (
                            <div className="flex flex-wrap gap-1">
                              {page.schemaTypes.map((t) => (
                                <span key={t} className="px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-300">{t}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-red-400">No JSON-LD schema found</span>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Crawled at</p>
                          <p className="text-gray-300">{new Date(page.crawledAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
