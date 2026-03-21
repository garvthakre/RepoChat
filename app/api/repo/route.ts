import { NextRequest, NextResponse } from 'next/server';

const GITHUB_BASE = 'https://api.github.com';

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

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get('owner')?.trim();
  const repo = request.nextUrl.searchParams.get('repo')?.trim();
  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing query parameters owner and repo' }, { status: 400 });
  }

  const token = process.env.GITHUB_TOKEN;

  try {
    const [metadata, topics] = await Promise.all([
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}`, token),
      fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/topics`, token),
    ]);

    const branch = metadata.default_branch || 'HEAD';
    let treeResp: any;
    try {
      treeResp = await fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
    } catch (err) {
      // Fallback to HEAD for older endpoints
      treeResp = await fetchJson(`${GITHUB_BASE}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, token);
    }
    const rawTree: string[] = [];

    const fileEntries = Array.isArray(treeResp.tree) ? treeResp.tree.filter((item: any) => item.type === 'blob') : [];
    for (const file of fileEntries) {
      const path = String(file.path);
      if (/node_modules|\.lock$|\.bak$/.test(path)) continue;
      rawTree.push(path);
      if (rawTree.length >= 100) break;
    }

    const readmeHeaders: Record<string, string> = { Accept: 'application/vnd.github.v3.raw' };
    if (token) {
      readmeHeaders.Authorization = `token ${token}`;
    }

    const readmeResp = await fetch(`${GITHUB_BASE}/repos/${owner}/${repo}/readme`, {
      headers: readmeHeaders,
    });
    const readmeText = readmeResp.ok ? await readmeResp.text() : '';

    return NextResponse.json({
      owner,
      repo,
      metadata: {
        name: metadata.full_name,
        description: metadata.description,
        stars: metadata.stargazers_count,
        language: metadata.language,
        topics: (topics?.names ?? []).slice(0, 20),
        html_url: metadata.html_url,
        forks: metadata.forks_count,
        open_issues: metadata.open_issues_count,
      },
      fileCount: fileEntries.length,
      files: rawTree,
      readme: readmeText,
    });
  } catch (error: any) {
    const status = error.message?.includes('404') ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
