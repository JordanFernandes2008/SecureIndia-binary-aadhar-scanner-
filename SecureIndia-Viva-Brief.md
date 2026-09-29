# SecureIndia Fact Desk: Viva Brief

## 1. One-line pitch
SecureIndia is a free, public fake-news checker. You paste any news, a WhatsApp forward or a link. It scans the web, merges every article that says the same thing into one story with one summary and all its sources, and gives an evidence-based verdict.

## 2. The problem
- Misinformation in India spreads mostly through WhatsApp forwards, with no source and no date.
- Ordinary people can't easily check a claim. Searching gives them 20 links that say the same thing, or a mix of real and fake.
- The existing fact-checkers (PIB Fact Check, Alt News, BOOM) only cover claims they have already investigated.

**What makes this different:** it removes duplicates. 10 articles saying the same thing become one story with one summary. If the news contains several stories, each gets its own card.

## 3. How it works, step by step
1. **Input.** The user pastes text or a link. For a link, the server reads the page's title and description.
2. **Search query.** Common words are removed and the most important words are kept.
3. **Web scan.** Google News RSS, Bing News RSS and GDELT are searched at the same time. The app also searches "<claim> fact check". If one source fails, the others still work.
4. **Relevance filter.** Word stemming, Rs/₹/rupees treated as the same word, and IDF weighting (distinctive words count most). The claim's names and numbers must appear. Non-news pages (Wikipedia, YouTube, social media) are dropped.
5. **Duplicate merging.** Headlines are compared using the overlap coefficient (shared words ÷ size of the smaller headline). An article joins a story if its average similarity to that story's articles is 0.5 or more.
6. **Source classification:** official (gov.in, RBI, UN), fact-checker (Alt News, BOOM, PIB Fact Check), established outlet (TOI, The Hindu, NDTV…), or other.
7. **Story status:**
   - *False:* a credible source's headline says fake, hoax, misleading, deepfake or similar.
   - *Disputed:* such words appear, but only from less credible sites.
   - *Corroborated:* an official source or an established outlet reports it.
   - *Reported:* 3 or more outlets carry it, none of them established.
   - *Unverified:* anything else.
8. **Verdict:** likely true, likely false or misleading, disputed, or unverified, with a confidence level (medium if official or 2+ outlets, low if 1) and a plain reason.
9. **Summary (debrief):** built only from what the articles say: how many, which outlets, the date range, other headlines, and who calls it fake. Nothing is invented.

## 4. Two modes
| | Keyword mode (live) | Deep AI mode (needs ANTHROPIC_API_KEY) |
|---|---|---|
| How | The rule-based pipeline above | Claude with live web search and page reading |
| Cost | Free | Paid per check |
| Strength | Fast, transparent, explainable | Reads the articles and understands meaning |
| Weakness | Matches words, doesn't understand meaning | Slower, costs money |

**Deep-mode safeguard:** every link in the AI's answer is compared against the pages it actually retrieved, and any link it didn't open is deleted. If the AI fails, the system falls back to keyword mode.

## 5. Tech stack
- **Frontend:** `index.html` in plain HTML, CSS and JavaScript. No framework and no build step.
- **Backend:** one Vercel serverless function, `api/analyze.js`, on Node.js 20+.
- **Libraries:** the Anthropic SDK, only for deep mode.
- **Hosting:** Vercel, which deploys automatically from GitHub `main`.
- **Tests:** Node's built-in test runner, 17 tests.
- **There is no Python or Java.** Everything is JavaScript.

## 6. Design
- **Concept:** a stop-motion paper "fact desk". Clippings, red string linking duplicates, and a rubber stamp for the verdict.
- **Animation:** CSS `steps()` at about 8 frames per second.
- **Accessibility:** reduced-motion support, keyboard navigation, screen-reader labels, checked contrast, 44px tap targets.
- **Extras:** Hindi-capable font, dark mode, WhatsApp share, shareable `/?q=` links.

## 7. Security and privacy
- No login and no database. What users paste isn't stored.
- All outside text is escaped before display, and only http/https links are allowed. That blocks script injection (XSS).
- Input is limited to 6,000 characters, with a rate limit of 6 checks per minute per IP.
- The API key stays on the server and is never sent to the browser.

## 8. Testing and results
- **17 automated tests, all passing.** They include regression tests built from real headlines and a fake network to test the fallback when Google blocks the server.
- **Real-data check on 9 claims:** verdicts 7/9 → 8/9; shown links that are on-topic 86% → 98%.
- **The one miss:** the fake "National Student Laptop Scheme" is rated disputed instead of false. It never called a false claim true.

## 9. Bugs found and fixed
1. **Google News blocked Vercel's servers (HTTP 503).** Fixed by searching Google, Bing and GDELT in parallel.
2. **True news showing as false.** Unrelated fact-checks made everything "false". Fixed by requiring relevant headlines that actually debunk the claim.
3. **Too-broad debunk words.** "No" and "fact check" were counted as debunks. Fixed with a strict word list.
4. **Unrelated stories chaining together during merging.** Fixed by averaging similarity against all members of a story.
5. **Off-topic links.** Fixed with the stemming and IDF relevance filter.
6. **Local news marked unverified.** Fixed so that one established outlet like TOI is enough.

## 10. Limitations (say these first)
- Keyword mode matches words, it doesn't understand meaning. It can confirm an event but miss a wrong detail, such as a location.
- It checks text only, not images or videos.
- The trusted-outlet lists are hand-picked, which is a possible bias.
- The rate limit is per server instance.
- Deep mode hasn't been tested live yet.

## 11. Future work
Deep mode by default; image and video checking; full Hindi and regional search; a WhatsApp bot; a stronger rate limit; outlet credibility learned from data.

## 12. Likely questions
- **How do you detect duplicates?** Overlap coefficient on headline words, with an average-similarity threshold of 0.5.
- **Why not AI for everything?** Cost, speed and transparency. AI is an optional upgrade with automatic fallback.
- **How do you stop the AI inventing sources?** Every cited URL is checked against the pages it actually fetched.
- **What if a fake is shared widely?** Volume doesn't count. Credibility does, and one credible debunk overrides the shares.
- **What's your accuracy?** 8/9 on our real-data test set. It's small, not a benchmark.
- **Why SIH26188?** Be ready: the repo started as an Aadhaar QR prototype. Confirm with your team which problem statement you're presenting under.
