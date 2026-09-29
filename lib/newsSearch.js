// Keyless search path: Google News RSS -> group duplicate coverage into stories.
// Used when no ANTHROPIC_API_KEY is configured, and as a fallback if Claude fails.

const STOP = new Set(('a an the and or but of to in on at for from by with as is are was were be been ' +
  'has have had it its this that these those after before over under into about than then says said ' +
  'will would can could may might not no new news report reports latest live update updates today ' +
  'india indian what who why how when where which amid against more first also just').split(' '));

// Outlets with editorial standards and corrections policies. Not a truth guarantee.
const ESTABLISHED = ['thehindu.com', 'indianexpress.com', 'hindustantimes.com', 'ndtv.com', 'timesofindia',
  'livemint.com', 'business-standard.com', 'economictimes', 'scroll.in', 'thewire.in', 'theprint.in',
  'deccanherald.com', 'tribuneindia.com', 'indiatoday.in', 'news18.com', 'pib.gov.in', 'reuters.com',
  'apnews.com', 'bbc.', 'aljazeera.com', 'theguardian.com', 'nytimes.com', 'washingtonpost.com',
  'bloomberg.com', 'ft.com', 'cnn.com', 'dw.com', 'france24.com', 'npr.org', 'The Hindu', 'Indian Express',
  'Hindustan Times', 'NDTV', 'Times of India', 'Mint', 'Business Standard', 'Economic Times', 'Reuters',
  'Associated Press', 'BBC', 'Al Jazeera', 'The Guardian', 'India Today', 'PIB', 'Deccan Herald',
  'The Print', 'ThePrint', 'Scroll', 'The Wire', 'Bloomberg', 'CNN', 'DW', 'NPR'];

const FACT_CHECKERS = ['altnews.in', 'boomlive.in', 'factly.in', 'factchecker.in', 'newschecker.in',
  'vishvasnews.com', 'thequint.com/news/webqoof', 'pib.gov.in/factcheck', 'snopes.com', 'politifact.com',
  'fullfact.org', 'factcheck.org', 'Alt News', 'BOOM', 'Factly', 'Newschecker', 'Vishvas News',
  'WebQoof', 'PIB Fact Check', 'Snopes', 'PolitiFact', 'Full Fact', 'AFP Fact Check', 'Reuters Fact Check'];

const DEBUNK = /\b(fake|false|hoax|misleading|debunk\w*|fact[- ]?check\w*|no,? |viral claim|morphed|doctored|old video|not true|baseless|rumou?r)\b/i;

export function tokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ')
    .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

export function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  // Overlap coefficient: short headlines about the same event still match long ones.
  return inter / Math.min(A.size, B.size);
}

export function queryFrom(text, max = 8) {
  const counts = new Map();
  for (const w of tokens(text)) counts.set(w, (counts.get(w) || 0) + 1);
  const seen = tokens(text);
  // Keep first-appearance order among the most frequent words: headlines lead with the subject.
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, max).map(e => e[0]);
  return [...new Set(seen.filter(w => top.includes(w)))].slice(0, max).join(' ');
}

function decode(s) {
  return (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function stripTags(s) { return decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

export function parseRSS(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const outlet = stripTags(tag(b, 'source'));
    let title = stripTags(tag(b, 'title'));
    // Google News appends " - Outlet" to every title; drop it so it doesn't skew matching.
    if (outlet && title.endsWith(' - ' + outlet)) title = title.slice(0, -(outlet.length + 3));
    const srcUrl = (b.match(/<source[^>]*url="([^"]+)"/i) || [])[1] || '';
    items.push({
      title, outlet, outletUrl: decode(srcUrl),
      url: decode(tag(b, 'link')).trim(),
      date: tag(b, 'pubDate').trim(),
      snippet: stripTags(tag(b, 'description')),
    });
  }
  return items;
}

const has = (list, item) => list.some(k => (item.outletUrl + ' ' + item.outlet + ' ' + item.url).toLowerCase().includes(k.toLowerCase()));
export const isEstablished = item => has(ESTABLISHED, item);
export const isFactChecker = item => has(FACT_CHECKERS, item);

// Group articles that report the same thing. Each group becomes one story with many source links.
export function clusterArticles(items, threshold = 0.5) {
  const clusters = [];
  for (const it of items) {
    const t = tokens(it.title);
    let best = null, bestScore = 0;
    for (const c of clusters) {
      const s = similarity(t, c.tokens);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= threshold) {
      best.items.push(it);
      best.tokens = [...new Set([...best.tokens, ...t])];
    } else {
      clusters.push({ tokens: t, items: [it] });
    }
  }
  return clusters;
}

function dedupeSources(items) {
  const out = [], seen = new Set();
  for (const it of items) {
    const key = (it.outlet || it.url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: it.title, url: it.url, outlet: it.outlet || hostOf(it.url), date: it.date,
      established: isEstablished(it), factCheck: isFactChecker(it) });
  }
  return out;
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function storyStatus(sources, items) {
  const debunked = items.filter(i => isFactChecker(i) || DEBUNK.test(i.title));
  const est = sources.filter(s => s.established).length;
  if (debunked.length) return 'disputed';
  if (est >= 2) return 'corroborated';
  if (sources.length >= 3) return 'reported';
  return 'unverified';
}

function debriefFor(items, sources) {
  // Representative headline: the one sharing the most words with the rest of the group.
  const scored = items.map(i => {
    const t = tokens(i.title);
    return { i, s: items.reduce((acc, o) => acc + similarity(t, tokens(o.title)), 0) + (isEstablished(i) ? 0.5 : 0) };
  }).sort((a, b) => b.s - a.s);
  const lead = scored[0].i;
  const snippet = items.map(i => i.snippet).find(s => s && s.length > 60 && !s.startsWith(lead.title)) || '';
  const outlets = sources.map(s => s.outlet).filter(Boolean);
  const est = sources.filter(s => s.established).map(s => s.outlet);
  let text = `${lead.title}.`;
  if (snippet) text += ` ${snippet.slice(0, 280)}`;
  text += ` Reported by ${outlets.length} outlet${outlets.length === 1 ? '' : 's'}`;
  if (est.length) text += `, including ${est.slice(0, 4).join(', ')}`;
  text += '.';
  return { headline: lead.title, debrief: text };
}

export function buildReport(query, items, factItems = []) {
  const all = [...items];
  for (const f of factItems) if (!all.some(i => i.url === f.url)) all.push(f);
  const clusters = clusterArticles(all)
    .map(c => ({ c, sources: dedupeSources(c.items) }))
    .sort((a, b) => b.sources.length - a.sources.length);

  const stories = clusters.slice(0, 6).map(({ c, sources }) => {
    const { headline, debrief } = debriefFor(c.items, sources);
    return { headline, debrief, status: storyStatus(sources, c.items), sources: sources.slice(0, 10) };
  });

  const factChecks = dedupeSources(all.filter(i => isFactChecker(i) || DEBUNK.test(i.title))).slice(0, 8);
  const top = stories[0];
  let verdict;
  if (!stories.length) {
    verdict = { label: 'unverified', confidence: 'low',
      reasoning: 'No coverage found. A real event of any significance is usually reported by several outlets; absence of coverage is a warning sign, but the search may also have missed it.' };
  } else if (factChecks.some(f => f.factCheck)) {
    verdict = { label: 'likely false or misleading', confidence: 'medium',
      reasoning: 'A dedicated fact-checking outlet has published on this claim. Open the fact-check links below and read what they concluded before sharing.' };
  } else if (top.status === 'corroborated') {
    verdict = { label: 'likely true', confidence: 'medium',
      reasoning: `The main story is reported independently by ${top.sources.filter(s => s.established).length} established outlets. Check that their details match the claim you received — real stories are often twisted in the retelling.` };
  } else if (top.status === 'disputed') {
    verdict = { label: 'disputed', confidence: 'low',
      reasoning: 'Some coverage calls this false or misleading. Read those articles before trusting or sharing it.' };
  } else {
    verdict = { label: 'unverified', confidence: 'low',
      reasoning: 'Coverage exists but no established outlet confirms it. Treat it as unconfirmed.' };
  }
  return { mode: 'keyword', query, verdict, stories, factChecks, searchedCount: all.length };
}

async function fetchText(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SecureIndiaNewsCheck/1.0)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${hostOf(url)}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// Pull the headline and description out of a news article page.
export function extractArticle(html) {
  const meta = name => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    return decode((html.match(re) || html.match(re2) || [])[1] || '');
  };
  const title = meta('og:title') || stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description = meta('og:description') || meta('description');
  return { title: title.trim(), description: description.trim() };
}

export async function keywordSearch(input) {
  let text = input, article = null;
  if (/^https?:\/\//i.test(input)) {
    try {
      article = extractArticle(await fetchText(input));
      text = `${article.title} ${article.description}`;
    } catch (e) {
      // Fall back to words in the URL slug.
      text = decodeURIComponent(new URL(input).pathname).replace(/[-_/]+/g, ' ');
    }
  }
  const q = queryFrom(text);
  if (!q) throw new Error('Could not find searchable words in the input.');
  const rss = s => `https://news.google.com/rss/search?q=${encodeURIComponent(s)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const [main, fc] = await Promise.allSettled([fetchText(rss(q)), fetchText(rss(q + ' fact check'))]);
  if (main.status === 'rejected' && fc.status === 'rejected') throw new Error('News search is unreachable: ' + main.reason.message);
  const items = main.status === 'fulfilled' ? parseRSS(main.value) : [];
  const factItems = fc.status === 'fulfilled' ? parseRSS(fc.value).filter(i => isFactChecker(i) || DEBUNK.test(i.title)) : [];
  const report = buildReport(q, items.slice(0, 60), factItems);
  if (article) report.article = article;
  return report;
}
