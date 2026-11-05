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

Results of the current build: 95,222 quotes on file, 25,059 kept. Left out: 41,954 from works not on the list, 16,834 with no source file to check, 8,789 whose wording wasn't found in the cited edition (many appear to be excerpts of a modern copyrighted series), 2,026 on books outside the 66, 447 from files marked as machine translated, 83 with a missing source file and 30 duplicates. Modern authors in that database, such as C. S. Lewis, are left out too.

A quote in the Catena Aurea is as Aquinas collected it. It's often condensed, and his attributions aren't always certain.

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
