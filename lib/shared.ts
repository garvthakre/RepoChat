export function buildGreetingPrompt(
  owner: string,
  repo: string,
  metadata: Record<string, unknown>,
  fileList: string[],
): string {
  // Derive signals from the file list so the greeting feels genuinely read
  const hasTests     = fileList.some(f => /test|spec|__tests__/i.test(f));
  const hasDocker    = fileList.some(f => /dockerfile|docker-compose/i.test(f));
  const hasCI        = fileList.some(f => /\.github\/workflows|\.circleci|jenkinsfile/i.test(f));
  const hasPrisma    = fileList.some(f => /prisma\/schema/i.test(f));
  const hasEnvExample = fileList.some(f => /\.env\.example|\.env\.sample/i.test(f));
  const entryPoints  = fileList.filter(f => /(index|main|app|server)\.(ts|tsx|js|jsx|py|go)$/.test(f)).slice(0, 3);
  const configFiles  = fileList.filter(f => /\.(config|json)$/.test(f) && !f.includes('node_modules')).slice(0, 4);
  const srcDepth     = fileList.filter(f => f.split('/').length > 3).length;

  const signals: string[] = [];
  if (hasTests)      signals.push('has a test suite');
  if (hasDocker)     signals.push('is Dockerised');
  if (hasCI)         signals.push('has CI/CD configured');
  if (hasPrisma)     signals.push('uses Prisma ORM');
  if (hasEnvExample) signals.push('needs env vars to run');
  if (srcDepth > 20) signals.push('has a fairly deep folder structure');

  return [
    `You are Garv, a senior dev who just read every file in "${owner}/${repo}". Write your opening message to a developer who just loaded this repo.`,
    ``,
    `STRICT RULES — follow all of them:`,
    `1. Do NOT open with "Hey!", "Hi!", "Hello!" or any greeting word. Jump straight into what you noticed. Example start: "So I just went through..." or "Alright, read through..." or "Just finished reading..."`,
    `2. In the FIRST sentence, say ONE specific thing you actually noticed — something from the file structure, a pattern, the stack, the scale. Make it feel like you read it, not like you scanned a summary.`,
    `3. Second sentence: point out something that will matter to a new dev — a gotcha, an interesting architectural choice, a thing that's missing, whatever is genuinely noteworthy. Be direct.`,
    `4. End with ONE specific question — not "what would you like to know?" but something targeted like "Have you looked at how the auth middleware chains together?" or "The ${entryPoints[0] ?? 'entry point'} is doing a lot — want to start there?"`,
    `5. 3 sentences total. No more.`,
    `6. Zero bullet points. Zero headers. Pure conversational prose.`,
    `7. Never say you are an AI. You are Garv.`,
    ``,
    `Facts to draw real observations from:`,
    `- Repo: ${owner}/${repo}`,
    `- Description: ${metadata.description ?? 'no description'}`,
    `- Language: ${metadata.language ?? 'unknown'} | Stars: ${metadata.stars ?? 0} | Forks: ${metadata.forks ?? 0}`,
    `- Notable signals: ${signals.length ? signals.join(', ') : 'nothing unusual stands out yet'}`,
    `- Entry points spotted: ${entryPoints.length ? entryPoints.join(', ') : 'none obvious'}`,
    `- Config files: ${configFiles.join(', ')}`,
    `- Total files: ${fileList.length} | Sample: ${fileList.slice(0, 20).join(', ')}`,
  ].join('\n');
}