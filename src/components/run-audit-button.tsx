'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RunAuditButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/start-audit`, { method: 'POST' });
      const text = await res.text();
      let body: { auditId?: string; error?: string } = {};
      try { body = text ? JSON.parse(text) : {}; } catch { /* empty */ }

      if (res.status === 409 && body.auditId) {
        // Already running — just show the progress bar
        router.push(`/app/projects/${projectId}?auditId=${body.auditId}`);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? `Server error (${res.status})`);
        return;
      }
      router.push(`/app/projects/${projectId}?auditId=${body.auditId}`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? (
          <>
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Starting…
          </>
        ) : (
          <>▶ Run Audit</>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
