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
type ContextStats = { filesLoaded: number; contextChars: number } | null;

// ---- Shareable link helpers --------------------------------------------------
// Conversation is encoded as base64url(JSON) in the URL hash: #chat=<token>
// Only role+content is stored; repoData always comes from the API/session.

function encodeMessages(messages: ChatMessage[]): string {
  try {
    const compact = messages.map((m) => [m.role === 'user' ? 'u' : 'a', m.content]);
    return btoa(encodeURIComponent(JSON.stringify(compact)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return ''; }
}

function decodeMessages(token: string): ChatMessage[] | null {
  try {
    const raw: [string, string][] = JSON.parse(
      decodeURIComponent(atob(token.replace(/-/g, '+').replace(/_/g, '/')))
    );
    return raw.map(([r, c]) => ({ role: r === 'u' ? 'user' : 'assistant', content: c }));
  } catch { return null; }
}

function buildShareUrl(owner: string, repo: string, messages: ChatMessage[]): string {
  const base = `${window.location.origin}/chat?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
  return messages.length ? `${base}#chat=${encodeMessages(messages)}` : base;
}

// ---- Markdown renderer -------------------------------------------------------
function renderMarkdown(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang || 'code';
      return `<div class="code-wrapper"><div class="code-header"><span class="code-lang">${l}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-wrapper').querySelector('code').innerText).then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500)})">Copy</button></div><pre><code>${code.trimEnd()}</code></pre></div>`;
    })
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/(<li class="md-li">.*<\/li>\n?)+/g, (m) => `<ul class="md-ul">${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ---- Message bubble ----------------------------------------------------------
function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
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
        <div className="prose-custom" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md">
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((d) => (
            <span key={d} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
          <span className="ml-2 text-xs text-slate-400">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

// ---- Loading screen ----------------------------------------------------------
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
                  <span className={`text-sm ${active ? 'text-violet-200' : done ? 'text-slate-400' : 'text-slate-500'}`}>{step.label}</span>
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

// ---- Suggestions grid --------------------------------------------------------
function SuggestionsGrid({ suggestions, onSelect, disabled }: { suggestions: string[]; onSelect: (q: string) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
      {suggestions.map((q) => (
        <button key={q} onClick={() => onSelect(q)} disabled={disabled}
          className="text-left text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50 leading-relaxed">
          {q}
        </button>
      ))}
    </div>
  );
}

// ---- File explorer -----------------------------------------------------------
type FileTree = { [key: string]: FileTree | null };

function buildTree(paths: string[]): FileTree {
  const root: FileTree = {};
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) { node[part] = null; }
      else { if (!node[part]) node[part] = {}; node = node[part] as FileTree; }
    }
  }
  return root;
}

function sortEntries(entries: [string, FileTree | null][]): [string, FileTree | null][] {
  return entries.sort(([an, av], [bn, bv]) => {
    if ((av !== null) !== (bv !== null)) return av !== null ? -1 : 1;
    return an.localeCompare(bn);
  });
}

function FileNode({
  name, node, depth, pathSoFar, onFileClick, onFileAsk,
}: {
  name: string; node: FileTree | null; depth: number; pathSoFar: string;
  onFileClick: (path: string) => void; onFileAsk: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const fullPath = pathSoFar ? `${pathSoFar}/${name}` : name;
  const isFile = node === null;

  if (isFile) {
    return (
      <div
        className="relative flex items-center group pr-1"
        style={{ paddingLeft: `${(depth + 1) * 10 + 6}px` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Click filename to show code */}
        <button
          onClick={() => onFileClick(fullPath)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-xs text-slate-400 hover:text-violet-300 rounded py-0.5 transition-colors"
          title={fullPath}
        >
          <span className="flex-shrink-0 opacity-50 group-hover:opacity-100">📄</span>
          <span className="truncate">{name}</span>
        </button>

        {/* "Ask →" pre-fills the textarea with "Explain what X does" */}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onFileAsk(fullPath); }}
            className="flex-shrink-0 ml-1 text-[10px] font-medium text-violet-400 hover:text-violet-200 bg-violet-900/40 hover:bg-violet-800/60 border border-violet-700/50 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
            title={`Ask about ${fullPath}`}
          >
            Ask →
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 rounded px-1.5 py-0.5 transition-colors"
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        <span className="flex-shrink-0 text-slate-500 w-3 text-center">{open ? '▾' : '▸'}</span>
        <span className="text-slate-500 flex-shrink-0">📁</span>
        <span className="truncate font-medium">{name}</span>
      </button>
      {open && (
        <div>
          {sortEntries(Object.entries(node as FileTree)).map(([childName, childNode]) => (
            <FileNode key={childName} name={childName} node={childNode} depth={depth + 1}
              pathSoFar={fullPath} onFileClick={onFileClick} onFileAsk={onFileAsk} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileExplorer({ files, onFileClick, onFileAsk }: { files: string[]; onFileClick: (p: string) => void; onFileAsk: (p: string) => void }) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="select-none">
      {sortEntries(Object.entries(tree)).map(([name, node]) => (
        <FileNode key={name} name={name} node={node} depth={0} pathSoFar=""
          onFileClick={onFileClick} onFileAsk={onFileAsk} />
      ))}
    </div>
  );
}

// ---- Context pill ------------------------------------------------------------
function ContextPill({ stats }: { stats: ContextStats }) {
  if (!stats) return null;
  const kb = Math.round(stats.contextChars / 1000);
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 border border-slate-700/60 rounded-full px-2.5 py-1"
      title={`${stats.filesLoaded} files · ${stats.contextChars.toLocaleString()} chars of context`}>
      <span className="text-slate-500">📄</span>
      <span>{stats.filesLoaded} file{stats.filesLoaded !== 1 ? 's' : ''} loaded</span>
      <span className="text-slate-600">·</span>
      <span>~{kb}k chars</span>
    </div>
  );
}

// ---- Share button ------------------------------------------------------------
function ShareButton({ owner, repo, messages }: { owner: string; repo: string; messages: ChatMessage[] }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');

  const handle = useCallback(async () => {
    const url = buildShareUrl(owner, repo, messages);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = Object.assign(document.createElement('input'), { value: url });
      document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
    }
    setState('copied');
    setTimeout(() => setState('idle'), 2000);
  }, [owner, repo, messages]);

  return (
    <button onClick={handle} title="Copy shareable link"
      className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-all ${
        state === 'copied'
          ? 'text-emerald-300 border-emerald-700/60 bg-emerald-900/20'
          : 'text-slate-400 hover:text-white border-slate-700 hover:border-slate-600'
      }`}>
      {state === 'copied' ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}

// ---- Onboarding guide modal --------------------------------------------------
const ONBOARDING_PROMPT = (repoName: string, files: string[], language: string) =>
  `You are an expert software engineer onboarding a new developer onto the repository "${repoName}".

Based on the repository context you have been given, produce a thorough onboarding checklist in clean Markdown.

Use EXACTLY this structure (keep the headings verbatim):

## 🚀 Getting Started
Numbered steps to clone, install dependencies, configure environment variables, and run the project locally. Be specific — include actual commands where possible.

## 📂 Key Files to Read First
A prioritised list of the most important files to understand the codebase. For each file include one sentence explaining why it matters. Pull from the actual file tree: ${files.slice(0, 40).join(', ')}.

## 🏗️ Architecture Overview
2–4 short paragraphs explaining how the major pieces fit together (frontend, backend, database, external services, etc.).

## ⚠️ Gotchas & Watch-Outs
A bullet list of non-obvious things that trip up new developers: environment quirks, deployment assumptions, known rough edges, unusual patterns in the codebase.

## 🧪 Running Tests
How to run the test suite, what testing framework is used, and any coverage gaps to be aware of.

## 📚 Useful Resources
Links or references mentioned in the README or config files that a new dev should bookmark.

Keep the tone practical and direct. Avoid padding. Format everything as clean Markdown that looks great when pasted into Notion, Confluence, or a GitHub wiki.`;

function OnboardingModal({
  repoData,
  onClose,
}: {
  repoData: RepoData;
  onClose: () => void;
}) {
  const [guide, setGuide]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied]     = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setGuide('');
    try {
      const prompt = ONBOARDING_PROMPT(
        repoData.metadata.name,
        repoData.files,
        repoData.metadata.language ?? 'unknown'
      );
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repoData.owner,
          repo: repoData.repo,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setGuide(`❌ Error: ${err.error ?? 'Failed to generate guide'}`);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setGuide(full);
      }
      setGenerated(true);
    } catch {
      setGuide('❌ Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [repoData]);

  // Auto-generate on open
  useEffect(() => { void generate(); }, []);

  const copyMarkdown = useCallback(async () => {
    try { await navigator.clipboard.writeText(guide); }
    catch {
      const el = Object.assign(document.createElement('textarea'), { value: guide });
      document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [guide]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
        {/* Modal header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-sm">📋</div>
            <div>
              <h2 className="text-sm font-semibold text-white">Onboarding Guide</h2>
              <p className="text-xs text-slate-500 font-mono">{repoData.metadata.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {generated && (
              <>
                <button
                  onClick={copyMarkdown}
                  className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-all ${
                    copied
                      ? 'text-emerald-300 border-emerald-700/60 bg-emerald-900/20'
                      : 'text-slate-300 hover:text-white border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  {copied ? (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy Markdown</>
                  )}
                </button>
                <button
                  onClick={() => { setGenerated(false); void generate(); }}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                  title="Regenerate"
                >
                  <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Redo
                </button>
              </>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {!guide && loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-slate-400">Generating onboarding guide…</span>
              </div>
              <p className="text-xs text-slate-600 text-center max-w-xs">Analysing the codebase structure, README, and key files to build a practical checklist.</p>
            </div>
          )}

          {guide && (
            <div className="prose-custom text-sm leading-relaxed">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(guide) }} />
              {loading && (
                <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          )}
        </div>

        {/* Modal footer hint */}
        {generated && (
          <div className="flex-shrink-0 border-t border-slate-800 px-5 py-2.5">
            <p className="text-xs text-slate-600 text-center">
              Paste this into Notion, Confluence, or a GitHub wiki — it's standard Markdown.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Rate limit banner -------------------------------------------------------
function RateLimitBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 mx-4 mb-3 rounded-xl bg-amber-950/60 border border-amber-700/50 px-4 py-3 text-xs text-amber-200">
      <span className="text-lg flex-shrink-0">⚠️</span>
      <div className="flex-1 leading-relaxed">
        <strong className="text-amber-100">GitHub rate limit hit.</strong> Add a{' '}
        <code className="bg-amber-900/60 px-1 rounded">GITHUB_TOKEN</code> to your{' '}
        <code className="bg-amber-900/60 px-1 rounded">.env</code> to get 5,000 requests/hour instead of 60.{' '}
        <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
          target="_blank" rel="noreferrer" className="underline hover:text-amber-100">Learn how →</a>
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 text-amber-500 hover:text-amber-300">✕</button>
    </div>
  );
}

// ---- Session helpers ---------------------------------------------------------
const sessionKey = (o: string, r: string) => `repochat:${o}/${r}`;

function saveSession(owner: string, repo: string, messages: ChatMessage[], repoData: RepoData) {
  try { sessionStorage.setItem(sessionKey(owner, repo), JSON.stringify({ messages, repoData, savedAt: Date.now() })); }
  catch { /* quota / private mode */ }
}

function loadSession(owner: string, repo: string): { messages: ChatMessage[]; repoData: RepoData } | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(owner, repo));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.savedAt > 30 * 60 * 1000) return null;
    return { messages: p.messages, repoData: p.repoData };
  } catch { return null; }
}

// ---- Repo fetcher (shared between cold-load and share-link paths) ------------
async function fetchRepoData(owner: string, repo: string,
  onStep: (s: string) => void): Promise<RepoData> {
  onStep('step1');
  const res = await fetch(`/api/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body?.error || 'Repository not found');
    err.rateLimited = !!body?.rateLimited;
    throw err;
  }
  const data: RepoData = await res.json();
  onStep('step2'); await new Promise((r) => setTimeout(r, 350));
  onStep('step3'); await new Promise((r) => setTimeout(r, 350));
  onStep('step4'); await new Promise((r) => setTimeout(r, 350));
  return data;
}

// ---- Main component ----------------------------------------------------------
function RepoChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') ?? '';
  const repo  = searchParams.get('repo')  ?? '';

  const [repoData,   setRepoData]   = useState<RepoData | null>(null);
  const [status,     setStatus]     = useState<'idle'|'step1'|'step2'|'step3'|'step4'|'ready'>('idle');
  const [error,      setError]      = useState('');
  const [rateLimited,setRateLimited]= useState(false);
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [msgInput,   setMsgInput]   = useState('');
  const [streaming,  setStreaming]  = useState(false);
  const [draft,      setDraft]      = useState('');
  const [ctxStats,   setCtxStats]   = useState<ContextStats>(null);
  const [sideTab,    setSideTab]    = useState<'suggestions'|'files'>('suggestions');
  const [showOnboarding, setShowOnboarding] = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Cmd+K / Ctrl+K → focus textarea ─────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Bootstrap: hash → session → API ─────────────────────────────────────────
  useEffect(() => {
    if (!owner || !repo) { setError('Missing owner and repo parameters.'); return; }

    const hashMatch = window.location.hash.match(/^#chat=(.+)$/);
    const sharedMsgs = hashMatch ? decodeMessages(hashMatch[1]) : null;

    // Strip hash immediately so refresh doesn't re-apply the shared state
    if (hashMatch) window.history.replaceState(null, '', window.location.pathname + window.location.search);

    // If we have a share link, we still need repoData — check session first
    if (sharedMsgs) {
      const cached = loadSession(owner, repo);
      if (cached) {
        setRepoData(cached.repoData);
        setMessages(sharedMsgs);
        setStatus('ready');
        return;
      }
      // Fetch repoData then apply shared messages
      fetchRepoData(owner, repo, setStatus as (s: string) => void)
        .then((data) => { setRepoData(data); setMessages(sharedMsgs); setStatus('ready'); })
        .catch((err) => { if (err.rateLimited) setRateLimited(true); setError(err.message); });
      return;
    }

    // Normal load — try session cache first
    const cached = loadSession(owner, repo);
    if (cached) { setRepoData(cached.repoData); setMessages(cached.messages); setStatus('ready'); return; }

    fetchRepoData(owner, repo, setStatus as (s: string) => void)
      .then((data) => { setRepoData(data); setStatus('ready'); })
      .catch((err) => { if (err.rateLimited) setRateLimited(true); setError(err.message); });
  }, [owner, repo]);

  // ── Session persistence ──────────────────────────────────────────────────────
  useEffect(() => {
    if (repoData && owner && repo) saveSession(owner, repo, messages, repoData);
  }, [messages, repoData, owner, repo]);

  // ── Scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [messages, draft]);

  // ── Textarea auto-resize ─────────────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [msgInput]);

  // ── Suggestions ─────────────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    if (!repoData) return [];
    const f = repoData.files;
    const s = [
      'What are the main entry points of this codebase?',
      'How do I run this project locally?',
      'What is the overall architecture of this project?',
    ];
    if (f.some((x) => /dockerfile/i.test(x))) s.push('How can I run this with Docker?');
    if (f.some((x) => /\btest\b|__tests__|jest\.config|pytest\.ini|spec\./i.test(x))) s.push('How do I run the test suite?');
    if (f.some((x) => /api\/|\/api\/|pages\/api/i.test(x))) s.push('What API routes are available?');
    if (f.some((x) => /prisma\/schema/i.test(x))) s.push('Explain the Prisma database schema.');
    if (f.some((x) => /\.env\.example|\.env\.sample/i.test(x))) s.push('What environment variables are needed?');
    if (f.some((x) => /github\/workflows\//i.test(x))) s.push('What CI/CD workflows are configured?');
    return s;
  }, [repoData]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content?: string) => {
    const text = (content ?? msgInput).trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setMsgInput('');
    setDraft('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: repoData?.owner, repo: repoData?.repo, messages: [...messages, userMsg] }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (errBody?.rateLimited) setRateLimited(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: `❌ Error: ${errBody.error ?? 'Failed to get response'}` }]);
        setStreaming(false);
        return;
      }

      const fl = res.headers.get('X-Context-Files-Loaded');
      const cc = res.headers.get('X-Context-Chars');
      if (fl && cc) setCtxStats({ filesLoaded: +fl, contextChars: +cc });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setDraft(full);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
      setDraft('');
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '❌ Network error. Please try again.' }]);
    } finally {
      setStreaming(false);
    }
  }, [msgInput, messages, repoData, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  // File explorer: click → show code; Ask → → pre-fill textarea
  const handleFileClick = useCallback((path: string) => void sendMessage(`Show me the code in \`${path}\``), [sendMessage]);
  const handleFileAsk   = useCallback((path: string) => {
    setMsgInput(`Explain what \`${path}\` does`);
    textareaRef.current?.focus();
  }, []);

  // ── Error screen ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-slate-900 p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-300 mb-2">{rateLimited ? 'GitHub Rate Limit Hit' : 'Error'}</h2>
          <p className="text-slate-300 text-sm mb-4 leading-relaxed">{error}</p>
          {rateLimited && (
            <div className="rounded-lg bg-amber-950/40 border border-amber-800/50 px-4 py-3 text-xs text-amber-300 text-left mb-4 leading-relaxed">
              Add a <code className="bg-amber-900/60 px-1 rounded">GITHUB_TOKEN</code> to your{' '}
              <code className="bg-amber-900/60 px-1 rounded">.env</code> to get 5,000 req/hr.{' '}
              <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                target="_blank" rel="noreferrer" className="underline hover:text-amber-100">Create a token →</a>
            </div>
          )}
          <button onClick={() => router.push('/')} className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-2.5 font-semibold text-sm transition-colors">
            ← Try Another Repo
          </button>
        </div>
      </main>
    );
  }

  if (!repoData || status !== 'ready') return <LoadingScreen owner={owner} repo={repo} status={status} />;

  const { metadata, fileCount } = repoData;
  const shortName = metadata.name.split('/').pop() ?? metadata.name;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
    {showOnboarding && (
      <OnboardingModal repoData={repoData} onClose={() => setShowOnboarding(false)} />
    )}
    <main className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-colors">
          ← New Repo
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span className="text-sm font-mono text-slate-200 truncate">{metadata.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ContextPill stats={ctxStats} />
          <ShareButton owner={owner} repo={repo} messages={messages} />
          <span className="hidden sm:inline text-xs text-slate-500">⭐ {metadata.stars.toLocaleString()}</span>
          {metadata.language && (
            <span className="hidden sm:inline text-xs rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">{metadata.language}</span>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900 overflow-hidden">
          <div className="flex-shrink-0 p-4 border-b border-slate-800">
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <h3 className="font-semibold text-white text-sm mb-1">{metadata.name}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{metadata.description || 'No description available.'}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[
                  `⭐ ${metadata.stars.toLocaleString()}`,
                  `🍴 ${metadata.forks.toLocaleString()}`,
                  ...(metadata.open_issues > 0 ? [`🐛 ${metadata.open_issues}`] : []),
                  `📁 ${fileCount} files`,
                ].map((label) => (
                  <span key={label} className="text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">{label}</span>
                ))}
                {metadata.language && (
                  <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700/30 rounded-full px-2 py-0.5">{metadata.language}</span>
                )}
              </div>
              {metadata.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {metadata.topics.slice(0, 8).map((t) => (
                    <span key={t} className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">#{t}</span>
                  ))}
                </div>
              )}
              <a href={metadata.html_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View on GitHub
              </a>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b border-slate-800">
            {(['suggestions', 'files'] as const).map((tab) => (
              <button key={tab} onClick={() => setSideTab(tab)}
                className={`flex-1 text-xs font-medium py-2.5 transition-colors ${
                  sideTab === tab ? 'text-violet-300 border-b-2 border-violet-500' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {tab === 'suggestions' ? '💡 Suggestions' : '🗂️ Files'}
              </button>
            ))}
          </div>

          {/* Onboarding guide button — lives between tabs and tab content */}
          <div className="flex-shrink-0 px-3 pt-3">
            <button
              onClick={() => setShowOnboarding(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700/20 hover:bg-emerald-700/30 border border-emerald-600/30 hover:border-emerald-500/50 text-emerald-300 hover:text-emerald-200 text-xs font-medium py-2.5 transition-all"
            >
              <span>📋</span>
              Generate Onboarding Guide
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            {sideTab === 'suggestions' ? (
              <div className="space-y-1.5">
                {suggestions.map((q) => (
                  <button key={q} onClick={() => void sendMessage(q)} disabled={streaming}
                    className="w-full text-left text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50 leading-relaxed">
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <FileExplorer files={repoData.files} onFileClick={handleFileClick} onFileAsk={handleFileAsk} />
            )}
          </div>
        </aside>

        {/* ── Chat ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {rateLimited && <RateLimitBanner onDismiss={() => setRateLimited(false)} />}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
            {messages.length === 0 && !draft && (
              <div className="flex flex-col items-center justify-center h-full gap-5 px-2">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">💬</span>
                  </div>
                  <h3 className="font-semibold text-white mb-2">Chat with {shortName}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Ask anything about this codebase — architecture, how to run it, specific files, and more.
                  </p>
                </div>
                <SuggestionsGrid suggestions={suggestions} onSelect={(q) => void sendMessage(q)} disabled={streaming} />
              </div>
            )}

            {messages.map((m, i) => <MessageBubble key={i} message={m} />)}

            {draft && (
              <div className="flex justify-start mb-4">
                <div className="max-w-[85%] bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-md">
                  <div className="prose-custom" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft) }} />
                  <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            )}
            {streaming && !draft && <TypingIndicator />}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex gap-2 items-end max-w-4xl mx-auto">
              <textarea
                ref={textareaRef}
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${shortName}...`}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors min-h-[46px] max-h-[120px]"
              />
              <button onClick={() => void sendMessage()} disabled={!msgInput.trim() || streaming}
                className="flex-shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-white transition-colors"
                aria-label="Send message">
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
            <p className="text-center text-xs text-slate-600 mt-2">
              Enter to send · Shift+Enter for new line ·{' '}
              <kbd className="font-mono bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-500">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>{' '}
              to focus
            </p>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>}>
      <RepoChatInner />
    </Suspense>
  );
}