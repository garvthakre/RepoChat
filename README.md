# RepoChat

Chat with any public GitHub repository using AI. Paste a repo URL, and RepoChat reads the README, maps the file structure, and lets you ask questions about the codebase in natural language.

## Why I built this

Jumping into an unfamiliar codebase is slow — you're grepping files, skimming READMEs, and hoping the docs are up to date. RepoChat skips that. It felt like a genuinely useful dev tool, not just a generic chat wrapper around an LLM.

## What it does

- Accepts any public GitHub repo URL (or `owner/repo` shorthand)
- Fetches repo metadata, README, and full file tree at load time
- Builds a context-aware system prompt so the AI knows exactly what it's talking about
- Streams responses token-by-token for a fast, natural feel
- Suggests smart questions based on what it detects in the repo (Docker, test suites, CI/CD, API routes, Prisma schemas, etc.)
- Renders markdown responses with syntax-highlighted code blocks

## Tech stack

- **Next.js 14** (App Router) — frontend + API routes
- **Groq API** with `llama-3.3-70b-versatile` — LLM inference
- **GitHub REST API** — repo data fetching
- **Tailwind CSS** — styling
- **TypeScript** throughout

## UI decisions

The experience was designed around three states that most chat apps handle badly:

**Loading state** — instead of a spinner, there's a step-by-step progress screen showing exactly what's being fetched (metadata → README → file tree → AI context). Users know what's happening.

**Empty state** — the first screen isn't a blank input box. It shows contextual suggested questions generated from the repo's actual contents, so there's always an obvious first action.

**Streaming state** — responses stream with a blinking cursor and a typing indicator, so the UI feels alive rather than frozen while waiting for the model.

## Running locally

```bash
# Install dependencies
npm install

# Add environment variables
cp .env.example .env
# Fill in GITHUB_TOKEN and GROQ_API_KEY

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | From [console.groq.com](https://console.groq.com) |
| `GITHUB_TOKEN` | Personal access token — increases GitHub API rate limits (optional but recommended) |

## Deployment

Deployed on Vercel. Set the environment variables in the Vercel dashboard and push to main — it just works.