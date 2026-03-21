import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const reply = String(body.reply ?? '').trim().slice(0, 800);

  if (!reply) return NextResponse.json({ chips: [] });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ chips: [] });

  const prompt = `Based on this developer's answer about a codebase, suggest exactly 3 short follow-up questions a new developer might want to ask next.

Rules:
- Each question must be under 8 words
- Make them specific to what was just discussed, not generic
- No numbering, no bullet points — just return a JSON array of 3 strings
- Return ONLY valid JSON, nothing else. Example: ["How is this tested?", "Show me an example", "What could go wrong?"]

Answer to follow up on:
${reply}`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        stream: false,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return NextResponse.json({ chips: [] });

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';

    // Parse — strip any markdown fences the model might add
    const cleaned = text.replace(/```json|```/g, '').trim();
    const chips = JSON.parse(cleaned);
    if (!Array.isArray(chips)) return NextResponse.json({ chips: [] });

    return NextResponse.json({
      chips: chips
        .filter((c: unknown) => typeof c === 'string')
        .map((c: string) => c.trim())
        .filter(Boolean)
        .slice(0, 3),
    });
  } catch {
    return NextResponse.json({ chips: [] });
  }
}