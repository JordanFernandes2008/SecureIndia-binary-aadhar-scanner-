import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRSS, clusterArticles, buildReport, queryFrom, extractArticle } from '../lib/newsSearch.js';
import { parseResult, keepSeenSources } from '../lib/claudeAnalyze.js';

const item = (title, outlet, url) => `<item><title>${title} - ${outlet}</title><link>${url}</link>
  <pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate><description>&lt;a href="x"&gt;${title}&lt;/a&gt;</description>
  <source url="https://${outlet.toLowerCase().replace(/ /g, '')}.com">${outlet}</source></item>`;

const RSS = `<rss><channel>
${item('ISRO launches Chandrayaan-4 mission from Sriharikota', 'The Hindu', 'https://thehindu.com/a')}
${item('Chandrayaan-4 launched successfully from Sriharikota by ISRO', 'NDTV', 'https://ndtv.com/b')}
${item('ISRO Chandrayaan-4 launch: mission lifts off from Sriharikota', 'Reuters', 'https://reuters.com/c')}
${item('RBI keeps repo rate unchanged at 5.5 percent', 'Mint', 'https://livemint.com/d')}
${item('Repo rate unchanged: RBI holds at 5.5 percent', 'Business Standard', 'https://business-standard.com/e')}
</channel></rss>`;

test('parses Google News RSS and strips outlet suffix', () => {
  const items = parseRSS(RSS);
  assert.equal(items.length, 5);
  assert.equal(items[0].title, 'ISRO launches Chandrayaan-4 mission from Sriharikota');
  assert.equal(items[0].outlet, 'The Hindu');
});

test('same-story articles merge; different stories stay separate', () => {
  const clusters = clusterArticles(parseRSS(RSS));
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map(c => c.items.length).sort(), [2, 3]);
});

test('report has one debrief per story with all its links', () => {
  const r = buildReport('q', parseRSS(RSS));
  assert.equal(r.stories.length, 2);
  assert.equal(r.stories[0].sources.length, 3);
  assert.equal(r.stories[0].status, 'corroborated');
  assert.equal(r.verdict.label, 'likely true');
  assert.ok(r.stories[0].debrief.includes('3 outlets'));
});

test('fact-check coverage flips verdict', () => {
  const fc = parseRSS(`<rss>${item('Fact Check: viral claim of Rs 5000 for every citizen is fake', 'Alt News', 'https://altnews.in/f')}</rss>`);
  const r = buildReport('q', [], fc);
  assert.equal(r.verdict.label, 'likely false or misleading');
  assert.equal(r.stories[0].sources[0].factCheck, true);
  // Already listed under the story, so not repeated in the separate fact-check list.
  assert.equal(r.factChecks.length, 0);
});

test('empty search is unverified', () => {
  assert.equal(buildReport('q', []).verdict.label, 'unverified');
});

test('query extraction and article meta', () => {
  assert.ok(queryFrom('The government has announced that every citizen will get Rs 5000').includes('government'));
  const a = extractArticle('<meta property="og:title" content="Big &amp; news"><meta name="description" content="desc">');
  assert.deepEqual(a, { title: 'Big & news', description: 'desc' });
});

test('Claude result parsing drops URLs it never retrieved', () => {
  const r = parseResult('blah <result>{"verdict":{"label":"likely true"},"stories":[{"headline":"h","sources":[{"url":"https://www.thehindu.com/a/"},{"url":"https://made-up.com/x"}]}],"factChecks":[{"url":"https://fake.org"}]}</result>');
  const out = keepSeenSources(r, new Set(['thehindu.com/a']));
  assert.equal(out.stories[0].sources.length, 1);
  assert.equal(out.stories[0].sources[0].established, true);
  assert.equal(out.factChecks.length, 0);
});

// Real headlines from a live web search (Sep 2026), kept as regression data.
const real = (title, url) => ({ title, url, outlet: new URL(url).hostname.replace(/^www\./, ''), outletUrl: '', date: '', snippet: '' });

test('real data: unrelated PIB debunks are not chained into one story, all links kept', () => {
  const r = buildReport('q', [
    real('PIB Fact Check flags fake AI video of FM Sitharaman promoting investment scheme', 'https://www.thehawk.in/news/x'),
    real('PIB Fact Check flags fake AI video of FM Sitharaman promoting investment scheme', 'https://www.ap7am.com/en/124986/x'),
    real('PIB fact check: viral video of finance minister promoting investment scheme is fake', 'https://www.newsonair.gov.in/a'),
    real('Govt denies viral video claiming FM endorsed fraud investment scheme', 'https://www.newsonair.gov.in/b'),
    real('Govt debunks fake video claiming FM Nirmala Sitharaman promoted investment scheme', 'https://www.newsonair.gov.in/c'),
    real('PIB fact check warns of scam using fake RBI message', 'https://www.newsonair.gov.in/d'),
    real('PIB fact check unit dismisses viral video claiming India withdrew funds from UK', 'https://www.newsonair.gov.in/e'),
  ]);
  assert.equal(r.verdict.label, 'likely false or misleading');
  assert.equal(r.stories[0].sources.length, 5);
  assert.equal(r.stories[0].status, 'false');
  assert.ok(r.stories.some(s => /withdrew funds from UK/.test(s.headline)));
  assert.ok(r.stories.some(s => /fake RBI message/.test(s.headline)));
});

test('real data: official government source corroborates a real announcement', () => {
  const r = buildReport('q', [
    real('RBI Monetary Policy: Repo Rate Unchanged, GDP Outlook Brightens', 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2173560'),
    real('Check the Current Repo Rate 2026', 'https://www.bankbazaar.com/home-loan/repo-rate.html'),
  ]);
  assert.equal(r.verdict.label, 'likely true');
});

import { parseBingRSS, parseGDELT, keywordSearch } from '../lib/newsSearch.js';

const BING = `<rss><channel>
<item><title>No GST on UPI payments above Rs 2,000, clarifies finance ministry</title>
<link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=x&amp;url=https%3a%2f%2fwww.thehindu.com%2fbusiness%2fupi-gst%2farticle1.ece&amp;c=1&amp;mkt=en-in</link>
<description>The ministry said reports of GST on UPI transactions over Rs 2,000 are false.</description>
<pubDate>Fri, 18 Apr 2025 10:00:00 GMT</pubDate><News:Source>The Hindu</News:Source></item>
</channel></rss>`;

const GDELT = JSON.stringify({ articles: [
  { url: 'https://www.pib.gov.in/PressRelease.aspx?id=1', title: 'Claims of GST on UPI transactions over Rs 2000 are false and baseless',
    seendate: '20250418T093000Z', domain: 'pib.gov.in', language: 'English' },
  { url: 'https://example.fr/x', title: 'Article en français', seendate: '20250418T093000Z', domain: 'example.fr', language: 'French' },
]});

test('Bing RSS: real article URL is unwrapped from the click-tracker', () => {
  const [it] = parseBingRSS(BING);
  assert.equal(it.url, 'https://www.thehindu.com/business/upi-gst/article1.ece');
  assert.equal(it.outlet, 'The Hindu');
});

test('GDELT: parses articles, drops other languages, converts dates', () => {
  const items = parseGDELT(GDELT);
  assert.equal(items.length, 1);
  assert.equal(items[0].outlet, 'pib.gov.in');
  assert.equal(items[0].date, '2025-04-18T09:30:00Z');
});

test('keyword scan still works when Google News returns 503', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('news.google.com')) return new Response('Service Unavailable', { status: 503 });
    if (u.includes('bing.com')) return new Response(BING, { status: 200 });
    if (u.includes('gdeltproject')) return new Response(GDELT, { status: 200 });
    throw new Error('unexpected ' + u);
  };
  try {
    const r = await keywordSearch('upi tax for over 2000');
    assert.ok(r.stories.length >= 1);
    assert.ok(r.stories.flatMap(s => s.sources).some(s => s.url.includes('thehindu.com')));
    assert.equal(r.verdict.label, 'likely false or misleading');
  } finally { globalThis.fetch = real; }
});

test('keyword scan gives a clear error only when every source fails', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  try { await assert.rejects(keywordSearch('upi tax for over 2000'), /All news sources are unreachable/); }
  finally { globalThis.fetch = real; }
});

test('regression: unrelated fact-checks do not turn a true story false', () => {
  const r = buildReport('RBI keeps repo rate unchanged', [
    real('RBI keeps repo rate unchanged at 5.25%, reduces GDP growth projection', 'https://newsonair.gov.in/a'),
    real('RBI keeps repo rate unchanged at 6.5 percent', 'https://www.business-standard.com/b'),
    real('RBI MPC update: Central bank keeps repo rate unchanged at 5.25%', 'https://www.businesstoday.in/c'),
  ], [
    real('Fact Check: Old video of Mumbai floods falsely shared as recent', 'https://www.altnews.in/n1'),
    real('Fact Check: Viral image of PM Modi with celebrity is morphed', 'https://www.boomlive.in/n2'),
  ]);
  assert.equal(r.verdict.label, 'likely true');
  assert.ok(!r.stories.some(s => s.status === 'false'));
});

test('regression: ordinary words like "no" or "fact check" are not a debunk', () => {
  const r = buildReport('No change in repo rate RBI', [
    real('No change in repo rate, RBI holds at 5.25%', 'https://www.pib.gov.in/x'),
    real('Fact check: Yes, RBI did keep the repo rate unchanged', 'https://www.boomlive.in/y'),
  ]);
  assert.notEqual(r.verdict.label, 'likely false or misleading');
});

test('regression: local news reported by TOI alone is likely true, old unrelated blasts are dropped', () => {
  const q = 'cylinder blasts in vashi, navi mumbai, 2 severely injured';
  const r = buildReport(q, [
    real('Two severely injured in cylinder blast at Navi Mumbai eatery, hospital glass shattered in Vashi', 'https://timesofindia.indiatimes.com/city/navi-mumbai/d'),
    real('Navi Mumbai Blast: 2 People Suffer Severe Burn Injuries After LPG Cylinder Explosion', 'https://www.freepressjournal.in/a'),
    real('At least 14 injured in cylinder blast at Mumbai Dharavi', 'https://www.deccanherald.com/x'),
    real('Bengaluru: two dead, four injured in cylinder blast', 'https://www.deccanherald.com/y'),
  ]);
  assert.equal(r.verdict.label, 'likely true');
  const urls = r.stories.flatMap(s => s.sources.map(x => x.url));
  assert.ok(urls.some(u => u.includes('timesofindia')));
  assert.ok(!urls.some(u => u.includes('deccanherald')));
});

test('a TOI article calling the claim fake still makes it false', () => {
  const r = buildReport('RBI discontinuing 500 rupee notes', [
    real('Fact check: Claim that RBI is discontinuing Rs 500 notes is fake', 'https://timesofindia.indiatimes.com/x'),
    real('Is RBI discontinuing Rs 500 notes? Here is the truth', 'https://www.example.com/y'),
  ]);
  assert.equal(r.verdict.label, 'likely false or misleading');
});
