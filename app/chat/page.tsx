"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
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

type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Simple markdown renderer for code blocks and basic formatting
function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang || 'code';
      return `<div class="code-wrapper"><div class="code-header"><span class="code-lang">${langLabel}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-wrapper').querySelector('code').innerText).then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500)})">Copy</button></div><pre><code>${code.trimEnd()}</code></pre></div>`;
    })
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/(<li class="md-li">.*<\/li>\n?)+/g, (match) => `<ul class="md-ul">${match}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-lg">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-md">
        <div
          className="prose-custom"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="ml-2 text-xs text-slate-400">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

const LOAD_STEPS = [
  { key: 'step1', label: 'Fetching repository metadata', icon: '🔍' },
  { key: 'step2', label: 'Reading README', icon: '📄' },
  { key: 'step3', label: 'Mapping file structure', icon: '🗂️' },
  { key: 'step4', label: 'Preparing AI context', icon: '🧠' },
];

function LoadingScreen({ owner, repo, status }: { owner: string; repo: string; status: string }) {
  const currentIdx = LOAD_STEPS.findIndex((s) => s.key === status);

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm">Loading Repository</h2>
              <p className="text-slate-400 text-xs font-mono">{owner}/{repo}</p>
            </div>
          </div>

          <div className="space-y-3">
            {LOAD_STEPS.map((step, idx) => {
              const done = currentIdx > idx;
              const active = currentIdx === idx;
              return (
                <div key={step.key} className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${active ? 'bg-violet-600/10 border border-violet-500/20' : done ? 'opacity-50' : 'opacity-30'}`}>
                  <span className="text-base">{done ? '✅' : step.icon}</span>
                  <span className={`text-sm ${active ? 'text-violet-200' : done ? 'text-slate-400' : 'text-slate-500'}`}>
                    {step.label}
                  </span>
                  {active && (
                    <div className="ml-auto flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

// Suggestions grid shown in the empty state — used on both desktop (sidebar) and mobile (inline)
function SuggestionsGrid({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
      {suggestions.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          disabled={disabled}
          className="text-left text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50 leading-relaxed"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function RepoChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') ?? '';
  const repo = searchParams.get('repo') ?? '';

  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [status, setStatus] = useState<'idle' | 'step1' | 'step2' | 'step3' | 'step4' | 'ready'>('idle');
  const [error, setError] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          setError(body?.error || 'Repository not found');
          return;
        }
        const data: RepoData = await raw.json();
        setStatus('step2');
        await new Promise((r) => setTimeout(r, 400));
        setStatus('step3');
        await new Promise((r) => setTimeout(r, 400));
        setStatus('step4');
        await new Promise((r) => setTimeout(r, 400));
        setRepoData(data);
        setStatus('ready');
      } catch {
        setError('Failed to load repository. Please check the URL and try again.');
      }
    };

    loadRepo();
  }, [owner, repo]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, assistantDraft]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [messageInput]);

  const detectedSuggestions = useMemo(() => {
    if (!repoData) return [];
    const files = repoData.files;
    const suggestions = [
      'What are the main entry points of this codebase?',
      'How do I run this project locally?',
      'What is the overall architecture of this project?',
    ];
    if (files.some((f) => /dockerfile/i.test(f))) suggestions.push('How can I run this with Docker?');
    if (files.some((f) => /\btest\b|__tests__|jest\.config|pytest\.ini|spec\./i.test(f))) suggestions.push('How do I run the test suite?');
    if (files.some((f) => /api\/|\/api\/|pages\/api/i.test(f))) suggestions.push('What API routes are available and what do they do?');
    if (files.some((f) => /prisma\/schema/i.test(f))) suggestions.push('Explain the Prisma database schema.');
    if (files.some((f) => /\.env\.example|\.env\.sample/i.test(f))) suggestions.push('What environment variables does this project need?');
    if (files.some((f) => /github\/workflows\//i.test(f))) suggestions.push('What CI/CD workflows are configured?');
    return suggestions;
  }, [repoData]);

  const sendMessage = useCallback(async (content?: string) => {
    const text = (content ?? messageInput).trim();
    if (!text || streaming) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setMessageInput('');
    setAssistantDraft('');
    setStreaming(true);

    try {
      const payload = {
        owner: repoData?.owner,
        repo: repoData?.repo,
        messages: [...messages, userMessage],
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        const errBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `❌ Error: ${errBody.error ?? 'Failed to get response'}` },
        ]);
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setAssistantDraft(fullText);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: fullText }]);
      setAssistantDraft('');
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ Network error. Please try again.' },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [messageInput, messages, repoData, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-slate-900 p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-300 mb-2">Error</h2>
          <p className="text-slate-300 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-2.5 font-semibold text-sm transition-colors"
          >
            ← Try Another Repo
          </button>
        </div>
      </main>
    );
  }

  if (!repoData || status !== 'ready') {
    return <LoadingScreen owner={owner} repo={repo} status={status} />;
  }

  const { metadata, fileCount } = repoData;
  const repoShortName = metadata.name.split('/').pop() ?? metadata.name;

  return (
    <main className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          ← New Repo
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span className="text-sm font-mono text-slate-200 truncate">{metadata.name}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-slate-500">
          <span className="hidden sm:inline">⭐ {metadata.stars.toLocaleString()}</span>
          {metadata.language && <span className="hidden sm:inline rounded-full bg-slate-800 px-2 py-0.5">{metadata.language}</span>}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Repo card */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <h3 className="font-semibold text-white text-sm mb-1">{metadata.name}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                {metadata.description || 'No description available.'}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                  ⭐ {metadata.stars.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                  🍴 {metadata.forks.toLocaleString()}
                </span>
                {metadata.open_issues > 0 && (
                  <span className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                    🐛 {metadata.open_issues}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                  📁 {fileCount} files
                </span>
                {metadata.language && (
                  <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700/30 rounded-full px-2 py-0.5">
                    {metadata.language}
                  </span>
                )}
              </div>
              {metadata.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {metadata.topics.slice(0, 8).map((topic) => (
                    <span key={topic} className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                      #{topic}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={metadata.html_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View on GitHub
              </a>
            </div>

            {/* Suggested questions — sidebar (desktop) */}
            {messages.length === 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Suggested Questions</p>
                <div className="space-y-1.5">
                  {detectedSuggestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => void sendMessage(q)}
                      disabled={streaming}
                      className="w-full text-left text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50 leading-relaxed"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
            {messages.length === 0 && !assistantDraft && (
              <div className="flex flex-col items-center justify-center h-full gap-5 px-2">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">💬</span>
                  </div>
                  <h3 className="font-semibold text-white mb-2">Chat with {repoShortName}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Ask anything about this codebase — architecture, how to run it, specific files, and more.
                  </p>
                </div>

                {/* Full suggestions grid — visible on ALL screen sizes */}
                <SuggestionsGrid
                  suggestions={detectedSuggestions}
                  onSelect={(q) => void sendMessage(q)}
                  disabled={streaming}
                />
              </div>
            )}

            {messages.map((message, idx) => (
              <MessageBubble key={idx} message={message} />
            ))}

            {/* Streaming draft */}
            {assistantDraft && (
              <div className="flex justify-start mb-4">
                <div className="max-w-[85%] bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-md">
                  <div
                    className="prose-custom"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(assistantDraft) }}
                  />
                  <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            )}

            {streaming && !assistantDraft && <TypingIndicator />}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex gap-2 items-end max-w-4xl mx-auto">
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${repoShortName}...`}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors min-h-[46px] max-h-[120px]"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!messageInput.trim() || streaming}
                className="flex-shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-white transition-colors"
                aria-label="Send message"
              >
                {streaming ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-center text-xs text-slate-600 mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    }>
      <RepoChatInner />
    </Suspense>
  );
}