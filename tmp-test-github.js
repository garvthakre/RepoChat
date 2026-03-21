import fetch from 'node-fetch';
const token = process.env.GITHUB_TOKEN || '';
const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoChat/1.0' };
if (token) headers.Authorization = `token ${token}`;

async function check(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const r = await fetch(url, {headers});
  console.log('repo', owner + '/' + repo, 'status', r.status);
  const text = await r.text();
  console.log(text.slice(0,400));
}

async function run() {
  await check('vercel', 'next.js');
  await check('garvthakre', 'Post90');
}

run().catch(console.error);
