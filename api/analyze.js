// POST /api/analyze  { "input": "<news text or article link>" }
import { claudeSearch } from '../lib/claudeAnalyze.js';
import { keywordSearch } from '../lib/newsSearch.js';

const MAX_INPUT = 6000;
const hits = new Map(); // best-effort per-instance rate limit

function limited(ip) {
  const now = Date.now(), win = 60_000, max = Number(process.env.RATE_LIMIT_PER_MIN || 6);
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const input = String((body && body.input) || '').trim();
  if (input.length < 8) return res.status(400).json({ error: 'Paste a news claim, article text, or a link.' });
  if (input.length > MAX_INPUT) return res.status(400).json({ error: `Input too long (max ${MAX_INPUT} characters).` });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many checks. Wait a minute and try again.' });

  const wantDeep = body.mode !== 'keyword' && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  try {
    if (wantDeep) {
      try {
        return res.status(200).json(await claudeSearch(input));
      } catch (e) {
        const report = await keywordSearch(input);
        report.notice = 'Deep search failed (' + e.message + '). Showing keyword search results instead.';
        return res.status(200).json(report);
      }
    }
    const report = await keywordSearch(input);
    if (!process.env.ANTHROPIC_API_KEY) report.notice = 'Keyword mode: results are grouped automatically from news search. Add an ANTHROPIC_API_KEY on the server for deep AI analysis.';
    return res.status(200).json(report);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Search failed' });
  }
}
