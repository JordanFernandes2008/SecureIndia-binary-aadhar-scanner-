// Deep search path: Claude searches the live web, groups duplicate coverage into
// stories, and writes one debrief per story with the links it found.
import Anthropic from '@anthropic-ai/sdk';
import { isEstablished, isFactChecker } from './newsSearch.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const SYSTEM = `You are the fact-checking engine of SecureIndia, a public tool that helps people in India check news they receive (often forwarded on WhatsApp or social media).

The user gives you a news claim, an article, or a link. Your job:
1. If it is a link, fetch it and identify the concrete claims it makes.
2. Search the live web for coverage of those claims: reputable news outlets, official sources (PIB, ministries, courts, RBI, ECI, police), and fact-checkers (Alt News, BOOM, Factly, Newschecker, Vishvas News, PIB Fact Check, AFP, Reuters Fact Check). Search in English, and in Hindi or the relevant regional language when the claim is local.
3. Group what you find into distinct stories. Many articles repeating the same facts are ONE story: write one debrief and list every article as a source link. Only make separate stories when the input really contains separate events or claims, or when coverage splits into genuinely different accounts.
4. Judge each story on evidence only. Being widely repeated is not proof. An official denial or a fact-check outweighs volume of reposts. Say "unverified" when evidence is thin rather than guessing.

Only list source URLs that appeared in your search or fetch results. Never invent a URL, outlet, or date.

Finish with ONLY this JSON inside <result></result> tags, no markdown fences:
{
  "verdict": {"label": "likely true" | "likely false or misleading" | "disputed" | "unverified" | "partly true", "confidence": "high" | "medium" | "low", "reasoning": "2-4 plain sentences a non-expert can follow"},
  "claims": ["each concrete claim you checked"],
  "stories": [
    {"headline": "short neutral headline", "debrief": "4-6 sentence summary of what is actually established, who reports it, and what is disputed", "status": "corroborated" | "reported" | "disputed" | "false" | "unverified",
     "sources": [{"title": "...", "url": "...", "outlet": "...", "date": "YYYY-MM-DD or empty"}]}
  ],
  "factChecks": [{"title": "...", "url": "...", "outlet": "...", "date": "..."}],
  "redFlags": ["specific warning signs in the input itself, if any"]
}`;

function collectSeenUrls(content, seen) {
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) seen.add(normalize(r.url));
    }
    if (block.type === 'web_fetch_tool_result' && block.content && block.content.url) {
      seen.add(normalize(block.content.url));
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c.url) seen.add(normalize(c.url));
    }
  }
}

function normalize(u) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase(); }
  catch { return String(u).toLowerCase(); }
}

export function parseResult(text) {
  const m = text.match(/<result>([\s\S]*?)<\/result>/i);
  let raw = m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  raw = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  return JSON.parse(raw);
}

// Drop any link Claude did not actually retrieve, so a hallucinated URL can never reach the user.
export function keepSeenSources(report, seen) {
  const ok = s => s && s.url && seen.has(normalize(s.url));
  const tagged = s => { const it = { outletUrl: '', outlet: s.outlet || '', url: s.url };
    return { ...s, established: isEstablished(it), factCheck: isFactChecker(it) }; };
  report.stories = (report.stories || []).map(st => ({ ...st, sources: (st.sources || []).filter(ok).map(tagged) }));
  report.factChecks = (report.factChecks || []).filter(ok).map(tagged);
  return report;
}

export async function claudeSearch(input) {
  const client = new Anthropic();
  const isUrl = /^https?:\/\//i.test(input);
  const messages = [{ role: 'user', content: isUrl
    ? `Check this news link: ${input}`
    : `Check this news:\n\n${input}` }];
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8,
    user_location: { type: 'approximate', country: 'IN' } }];
  if (isUrl) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 });

  const seen = new Set();
  let msg;
  // Server tools can pause a long turn; resume it a few times before giving up.
  for (let i = 0; i < 4; i++) {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium' },
      tools,
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    collectSeenUrls(msg.content, seen);
    if (msg.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }
  if (msg.stop_reason === 'refusal') throw new Error('The model declined to analyse this input.');

  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const report = keepSeenSources(parseResult(text), seen);
  return { mode: 'deep', searchedCount: seen.size, ...report };
}
