interface StoryVideoLink {
  id: string;
  title: string;
  url?: string;
  creator: string;
  format: "Animated retelling" | "Musical adaptation" | "Short excerpt" | "Companion lesson";
}

const saddleback = (id: string, title: string): StoryVideoLink => ({
  id, title, creator: "Saddleback Kids", format: "Animated retelling",
});

const crossroads = (id: string, title: string): StoryVideoLink => ({
  id, title, creator: "Crossroads Kids’ Club", format: "Animated retelling",
});

export const FAMILY_VIDEO_CHANNELS = [
  { name: "Minno Kids", url: "https://www.youtube.com/@minnokids" },
  { name: "Minno Bedtime", url: "https://www.youtube.com/@minnobedtime" },
  { name: "VeggieTales Official", url: "https://www.youtube.com/@veggietales" },
  { name: "Saddleback Kids animated Bible stories", url: "https://www.youtube.com/playlist?list=PL5aPdmniG3y_n7hXEKTV4qQnIeCe-p6Ws" },
];

const videosByStory: Record<string, StoryVideoLink[]> = {
  creation: [
    crossroads("fJnj_SAlh8Y", "God’s Story: Creation"),
    saddleback("teu7BCZTgDs", "Creation (Genesis 1–2)"),
  ],
  ruth: [
    saddleback("SDmjO7X8ELI", "Ruth and Naomi"),
    { id: "opjrer7dB38", title: "The Story of Ruth and Naomi", creator: "Minno Kids", format: "Animated retelling" },
  ],
  "burning-bush": [saddleback("SfR1x3lvrvs", "Moses and the Burning Bush")],
  david: [
    { id: "QOznv1uhn0M", title: "David and Goliath", creator: "Minno Kids", format: "Animated retelling" },
    crossroads("7zLAcUZkxHA", "God’s Story: David and Goliath"),
  ],
  jonah: [
    saddleback("WOSadLyqshg", "Jonah and the Fish"),
    { id: "bibleproject-jonah", url: "https://bibleproject.com/videos/jonah/",
      title: "Book of Jonah overview", creator: "BibleProject", format: "Companion lesson" },
  ],
  esther: [
    saddleback("D3lsMSEEuG4", "Esther’s Request to the King"),
    crossroads("KPDRmkh7J9c", "God’s Story: Esther"),
  ],
  daniel: [
    { id: "eywIAaKaHUU", title: "Daniel and the Lions’ Den", creator: "Minno Kids", format: "Animated retelling" },
    saddleback("bEM_X25DWPk", "Daniel in the Lions’ Den"),
  ],
  noah: [
    saddleback("qzYjy6lhRag", "Noah and the Flood"),
    { id: "l1vSBNmKrSI", title: "Noah’s Ark", creator: "VeggieTales Official", format: "Musical adaptation" },
    { id: "tYIiQZUqjdw", title: "God speaks to Noah", creator: "Minno Kids", format: "Short excerpt" },
  ],
  galilee: [
    saddleback("uYLHqdSO9OY", "Jesus Calms the Storm"),
    { id: "crossroads-storm", url: "https://www.crossroads.net/media/videos/jesus-calms-storm-or-kids-club-for-older-kids",
      title: "Jesus Calms the Storm! · Kids’ Club lesson", creator: "Crossroads Kids’ Club", format: "Companion lesson" },
  ],
  samaritan: [
    saddleback("osfQg4yKtq8", "The Good Samaritan"),
    { id: "crossroads-helpers", url: "https://www.crossroads.net/media/videos/lets-be-helpers-or-good-samaritan-or-kids-club-older",
      title: "Let’s Be Helpers", creator: "Crossroads Kids’ Club", format: "Companion lesson" },
  ],
  "jesus-welcomes-children": [saddleback("VPUMDVBO7dY", "Jesus and the Children")],
  "prodigal-son": [
    saddleback("DJgROx4wFKM", "The Prodigal Son"),
    crossroads("kfDfMZ6MTJs", "God’s Story: Two Sons and a Father"),
  ],
  joseph: [
    saddleback("4m6R_9KYHlY", "Joseph Forgives His Brothers"),
    saddleback("VnlqKPIZQzI", "Joseph and His Coat"),
  ],
  "feeding-the-crowd": [
    saddleback("S6rj9cAJrWE", "Jesus Feeds the 5,000"),
    crossroads("zDp3HW4cES4", "God’s Story: Jesus Feeds 5,000"),
  ],
  resurrection: [
    crossroads("VtYDbPfZB-8", "God’s Story: Jesus Is Alive"),
    saddleback("HL8R158Ujp4", "The Story of Easter (Jesus’ Sacrifice)"),
  ],
};

export function familyStoryVideos(storyId: string): readonly StoryVideoLink[] {
  return videosByStory[storyId] ?? [];
}

const animations: Partial<Record<string, { file: string; title: string; format: string; note: string }>> = {
  "burning-bush": {
    file: "burning-bush-short.mp4",
    title: "The bush that kept burning",
    format: "animated short",
    note: "A short, silent animation with on-screen story text.",
  },
  "jesus-welcomes-children": {
    file: "welcome-circle-short.mp4",
    title: "Make a welcome circle",
    format: "animated craft demo",
    note: "A silent demo with on-screen instructions. Colored paper hands move into a circle around a heart.",
  },
};

export function familyStoryAnimation(storyId: string) {
  return animations[storyId];
}
