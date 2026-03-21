"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type RepoMetadata = {
  name: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  html_url: string;
  forks: number;
  open_issues: number;
};

type RepoData = {
  owner: string;
  repo: string;
  metadata: RepoMetadata;
  fileCount: number;
  files: string[];
  readme: string;
};

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function ReposChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');
  const firstAuto = useRef(true);

  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [status, setStatus] = useState<'idle' | 'step1' | 'step2' | 'step3' | 'step4' | 'ready'>('idle');
  const [error, setError] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setError('Missing owner and repo parameters.');
      return;
    }

    const loadRepo = async () => {
      try {
        setStatus('step1');
        const raw = await fetch(`/api/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        if (!raw.ok) {
          const body = await raw.json();
          setError(body?.error || 'Repo not found');
          return;
        }

        const data: RepoData = await raw.json();
        setStatus('step2');

        // fake segment timing to show steps
        await new Promise((resolve) => setTimeout(resolve, 350));
        setStatus('step3');
        await new Promise((resolve) => setTimeout(resolve, 350));
        setStatus('step4');
        await new Promise((resolve) => setTimeout(resolve, 350));
        setRepoData(data);
        setStatus('ready');
      } catch (e: any) {
        setError('Failed to load repository.');
      }
    };

    loadRepo();
  }, [owner, repo]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, assistantDraft]);

  const detectedSuggestions = useMemo(() => {
    if (!repoData) return [];
    const files = repoData.files;
    const hasDocker = files.some((f) => f.toLowerCase().includes('dockerfile'));
    const hasTests = files.some((f) => /\btest\b/i.test(f) || f.includes('__tests__') || f.includes('jest.config') || f.includes('pytest.ini'));
    const hasApi = files.some((f) => f.includes('api/') || f.includes('/api/') || f.includes('pages/api'));
    const hasPrisma = files.some((f) => f.includes('prisma/schema.prisma'));
    const out = ['What are the entry points of this repo?', 'How do I run this project locally?', 'What parts are needed to deploy this app?'];
    if (hasDocker) out.push('How can I run this repository with Docker?');
    if (hasTests) out.push('What commands run the test suite?');
    if (hasApi) out.push('Where are the API routes and what do they do?');
    if (hasPrisma) out.push('Explain the database schema in this repository.');
    return out;
  }, [repoData]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-800 bg-slate-900 p-8">
          <h2 className="text-xl font-bold text-red-300">Error</h2>
          <p className="mt-2 text-red-100">{error}</p>
          <button onClick={() => router.push('/')} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 font-semibold">Back</button>
        </div>
      </main>
    );
  }

  if (!repoData || status !== 'ready') {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-8">
          <h2 className="text-2xl font-bold text-white">Loading repository</h2>
          <p className="mt-2 text-slate-300">{owner}/{repo}</p>
          <div className="mt-6 space-y-2">
            <div className={`h-3 w-full rounded-lg ${status === 'step1' ? 'bg-violet-500' : 'bg-slate-800'}`}>Fetching metadata</div>
            <div className={`h-3 w-full rounded-lg ${status === 'step2' ? 'bg-violet-500' : 'bg-slate-800'}`}>Reading README</div>
            <div className={`h-3 w-full rounded-lg ${status === 'step3' ? 'bg-violet-500' : 'bg-slate-800'}`}>Mapping file structure</div>
            <div className={`h-3 w-full rounded-lg ${status === 'step4' ? 'bg-violet-500' : 'bg-slate-800'}`}>Preparing context</div>
          </div>
        </div>
      </main>
    );
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || streaming) return;
    const content = messageInput.trim();
    const userMessage: ChatMessage = { role: 'user', content };

    setMessages((prev) => [...prev, userMessage]);
    setMessageInput('');
    setAssistantDraft('');
    setStreaming(true);
    setTyping(true);

    const payload = {
      owner: repoData.owner,
      repo: repoData.repo,
      messages: [...messages, userMessage],
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      setError('Failed to get response from AI.');
      setStreaming(false);
      setTyping(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullText += chunk;
      setAssistantDraft(fullText);
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: fullText }]);
    setAssistantDraft('');
    setStreaming(false);
    setTyping(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-4">
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <button className="mb-4 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={() => router.push('/')}>← New repo</button>
          <div className="rounded-xl bg-slate-950 p-4">
            <h2 className="text-lg font-bold text-white">{repoData.metadata.name}</h2>
            <p className="mt-2 text-slate-300">{repoData.metadata.description || 'No description available.'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-slate-800 px-2 py-1">⭐ {repoData.metadata.stars}</span>
              <span className="rounded-full bg-slate-800 px-2 py-1">{repoData.metadata.language || 'unknown'}</span>
              <span className="rounded-full bg-slate-800 px-2 py-1">{repoData.fileCount} files</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {repoData.metadata.topics?.map((topic) => (
                <span key={topic} className="rounded-full bg-violet-600 px-2 py-1 text-xs text-white">{topic}</span>
              ))}
            </div>
            <a className="mt-3 inline-block text-xs text-violet-300 hover:text-violet-100" href={repoData.metadata.html_url} target="_blank" rel="noreferrer">Open on GitHub</a>
          </div>
        </section>

        <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div ref={scrollRef} className="relative mb-3 flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 scrollbar-thin">
            {messages.length === 0 && !assistantDraft && (
              <div className="text-slate-400">
                <p className="font-semibold">Welcome to RepoChat</p>
                <p className="mt-2">Ask anything about the codebase. Suggested questions:</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                  {detectedSuggestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {messages.map((message, idx) => (
              <div key={idx} className={`max-w-[90%] rounded-xl p-3 ${message.role === 'user' ? 'ml-auto bg-violet-600 text-white' : 'mr-auto bg-slate-800 text-slate-100'}`}>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              </div>
            ))}

            {assistantDraft && (
              <div className="mr-auto rounded-xl bg-slate-800 p-3 text-slate-100">
                <div className="whitespace-pre-wrap text-sm">{assistantDraft}</div>
              </div>
            )}

            {typing && (
              <div className="mr-auto rounded-xl bg-slate-800 p-3 text-slate-200">
                <div className="flex gap-1 text-xs">
                  <span className="animate-bounce-custom">●</span>
                  <span className="animate-bounce-custom delay-75">●</span>
                  <span className="animate-bounce-custom delay-150">●</span>
                  Claude is crafting a response...
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question, press Enter to send (Shift+Enter newline)"
              className="min-h-[3rem] max-h-28 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Press Enter to send</span>
              <button
                onClick={() => void sendMessage()}
                disabled={!messageInput.trim() || streaming}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {streaming ? 'Streaming...' : 'Send'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white">Loading chat...</div>}>
      <ReposChatInner />
    </Suspense>
  );
}
