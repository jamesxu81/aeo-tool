import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/app" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-sm font-bold">
              A
            </span>
            AEO Tool
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-300">
            <Link href="/app" className="hover:text-white">Projects</Link>
            <Link href="/app/projects/new" className="hover:text-white">New</Link>
            <UserButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
