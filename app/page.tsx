"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseGithubRepoUrl } from '../lib/github';

const examples = ['vercel/next.js', 'facebook/react', 'nestjs/nest'];

export default function HomePage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const parsed = parseGithubRepoUrl(repoInput);
    if (!parsed) {
      setError('Enter a valid GitHub repository URL or owner/repo string.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/repo?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`);
      if (!res.ok) {
        const body = await res.json();
        setError(body?.error ?? 'Repository not found.');
        setLoading(false);
        return;
      }
      router.push(`/chat?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`);
    } catch (e) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const applyExample = (example: string) => {
    setRepoInput(example);
    setError('');
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-4xl font-bold text-white text-center">RepoChat</h1>
        <p className="mt-3 text-slate-300 text-center">Paste a public GitHub repo and chat with its code.</p>

        <form className="mt-8" onSubmit={onSubmit}>
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="github.com/owner/repo or owner/repo"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 px-4 focus:border-violet-500 focus:outline-none"
            aria-label="Repository URL"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Validating...' : 'Open Repo Chat'}
          </button>
        </form>

        <div className="mt-6">
          <p className="text-slate-400">Try an example:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => applyExample(example)}
                className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-rose-950 p-3 text-rose-200">{error}</div>}
      </div>
    </main>
  );
}
