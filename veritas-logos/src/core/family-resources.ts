import type { AgeGroup } from "./family";

interface FamilyResource {
  title: string;
  provider: string;
  format: "PDF lesson" | "Coloring page" | "Group activities" | "Video" | "Illustrated PDF" | "Read online" | "Parent-led lesson";
  url: string;
  audience: ReadonlyArray<AgeGroup>;
  detail?: string;
  adultOnly?: boolean;
}

export const FAMILY_HOME_RESOURCES = [
  { title: "Bible App for Kids resources from YouVersion", provider: "YouVersion",
    url: "https://bibleappforkids.com/parents", detail: "Parent guides and coloring pages by story" },
  { title: "Bible App for Kids curriculum from Life.Church", provider: "Life.Church",
    url: "https://open.life.church/preschool", detail: "Preschool ministry lessons and activities" },
  { title: "Fresh Life Church kids resources", provider: "Fresh Life Church",
    url: "https://open.life.church/partners/fresh-life-church", detail: "Coloring pages, prayer guides, and seasonal activities" },
];

const trueway = (title: string, path: string, age: AgeGroup, detail?: string): FamilyResource => ({
  title, provider: "Trueway Kids", format: "PDF lesson", url: `https://truewaykids.com/${path}/`, audience: [age], detail,
});

const markVideo: FamilyResource = {
  title: "Gospel of Mark overview", provider: "BibleProject", format: "Video",
  url: "https://bibleproject.com/videos/mark/", audience: ["teen"], detail: "Context for the whole Gospel",
};

const purple = (lesson: number): FamilyResource => ({
  title: "Purple Curriculum parent-led lesson",
  provider: "Purple Curriculum",
  format: "Parent-led lesson",
  url: `https://www.purplecurriculum.com/preschool-cms-1/${lesson}`,
  audience: ["young"],
  adultOnly: true,
  detail: "Publisher ages 3–5. Some linked downloads have separate access requirements.",
});

const storyResources: Record<string, FamilyResource[]> = {
  "jesus-is-born": [
    trueway("Jesus Is Born printable lesson", "jesus-is-born", "young", "Choose the age 5+ Christmas pack"),
    trueway("The Shepherds preteen study", "shepherds-teen", "middle", "Luke 2:8–20"),
    trueway("Jesus Is Born teen study", "jesus-is-born-teen", "teen"),
  ],
  "jesus-baptism": [
    trueway("The Baptism of Jesus printable lesson", "the-baptism-of-jesus", "young", "Choose the age 5+ pack"),
    trueway("The Baptism of Jesus preteen study", "the-baptism-of-jesus-teen", "middle"),
    trueway("The Baptism of Jesus teen study", "the-baptism-of-jesus-teen", "teen"),
  ],
  "first-disciples": [
    trueway("Fishers of Men printable lesson", "fishers-of-men", "young", "Parallel account in Luke 5"),
    trueway("Fishers of Men preteen study", "fishers-of-men-luke-5-preteen", "middle", "Parallel account in Luke 5"),
    trueway("Fishers of Men teen study", "fishers-of-men-teen-2", "teen", "Parallel account in Luke 5"),
  ],
  "road-to-emmaus": [
    trueway("The Road to Emmaus printable lesson", "road-to-emmaus", "young", "Choose the age 5+ pack"),
    trueway("The Road to Emmaus preteen study", "road-to-emmaus", "middle", "Choose the Preteens and Teens pack"),
    trueway("The Road to Emmaus teen study", "road-to-emmaus", "teen", "Choose the Preteens and Teens pack"),
  ],
  pentecost: [
    trueway("Pentecost printable lesson", "pentecost", "young", "Choose the age 5+ pack"),
    trueway("Pentecost preteen study", "pentecost-teen", "middle"),
    trueway("Pentecost teen study", "pentecost-teen", "teen"),
  ],
  "philip-and-the-traveler": [
    trueway("Philip and the Ethiopian printable lesson", "philip-and-the-ethiopian", "young", "Choose the age 5+ pack"),
    trueway("Philip and the Ethiopian preteen study", "philip-and-the-ethiopian-bible-lesson-preteens", "middle"),
    trueway("Philip and the Ethiopian teen study", "philip-ethiopian-teen", "teen"),
  ],
  "adam-and-eve": [
    trueway("Adam and Eve in Genesis 2 printable lesson", "adam-and-eve-5", "young", "Publisher ages 5–10"),
    trueway("Adam and Eve study", "adam-eve-teen", "middle", "Publisher preteen and teen pack"),
    trueway("Adam and Eve teen study", "adam-eve-teen", "teen"),
  ],
  "tower-of-babel": [
    trueway("Tower of Babel printable lesson", "the-tower-of-babel-bible-lesson-for-5-10-year-old", "young", "Publisher ages 5–10"),
    trueway("Tower of Babel preteen study", "babel-teens", "middle"),
    trueway("Tower of Babel teen study", "babel-teens", "teen"),
  ],
  "god-calls-abraham": [
    trueway("God Calls Abraham and Sarah printable lesson", "god-calls-abraham-and-sarah-free-bible-lesson-for-under-5s", "young", "Choose the age 5+ pack on the page"),
    trueway("God Calls Abraham and Sarah preteen study", "abram-and-sarai-teen", "middle"),
    trueway("God Calls Abraham and Sarah teen study", "abram-and-sarai-teen", "teen"),
  ],
  "sarah-laughs": [
    trueway("Isaac Is Born printable lesson", "isaac-is-born-5", "young", "Publisher ages 5–10"),
    trueway("Isaac Is Born preteen study", "isaac-is-born-teens", "middle"),
    trueway("Isaac Is Born teen study", "isaac-is-born-teens", "teen"),
  ],
  "jacob-and-esau": [
    { title: "Jacob and Esau activity pack", provider: "Mary’s Printables", format: "PDF lesson",
      url: "https://www.marysprintables.com/esau-and-jacob-worksheet/", audience: ["young"],
      detail: "Covers events from Genesis 25, 27, and 33" },
    { title: "Jacob and Esau reunion worksheet", provider: "Learn of Christ", format: "PDF lesson",
      url: "https://learnofchrist.com/activity-sheets/genesis/33", audience: ["middle"], detail: "Genesis 33" },
    { title: "Book of Genesis study guide", provider: "BibleProject", format: "Read online",
      url: "https://bibleproject.com/guides/book-of-genesis/", audience: ["teen"], detail: "Context for Jacob’s family" },
  ],
  "baby-moses": [
    trueway("Baby Moses printable lesson", "baby-moses-bible-lesson-5-10-year-old-bible-lesson-pack", "young", "Publisher ages 5–10"),
    trueway("Baby Moses preteen study", "baby-moses-teens", "middle"),
    trueway("Baby Moses teen study", "baby-moses-teens", "teen"),
  ],
  "red-sea": [
    trueway("Crossing the Red Sea printable lesson", "the-red-sea", "young", "Choose the age 5+ pack"),
    trueway("Crossing the Red Sea preteen study", "red-sea-teens", "middle"),
    trueway("Crossing the Red Sea teen study", "red-sea-teens", "teen"),
  ],
  "samuel-hears-god": [
    trueway("Hannah and Samuel printable lesson", "hannah-and-samuel-5", "young", "Publisher ages 5–10"),
    trueway("Hannah and Samuel preteen study", "hannah-and-samuel-teen", "middle"),
    trueway("Hannah and Samuel teen study", "hannah-and-samuel-teen", "teen"),
  ],
  zacchaeus: [
    trueway("Zacchaeus printable lesson", "zacchaeus", "young", "Choose the age 5+ pack"),
    trueway("Zacchaeus preteen study", "zacchaeus-teens", "middle"),
    trueway("Zacchaeus teen study", "zacchaeus-teens", "teen"),
  ],
  "lost-sheep": [
    trueway("The Lost Sheep and the Lost Coin printable lesson", "the-parable-of-lost-things", "young", "Choose the age 5+ pack"),
    trueway("The Lost Sheep and the Lost Coin preteen study", "lost-sheep-and-coin-teen", "middle"),
    trueway("The Lost Sheep and the Lost Coin teen study", "lost-sheep-and-coin-teen", "teen"),
  ],
  "wise-builders": [
    trueway("The Wise and Foolish Builders printable lesson", "the-wise-and-foolish-builders", "young", "Choose the age 5+ pack"),
    trueway("The Wise and Foolish Builders preteen study", "wise-and-foolish-builders-preteen", "middle"),
    trueway("The Wise and Foolish Builders teen study", "wise-and-foolish-builders-teen", "teen"),
  ],
  "burning-bush": [
    purple(16),
    trueway("Burning Bush printable lesson and craft", "burning-bush-5", "young", "Publisher ages 5–10"),
    trueway("Burning Bush printable lesson and craft", "burning-bush-5", "middle", "Publisher ages 5–10"),
    trueway("Burning Bush study for teens", "burning-bush-teens", "teen"),
  ],
  david: [
    trueway("David and Goliath printable lesson", "david-and-goliath-5", "young", "Publisher age range 5–10"),
    trueway("David and Goliath study for preteens", "david-and-goliath-teen", "middle"),
  ],
  jonah: [
    trueway("Jonah and the great fish printable lesson", "jonah", "young", "Choose the age 5+ edition"),
    trueway("Jonah study for preteens", "jonah-teens", "middle", "Includes all four chapters"),
  ],
  esther: [
    trueway("Esther study for preteens", "esther-teens", "middle"),
    trueway("Esther study for teens", "esther-teens", "teen"),
  ],
  daniel: [
    trueway("Daniel and the lions’ den study for preteens", "daniel-teens", "middle"),
    trueway("Daniel and the lions’ den study for teens", "daniel-teens", "teen"),
  ],
  creation: [
    trueway("Creation printable lesson", "creation-bible-lesson-for-children-5-10-years-old", "young", "Publisher age range 5–10"),
    trueway("Creation study for preteens", "creation-genesis-1-teen", "middle"),
    trueway("Creation study for teens", "creation-genesis-1-teen", "teen"),
    {
      title: "When God Made Everything", provider: "Bible for Children", format: "Illustrated PDF",
      url: "https://bibleforchildren.org/PDFs/english/01_When_God_Made_Everything_English.pdf", audience: ["young", "middle"],
    },
  ],
  joseph: [
    trueway("Joseph printable lesson", "joseph-5-10-year-old-bible-lesson-pack", "young", "Publisher age range 5–10"),
    trueway("Joseph study for preteens", "joseph-teens", "middle"),
    trueway("Joseph study for teens", "joseph-teens", "teen"),
    {
      title: "Joseph and His Brothers", provider: "Childhood Bible Stories", format: "Read online",
      url: "https://childhoodbiblestories.com/stories/joseph-and-his-brothers", audience: ["young", "middle"], detail: "Publisher age range 5–9",
    },
    {
      title: "God Honors Joseph the Slave", provider: "Bible for Children", format: "Illustrated PDF",
      url: "https://bibleforchildren.org/PDFs/english/08_God_Honors_Joseph_the_Slave_English.pdf", audience: ["young", "middle"],
    },
  ],
  ruth: [
    purple(27),
    trueway("Ruth printable lesson", "ruth-5", "young", "Publisher age range 5–10"),
    trueway("Ruth study for preteens", "ruth-teen", "middle"),
    trueway("Ruth study for teens", "ruth-teen", "teen"),
    {
      title: "Ruth, Naomi and Boaz Are Blessed", provider: "Life, Hope & Truth", format: "Read online",
      url: "https://lifehopeandtruth.com/bible/bible-study/bible-stories/ruth/", audience: ["middle", "teen"],
      adultOnly: true, detail: "Publisher retelling for family discussion",
    },
  ],
  "feeding-the-crowd": [
    trueway("Feeding the Five Thousand printable lesson", "feeding5000", "young", "Choose the age 5+ edition"),
    trueway("Feeding the 5,000 preteen study", "feeding-the-5000-preteens", "middle"),
    trueway("Feeding the Five Thousand teen study", "feeding-the-5000-teen", "teen"),
    {
      title: "Jesus Feeds 5000 People", provider: "Bible for Children", format: "Illustrated PDF",
      url: "https://bibleforchildren.org/PDFs/english/51_Jesus_Feeds_5000_People_English.pdf", audience: ["young", "middle"],
    },
  ],
  resurrection: [
    trueway("Easter printable lesson", "easter-lesson", "young", "Includes the crucifixion and resurrection"),
    trueway("Easter activities and worksheets", "easter-resources", "middle", "Includes ages 5–10 worksheets"),
    {
      title: "The Easter Story", provider: "Childhood Bible Stories", format: "Read online",
      url: "https://childhoodbiblestories.com/stories/easter-resurrection", audience: ["young"], detail: "Includes the crucifixion and resurrection",
    },
    {
      title: "The Resurrection of Jesus", provider: "BibleProject", format: "Video",
      url: "https://bibleproject.com/videos/gospel-luke-5/", audience: ["teen"], detail: "A companion reading of Luke 24",
    },
  ],
  noah: [
    purple(4),
    trueway("Noah’s Ark printable lesson", "noah-5", "young", "Publisher age range 5–10"),
    trueway("God keeps his promises", "god-keeps-his-promises-bible-lesson-for-5-10-year-old", "middle", "Publisher age range 5–10"),
    trueway("Noah’s Ark teen study", "noah-teen", "teen", "Genesis 6–7"),
    {
      title: "Free Noah’s Ark lesson", provider: "Childhood Bible Stories", format: "PDF lesson",
      url: "https://childhoodbiblestories.com/lessons/noahs-ark", audience: ["young"],
      adultOnly: true, detail: "Ages 3–8. The publisher asks for an email address.",
    },
    {
      title: "Genesis 1–11", provider: "BibleProject", format: "Video",
      url: "https://bibleproject.com/videos/torah-genesis-1/", audience: ["teen"], detail: "Context for the flood story",
    },
  ],
  galilee: [
    trueway("Jesus Calms the Storm printable lesson", "jesus-calms-the-storm", "young", "Choose the age 5+ edition"),
    trueway("Jesus Calms the Storm preteen study", "jesus-calms-the-storm-preteen", "middle", "Publisher age range 8–13"),
    trueway("Jesus Calms the Storm teen study", "jesus-calms-the-storm-teen", "teen"),
    markVideo,
  ],
  samaritan: [
    purple(70),
    trueway("The Good Samaritan printable lesson", "good-samaritan", "young", "Choose the age 5+ edition"),
    trueway("The Good Samaritan preteen study", "the-good-samaritan-preteens", "middle"),
    trueway("The Good Samaritan teen study", "good-samaritan-teen", "teen"),
  ],
  "jesus-welcomes-children": [
    trueway("Jesus and the Little Children printable lesson", "jesus-and-the-little-children", "young", "Choose the age 5+ edition"),
    trueway("Jesus Welcomes the Little Children teen study", "little-children-teens", "teen"),
    {
      title: "Jesus and the Children", provider: "Sermons4Kids", format: "Coloring page",
      url: "https://sermons4kids.com/activities/jesus-and-the-children-1", audience: ["young"],
      adultOnly: true, detail: "A free publisher account is required to print or download.",
    },
    {
      title: "Let the Children Come", provider: "Sermons4Kids", format: "Group activities",
      url: "https://sermons4kids.com/activities/let-the-children-come-6", audience: ["middle"],
    },
    markVideo,
  ],
  "prodigal-son": [
    trueway("The Lost Son printable lesson", "prodigal-son", "young", "Choose the age 5+ edition"),
    trueway("The Lost Son preteen study", "lost-son-preteen-bible-lesson", "middle"),
    trueway("The Prodigal Son teen study", "prodigal-son-teen", "teen"),
    {
      title: "The Prodigal Son in Luke 9–19", provider: "BibleProject", format: "Video",
      url: "https://bibleproject.com/videos/gospel-luke-3/", audience: ["teen"],
    },
  ],
};

export function getFamilyResources(story: string, age: AgeGroup, forAdults = false) {
  return (storyResources[story] ?? []).filter((resource) =>
    resource.audience.includes(age) && (forAdults || !resource.adultOnly));
}
