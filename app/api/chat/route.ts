import { NextRequest, NextResponse } from 'next/server';

const GITHUB_BASE = 'https://api.github.com';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// File extensions we'll attempt to fetch content for
const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h',
  'css', 'scss', 'sass', 'less',
  'html', 'xml', 'svg',
  'json', 'yaml', 'yml', 'toml', 'ini', 'env',
  'md', 'mdx', 'txt',
  'sh', 'bash', 'zsh',
  'sql', 'prisma', 'graphql', 'gql',
  'dockerfile', 'makefile',
]);

// Max size per file in bytes — skip anything larger to keep the prompt lean
const MAX_FILE_BYTES = 8_000;
// Max total characters of file content to inject into the prompt
const MAX_TOTAL_CONTENT_CHARS = 40_000;
// Max number of files to fetch content for
const MAX_FILES_TO_FETCH = 20;

function isTextFile(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.split('/').pop() ?? lower;
  // Dotfiles without extension (e.g. .gitignore, .env.example)
  if (base.startsWith('.') && !base.slice(1).includes('.')) return true;
  // Special filenames
  if (['dockerfile', 'makefile', 'procfile', 'rakefile'].includes(base)) return true;
  const ext = base.split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

async function fetchJson(url: string, token?: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RepoChat/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status} ${response.statusText}: ${errorText}`);
  }
  return response.json();
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3.raw',
      'User-Agent': 'RepoChat/1.0',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const url = `${GITHUB_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    // Respect max file size — check Content-Length if available
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_BYTES) return null;

    const text = await res.text();
    // Double-check after reading
    if (text.length > MAX_FILE_BYTES) return null;

    return text;
  } catch {
    return null;
  }
}

/**
 * Pick the most "important" files to fetch content for.
 * Priority: config/entry files first, then source files, then the rest.
 */
function prioritizeFiles(files: string[]): string[] {
  const priority: string[] = [];
  const rest: string[] = [];

  for (const f of files) {
    const lower = f.toLowerCase();
    const base = lower.split('/').pop() ?? '';
    const isHighPriority =
      /^(package\.json|readme|dockerfile|docker-compose|\.env\.example|makefile|procfile)/.test(base) ||
      /\.(config|env)\.(ts|js|mjs)$/.test(lower) ||
      /^(src|app|lib|pages|routes|controllers|models|schema)\//i.test(f) ||
      /\bindex\.(ts|tsx|js|jsx)$/.test(lower) ||
      /\bmain\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(lower) ||
      /schema\.(prisma|graphql|gql|sql)$/.test(lower);

    if (isHighPriority) priority.push(f);
    else rest.push(f);
  }

  return [...priority, ...rest];
}

function buildSystemPrompt({
  owner,
  repo,
  metadata,
  readme,
  fileList,
  fileContents,
}: {
  owner: string;
  repo: string;
  metadata: Record<string, unknown>;
  readme: string;
  fileList: string[];
  fileContents: Record<string, string>;
}): string {
  const lines: string[] = [
    `You are RepoChat, an expert AI assistant specialized in understanding and explaining code repositories.`,
    `You have been given full context about the GitHub repository "${owner}/${repo}".`,
    `Answer questions accurately using ONLY the provided repository context. If something isn't covered in the context, say so honestly.`,
    `When showing code, use proper markdown fenced code blocks with the language identifier.`,
    ``,
    `=== REPOSITORY CONTEXT ===`,
    `Repository: ${owner}/${repo}`,
    `Description: ${metadata.description ?? 'No description'}`,
    `Stars: ${metadata.stars ?? 0} | Language: ${metadata.language ?? 'unknown'} | Forks: ${metadata.forks ?? 0}`,
  ];

  const topics = metadata.topics as string[] | undefined;
  if (Array.isArray(topics) && topics.length > 0) {
    lines.push(`Topics: ${topics.join(', ')}`);
  }

  lines.push(`GitHub URL: ${metadata.html_url}`);
  lines.push(`Total files indexed: ${fileList.length}`);
  lines.push('');

  if (readme.trim()) {
    const trimmed = readme.slice(0, 4000);
    lines.push(`=== README ===`);
    lines.push(trimmed);
    if (readme.length > 4000) lines.push('\n[README truncated for context length]');
    lines.push('');
  }

  lines.push(`=== FILE STRUCTURE ===`);
  lines.push(fileList.slice(0, 100).join('\n'));
  if (fileList.length > 100) lines.push('\n[File list truncated to 100 entries]');
  lines.push('');

  // Inject actual file contents
  const fetchedPaths = Object.keys(fileContents);
  if (fetchedPaths.length > 0) {
    lines.push(`=== FILE CONTENTS (${fetchedPaths.length} files) ===`);
    lines.push(`The following files have been fully loaded so you can answer questions about their code directly.`);
    lines.push('');

    for (const [path, content] of Object.entries(fileContents)) {
      const ext = path.split('.').pop() ?? '';
      lines.push(`--- ${path} ---`);
      lines.push('```' + ext);
      lines.push(content.trimEnd());
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const owner = String(body.owner ?? '').trim();
  const repo = String(body.repo ?? '').trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }
  if (!messages.length) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const token = process.env.GITHUB_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;

  if (!groqKey) {
    return NextResponse.json({ error: 'Missing GROQ_API_KEY environment variable' }, { status: 500 });
  }

  try {
    // Fetch repo context in parallel
    const [repoResp, topicsResp, treeResp] = await Promise.all([
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}`, token),
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/topics`, token),
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token),
    ]);

    const allFiles: string[] = Array.isArray(treeResp.tree)
      ? treeResp.tree
          .filter((item: { type: string }) => item.type === 'blob')
          .map((item: { path: string }) => String(item.path))
          .filter((path: string) => !/node_modules|\.lock$|\.bak$/i.test(path))
      : [];

    const fileList = allFiles.slice(0, 100);

    const readmeRes = await fetch(`${GITHUB_BASE}/repos/${owner}/${repo}/readme`, {
      headers: {
        Accept: 'application/vnd.github.v3.raw',
        'User-Agent': 'RepoChat/1.0',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });
    const readme = readmeRes.ok ? await readmeRes.text() : '';

    // --- File content fetching ---
    const candidateFiles = allFiles.filter(isTextFile);
    const prioritized = prioritizeFiles(candidateFiles).slice(0, MAX_FILES_TO_FETCH);

    // Fetch all candidate files in parallel, then filter out nulls
    const fetchResults = await Promise.all(
      prioritized.map(async (path) => {
        const content = await fetchFileContent(owner, repo, path, token);
        return content ? { path, content } : null;
      })
    );

    // Build fileContents map, respecting total character budget
    const fileContents: Record<string, string> = {};
    let totalChars = 0;

    for (const result of fetchResults) {
      if (!result) continue;
      if (totalChars + result.content.length > MAX_TOTAL_CONTENT_CHARS) break;
      fileContents[result.path] = result.content;
      totalChars += result.content.length;
    }

    const systemPrompt = buildSystemPrompt({
      owner,
      repo,
      metadata: {
        description: repoResp.description,
        stars: repoResp.stargazers_count,
        language: repoResp.language,
        topics: topicsResp?.names ?? [],
        html_url: repoResp.html_url,
        forks: repoResp.forks_count,
      },
      readme,
      fileList,
      fileContents,
    });

    // Build messages for OpenAI-compatible Groq API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m: { role?: string; content?: string }) => m.role === 'user' || m.role === 'assistant')
        .map((m: { role: string; content: string }) => ({
          role: m.role,
          content: String(m.content ?? '').trim(),
        }))
        .filter((m: { content: string }) => m.content.length > 0),
    ];

    // Call Groq with streaming (OpenAI-compatible)
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!groqResponse.ok || !groqResponse.body) {
      const errorText = await groqResponse.text();
      return NextResponse.json(
        { error: `Groq API error ${groqResponse.status}: ${errorText}` },
        { status: 500 }
      );
    }

    // Forward the SSE stream, extracting text deltas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = groqResponse.body.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const text = parsed?.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}