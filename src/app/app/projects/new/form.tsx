'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProjectForm() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);

    const fd = new FormData(e.currentTarget);
    const keywordsRaw = String(fd.get('keywords') || '');
    const competitorsRaw = String(fd.get('competitors') || '');

    const keywords = keywordsRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const competitors = competitorsRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);

    const payload = {
      name: String(fd.get('name') || '').trim(),
      domain: String(fd.get('domain') || '').trim(),
      keywords,
      competitors,
    };

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(body?.error || 'Failed to create project');
        return;
      }
      router.push(`/app/projects/${body.id}`);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">Project name *</label>
        <input
          name="name"
          required
          placeholder="Acme Marketing Site"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">Domain *</label>
        <input
          name="domain"
          required
          placeholder="acme.com"
          pattern="^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
        <p className="mt-1 text-xs text-slate-500">Just the domain — no https:// or path.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Keywords (1–20, one per line)
        </label>
        <textarea
          name="keywords"
          required
          rows={6}
          placeholder={'best project management tool for agencies\nhow to reduce bounce rate\n...'}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Competitors (0–2 domains, one per line)
        </label>
        <textarea
          name="competitors"
          rows={3}
          placeholder={'competitor-a.com\ncompetitor-b.com'}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 font-mono text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-md bg-indigo-500 px-5 py-2.5 font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
      >
        {status === 'submitting' ? 'Creating…' : 'Create project'}
      </button>
      {error ? <p className="text-sm text-red-400">⚠ {error}</p> : null}
    </form>
  );
}
