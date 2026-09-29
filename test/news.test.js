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
