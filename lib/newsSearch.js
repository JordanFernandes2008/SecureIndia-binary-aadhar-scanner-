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
  'The Print', 'ThePrint', 'Scroll', 'The Wire', 'Bloomberg', 'CNN', 'DW', 'NPR',
  'newindianexpress.com', 'telegraphindia.com', 'firstpost.com', 'moneycontrol.com', 'financialexpress.com',
  'businesstoday.in', 'outlookindia.com', 'thenewsminute.com', 'deccanchronicle.com', 'nbcnews.com', 'cbsnews.com',
  'abcnews.go.com', 'wsj.com', 'economist.com', 'nature.com', 'science.org', 'afp.com', 'aljazeera.net'];

const FACT_CHECKERS = ['altnews.in', 'boomlive.in', 'factly.in', 'factchecker.in', 'newschecker.in',
  'vishvasnews.com', 'thequint.com/news/webqoof', 'pib.gov.in/factcheck', 'snopes.com', 'politifact.com',
  'fullfact.org', 'factcheck.org', 'dfrac.org', 'cyberpeace.org', 'dau.mcaindia.in', 'newsmeter.in',
  'factcrescendo.com', 'thelogicalindian.com', 'indiatoday.in/fact-check', 'factcheck.afp.com', 'Alt News', 'BOOM', 'Factly', 'Newschecker', 'Vishvas News',
  'WebQoof', 'PIB Fact Check', 'Snopes', 'PolitiFact', 'Full Fact', 'AFP Fact Check', 'Reuters Fact Check'];

// Words that say a claim is false. Deliberately strict: "fact check" alone is not a verdict
// (fact-checks also confirm true claims), and ordinary words like "no" must not count.
const DEBUNK = /\b(fake|false(ly)?|hoax|misleading|debunk(s|ed|ing)?|morphed|doctored|fabricated|misinformation|not true|baseless|scam|ai[- ]generated|deepfake|old video|misattributed)\b/i;

export function tokens(s) {
  return (s || '').toLowerCase().replace(/(\d),(?=\d{2,3}\b)/g, '$1').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ')
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
// Primary government sources (PIB, ministries, RBI, ECI, state portals).
const OFFICIAL = /(^|[./])(gov\.in|nic\.in|rbi\.org\.in|npci\.org\.in|isro\.gov\.in|gov|mil|un\.org|who\.int|europa\.eu|g20\.in)(\/|$)/i;
export const isOfficial = item => OFFICIAL.test(hostOf(item.url) + '/') || OFFICIAL.test(hostOf(item.outletUrl) + '/');
const credible = i => isFactChecker(i) || isOfficial(i) || isEstablished(i);

// Fact-check boilerplate is shared by unrelated debunks, so it must not decide which story an article belongs to.
const CLUSTER_STOP = new Set(('pib fact check checks checked viral video videos fake false claim claims claiming claimed ' +
  'message messages hoax debunk debunks debunked misleading govt government flags flagged warns dismisses denies unit ' +
  'social media whatsapp').split(' '));
const clusterTokens = title => tokens(title).filter(w => !CLUSTER_STOP.has(w));

// Group articles that report the same thing. Each group becomes one story with many source links.
export function clusterArticles(items, threshold = 0.5) {
  const clusters = [];
  for (const it of items) {
    const t = clusterTokens(it.title);
    let best = null, bestScore = 0;
    for (const c of clusters) {
      // Average similarity to every member: a growing word pool would chain unrelated stories together.
      const s = c.members.reduce((acc, m) => acc + similarity(t, m), 0) / c.members.length;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= threshold) {
      best.items.push(it);
      best.members.push(t);
    } else {
      clusters.push({ members: [t], items: [it] });
    }
  }
  return clusters;
}

function dedupeSources(items) {
  const out = [], seen = new Set();
  for (const it of items) {
    const key = (it.url || it.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: it.title, url: it.url, outlet: it.outlet || hostOf(it.url), date: it.date,
      established: isEstablished(it), official: isOfficial(it), factCheck: isFactChecker(it) });
  }
  return out;
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function storyStatus(sources, items) {
  const debunked = items.filter(i => DEBUNK.test(i.title));
  if (debunked.some(credible)) return 'false';
  if (debunked.length) return 'disputed';
  const est = new Set(sources.filter(s => s.established).map(s => s.outlet)).size;
  if (est >= 2 || sources.some(s => s.official)) return 'corroborated';
  if (new Set(sources.map(s => s.outlet)).size >= 3) return 'reported';
  return 'unverified';
}

function fmtDay(d) {
  const t = new Date(d);
  return isNaN(t) ? '' : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

// Keyword-mode debrief, built only from what the articles themselves say: who reported it, when,
// how else it was worded, and whether credible sources call it fake. Never invents facts.
function debriefFor(items, sources) {
  // Representative headline: the one sharing the most words with the rest of the group.
  const scored = items.map(i => {
    const t = clusterTokens(i.title);
    return { i, s: items.reduce((acc, o) => acc + similarity(t, clusterTokens(o.title)), 0) + (credible(i) ? 0.5 : 0) };
  }).sort((a, b) => b.s - a.s);
  const lead = scored[0].i;
  const outlets = [...new Set(sources.map(s => s.outlet).filter(Boolean))];
  const trusted = [...new Set(sources.filter(s => s.established || s.official || s.factCheck).map(s => s.outlet))];
  const parts = [];

  const snippet = items.map(i => i.snippet).find(x => x && x.length > 60 && similarity(tokens(x), tokens(lead.title)) < 0.8);
  if (snippet) parts.push(snippet.slice(0, 280).replace(/\s+\S*$/, '') + (snippet.length > 280 ? '…' : ''));

  let who = `${items.length} article${items.length === 1 ? '' : 's'} from ${outlets.length} outlet${outlets.length === 1 ? '' : 's'}`;
  if (trusted.length) who += ` (including ${listJoin(trusted.slice(0, 3))})`;
  const days = items.map(i => new Date(i.date)).filter(d => !isNaN(d)).sort((a, b) => a - b);
  let when = '';
  if (days.length) {
    const a = fmtDay(days[0]), b = fmtDay(days[days.length - 1]);
    when = a === b ? ` on ${a}` : ` between ${a} and ${b}`;
  }
  parts.push(`Found in ${who}${when}.`);

  const seen = new Set([lead.title.toLowerCase()]);
  const alt = items.map(i => i.title).filter(t => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return similarity(clusterTokens(t), clusterTokens(lead.title)) < 0.9;
  }).slice(0, 2);
  if (alt.length) parts.push(`Also headlined: ${alt.map(t => `“${t}”`).join('; ')}.`);

  const debunkers = [...new Set(items.filter(i => DEBUNK.test(i.title) && credible(i)).map(i => i.outlet || hostOf(i.url)))];
  if (debunkers.length) parts.push(`${listJoin(debunkers.slice(0, 3))} describe${debunkers.length === 1 ? 's' : ''} the claim as fake or misleading.`);
  else if (items.some(i => DEBUNK.test(i.title))) parts.push('Some coverage questions whether the claim is true.');

  return { headline: lead.title, debrief: parts.join(' ') };
}

// How much of the user's claim a headline is actually about (share of query words it contains).
export function relevance(title, query) {
  const q = [...new Set(tokens(query))], t = new Set(tokens(title));
  if (!q.length) return 1; // nothing to compare against
  return q.filter(w => t.has(w)).length / q.length;
}

export function buildReport(query, items, factItems = []) {
  // Search engines pad results with loosely related articles; only keep ones about this claim.
  const need = tokens(query).length <= 2 ? 0.5 : 0.4;
  const all = items.filter(i => relevance(i.title, query) >= need);
  for (const f of factItems) if (relevance(f.title, query) >= need && !all.some(i => i.url === f.url)) all.push(f);
  const clusters = clusterArticles(all)
    .map(c => ({ c, sources: dedupeSources(c.items) }))
    .sort((a, b) => b.sources.length - a.sources.length);

  const stories = clusters.slice(0, 6).map(({ c, sources }) => {
    const { headline, debrief } = debriefFor(c.items, sources);
    return { headline, debrief, status: storyStatus(sources, c.items), sources: sources.slice(0, 10) };
  });

  // Only fact-checks that are not already listed under a story, so no link is shown twice.
  const shown = new Set(stories.flatMap(st => st.sources.map(x => x.url)));
  const factChecks = dedupeSources(all.filter(i => (isFactChecker(i) || DEBUNK.test(i.title)) && !shown.has(i.url))).slice(0, 8);
  // The verdict follows the best-evidenced story, not whichever cluster happens to be largest.
  const top = stories.find(st => st.status === 'false') ||
    stories.find(st => st.status === 'corroborated') || stories[0];
  let verdict;
  if (!stories.length) {
    verdict = { label: 'unverified', confidence: 'low',
      reasoning: 'No coverage found. A real event of any significance is usually reported by several outlets; absence of coverage is a warning sign, but the search may also have missed it.' };
  } else if (top.status === 'false') {
    verdict = { label: 'likely false or misleading', confidence: 'medium',
      reasoning: 'A fact-checker, official government source, or established outlet has called this false or fake. Open the links below and read what they concluded before sharing.' };
  } else if (top.status === 'corroborated') {
    const off = top.sources.some(s => s.official);
    verdict = { label: 'likely true', confidence: 'medium',
      reasoning: (off ? 'An official government source reports this' : `The main story is reported independently by ${new Set(top.sources.filter(s => s.established).map(s => s.outlet)).size} established outlets`) +
        '. Check that their details match the claim you received — real stories are often twisted in the retelling.' };
  } else if (top.status === 'disputed') {
    verdict = { label: 'disputed', confidence: 'low',
      reasoning: 'Some coverage calls this false or misleading. Read those articles before trusting or sharing it.' };
  } else {
    verdict = { label: 'unverified', confidence: 'low',
      reasoning: 'Coverage exists but no established outlet confirms it. Treat it as unconfirmed.' };
  }
  return { mode: 'keyword', query, verdict, stories, factChecks, searchedCount: items.length + factItems.length };
}

// Bing News RSS: links go through a click-tracker that carries the real URL in `url=`.
export function parseBingRSS(xml) {
  return parseRSS(xml).map((it, idx) => {
    const block = (xml.match(/<item>([\s\S]*?)<\/item>/gi) || [])[idx] || '';
    let url = it.url;
    try { const real = new URL(url).searchParams.get('url'); if (real) url = real; } catch {}
    const outlet = it.outlet || stripTags(tag(block, 'News:Source')) || hostOf(url);
    return { ...it, url, outlet };
  });
}

// GDELT wants quoted phrases or plain words; strip anything else.
export function gdeltQuery(q) { return q.replace(/[^\p{L}\p{N} ]+/gu, ' ').trim(); }

export function parseGDELT(json) {
  let data; try { data = JSON.parse(json); } catch { throw new Error('GDELT returned an unreadable response'); }
  return (data.articles || []).filter(a => !a.language || /english|hindi/i.test(a.language)).map(a => {
    const d = String(a.seendate || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    return { title: String(a.title || '').trim(), url: a.url, outlet: a.domain || hostOf(a.url), outletUrl: '',
      date: d ? `${d[1]}-${d[2]}-${d[3]}T${d[4]}:${d[5]}:${d[6]}Z` : '', snippet: '' };
  });
}

async function fetchText(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 SecureIndiaNewsCheck/1.0',
        'accept': 'application/rss+xml, application/xml, application/json, text/html;q=0.8, */*;q=0.5', 'accept-language': 'en-IN,en;q=0.9' } });
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

  // Several independent news indexes, queried in parallel. Any one of them is enough;
  // Google News in particular often refuses requests from cloud servers.
  const providers = [
    ['Google News', s => fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(s)}&hl=en-IN&gl=IN&ceid=IN:en`).then(parseRSS)],
    ['Bing News', s => fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(s)}&format=rss&setmkt=en-IN&cc=IN`).then(parseBingRSS)],
    ['GDELT', s => fetchText(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gdeltQuery(s))}&mode=artlist&format=json&maxrecords=60&sort=datedesc&timespan=1y`).then(parseGDELT)],
  ];
  const jobs = [];
  for (const [name, run] of providers) {
    jobs.push(run(q).then(r => ({ name, kind: 'main', items: r })));
    if (name !== 'GDELT') jobs.push(run(q + ' fact check').then(r => ({ name, kind: 'fc', items: r })));
  }
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!ok.length) {
    const why = settled.map(x => x.reason && x.reason.message).filter(Boolean);
    throw new Error('All news sources are unreachable right now (' + [...new Set(why)].slice(0, 3).join('; ') + '). Try again in a minute.');
  }
  const uniq = list => { const seen = new Set(); return list.filter(i => i.url && i.title && !seen.has(i.url) && seen.add(i.url)); };
  const items = uniq(ok.filter(x => x.kind === 'main').flatMap(x => x.items));
  const factItems = uniq(ok.filter(x => x.kind === 'fc').flatMap(x => x.items)).filter(i => isFactChecker(i) || DEBUNK.test(i.title));
  const report = buildReport(q, items.slice(0, 60), factItems);
  if (article) report.article = article;
  return report;
}
