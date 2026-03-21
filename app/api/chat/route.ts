import { NextRequest, NextResponse } from 'next/server';

const GITHUB_BASE = 'https://api.github.com';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

function buildSystemPrompt({
  owner,
  repo,
  metadata,
  readme,
  fileList,
}: {
  owner: string;
  repo: string;
  metadata: Record<string, unknown>;
  readme: string;
  fileList: string[];
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

    const fileList: string[] = Array.isArray(treeResp.tree)
      ? treeResp.tree
          .filter((item: { type: string }) => item.type === 'blob')
          .map((item: { path: string }) => String(item.path))
          .filter((path: string) => !/node_modules|\.lock$|\.bak$/i.test(path))
          .slice(0, 100)
      : [];

    const readmeRes = await fetch(`${GITHUB_BASE}/repos/${owner}/${repo}/readme`, {
      headers: {
        Accept: 'application/vnd.github.v3.raw',
        'User-Agent': 'RepoChat/1.0',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });
    const readme = readmeRes.ok ? await readmeRes.text() : '';

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