# Data sources and licenses

Everything stored in the app comes from these sources. Keep these credits wherever the data is shown. The app's About screen and the API responses already include them.

| Data | Source | License |
|---|---|---|
| BSB, NHEB, KJV, ASV, YLT text | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | BSB: CC0. NHEB, ASV, YLT: public domain. KJV: public domain except in the UK, where Crown rights apply |
| Hebrew and Greek words (TAHOT, TAGNT), brief lexicons (TBESH, TBESG) | [STEP Bible data](https://github.com/STEPBible/STEPBible-Data), Tyndale House, Cambridge | CC BY 4.0 |
| Strong's dictionaries | [openscriptures/strongs](https://github.com/openscriptures/strongs) | CC BY-SA. Changes to this data must be shared under the same license |
| Cross-references | OpenBible.info, via scrollmapper | CC BY |
| Nave's Topical Bible | Public domain, via [BibleData](https://github.com/BradyStephenson/bible-data) | CC BY 4.0 for the BibleData edition |
| Confession texts and proof lists (Westminster Confession and Larger Catechism, Heidelberg Catechism, Baptist Catechism) | [Creeds.json](https://github.com/NonlinearFruit/Creeds.json) | Each document used is marked public domain there. The build refuses any that isn't |
| People, family links, verse index, name meanings, book names, chronology | [BibleData](https://github.com/BradyStephenson/bible-data) by Brady Stephenson and contributors | CC BY 4.0 |

**Changes made to BibleData:** family links that don't name both people in the cited chapter are dropped. Noah's lifespan row is dropped because it disagrees with Genesis 9:29. BibleData files Jesus under its YHVH record. The app lists him as a person, using that record's Jesus labels and two links anyone can read in the verses: Matthew 1:16 and Luke 3:23.

**Left out on purpose:** NIV, ESV, NASB, NLT and CJB are under copyright, so the prototype's text labeled with those names was removed. To offer them, get permission from each publisher or use a licensed Bible API, then add a loader in `src/core/bible.ts`. Darby's translation was also left out because the available copy has corrupted text.

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

## Theological terms

Built by `scripts/build_glossary.py`. The list of terms and which entry answers each one are chosen by hand. The definitions aren't written for the app; they're quoted from:

- Easton's Bible Dictionary (1897), Schaff's Dictionary of the Bible (American Sunday-School Union, 1880) and Smith's Bible Dictionary (1884 edition), from CCEL's files marked public domain, as held in [bible-dictionary-dataset](https://github.com/neuu-org/bible-dictionary-dataset) (its structure is CC BY 4.0). That dataset calls the Schaff book "Hastings," but the file's own title page identifies it.
- The Westminster Larger Catechism, Heidelberg Catechism and Baptist Catechism already in the app.
- Schaff's History of the Christian Church, Hodge's Systematic Theology and Watson's A Body of Divinity, from CCEL's files. These are the opening prose of a section on the subject, so they often describe a term more than define it, and the section's own title is shown.

The 18 terms that had no entry anywhere are filled from `scripts/glossary_filled.json`, preferring theological works, then dictionaries:

- Public domain: Webster's Unabridged Dictionary (Project Gutenberg ebook 29765, via [matthewreagan/WebstersEnglishDictionary](https://github.com/matthewreagan/WebstersEnglishDictionary), checked against that file at build time), The Catholic Encyclopedia (1911, on New Advent), Encyclopædia Britannica (1911, read through a mirror of Wikisource) and Murray's New English Dictionary (1919, on the World English Historical Dictionary).
- **Copyrighted, short quotations:** Merriam-Webster (Dispensationalism, Ecclesiology, Rapture) and John A. Hardon's Modern Catholic Dictionary on CatholicCulture.org (Kenosis). These are one sentence each, marked `modern` in the data and tagged in the app. Replace them or get permission before any public or paid release.

Where a definition states one tradition's view, Claude adds a short note labeled as its own and not from the source. The sources lean toward 1800s Protestant scholarship, and the app says so.

**The owner's glossary.** `Theological_Terms.docx` holds 370 entries, labeled "Your glossary" with "No source named." At the owner's request, `scripts/glossary_corrections.json` rewords 77 of them: 19 that were inaccurate or imprecise, and 58 contested views that now say which tradition holds them. Claude wrote the rewording, the app tags those entries "Corrected" and shows the original wording and the reason, and the rest stay word for word. Named facts were checked where a `basis` is listed, but the rewording as a whole is unsourced editorial work, so check it as you would any draft. Its file metadata names the app's owner as author, and it names no sources. The app doesn't treat it as a cited source, and it's kept apart from the quoted definitions. Some entries closely resemble wording in Wayne Grudem's Systematic Theology (Miracle is one), and correcting an entry doesn't settle that, so check the document's history before any public release. The build reads it from `extra/own/Theological_Terms.docx` under the sources folder, and it isn't stored in the repository in its original form, only as text in `public/data/glossary.json`.
