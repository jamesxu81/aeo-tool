'use client';

import { useState } from 'react';

export default function WaitlistForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      email: String(fd.get('email') || '').trim(),
      domain: String(fd.get('domain') || '').trim(),
      keywordCount: fd.get('keywordCount') ? Number(fd.get('keywordCount')) : undefined,
      role: String(fd.get('role') || '') || undefined,
      source: 'landing',
    };
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus('err');
        setErrorMsg(body?.error || 'Something went wrong');
        return;
      }
      setStatus('ok');
    } catch (err) {
      setStatus('err');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  }

  if (status === 'ok') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <div className="text-2xl">✅</div>
        <h3 className="mt-2 text-lg font-semibold text-emerald-300">You&apos;re on the list</h3>
        <p className="mt-1 text-sm text-emerald-200/80">
          We&apos;ll email you when the first reports are ready. Early signups get $50 off.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">Work email *</label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500 focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">Your domain</label>
        <input
          name="domain"
          type="text"
          placeholder="example.com"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500 focus:ring-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300"># keywords</label>
          <input
            name="keywordCount"
            type="number"
            min="0"
            max="10000"
            placeholder="20"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Role</label>
          <select
            name="role"
            defaultValue=""
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500 focus:ring-2"
          >
            <option value="">Select…</option>
            <option value="in-house">In-house SEO / Growth</option>
            <option value="agency">SEO Agency</option>
            <option value="content">Content team</option>
            <option value="founder">Founder</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full rounded-md bg-indigo-500 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
      >
        {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {status === 'err' && errorMsg ? (
        <p className="text-sm text-red-400">⚠ {errorMsg}</p>
      ) : null}
      <p className="text-xs text-slate-500">
        We&apos;ll only email you about the launch. No spam.
      </p>
    </form>
  );
}
