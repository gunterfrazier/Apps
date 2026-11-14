# Veritas Logos

A phone-first Bible study guide builder and reference tool, for personal use. It grew out of the original single-file Veritas Logos prototype and reuses BibliaTree's family tree, pathfinder and timeline tools.

**The rule for its data:** everything stored comes from a named source that can be checked. There is no hand-written commentary. Culture, idioms and theological readings come from the AI assistant on request, labeled as drafts that say what each claim rests on.

## What's in it

- **Reader:** 23 built-in translations: the BSB, NHEB, KJV, ASV and YLT, plus the LEB, BBE, UKJV, AKJV and OEB, the Geneva, Darby, Webster, Rotherham and Noyes Bibles, the JPS Tanakh, the Douay-Rheims and CPDV, and the Twentieth Century, Anderson and Haweis New Testaments, Tyndale and Wycliffe. The ESV, NIV, NLT and NKJV can be read too, a chapter at a time, through the owner's connector (see below). Side-by-side comparison, highlights, bookmarks, notes and read-aloud. Read-aloud uses the browser's own voice, and where there's none (the Claude app on Android) a voice built into the app.
- **Insights on any verse or passage:** where it's quoted, paralleled or possibly alluded to, where historic confessions cite it, and which Nave's topics cite it, plus an AI explanation of the first audience, idioms, culture, doctrines and theological lenses.
- **Hebrew and Greek:** every word of every verse, with grammar, lexicon entries and a concordance.
- **Study guide builder:** from any passage or topic, in four formats, in one step or through six guided steps. Guides can be edited, exported, shared by link and embedded.
- **AI assistant:** explains passages, answers questions and drafts guide sections. It works from the app's real text, and flags references that don't exist.
- **Explore and expand:** every guide section, and the reader's insight sections, can be researched further with AI, including a background overview. It searches the app's library, and the app checks each citation word for word. It can't search the live web.
- **Deep exegesis:** an AI synopsis of a passage from the chosen lens, worked from the Hebrew or Greek. The app checks its references, word studies and quotes, and it stays labeled as a draft.
- **Search this passage:** looks for a word or topic in selected verses, including the Hebrew or Greek behind it, the topics, glossary, confessions and writers. This part is all checked data and needs no AI. An optional AI reading then shows how the chosen lens understands it, keeping what the text says apart from what the tradition brings.
- **People:** 3,172 people, rebuilt with the Bible as the final authority. Every family claim from TIPNR, BibleData, Theographic, ACAI and the original BibliaTree file is tested against the tagged Hebrew and Greek, and the app's "How this was checked" page lists what was kept, changed and dropped.
- **Book guides for every book of the Bible:** a page for the whole book, with every part labeled Counted, Quoted, AI draft or Yours. Counted: length and Hebrew or Greek word count, the words the book uses far more than the rest of its Testament and where they cluster by chapter, words found only in that book, the people named, the Scripture it quotes (or, for the Old Testament, where the New Testament quotes it), where the Greek editions differ or the Hebrew is read one way and written another (Qere and Ketiv), the records a history book names as its sources, and the names in the Psalm titles (read from STEPBible's Hebrew, since English verse numbers leave the titles out). Quoted, word for word from CCEL's public-domain editions with page numbers: what Clement of Rome, Ignatius, Polycarp, Papias, Justin, Irenaeus, Melito, Clement of Alexandria, Tertullian, Origen, Dionysius, Eusebius, Athanasius, Jerome and the Muratorian fragment said about the book (and Josephus, in the app's own Whiston text), plus Matthew Henry's introduction and chapter summaries and Easton's and Smith's entries. AI drafts on request: modern views on author and date (naming who holds each), an outline, themes through the chosen lens and study questions. Your notes save to the Notebook, and the whole guide can become an editable study guide that exports to Word or PDF.
- **Genre and symbols:** counts a passage's literary features, finds passages that echo its key words across Hebrew, Greek and the Septuagint, and lines them up side by side. Optional AI drafts assess the genre and read the symbols through the chosen lens. The app sets the grades for shared wording and recorded links itself, so the AI can't claim them.
- **AI work:** AI requests run on their own, outside any screen, and are saved as they go. Moving around the app doesn't stop them. If the phone pauses a minimized app, they carry on when it returns, and a long exegesis resumes from its last finished step. The AI work page lists everything and has a connection check.
- **Theological lenses:** Reformed, Covenant / Federal, Arminian, Catholic, Orthodox, Lutheran, Anglican, Baptist, Pentecostal, Messianic and Dispensational.
- **People:** 3,129 people, with family links citing their verses, a family tree, a pathfinder and a timeline.
- **Church history:** an interactive timeline of 105 councils, schisms, reformations, creeds and theological shifts, each with a checked source.
- **Timelines:** both charts keep every item on a fixed lane, so nothing jumps while you drag or pinch. A pinned bar steps through periods and zooms, and each chart remembers its view when you come back to it.
- **Scholar tools:** citations in five formats, a word-by-word interlinear, grammar search, the Septuagint and Vulgate side by side, Greek edition differences, a Gospel synopsis, 45 creeds across traditions, the deuterocanon, the Apostolic Fathers in Greek and English, Josephus, how a verse was read century by century, disputed dates, a notebook with backlinks, a bibliography with PDFs, advanced search and an AI research mode that checks its quotes.
- **Connections:** links, embeds and a REST API. See `docs-API.md`.

Every section of a guide says where it came from: cited sources, AI draft or your own writing. No Scripture text is ever generated. If a verse doesn't exist, the app says so.

## How it's used today

It runs as a private page in Claude. AI goes through your Claude account, and notes and guides are saved privately to that account, so no server, API key or separate bill is needed. To update it, run `npm run build` and publish `dist-artifact/index.html` with the files in `dist/`, including `voice-worker.js` and `voice/`.

## Run it

Requires Node 22.13 or later.

```bash
npm install
npm run build
npm run api          # website and API at http://localhost:8787
```

`npm run dev` rebuilds the app on change at http://localhost:5173, without the API.

`npm run build` packs the data files in `dist/data`, which takes them from about 240 MB to about 100 MB. Each is gzip-compressed, then base64-encoded into a JSON string, because Claude's artifact host serves `.json` files only as text. They keep their names, and the app and the server unpack them when they're read, so they work on any host without special settings. `public/data` stays plain, and `npm run dev` doesn't pack. The host also holds at most 512 files per version, so the per-book `links` and `xref` folders go out as one file each, `links.bundle.json` and `xref.bundle.json`; the app and the server read a bundle where there is one and the separate files where there isn't.

The build also packs the built-in read-aloud voice into `dist/voice`: `public/voice/norman.bin` is split into three JSON pieces packed the same way (about 13 MB each, under the host's 16 MB limit for a text file), next to ONNX Runtime's `ort-wasm-simd-threaded.wasm`, which the host serves as it is, and `dist/voice-worker.js` runs them. Together they add about 55 MB, so the published app is about 158 MB of the host's 256 MB.

Checks: `npm run typecheck`, `npm test`, `npm run data:check`.

### The built-in voice and its license

The built-in voice turns text into phonemes with eSpeak NG, which is licensed GPL-3.0-or-later. It's compiled to WebAssembly from [rhasspy/espeak-ng](https://github.com/rhasspy/espeak-ng) at commit `8593723f10cfd9befd50de447f14bf0a9d2a14a4`, the fork Piper's voices were trained with, by `scripts/build_espeak.sh` (`npm run data:espeak`; it needs git, cmake, a C compiler and Zig from `pip install ziglang`). It writes `src/voice/espeak/espeak-ng.wasm` and the English data `src/voice/espeak/espeak-ng-data.bin`, and the build bundles both into `voice-worker.js`. Checked against phonemizer.js 1.2.1, which the app used before, it gives the same phonemes on 3,456 sampled verses, so the voice sounds the same.

Because it carries eSpeak NG, `voice-worker.js` is offered under the GNU GPL, version 3 or later, as a whole. Its complete source is this repository's `src/voice` folder and `scripts/build_espeak.sh`, with that commit of rhasspy/espeak-ng and ONNX Runtime Web (MIT). The license text is in `LICENSES/GPL-3.0.txt` and is published with the app as `licenses/GPL-3.0.txt`, and the app's About screen links to both. The rest of the app doesn't contain eSpeak NG and only talks to the worker through messages. To keep the source available for as long as the app is shared, keep this repository public, and consider forking rhasspy/espeak-ng into your own GitHub account so that commit can't disappear.

### The ESV, NIV, NLT and NKJV

These are under copyright, so the app doesn't store them. A page in Claude can't reach other sites, so the reader asks for them through a connector: `supabase/functions/bible-texts` is a small MCP server, deployed as the Supabase Edge Function `bible-texts` (with JWT checking off, since it checks its own token), that fetches a chapter from the ESV API or API.Bible. To set it up:

1. Get a free non-commercial key at [api.esv.org](https://api.esv.org) and a free Starter key at [api.bible](https://api.bible), choosing the NIV, NLT and NKJV there.
2. In the Supabase project's Edge Function secrets, set `ESV_API_KEY`, `API_BIBLE_KEY` and `BIBLE_CONNECTOR_TOKEN` (any long random string).
3. In Claude, add a custom connector named exactly **Veritas Bible Texts**, with the address `https://<project>.supabase.co/functions/v1/bible-texts/<BIBLE_CONNECTOR_TOKEN>`.
4. The first time you open one of these Bibles in the reader, Claude asks you to allow the page to use the connector.

The artifact declares the `mcp` capability for that connector's `get_chapter` tool. The licensed text is used only in the reader: read-aloud, search, guides and the AI use the BSB. See `DATA-LICENSES.md` for the terms.

## The website (Cloudflare Pages)

The same app runs as a free public website on Cloudflare Pages, built straight from this repository on every push. Cloudflare's free plan allows 20,000 files of up to 25 MiB each with no bandwidth cap; the site is about 420 files and 180 MB. Everything works except the AI tools, which need a Claude account or a paid API key: notes, highlights and guides are kept in each visitor's browser, read-aloud uses the browser's voice or the built-in one, and the app works offline once opened.

Set it up once, in the Cloudflare dashboard:

1. Sign up for a free account at dash.cloudflare.com.
2. Under Workers & Pages, create a Pages project by connecting to Git, allow Cloudflare to see this GitHub repository, and pick it.
3. Name the project `veritas-logos`, so the site is at https://veritas-logos.pages.dev. Set the production branch to `claude/veritas-logos`, the root directory to `veritas-logos`, the build command to `npm run build` and the output directory to `dist`, with no framework preset. `.node-version` asks for Node 22.
4. Save and deploy. Each later push to the branch redeploys the site.

`site.config.json` holds the website's settings, which the build writes into `dist/index.html`:

- `bibleTextsUrl`: the Bible function's `/web` address, where the website's reader gets the ESV, NIV, NLT and NKJV. That address answers only pages from https://veritas-logos.pages.dev and its preview addresses. If the site ends up at another address (the name was taken, or a custom domain), add the Supabase secret `BIBLE_WEB_ORIGINS` with the site's address, such as `https://my-name.pages.dev`; several can be listed, separated by commas.
- `claudeUrl`: leave empty, or set it to the Claude version's link once that's shared, and the website points people there for the AI tools.

`public/_headers` sets Cloudflare's caching. The offline cache (`public/sw.js`) is renamed after each build's contents, so visitors get new data after a deploy.

## Other ways to host it

The app can also run on any other static host or server. A public release that charged money would also need user accounts and billing, and you should recheck the data licenses and the Bible APIs' non-commercial terms.


1. **Static site only (cheapest).** Upload `dist/` to any static host. Everything works except AI and saved API guides. It's about 100 MB, because the build packs the data files.
2. **Static site plus server (needed for AI and the API).** Run `dist-server/server.js`, or the included `Dockerfile`, on any Node host with a persistent disk for the SQLite database. Set the values in `.env.example`.

## Turning on AI

The AI key must stay on the server, because anyone can read a key placed in a web page.

1. Create a key at console.anthropic.com. Usage is billed to that account.
2. Set `ANTHROPIC_API_KEY` on the server. `AI_MODEL` defaults to `claude-sonnet-5-5`.
3. Decide who can use it. By default only people with an API key can. `AI_PUBLIC=1` opens it to all visitors, limited by `AI_DAILY_LIMIT` per network address, so watch your spending before you turn that on.

To use a different AI provider, change `server/ai.ts`. The prompts and tools in `src/core/ai.ts` don't depend on the provider.

## Project layout

```
src/core/      Shared logic: Bible, lexicon, insights, guide generator, exports, AI prompts, family graph
src/app/       The phone app (React)
src/embed/     The small page other sites frame
server/        API server and AI runner
scripts/       Data build, checks and site build
public/        Static files and data generated from the sources
test/          Automated tests
```

## How the data is checked

`npm run data:check` tests the data against the Bible text:

- Every family claim is tested against the tagged Hebrew and Greek by `scripts/build_people.py`. The Bible decides, and the app's "How this was checked" page lists the results.
- A lifespan must match the verse where the verse gives a total. BibleData counts 951 years for Noah, and Genesis 9:29 says 950, so the verse is used.
- `npm test` walks genealogies copied from Scripture (Genesis 5 and 11, Ruth 4, 1 Chronicles 3, Matthew 1, Luke 3) through the data.
- Quotations and parallels must share a run of wording, which is shown with each one.
- Book guides are built by `scripts/build_bookguides.py` (`npm run data:books -- --sources ../sources`). The passages it quotes are listed in `scripts/book_guides.json` by their first and last words only, and the text between them is copied from CCEL's file, so a quote can't drift from the edition. Translators are credited from each work's own notice in the edition. The build stops if a passage, a dictionary entry, a translator's notice or the claim behind an editorial note can't be found: a note may only say what a quoted passage says and what the book's Greek shows.

The read-aloud voice is built by `npm run data:voice -- --model <path>/en_US-norman-medium.onnx` (Python with `onnx`, `onnxruntime` and `numpy`), from the copy in k2-fsa/sherpa-onnx's `tts-models` release (`vits-piper-en_US-norman-medium.tar.bz2`). It stores the large weights as 16-bit floats, which halves the download, and stops if the rebuilt model's speech differs from the original's by more than rounding.

Sources can still contain errors, and their chronology and family links reflect their editors' judgment. To rebuild, finish with `npm run data:echo`, `npm run data:people` and `npm run data:books -- --sources ../sources`, after `npm run data:build -- --sources ../sources`, `npm run data:translations -- --sources ../sources/scrollmapper/formats/json`, `npm run data:writings -- --sources ../sources` and `npm run data:glossary -- --sources ../sources` (they need Python 3.11 or later and run after the first step because it clears `public/data`), which needs local copies of the sources listed in `DATA-LICENSES.md`.

## How the features connect

Any passage, term, writer, event or creed is one tap from the others:

- **Passage:** Insights, word-by-word Hebrew and Greek, Through history (by century, or two writers side by side), Text (Septuagint, Vulgate and Greek editions), Links, and your note, which also shows other notes that name it.
- **Term:** your glossary, named definitions, its use by century, church history events, your notes and modern scholarship links.
- **Writer:** excerpts by book, tradition, events and your notes.
- **Event:** source, quote, documents, writers, terms and verses.
- **Everything** can be cited in Chicago, Turabian, SBL, BibTeX or RIS, saved to My sources or the Notebook, and added to a guide. Guides export to Word with real footnotes.
- **Go anywhere** (Ctrl K or the search button) opens any verse, term, writer, event, creed or tool. On a wide screen the study panel stays beside the text, and J and K move between verses.

## Known limits

- Echoes show shared words, not intent. The Septuagint here isn't tagged, so it's matched by word stems, and Psalms and Jeremiah aren't matched because their Greek numbering differs. Aramaic parts of Daniel and Ezra have fewer links.

- A web page can't run while the phone has suspended it. AI work in a minimized app may pause and carries on when the app is opened again.
- Read aloud uses the browser's own speech engine in Chrome, Safari, Edge and Firefox. Android's in-app viewer, which the Claude app uses there, has none, so a voice built into the app reads instead: Norman, a Piper voice run by ONNX Runtime in a worker, with eSpeak NG for pronunciation. The first time, it downloads about 54 MB, which the browser keeps. Each time the app opens it takes a few seconds to get ready, and it runs on one thread, because a page in Claude can't use shared memory. Like any page, it stops when the phone locks or the app is minimized. Settings can choose it everywhere. It mispronounces some names, as eSpeak's rules guess them.
- The packed data needs a browser from 2023 or later (Safari 16.4, Chrome 80, Firefox 113). An older browser shows a message asking for an update.

- There is no sourced data yet for idioms, customs, or the first audience, so those rely on AI drafts. Public-domain works could be added as cited sources.
- The verse-by-verse confession citations in Insights cover Reformed and Baptist documents, while the Creeds section adds Catholic, Orthodox and other traditions through Schaff (6th ed.), so nothing after about 1930 is there.
- The deuterocanon has its own reader and isn't part of the reader's search, references or writers' excerpts, which cover the 66-book canon.
- Hebrew and Greek are linked word by word only to a tagged BSB, not to the other translations.
- The ESV, NIV, NLT and NKJV need the owner's connector and are used only in the reader, one chapter at a time. API.Bible's free plan allows 5,000 requests a month and the ESV API 5,000 a day. Some older built-in Bibles are partial (Tyndale, the OEB, Noyes and the New Testament-only ones), and the reader says what each one covers.
- By default, New Testament dates follow Ussher and Old Testament dates follow BibleData. A switch moves a few disputed dates to common modern ones, and Disputed dates lists the views, but most dates have only the source's value.
- 77 entries in the owner's glossary were reworded by Claude at his request. They are unsourced editorial work, tagged "Corrected," and each shows the original wording.
- CCEL's Fathers and Calvin files came from a third-party copy on GitHub, and only 10 volumes of Calvin's commentaries are in it. See DATA-LICENSES.md.
