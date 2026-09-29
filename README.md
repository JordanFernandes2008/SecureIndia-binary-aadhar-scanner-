# SecureIndia

Aadhaar Secure QR verification — a working slice of the SIH26188 prototype.
Team TECHNOVA · Smart India Hackathon 2026.

## What it does

Reads the Secure QR printed on an Aadhaar card and verifies UIDAI's RSA
signature over the data. If the signature verifies, UIDAI issued exactly
those bytes and nothing has been altered since.

**Everything happens in the browser.** No server, no upload, no database
call, no API key. The document never leaves the device.

## How the verification works

1. The QR decodes to a long decimal number — a byte stream, not text.
   (This is why ordinary QR apps show nothing useful.)
2. Convert the number to bytes and GZIP-decompress it.
3. The last 256 bytes are UIDAI's RSA signature. Everything before is the
   signed data.
4. Hash the signed data with SHA-256 and verify the signature against
   UIDAI's published public certificate.
5. Only after the signature verifies do we parse the fields — name, DOB,
   gender, address, and the signed photograph.

Change one character anywhere in the data and the hash changes, so the
signature no longer matches. A forger cannot produce a valid signature
without UIDAI's private key, which only UIDAI holds.

## Setup

You need UIDAI's public certificate. Download it from uidai.gov.in
(Aadhaar Secure QR / offline eKYC documentation) and load it in Step 1
of the app. It is stored only in your browser session.

## Fake news check (`news.html`)

Paste a forwarded message, headline, article or link. The server searches
the web, merges articles that report the same thing into **one story with
one debrief**, and lists every link where that story was found. If the
input contains several different stories, each gets its own card, debrief
and links. Fact-checks found are listed separately.

Two modes, chosen automatically on the server:

- **Deep mode** (set `ANTHROPIC_API_KEY` in Vercel -> Project -> Settings ->
  Environment Variables). Claude searches the live web, reads the link,
  groups coverage into stories and writes the debriefs. Any source URL
  Claude did not actually retrieve is dropped before it reaches the page.
  Each check costs money (model tokens plus web searches), so the endpoint
  is rate-limited per IP (`RATE_LIMIT_PER_MIN`, default 6).
- **Keyword mode** (no key). Google News search, grouped by headline
  similarity, with a rule-based verdict. Free, but cruder: it matches
  words, it does not understand the claim.

The verdict is an evidence summary, not a ruling. Always open the links.

Run locally: `npm install && npm run dev`, then open
http://localhost:3000/news.html. Tests: `npm test`.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project → Import** the repo.
3. Framework preset: **Other**. No build command. Output directory: `./`
4. Optional: add `ANTHROPIC_API_KEY` for deep fake-news analysis.
5. Deploy.

The Aadhaar page is fully static. The fake news page uses one serverless
function, `api/analyze.js`.

## Known limitations

- The Secure QR is dense. Blurry photos and photocopies often fail to
  decode — this is an image quality limit, not a fraud signal.
- The signed photograph is JPEG2000, which browsers cannot render. We
  report its presence and size rather than displaying it.
- Older Aadhaar cards use a plain-text XML QR with no signature. Those
  are detected and reported as unverifiable.
- DigiLocker QRs use a different format and are verified through
  DigiLocker's own endpoint, not this flow.
- A valid signature proves the **document** is genuine. It does not
  prove the person presenting it is the holder — that requires matching
  the signed photograph against the person, which is the next phase.

## Not implemented yet

- OCR cross-check of printed card text against the signed QR fields
- Face match against the signed photograph
- AI forensics track for unsigned documents
- Officer dashboard and audit log
