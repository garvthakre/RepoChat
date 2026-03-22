import { NextRequest, NextResponse } from 'next/server';
import { buildGreetingPrompt } from '../chat/route';

const GITHUB_BASE = 'https://api.github.com';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function fetchJson(url: string, token?: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RepoChat/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const owner = String(body.owner ?? '').trim();
  const repo  = String(body.repo  ?? '').trim();

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const token  = process.env.GITHUB_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 });
  }

  try {
    // Fetch just what's needed for the greeting — metadata + file list
    const [repoResp, topicsResp, treeResp] = await Promise.all([
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}`, token),
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/topics`, token),
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token),
    ]);

    const fileList: string[] = Array.isArray(treeResp.tree)
      ? treeResp.tree
          .filter((i: { type: string }) => i.type === 'blob')
          .map((i: { path: string }) => String(i.path))
          .filter((p: string) => !/node_modules|\.lock$|\.bak$/i.test(p))
          .slice(0, 80)
      : [];

    const metadata = {
      description: repoResp.description,
      language:    repoResp.language,
      stars:       repoResp.stargazers_count,
      forks:       repoResp.forks_count,
      topics:      topicsResp?.names ?? [],
    };

    const prompt = buildGreetingPrompt(owner, repo, metadata, fileList);

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,   // greeting should be short
        stream: true,
      }),
    });

    if (!groqRes.ok || !groqRes.body) {
      const err = await groqRes.text();
      // Rate limit — return a static fallback greeting so the page still works
      if (groqRes.status === 429) {
        const fallback = `Hey! Just finished reading through **${owner}/${repo}** — ${fileList.length} files, ${metadata.language ?? 'interesting stack'}. What do you want to dig into first?`;
        return new Response(fallback, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return NextResponse.json({ error: `Groq error ${groqRes.status}: ${err}` }, { status: 500 });
    }

    // Stream the greeting back token-by-token
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader  = groqRes.body.getReader();

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
              if (data === '[DONE]') { controller.close(); return; }
              try {
                const parsed = JSON.parse(data);
                const text = parsed?.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip malformed */ }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(encoder.encode(`Hey! I've read through **${owner}/${repo}**. What do you want to know? (Note: ${msg})`));
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Always return something — a failed greeting shouldn't break the page
    const fallback = `Hey! Just read through **${owner}/${repo}**. What do you want to dig into?`;
    return new Response(fallback, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}