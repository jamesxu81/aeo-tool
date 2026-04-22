'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: number;
  email: string;
  domain: string | null;
  keyword_count: number | null;
  role: string | null;
  source: string | null;
  created_at: string;
}

export default function AdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/waitlist')
      .then(async (r) => {
        if (!r.ok) throw new Error('Not authorized or error fetching');
        return r.json();
      })
      .then((data) => {
        setRows(data.rows || []);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Waitlist signups</h1>
          <a
            href="/api/admin/waitlist?format=csv"
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            Export CSV
          </a>
        </div>

        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : error ? (
          <p className="text-red-400">⚠ {error}</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-400">{rows.length} total</p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-left text-slate-300">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2"># kw</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-500">{r.id}</td>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2 text-slate-400">{r.domain || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.keyword_count ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.role || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.source || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{r.created_at}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        No signups yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
