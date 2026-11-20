interface StoryVideoLink {
  id: string;
  title: string;
  creator: string;
  format: "Animated retelling" | "Musical adaptation" | "Short excerpt";
}

const saddleback = (id: string, title: string): StoryVideoLink => ({
  id, title, creator: "Saddleback Kids", format: "Animated retelling",
});

export const FAMILY_VIDEO_CHANNELS = [
  { name: "Minno Kids", url: "https://www.youtube.com/@minnokids" },
  { name: "Minno Bedtime", url: "https://www.youtube.com/@minnobedtime" },
  { name: "VeggieTales Official", url: "https://www.youtube.com/@veggietales" },
  { name: "Saddleback Kids animated Bible stories", url: "https://www.youtube.com/playlist?list=PL5aPdmniG3y_n7hXEKTV4qQnIeCe-p6Ws" },
];

const videosByStory: Record<string, StoryVideoLink[]> = {
  noah: [
    saddleback("qzYjy6lhRag", "Noah and the Flood"),
    { id: "l1vSBNmKrSI", title: "Noah’s Ark", creator: "VeggieTales Official", format: "Musical adaptation" },
    { id: "tYIiQZUqjdw", title: "God speaks to Noah", creator: "Minno Kids", format: "Short excerpt" },
  ],
  galilee: [saddleback("uYLHqdSO9OY", "Jesus Calms the Storm")],
  samaritan: [saddleback("osfQg4yKtq8", "The Good Samaritan")],
  "jesus-welcomes-children": [saddleback("VPUMDVBO7dY", "Jesus and the Children")],
  "prodigal-son": [saddleback("DJgROx4wFKM", "The Prodigal Son")],
};

export function familyStoryVideos(storyId: string): readonly StoryVideoLink[] {
  return videosByStory[storyId] ?? [];
}
