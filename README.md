# SecureIndia — Fake News Check

Team TECHNOVA · Smart India Hackathon 2026 (SIH26188).

A free, public tool: paste any news, a WhatsApp forward or a link, and
SecureIndia scans the web and tells you what is actually being reported.

## What it does

1. **Takes anything** — an article link, a headline, or a whole forwarded message.
2. **Scans the web** — news sites, official government sources (PIB, RBI,
   ministries) and fact-checkers (Alt News, BOOM, Factly, PIB Fact Check…).
3. **Merges duplicates** — many articles saying the same thing become **one
   story with one debrief**, listing every link where it was found. No link is
   shown twice.
4. **Splits separate stories** — if the news contains two or more different
   stories, each gets its own card, debrief and links.
5. **Gives a verdict** — likely true, likely false or misleading, disputed, or
   unverified, with the reasoning and warning signs in the message.

Every check has a shareable link (`/?q=…`) and a WhatsApp share button.

## Two scan modes

Chosen automatically on the server:

- **Deep AI scan** — set `ANTHROPIC_API_KEY` in Vercel → Project → Settings →
  Environment Variables (tick Production and Preview). Claude searches the live
  web, reads the link, groups coverage into stories and writes the debriefs.
  Any source URL Claude did not actually retrieve is dropped before it reaches
  the page. Each check costs money (model tokens plus web searches), so the
  endpoint is rate-limited per IP (`RATE_LIMIT_PER_MIN`, default 6).
- **Keyword scan** (no key) — Google News search, grouped by headline
  similarity, with a rule-based verdict. Free, but cruder: it matches words, it
  does not read the articles.

The verdict is an evidence summary, not a ruling. Always open the sources.

## Files

- `index.html` — the whole frontend (no build step)
- `api/analyze.js` — serverless function, `POST {input}` or `GET ?q=`
- `lib/claudeAnalyze.js` — deep scan
- `lib/newsSearch.js` — keyword scan, story grouping and verdict rules
- `test/` — `npm test`

## Run locally

```
npm install
npm run dev     # http://localhost:3000
npm test
```

## Deploy to Vercel

Import the repo, framework preset **Other**, no build command. Optionally add
`ANTHROPIC_API_KEY`. `vercel.json` gives the function up to 120 s; lower it if
your plan does not allow that.
