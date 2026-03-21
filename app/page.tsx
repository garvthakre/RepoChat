"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseGithubRepoUrl } from '../lib/github';

const EXAMPLES = [
  { label: 'vercel/next.js', desc: 'The React Framework' },
  { label: 'facebook/react', desc: 'UI Library' },
  { label: 'nestjs/nest', desc: 'Node.js Framework' },
  { label: 'tailwindlabs/tailwindcss', desc: 'CSS Framework' },
];

export default function HomePage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (value: string) => {
    setError('');
    const parsed = parseGithubRepoUrl(value || repoInput);
    if (!parsed) {
      setError('Enter a valid GitHub repository URL or owner/repo format.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/repo?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`
      );
      if (!res.ok) {
        const body = await res.json();
        setError(body?.error ?? 'Repository not found. Make sure it\'s public.');
        setLoading(false);
        return;
      }
      router.push(`/chat?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleSubmit(repoInput);
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 mb-5 shadow-lg shadow-violet-900/20">
            <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">RepoChat</h1>
          <p className="mt-3 text-slate-400 text-base leading-relaxed">
            Enter any public GitHub repository and chat with an AI<br />
            that understands its entire codebase.
          </p>
        </div>

        {/* Input card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
          <form onSubmit={onSubmit}>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              GitHub Repository
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <input
                value={repoInput}
                onChange={(e) => { setRepoInput(e.target.value); setError(''); }}
                placeholder="github.com/owner/repo or owner/repo"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                aria-label="Repository URL"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || !repoInput.trim()}
              className="mt-3 w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold text-sm text-white transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Validating repository...
                </>
              ) : (
                <>
                  Open RepoChat
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-3 rounded-lg bg-red-950/50 border border-red-800/50 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Examples */}
        <div className="mt-6">
          <p className="text-xs text-slate-500 text-center mb-3 uppercase tracking-wider">Try an example</p>
          <div className="grid grid-cols-2 gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => {
                  setRepoInput(ex.label);
                  void handleSubmit(ex.label);
                }}
                disabled={loading}
                className="rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-slate-700 px-4 py-3 text-left transition-colors disabled:opacity-50 group"
              >
                <div className="text-xs font-mono text-violet-400 group-hover:text-violet-300 transition-colors">{ex.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{ex.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-600">
          Made with ❤️ by <a href="https://github.com/garvthakre" className="text-violet-500 hover:underline" target="_blank" rel="noopener noreferrer">Garv Thakre</a>. Open source on <a href="https://github.com/garvthakre/repochat" className="text-violet-500 hover:underline" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </div>
    </main>
  );
}