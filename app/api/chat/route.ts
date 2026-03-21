import { NextRequest, NextResponse } from 'next/server';

const GITHUB_BASE = 'https://api.github.com';

async function fetchJson(url: string, token?: string) {
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status} ${response.statusText}: ${errorText}`);
  }
  return response.json();
}

function buildContext({ owner, repo, metadata, readme, fileList }: { owner: string; repo: string; metadata: any; readme: string; fileList: string[] }) {
  const context: string[] = [];
  context.push(`Repo: ${owner}/${repo}`);
  context.push(`Description: ${metadata.description ?? 'No description'}`);
  context.push(`Stars: ${metadata.stars ?? 0}, Language: ${metadata.language ?? 'unknown'}`);
  if (Array.isArray(metadata.topics) && metadata.topics.length > 0) {
    context.push(`Topics: ${metadata.topics.join(', ')}`);
  }
  context.push(`URL: ${metadata.html_url}`);
  context.push(`File count: ${fileList.length}`);
  if (readme.trim()) {
    const trimmed = readme.slice(0, 4000);
    context.push(`README (first 4000 chars):\n${trimmed}`);
  }
  context.push(`File structure (truncated to 100):\n${fileList.slice(0, 100).join('\n')}`);

  return context.join('\n\n');
}

function parseStreamEvent(line: string): string {
  if (!line.startsWith('data:')) return '';
  const payload = line.replace(/^data:\s*/, '');
  if (payload === '[DONE]') return '[DONE]';
  try {
    const obj = JSON.parse(payload);
    if (obj?.delta?.content) {
      return String(obj.delta.content);
    }
    if (obj?.completion?.[0]?.content?.[0]?.text) {
      return String(obj.completion[0].content[0].text);
    }
    if (obj?.completion?.content) {
      return String(obj.completion.content);
    }
  } catch (_){
    return '';
  }
  return '';
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
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY environment variable' }, { status: 500 });
  }

  try {
    const repoResp = await fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}`, token);
    const topicsResp = await fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/topics`, token);
    const treeResp = await fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token);

    const fileEntries = Array.isArray(treeResp.tree)
      ? treeResp.tree
          .filter((item: any) => item.type === 'blob')
          .map((item: any) => String(item.path))
          .filter((path: string) => !/node_modules|\.lock$|\.bak$/i.test(path))
      : [];
    const fileList = fileEntries.slice(0, 100);

    const readmeRes = await fetch(`${GITHUB_BASE}/repos/${owner}/${repo}/readme`, {
      headers: {
        Accept: 'application/vnd.github.v3.raw',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });
    const readme = readmeRes.ok ? (await readmeRes.text()) : '';

    const systemPrompt = `You are an AI assistant called RepoChat. Use only information directly from the repository context and do not fabricate details.\n\n${buildContext({ owner, repo, metadata: {
      name: repoResp.full_name,
      description: repoResp.description,
      stars: repoResp.stargazers_count,
      language: repoResp.language,
      topics: topicsResp?.names ?? [],
      html_url: repoResp.html_url,
    }, readme, fileList })}`;

    const userMessages = messages
      .map((m: { role?: string; content?: string }) => {
        const role = m.role === 'assistant' ? 'ASSISTANT' : 'USER';
        return `${role}: ${String(m.content ?? '').trim()}`;
      })
      .join('\n');

    const prompt = `${systemPrompt}\n\n${userMessages}\nASSISTANT:`;

    const response = await fetch('https://api.anthropic.com/v1/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anthropicKey}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        prompt,
        max_tokens_to_sample: 1000,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Anthropic error: ${response.status} ${errorText}` }, { status: 500 });
    }

    const reader = response.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const chunk = parseStreamEvent(line.trim());
            if (!chunk) continue;
            if (chunk === '[DONE]') {
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(chunk));
          }
        }

        if (buffer.trim()) {
          const chunk = parseStreamEvent(buffer.trim());
          if (chunk && chunk !== '[DONE]') {
            controller.enqueue(encoder.encode(chunk));
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, max-age=0',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
