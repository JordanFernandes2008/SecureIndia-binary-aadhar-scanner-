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
  assert.equal(r.factChecks.length, 1);
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
