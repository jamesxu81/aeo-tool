import WaitlistForm from '@/components/waitlist-form';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500 font-bold">
            A
          </div>
          <span className="font-semibold tracking-tight">AEO Tool</span>
        </div>
        <nav className="hidden gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-12 md:pt-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              Private beta — Q2 2026
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              See if <span className="text-indigo-400">ChatGPT</span> &{' '}
              <span className="text-indigo-400">Perplexity</span> cite your site.
            </h1>
            <p className="mt-5 text-lg text-slate-300">
              AI search is reshaping traffic. Find out which keywords trigger AI answers
              about your brand — and whether you&apos;re being cited, ignored, or outranked by
              competitors.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-300">
              <li>✅ AI citation check across ChatGPT, Perplexity, Google AI Overview</li>
              <li>✅ Full AEO technical audit (Schema, E-E-A-T, answerability)</li>
              <li>✅ Side-by-side competitor gap analysis + PDF report</li>
            </ul>
          </div>

          {/* Signup card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-xl font-semibold">Get early access</h2>
            <p className="mt-1 text-sm text-slate-400">
              Join the waitlist — early signups get <b className="text-indigo-300">$50 off</b> the first report.
            </p>
            <div className="mt-5">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          What you get in each report
        </h2>
        <p className="mt-3 text-center text-slate-400">
          One $99 report. Everything you need to fix your AI search visibility.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: '🔍',
              title: 'AI Citation Detection',
              desc:
                'We run your keywords through ChatGPT, Perplexity, Google AI Overview and Gemini. You see exactly where you\'re cited — and where competitors are winning.',
            },
            {
              icon: '🧪',
              title: 'AEO Technical Audit',
              desc:
                'Schema validation, content answerability, E-E-A-T signals, authority score. Every finding comes with evidence and a fix suggestion.',
            },
            {
              icon: '⚔️',
              title: 'Competitor Gap Analysis',
              desc:
                'Pick 2 competitors. We run them through the same pipeline and diff. See the citation gap, content gap, and authority gap in one view.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            { step: '1', title: 'Enter domain + keywords', desc: 'Up to 20 keywords, 2 competitor domains.' },
            { step: '2', title: 'We crawl + audit', desc: 'Playwright + schema/content/E-E-A-T rule engine.' },
            { step: '3', title: 'We query the AIs', desc: 'Perplexity, Google AI Overview, ChatGPT-via-API.' },
            { step: '4', title: 'You get the PDF', desc: 'Report in 10–30 min. Email notification.' },
          ].map((s) => (
            <div key={s.step} className="rounded-xl border border-slate-800 p-5">
              <div className="text-indigo-400">Step {s.step}</div>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-3xl px-6 py-20">
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-transparent p-8 text-center">
          <h2 className="text-3xl font-bold">Simple pricing</h2>
          <div className="mt-6 text-5xl font-bold">
            $99<span className="ml-2 text-lg font-medium text-slate-400">/ report</span>
          </div>
          <p className="mt-3 text-slate-400">One domain, up to 20 keywords, 2 competitors.</p>
          <p className="mt-2 text-sm text-indigo-300">Waitlist members save $50 on the first report.</p>
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-slate-300">
            <li>✓ Full AI citation matrix (4 providers)</li>
            <li>✓ Technical + E-E-A-T audit</li>
            <li>✓ 2 competitor comparisons</li>
            <li>✓ PDF + shareable web report</li>
            <li>✓ Prioritized fix recommendations</li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">FAQ</h2>
        <div className="mt-10 space-y-6">
          {[
            {
              q: 'How do you know if ChatGPT cites my site?',
              a: 'We query each AI provider programmatically through their public APIs (Perplexity Sonar, Google AI Overview via SerpAPI, OpenAI with web_search). We run each query multiple times and take the union — AI answers are non-deterministic.',
            },
            {
              q: 'Is this the exact same as what users see in ChatGPT?',
              a: 'Very close but not 100% identical. API results match UI semantics but can differ. Every report discloses this clearly with evidence.',
            },
            {
              q: 'When will it be ready?',
              a: 'Private beta opens Q2 2026. Waitlist signups get first access and a $50 discount.',
            },
            {
              q: 'Do you actually change my site?',
              a: 'No. We only produce a report with evidence and recommendations. You decide what to implement.',
            },
          ].map((f) => (
            <div key={f.q} className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} AEO Tool. Built for AI-first search.
      </footer>
    </main>
  );
}
