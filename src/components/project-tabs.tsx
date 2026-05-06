'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface ProjectTabsProps {
  activeTab: string
  projectId: string
  counts: {
    pages: number
    aiChecks: number
    audits: number
    schemaFindings: number
    contentFindings: number
    eeatSignals: number
  }
}

const TABS = [
  { id: 'overview',  label: '📊 Overview',           countKey: null },
  { id: 'pages',     label: '🔗 Crawled Pages',       countKey: 'pages'           as const },
  { id: 'schema',    label: '🏷️ Schema',              countKey: 'schemaFindings'  as const },
  { id: 'content',   label: '📝 Content',             countKey: 'contentFindings' as const },
  { id: 'eeat',      label: '🛡️ E-E-A-T',            countKey: 'eeatSignals'     as const },
  { id: 'ai-checks',       label: '🤖 AI Checks',      countKey: 'aiChecks'        as const },
  { id: 'competitors',    label: '🏁 Competitors',    countKey: null },
  { id: 'recommendations',label: '💡 Recommendations',countKey: null },
  { id: 'audits',         label: '📋 History',        countKey: 'audits'          as const },
]

export function ProjectTabs({ activeTab, projectId, counts }: ProjectTabsProps) {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b border-gray-800 mt-6">
      {TABS.map((tab) => {
        const count = tab.countKey ? counts[tab.countKey] : null
        const isActive = activeTab === tab.id
        return (
          <Link
            key={tab.id}
            href={`${pathname}?tab=${tab.id}`}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            {tab.label}
            {count !== null && count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                isActive ? 'bg-indigo-500/30 text-indigo-300' : 'bg-gray-800 text-gray-400'
              }`}>
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
