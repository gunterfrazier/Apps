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
