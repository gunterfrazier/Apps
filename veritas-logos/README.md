# Veritas Logos

A phone-first Bible study guide builder and reference tool, for personal use. It grew out of the original single-file Veritas Logos prototype and reuses BibliaTree's family tree, pathfinder and timeline tools.

**The rule for its data:** everything stored comes from a named source that can be checked. There is no hand-written commentary. Culture, idioms and theological readings come from the AI assistant on request, labeled as drafts that say what each claim rests on.

## What's in it

- **Reader:** full text of five translations (BSB, NHEB, KJV, ASV, YLT), side-by-side comparison, highlights, bookmarks, notes and read-aloud.
- **Insights on any verse or passage:** where it's quoted, paralleled or possibly alluded to, where historic confessions cite it, and which Nave's topics cite it, plus an AI explanation of the first audience, idioms, culture, doctrines and theological lenses.
- **Hebrew and Greek:** every word of every verse, with grammar, lexicon entries and a concordance.
- **Study guide builder:** from any passage or topic, in four formats, in one step or through six guided steps. Guides can be edited, exported, shared by link and embedded.
- **AI assistant:** explains passages, answers questions and drafts guide sections. It works from the app's real text, and flags references that don't exist.
- **Explore and expand:** every guide section, and the reader's insight sections, can be researched further with AI, including a background overview. It searches the app's library, and the app checks each citation word for word. It can't search the live web.
- **Deep exegesis:** an AI synopsis of a passage from the chosen lens, worked from the Hebrew or Greek. The app checks its references, word studies and quotes, and it stays labeled as a draft.
- **AI work:** AI requests run on their own, outside any screen, and are saved as they go. Moving around the app doesn't stop them. If the phone pauses a minimized app, they carry on when it returns, and a long exegesis resumes from its last finished step. The AI work page lists everything and has a connection check.
- **Theological lenses:** Reformed, Covenant / Federal, Arminian, Catholic, Orthodox, Lutheran, Anglican, Baptist, Pentecostal, Messianic and Dispensational.
- **People:** 3,009 people from BibleData, with family links citing their verses, a family tree, a pathfinder and a timeline.
- **Church history:** an interactive timeline of 105 councils, schisms, reformations, creeds and theological shifts, each with a checked source.
- **Scholar tools:** citations in five formats, a word-by-word interlinear, grammar search, the Septuagint and Vulgate side by side, Greek edition differences, a Gospel synopsis, 45 creeds across traditions, the deuterocanon, the Apostolic Fathers in Greek and English, Josephus, how a verse was read century by century, disputed dates, a notebook with backlinks, a bibliography with PDFs, advanced search and an AI research mode that checks its quotes.
- **Connections:** links, embeds and a REST API. See `docs-API.md`.

Every section of a guide says where it came from: cited sources, AI draft or your own writing. No Scripture text is ever generated. If a verse doesn't exist, the app says so.

## How it's used today

It runs as a private page in Claude. AI goes through your Claude account, and notes and guides are saved privately to that account, so no server, API key or separate bill is needed. To update it, run `npm run build` and publish `dist-artifact/index.html` with the files in `dist/`.

## Run it

Requires Node 22.13 or later.

```bash
npm install
npm run build
npm run api          # website and API at http://localhost:8787
```

`npm run dev` rebuilds the app on change at http://localhost:5173, without the API.

Checks: `npm run typecheck`, `npm test`, `npm run data:check`.

## If you release it publicly later

The app can also run on your own site. The hosted options are built and tested but not deployed. A public release would also need user accounts and billing if you charge a subscription or usage fee, and you should recheck the data licenses.


1. **Static site only (cheapest).** Upload `dist/` to any static host. Everything works except AI and saved API guides. It's about 240 MB, so turn on compression if your host offers it. Most do.
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

- A family link is kept only if both people are named in the chapter it cites. The build dropped 84 that failed.
- A lifespan must match the verse where the verse gives a total. Noah is left off the timeline because BibleData counts 951 years and Genesis 9:29 says 950.
- Quotations and parallels must share a run of wording, which is shown with each one.

Sources can still contain errors, and their chronology and family links reflect their editors' judgment. To rebuild, run `npm run data:build -- --sources ../sources`, then `npm run data:writings -- --sources ../sources` and `npm run data:glossary -- --sources ../sources` (they need Python 3.11 or later and run after the first step because it clears `public/data`), which needs local copies of the sources listed in `DATA-LICENSES.md`.

## How the features connect

Any passage, term, writer, event or creed is one tap from the others:

- **Passage:** Insights, word-by-word Hebrew and Greek, Through history (by century, or two writers side by side), Text (Septuagint, Vulgate and Greek editions), Links, and your note, which also shows other notes that name it.
- **Term:** your glossary, named definitions, its use by century, church history events, your notes and modern scholarship links.
- **Writer:** excerpts by book, tradition, events and your notes.
- **Event:** source, quote, documents, writers, terms and verses.
- **Everything** can be cited in Chicago, Turabian, SBL, BibTeX or RIS, saved to My sources or the Notebook, and added to a guide. Guides export to Word with real footnotes.
- **Go anywhere** (Ctrl K or the search button) opens any verse, term, writer, event, creed or tool. On a wide screen the study panel stays beside the text, and J and K move between verses.

## Known limits

- A web page can't run while the phone has suspended it. AI work in a minimized app may pause and carries on when the app is opened again.

- There is no sourced data yet for idioms, customs, or the first audience, so those rely on AI drafts. Public-domain works could be added as cited sources.
- The verse-by-verse confession citations in Insights cover Reformed and Baptist documents, while the Creeds section adds Catholic, Orthodox and other traditions through Schaff (6th ed.), so nothing after about 1930 is there.
- The deuterocanon has its own reader and isn't part of the reader's search, references or writers' excerpts, which cover the 66-book canon.
- Hebrew and Greek are linked word by word only to a tagged BSB, not to the other translations.
- By default, New Testament dates follow Ussher and Old Testament dates follow BibleData. A switch moves a few disputed dates to common modern ones, and Disputed dates lists the views, but most dates have only the source's value.
- 77 entries in the owner's glossary were reworded by Claude at his request. They are unsourced editorial work, tagged "Corrected," and each shows the original wording. Four definitions are short quotations from copyrighted dictionaries and need replacing or permission before any public release.
- CCEL's Fathers and Calvin files came from a third-party copy on GitHub, and only 10 volumes of Calvin's commentaries are in it. See DATA-LICENSES.md.
