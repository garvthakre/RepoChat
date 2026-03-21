export function parseGithubRepoUrl(value: string): { owner: string; repo: string } | null {
  const raw = value.trim().replace(/\.+$/g, '').replace(/^https?:\/\//, '').replace(/^git@/, '').replace(/\.git$/, '').replace(/^www\./, '');
  const normalized = raw.replace(/\s+/g, '');
  let path = normalized;
  if (path.startsWith('github.com/')) {
    path = path.slice('github.com/'.length);
  }

  if (path.includes(':') && path.includes('/')) {
    const maybe = path.split(':').pop() ?? '';
    if (maybe.includes('/')) path = maybe;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];
  return owner && repo ? { owner, repo } : null;
}

export function cleanText(input: string): string {
  return input.replace(/\r\n/g, '\n').trim();
}
