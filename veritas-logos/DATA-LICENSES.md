# Data sources and licenses

Everything stored in the app comes from these sources. Keep these credits wherever the data is shown. The app's About screen and the API responses already include them.

The published copies in `dist/data` are gzip-compressed and base64-encoded to save space. Packing doesn't change a word: the build checks that each file unpacks to exactly the bytes in `public/data`.

| Data | Source | License |
|---|---|---|
| BSB, NHEB, KJV, ASV, YLT text | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | BSB: CC0. NHEB, ASV, YLT: public domain. KJV: public domain except in the UK, where Crown rights apply |
| LEB, BBE, UKJV, AKJV, OEB, Geneva 1599, Darby, Webster, Rotherham, Noyes, JPS 1917, Douay-Rheims (Challoner), CPDV, Twentieth Century NT, Anderson NT, Haweis NT, Tyndale, Wycliffe | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain, except the LEB: © 2012 Logos Bible Software, free to use and give away with its notice and a link to [lexhamenglishbible.com](https://lexhamenglishbible.com), but not to sell on its own. UKJV: public domain, credited "I love Jesus (UKJV)" as its editors ask. BBE: public domain in the United States |
| Hebrew and Greek words (TAHOT, TAGNT), brief lexicons (TBESH, TBESG) | [STEP Bible data](https://github.com/STEPBible/STEPBible-Data), Tyndale House, Cambridge | CC BY 4.0 |
| Strong's dictionaries | [openscriptures/strongs](https://github.com/openscriptures/strongs) | CC BY-SA. Changes to this data must be shared under the same license |
| Cross-references | OpenBible.info, via scrollmapper | CC BY |
| Nave's Topical Bible | Public domain, via [BibleData](https://github.com/BradyStephenson/bible-data) | CC BY 4.0 for the BibleData edition |
| Confession texts and proof lists (Westminster Confession and Larger Catechism, Heidelberg Catechism, Baptist Catechism) | [Creeds.json](https://github.com/NonlinearFruit/Creeds.json) | Each document used is marked public domain there. The build refuses any that isn't |
| People, individual verse tags, summaries | [TIPNR](https://github.com/STEPBible/STEPBible-Data) by STEPBible.org, based on work at Tyndale House Cambridge | CC BY 4.0 |
| More people and family claims, name meanings, book names, chronology | [BibleData](https://github.com/BradyStephenson/bible-data) by Brady Stephenson and contributors | CC BY 4.0 |
| Cross-checks of family claims, and calendar dates | [Theographic Bible Metadata](https://github.com/robertrouse/theographic-bible-metadata) by Robert Rouse | CC BY-SA 4.0 |
| Cross-checks of family claims | [ACAI](https://github.com/BibleAquifer/ACAI) by Mission Mutual | CC BY-SA 4.0 |

**How the people data is built:** `scripts/build_people.py` gathers every family claim from TIPNR, BibleData, Theographic, ACAI and the original BibliaTree file, then tests each one against the tagged Hebrew and Greek. The Bible decides: what it states is kept with its verse, what it contradicts is dropped and logged, and what it doesn't address is kept only if open sources support it, and is marked. People a source inferred but no verse refers to are left out, such as the nine generations TIPNR adds between Matthan and Jacob, though Matthew 1:15 says Matthan fathered Jacob. A verse that names someone only by their clan or nation can't state whose child they are. TIPNR files every "Israel" and "Judah" under the founder, so for Jacob, his twelve sons, Ephraim and Manasseh only the verses of their own story, and elsewhere those that name them as people ("Abraham, Isaac and Jacob", "son of Judah"), are listed as theirs. A reign belongs only to the king the verse says "became king", not to another king it dates by. BibleData's "Talitha" is Jairus's unnamed daughter: Mark 5:41 translates the word as "little girl". TIPNR files the "Caesar" of Paul's appeal (Acts 25–28) under Claudius; Josephus says Nero sent Festus (Antiquities 20.8.9), so those verses are Nero's, listed as Caesar, the name the verses use. Luke 3:1 ("Tiberius Caesar"), Acts 27:1 (the "Augustan cohort") and the subscription after 2 Timothy are no longer counted as mentions of Augustus or Nero. A few readings were fixed by hand after checking the verse, and each is listed in `build_people.py` with its reason. The app's "How this was checked" page lists these decisions. Summaries come from TIPNR and are secondary. A family statement in one that the verses don't support is removed. Calendar dates come from Theographic's chronology, because Scripture gives none. Theographic and ACAI are share-alike, so the people data files (`figures.json`, `person-aliases.json`, `person-verses-all.json`, `people-report.json` and the people lists in `links/`) are shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), separately from the app's code. Anyone may copy, change and share them, including commercially, if they credit the four sources, say what they changed, and share their changed version under the same license. A paid release can include them on those terms.

**Changes made to BibleData:** family links that don't name both people in the cited chapter are dropped. Noah's lifespan row is dropped because it disagrees with Genesis 9:29. BibleData files Jesus under its YHVH record. The app lists him as a person, using that record's Jesus labels and two links anyone can read in the verses: Matthew 1:16 and Luke 3:23.

**How the added Bibles are built:** `scripts/build_translations.py` (`npm run data:translations -- --sources <scrollmapper>/formats/json`, after `data:build`) lines each one up with the app's verse numbering. Where a book's verses split differently from the KJV, its verses are matched to the KJV's (the ASV's for the JPS) by their wording, so a verse is never shown under the wrong number; a verse with no counterpart is left out, and a verse the KJV splits in two is shown under the first number. The JPS numbers the Hebrew way, and the Douay-Rheims, CPDV and Wycliffe number the Psalms the Vulgate way, so those books are matched as whole books. Fixes made to the text, each in the script: the JPS copy spells the divine names "G-d", "L-rd" and "HaShem", which are restored to the 1917 edition's "God", "Lord" and "LORD"; the Darby copy lost the space before every word for Elohim ("ofGod"), which is put back, and its footnote asterisks are removed; LEB markup tags, Haweis's paragraph codes, the glossary attached to Anderson's last verse and a translator's note inside the CPDV's Acts 20:7 are removed. The deuterocanonical books and additions of the Catholic Bibles aren't included, because the app follows the 66 books. Gaps in the sources: the JPS copy has no Malachi 3:19–24 (4:1–6 in English Bibles), the OEB has only the New Testament and Psalms, Noyes has Job to Malachi and the New Testament, and Tyndale has Genesis, the Gospels, Acts, Romans, 1 Corinthians, Hebrews and Revelation.

**Licensed Bibles (ESV, NIV, NLT, NKJV):** not stored in the app. The reader fetches them a chapter at a time, while it's open, through the owner's "Veritas Bible Texts" connector (`supabase/functions/bible-texts`), which calls the [ESV API](https://api.esv.org) from Crossway and [API.Bible](https://api.bible) from the American Bible Society with the owner's free non-commercial keys. Their terms are kept this way: each chapter is shown with the publisher's notice, and the ESV's with a link to [esv.org](https://www.esv.org); only the last few hundred verses are held, in memory, and nothing is saved; API.Bible's fair-use report is sent for each chapter shown; and the text isn't read aloud, searched, quoted into guides or given to the AI, which use the BSB instead. The app stays free and non-commercial, as both keys require. NASB and CJB still aren't offered.

**Built-in read-aloud voice** (`public/voice`, used where the browser has no speech engine):

| Part | Source | License |
|---|---|---|
| Norman voice (`en_US-norman-medium`) | Trained by Bryce Beattie on LibriVox recordings; published in [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices); this copy from [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models) | Recordings public domain (model card); piper-voices MIT. The app stores the weights as 16-bit floats, which is its only change |
| ONNX Runtime Web 1.31.1 | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | MIT |
| eSpeak NG, through phonemizer.js 1.2.1 | [espeak-ng](https://github.com/espeak-ng/espeak-ng), [xenova/phonemizer.js](https://github.com/xenova/phonemizer.js) | eSpeak NG: GPL-3.0. phonemizer.js: Apache-2.0. GPL-3.0 needs a look before a public release, since the app ships eSpeak NG inside `voice-worker.js` |

This is a summary, not legal advice. Check the license terms yourself before a public launch, especially if the app will ever charge money.

## Church Fathers and later teachers

Built by `scripts/build_writings.py`. The rule: nothing goes in unless it traces to a named, checkable public-domain edition.

**Church Fathers.** Quotes and verse links come from [HistoricalChristianFaith/Commentaries-Database](https://github.com/HistoricalChristianFaith/Commentaries-Database), checked against the texts in [HistoricalChristianFaith/Writings-Database](https://github.com/HistoricalChristianFaith/Writings-Database). The Commentaries-Database dedicates its compilation to the public domain but notes that some excerpts come from copyrighted works and leaves that analysis to its users, and the Writings-Database includes machine translations. So a quote is kept only if all of this holds:

1. Its work is on the `WORKS` list, which names the edition: Ante-Nicene Fathers (1885–96), Nicene and Post-Nicene Fathers (1886–1900), Newman's Catena Aurea (1841–45), or another dated edition named there.
2. Its wording appears word for word in that edition's text.
3. The source file isn't marked as machine translated.

Results of the current build: 95,222 quotes on file, 24,229 kept. Left out: 41,954 from works not on the list, 16,834 with no source file to check, 8,789 whose wording wasn't found in the cited edition (many appear to be excerpts of a modern copyrighted series), 2,026 on books outside the 66, 836 labeled as Ante-Nicene or Nicene that weren't found in CCEL's text of those series, 447 from files marked as machine translated, 83 with a missing source file and 24 duplicates. Modern authors in that database, such as C. S. Lewis, are left out too. Of the quotes kept, 13,895 were confirmed in CCEL's text of the series, and 2,909 of those had their volume label corrected or narrowed to one volume. The other kept quotes are from editions not in the CCEL files used here, chiefly the Catena Aurea, so they rest on the Writings-Database text alone.

A quote in the Catena Aurea is as Aquinas collected it. It's often condensed, and his attributions aren't always certain.

**The CCEL check and citations.** The Ante-Nicene and Nicene and Post-Nicene volumes come from the Christian Classics Ethereal Library's ThML files, whose rights field reads "Public Domain." CCEL's site couldn't be reached from the build environment, so these files came from [theology-corpus](https://github.com/timothyhartzog/theology-corpus), a third-party copy on GitHub that has no license of its own. Replace it with CCEL's files if `ccel.org` becomes reachable. CCEL's own [copyright page](https://www.ccel.org/about/copyright.html) couldn't be read from here either, so read it before any public release.

Two uses:

1. Quotes labeled with those series must also appear word for word in CCEL's text with footnotes removed. This corrects the volume number on each quote, and a quote that fails is dropped.
2. Where a work tags a Scripture reference, that place becomes a "Cites this verse" entry: the sentence with the reference and one on each side. A reference in a footnote counts only if the note is short and mostly the reference itself, which is an editor naming the verse. Editors' prefaces and longer notes are skipped, as are chapter-only references, spans over 25 verses, and the objections in Aquinas's Summa, which aren't his own view. The Summa cites the Vulgate, so its Psalms and Old Testament history are left out because they're numbered or named differently. Each writer gets at most six entries for one verse from one file. The current build has about 71,000 of these entries, plus about 37,600 from the older works below.

Other public-domain works used this way: Aquinas's Summa, Watson's A Body of Divinity, Bunyan's The Pilgrim's Progress, Baxter's The Reformed Pastor and First Principles of the Reformation (Luther). Calvin's commentaries come from the same copy, which has 10 verse-by-verse volumes of CCEL's set: Genesis, parts of the Harmony of the Law and the Gospels, Romans, 2 Corinthians, the Pastoral Epistles, Hebrews and the Catholic Epistles.

**Older works with no rights statement.** Many CCEL files have an empty rights field. The app's owner approved adding the older ones once each edition's date was checked, so they're listed with that date in `OLDER_WORKS`: Edwards's Works (1834), Manton (1870–72), Owen's Communion with God, Glory of Christ and Mortification of Sin (Goold's edition of 1850–53, in a photographic reprint), Gill (1770), Hodge's Systematic Theology (1871–73) and Ephesians, Ryle's Holiness (1879, 1952 reprint), Bunyan's Grace Abounding, Baxter's A Call to the Unconverted, Anselm (Deane, 1903), the London Baptist Confession, and Schaff's History (1910 edition). The works themselves are old, but this isn't a rights statement from CCEL, and these files carry a comment reading "Copyright Christian Classics Ethereal Library," which may refer to its markup. Check this before any public release. Each writer keeps at most three entries per verse here, in shorter excerpts, to stay within the host's size limit.

Left out after that date check:

- Owen's Justice, Perseverance, Pneumatologia and Sermons: the files say "© AGES Software," and the ones checked also say the text "has not been proof-read."
- Luther's Bondage of the Will: Atherton's 1931 revision of Cole's translation, which may still be under US copyright until 2027.
- The Rutherford selection: a modern edition with no date in the file.
- Spurgeon's sermons: the wording is modernized.

**Later teachers.**

| Work | Source | Status |
|---|---|---|
| Matthew Henry, Commentary on the Whole Bible | [LyteWord markdown edition](https://github.com/lyteword/mhenry-complete) | Public domain; edition CC0 |
| Spurgeon, Treasury of David (expositions only) | [LyteWord markdown edition](https://github.com/lyteword/chspurgeon-tod) | Public domain; edition CC0 |
| Wesley, Explanatory Notes | [kjv-wesley](https://github.com/wilsonpruitt/kjv-wesley) | Text public domain; structure CC BY 4.0, History of Methodism |
| Calvin, Institutes, trans. John Allen | Project Gutenberg [45001](https://www.gutenberg.org/ebooks/45001), [64392](https://www.gutenberg.org/ebooks/64392) | Public domain in the US |
| Luther on Galatians, Graebner's abridgment (1949) | Project Gutenberg [1549](https://www.gutenberg.org/ebooks/1549) | Listed by Project Gutenberg as public domain in the US. It's a modernized abridgment, not a close translation, and the app says so |
| Edwards, Selected Sermons, ed. Gardiner (1904) | Project Gutenberg [34632](https://www.gutenberg.org/ebooks/34632) | Public domain in the US |

Wesley notes with no lead-in words are dropped, because the edition's parser sometimes read a numbered point as a verse number. Calvin's entries are places where he or Allen's notes cite the verse, with the surrounding sentences.

**Spurgeon's sermons are an index only.** The [LyteWord edition](https://github.com/lyteword/chspurgeon-sermons) is marked CC0, but its text is a modernized edition whose wording matches one published with a 2010 copyright by Larry and Marion Pierce. So the app keeps only the sermon number, title, volume and text, and links to the [Spurgeon Library](https://www.spurgeon.org/). Those links are built from the title, so some may not resolve.

## Timeline

Old Testament dates come from BibleData's epochs and events (CC BY 4.0). New Testament years are read from its copy of Ussher's Annals of the World (1650). That copy's wording appears to be a modern revision, so only the year and paragraph number are used, and the captions are plain labels for the cited passages. Writers appear at the `default_year` in the Commentaries-Database metadata, or at the death year for the few added by hand (Henry, Spurgeon, Edwards). Confessions use the year in the confession data.

## Scholarly texts and tools

Built by `scripts/build_scholar.py`. Everything comes from a named source, and these notes say what was changed.

| Data | Source | License and status |
|---|---|---|
| Septuagint | Swete's edition (1909–30) as digitized by the [First Thousand Years of Greek](https://github.com/OpenGreekAndLatin/First1KGreek), through [nathans/lxx-swete](https://github.com/nathans/lxx-swete) | CC BY-SA 4.0. Machine-corrected, and has no Ecclesiastes |
| Clementine Vulgate | [jrichter/ClementineVulgateConverter](https://github.com/jrichter/ClementineVulgateConverter) | Text public domain |
| Word links to the BSB | [tuscaroratech/berean-study-bible-with-strongs](https://github.com/tuscaroratech/berean-study-bible-with-strongs) | BSB is CC0, and the repository states no license for its tagging. 79% of verses match the app's BSB exactly, and the rest differ slightly in wording |
| Greek edition differences, Qere and Ketiv | STEP Bible's TAGNT and TAHOT, Tyndale House | CC BY 4.0. This compares printed editions and isn't a manuscript apparatus |
| Gospel synopsis | Section order and parallels from Aland's Synopsis, through [cbop-dev/aland-gospel-synopsis](https://github.com/cbop-dev/aland-gospel-synopsis) | MIT for the data file. Aland's own Greek text isn't included. Check the numbering's status before a commercial release |
| Creeds and confessions | Schaff, The Creeds of Christendom, 6th ed., vols. 2–3, CCEL files marked public domain | Public domain. Schaff's footnotes are left out |
| Deuterocanon | Douay-Rheims (1899) via [yoarikso/douayrheimsbible](https://github.com/yoarikso/douayrheimsbible), MIT. King James 1611 via [Saorsa-Ind](https://github.com/Saorsa-Ind/King-James-Version-1611-JSON-Dataset), CC0. Greek from Swete | Texts public domain, Greek CC BY-SA 4.0 |
| Apostolic Fathers | Greek: [Open Apostolic Fathers](https://github.com/jtauber/apostolic-fathers), from Lake (1912), CC BY-SA 4.0. English: Ante-Nicene Fathers (1885–86), from CCEL | Paired by chapter. English is missing where numbering differs, and for 2 Clement and Hermas |
| Josephus | Whiston's translation (1737), Project Gutenberg 2846, 2848, 2849, 2850 | Public domain. Gutenberg's header and license text are removed, so the text isn't presented as a Gutenberg edition |
| Print page numbers | The `<pb>` marks in CCEL's files, located by matching each quote | Present only where the file marks pages |

**Church history events.** `scripts/church_events.json` holds 105 events chosen by hand. Claude wrote each short summary. For older events, the build checks that the named section of Schaff's History or Creeds holds the given phrase, and it quotes a sentence from that section where one states the event well. For later events, each page named was read when the summary was written. Schaff wrote from a Protestant point of view.

**Disputed dates and passages.** `scripts/chronology.json`, `book_dating.json` and `disputed.json` are short summaries by Claude with a source named for each view. "Dating the Bible" was read through a copy of the Wikipedia article, so check the live page. Which Greek editions print which words is computed from STEP's data.

**Not included.** Critical apparatus from NA28 or BHS and lexicons such as BDAG and HALOT are under copyright. Philo isn't included, because no open English translation could be loaded here. The Greek and Latin of later Fathers aren't included, because open texts of them don't line up with the old translations in a way the app can check.

**Book guides.** `scripts/build_bookguides.py` counts from STEP's TAGNT and lexicon (CC BY 4.0), OpenBible.info's cross-references (CC BY), the people data and the edition comparison above. Its quotations come from CCEL's ThML files of the Ante-Nicene and Nicene and Post-Nicene Fathers (rights field "Public Domain"), Matthew Henry's Commentary (LyteWord, CC0) and Easton's and Smith's dictionaries. Henry died before reaching Romans, and the preface to his sixth volume names the ministers who finished it, so Henry's notes on Romans to Revelation now name the minister who wrote them, John Reynolds of Shrewsbury for 1–3 John. A cross-reference counts as a quotation only when it shares five or more words with the passage, and not when the shared wording is a stock phrase: one matched to several passages, or found in eight or more Old Testament verses ("in the name of the LORD"). STEP's brief Greek lexicon writes a rough breathing on a diphthong after its first vowel ("ahima" for αἷμα); the build moves the h to the front ("haima"), as the tagged text itself writes it.

**AI research mode.** A confirmed source shows that the quoted words exist in the app's data. It doesn't show that they support the claim, so the reader still has to judge that. This has been tested with a stand-in for the model, not with real model answers.

## Theological terms

Built by `scripts/build_glossary.py`. The list of terms and which entry answers each one are chosen by hand. The definitions aren't written for the app; they're quoted from:

- `scholar/echo-bridge.json` links Hebrew words to their usual Greek renderings. `scripts/build_echo.py` calculates it from the Septuagint and the tagged Hebrew above, by counting shared verses. Nothing in it is written by hand.
- The full text of Easton's and Smith's dictionaries is also kept in `scholar/dictionary-easton.json` and `scholar/dictionary-smith.json`, so the AI assistant can look up background and have its quotes checked word for word.
- Easton's Bible Dictionary (1897), Schaff's Dictionary of the Bible (American Sunday-School Union, 1880) and Smith's Bible Dictionary (1884 edition), from CCEL's files marked public domain, as held in [bible-dictionary-dataset](https://github.com/neuu-org/bible-dictionary-dataset) (its structure is CC BY 4.0). That dataset calls the Schaff book "Hastings," but the file's own title page identifies it.
- The Westminster Larger Catechism, Heidelberg Catechism and Baptist Catechism already in the app.
- Schaff's History of the Christian Church, Hodge's Systematic Theology and Watson's A Body of Divinity, from CCEL's files. These are the opening prose of a section on the subject, so they often describe a term more than define it, and the section's own title is shown.

The 18 terms that had no entry anywhere are filled from `scripts/glossary_filled.json`, preferring theological works, then dictionaries:

- Public domain: Webster's Unabridged Dictionary (Project Gutenberg ebook 29765, via [matthewreagan/WebstersEnglishDictionary](https://github.com/matthewreagan/WebstersEnglishDictionary), checked against that file at build time), The Catholic Encyclopedia (1911, on New Advent), Encyclopædia Britannica (1911, read through a mirror of Wikisource) and Murray's New English Dictionary (1919, on the World English Historical Dictionary).
- **Copyrighted, short quotations:** Merriam-Webster (Dispensationalism, Ecclesiology, Rapture) and John A. Hardon's Modern Catholic Dictionary on CatholicCulture.org (Kenosis). These are one sentence each, marked `modern` in the data and tagged in the app. Replace them or get permission before any public or paid release.

Where a definition states one tradition's view, Claude adds a short note labeled as its own and not from the source. The sources lean toward 1800s Protestant scholarship, and the app says so.

**The owner's glossary.** `Theological_Terms.docx` holds 370 entries, labeled "Your glossary" with "No source named." At the owner's request, `scripts/glossary_corrections.json` rewords 77 of them: 19 that were inaccurate or imprecise, and 58 contested views that now say which tradition holds them. Claude wrote the rewording, the app tags those entries "Corrected" and shows the original wording and the reason, and the rest stay word for word. Named facts were checked where a `basis` is listed, but the rewording as a whole is unsourced editorial work, so check it as you would any draft. Its file metadata names the app's owner as author, and it names no sources. The app doesn't treat it as a cited source, and it's kept apart from the quoted definitions. Some entries closely resemble wording in Wayne Grudem's Systematic Theology (Miracle is one), and correcting an entry doesn't settle that, so check the document's history before any public release. The build reads it from `extra/own/Theological_Terms.docx` under the sources folder, and it isn't stored in the repository in its original form, only as text in `public/data/glossary.json`.
