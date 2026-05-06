'use client';

import { useEffect, useRef, useState } from 'react';

const STEPS = [
  'Crawling domain',
  'Checking schema markup',
  'Analysing content quality',
  'Evaluating E-E-A-T signals',
  'Running AI citation checks',
  'Auditing competitors',
  'Building report',
];

type AuditStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';

interface StatusResponse {
  status: AuditStatus;
  progress: number;
  errorMessage?: string;
  logs: { message: string; createdAt: string }[];
}

// Parse crawl progress from log messages like "Fetching 3/10: https://..."
function parseCrawlProgress(logs: { message: string }[]): {
  current: number;
  total: number;
  currentUrl: string;
} | null {
  // find the last "Fetching N/M: url" message
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i].message.match(/^Fetching (\d+)\/(\d+):\s+(.+)$/);
    if (m) {
      return { current: parseInt(m[1]), total: parseInt(m[2]), currentUrl: m[3] };
    }
  }
  return null;
}

// Parse AI check progress from log messages like "Checking "keyword" via serpapi…"
function parseAiProgress(logs: { message: string }[]): {
  checked: number;
  total: number;
  current: string;
} | null {
  let total = 0;
  let checked = 0;
  let current = '';
  for (const l of logs) {
    const checking = l.message.match(/^Checking "(.+)" via/);
    if (checking) { total++; current = checking[1]; }
    const done = l.message.match(/^[✅❌].+ via .+:/);
    if (done) checked++;
  }
  if (total === 0) return null;
  return { checked, total, current };
}

export default function AuditProgress({ auditId }: { auditId: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(5_000);

  function scheduleNext(status: AuditStatus | null) {
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (status === 'DONE' || status === 'FAILED') return;
    const delay = status === 'RUNNING' ? 3_000 : Math.min(delayRef.current * 1.5, 30_000);
    delayRef.current = delay;
    intervalRef.current = setTimeout(poll, delay);
  }

  async function poll() {
    try {
      const res = await fetch(`/api/audits/${auditId}/status`);
      if (!res.ok) { scheduleNext(null); return; }
      const json: StatusResponse = await res.json();
      setData(json);
      scheduleNext(json.status);
    } catch {
      scheduleNext(null);
    }
  }

  useEffect(() => {
    poll();
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  if (!data) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
        <div className="h-2 bg-white/10 rounded w-full" />
      </div>
    );
  }

  const isDone = data.status === 'DONE';
  const isFailed = data.status === 'FAILED';
  const completedSteps = Math.floor((data.progress / 100) * STEPS.length);

  // Detect which step is currently active
  const isCrawling = data.logs.some(l => l.message.startsWith('Started: Crawling')) &&
    !data.logs.some(l => l.message.startsWith('Done: Crawling'));
  const isAiChecking = data.logs.some(l => l.message.startsWith('Started: Running AI')) &&
    !data.logs.some(l => l.message.startsWith('Done: Running AI'));

  const crawlProgress = isCrawling ? parseCrawlProgress(data.logs) : null;
  const aiProgress = isAiChecking ? parseAiProgress(data.logs) : null;

  // Count crawled pages from logs
  const crawlDoneMsg = data.logs.find(l => l.message.startsWith('✅ Crawled'));
  const totalCrawled = crawlDoneMsg
    ? parseInt(crawlDoneMsg.message.match(/Crawled (\d+)/)?.[1] ?? '0')
    : crawlProgress?.current ?? 0;

  return (
    <div className={`rounded-xl border p-6 mb-6 ${
      isFailed ? 'border-red-500/40 bg-red-500/5' :
      isDone   ? 'border-green-500/40 bg-green-500/5' :
                 'border-white/10 bg-white/5'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-sm text-white">
          {isDone ? '✅ Audit complete' : isFailed ? '❌ Audit failed' : '⚙️ Running audit…'}
        </span>
        <span className="text-xs text-white/50">{data.progress}%</span>
      </div>

      {/* Main progress bar */}
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            isFailed ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${data.progress}%` }}
        />
      </div>

      {/* Step checklist */}
      <ul className="space-y-1.5 mb-4">
        {STEPS.map((step, i) => {
          const done = i < completedSteps;
          const active = i === completedSteps && !isDone && !isFailed;
          return (
            <li key={step}>
              <div className={`flex items-center gap-2 text-xs ${
                done ? 'text-white/80' : active ? 'text-white' : 'text-white/30'
              }`}>
                {done ? (
                  <span className="text-green-400">✓</span>
                ) : active ? (
                  <span className="animate-spin inline-block w-3 h-3 border border-indigo-400 border-t-transparent rounded-full" />
                ) : (
                  <span className="w-3 h-3 rounded-full border border-white/20 inline-block" />
                )}
                {step}
                {/* Crawl page count badge */}
                {step === 'Crawling domain' && (done || active) && totalCrawled > 0 && (
                  <span className="ml-1 text-white/40">
                    {done ? `${totalCrawled} pages` : `${crawlProgress?.current ?? 0}/${crawlProgress?.total ?? '?'} pages`}
                  </span>
                )}
                {/* AI check badge */}
                {step === 'Running AI citation checks' && (done || active) && aiProgress && (
                  <span className="ml-1 text-white/40">
                    {aiProgress.checked}/{aiProgress.total} keywords
                  </span>
                )}
              </div>

              {/* Crawl sub-progress (only shown while crawling) */}
              {step === 'Crawling domain' && active && crawlProgress && (
                <div className="mt-2 ml-5">
                  {/* Mini progress bar */}
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-1.5 w-48">
                    <div
                      className="h-full rounded-full bg-indigo-400/60 transition-all duration-500"
                      style={{ width: `${Math.round((crawlProgress.current / crawlProgress.total) * 100)}%` }}
                    />
                  </div>
                  {/* Current URL being fetched */}
                  <p className="text-[10px] text-white/30 font-mono truncate max-w-xs">
                    {crawlProgress.currentUrl}
                  </p>
                </div>
              )}

              {/* AI check sub-progress (only shown while running AI checks) */}
              {step === 'Running AI citation checks' && active && aiProgress && aiProgress.current && (
                <div className="mt-1.5 ml-5">
                  <p className="text-[10px] text-white/30 font-mono">
                    checking &quot;{aiProgress.current}&quot;…
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Error message */}
      {isFailed && data.errorMessage && (
        <p className="text-xs text-red-400 mb-3">Error: {data.errorMessage}</p>
      )}

      {/* Logs toggle */}
      {data.logs.length > 0 && (
        <button
          onClick={() => setShowLogs((v) => !v)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {showLogs ? '▾ Hide log' : `▸ Show log (${data.logs.length})`}
        </button>
      )}
      {showLogs && (
        <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto font-mono text-[11px] text-white/50">
          {data.logs.map((l, i) => (
            <li key={i} className={
              l.message.startsWith('✅') ? 'text-green-400/70' :
              l.message.startsWith('❌') ? 'text-red-400/70' :
              l.message.startsWith('⚠️') ? 'text-yellow-400/70' :
              l.message.startsWith('Fetching') ? 'text-indigo-300/50' :
              ''
            }>{l.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
