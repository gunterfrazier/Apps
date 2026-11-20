import type { AgeGroup } from "./family";

interface FamilyResource {
  title: string;
  provider: string;
  format: "PDF lesson" | "Coloring page" | "Group activities" | "Video";
  url: string;
  audience: ReadonlyArray<AgeGroup>;
  detail?: string;
  adultOnly?: boolean;
}

const trueway = (title: string, path: string, age: AgeGroup, detail?: string): FamilyResource => ({
  title, provider: "Trueway Kids", format: "PDF lesson", url: `https://truewaykids.com/${path}/`, audience: [age], detail,
});

const markVideo: FamilyResource = {
  title: "Gospel of Mark overview", provider: "BibleProject", format: "Video",
  url: "https://bibleproject.com/videos/mark/", audience: ["teen"], detail: "Context for the whole Gospel",
};

const storyResources: Record<string, FamilyResource[]> = {
  noah: [
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
