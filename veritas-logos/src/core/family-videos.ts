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

const genesisBeginnings: StoryVideoLink = {
  id: "bibleproject-genesis-beginnings", url: "https://bibleproject.com/videos/torah-genesis-1/",
  title: "Genesis 1–11 overview", creator: "BibleProject", format: "Companion lesson",
};

const bibleProject = (path: string, title: string): StoryVideoLink => ({
  id: `bibleproject-${path}`, url: `https://bibleproject.com/videos/${path}/`,
  title, creator: "BibleProject", format: "Companion lesson",
});

const videosByStory: Record<string, StoryVideoLink[]> = {
  "jesus-is-born": [saddleback("v3656G6tWuI", "The Story of Christmas (Jesus Is Born)"), bibleProject("gospel-luke-1", "The Birth of Jesus in Luke 1–2")],
  "jesus-baptism": [saddleback("T0XT4lNJasg", "The Baptism of Jesus"), bibleProject("gospel-luke-2", "The Baptism of Jesus and His Early Ministry in Luke")],
  "first-disciples": [saddleback("EhIwTU9RbxY", "Jesus Calls Peter (Luke’s Account)"), bibleProject("mark", "Gospel of Mark Overview")],
  "road-to-emmaus": [
    { id: "saddleback-emmaus", url: "https://www.youtube.com/watch?v=fZCY4xmRR1U&t=5070s",
      title: "The Road to Emmaus (Chapter from The Story of Jesus)", creator: "Saddleback Kids", format: "Short excerpt" },
    bibleProject("gospel-luke-5", "The Resurrection of Jesus in Luke 24"),
  ],
  pentecost: [crossroads("vuUK6REOWuE", "Kid Bible Story: Pentecost"), bibleProject("gospel-acts-1", "Pentecost in Acts 1–7")],
  "philip-and-the-traveler": [saddleback("TGEqn7_teFo", "Philip and the Ethiopian"), bibleProject("gospel-acts-2", "The Good News Spreads in Acts 8–12")],
  "adam-and-eve": [saddleback("l7TDvJrjjz0", "Adam and Eve Sin"), genesisBeginnings],
  "tower-of-babel": [
    { id: "servus-dei-babel", url: "https://www.servus-dei.com/post/tower-of-babel-higher-and-higher",
      title: "The Tower of Babel: Higher and Higher", creator: "Servus Dei", format: "Animated retelling" },
    genesisBeginnings,
  ],
  "god-calls-abraham": [
    saddleback("foWKaKnJeUw", "Abraham (Genesis 12–13)"),
    { id: "mimi-lumi-abraham", url: "https://mimiandlumi.com/episodes/god-calls-abraham/",
      title: "God Calls Abraham", creator: "Mimi & Lumi", format: "Animated retelling" },
  ],
  "sarah-laughs": [
    saddleback("SDlDgcXk2lc", "God’s Promises for Abraham and Sarah"),
    { id: "6P_WR4xW6io", title: "Sarah Laughed", creator: "DG Bible Songs", format: "Musical adaptation" },
  ],
  "jacob-and-esau": [
    { id: "tiny-bible-jacob", url: "https://tinybiblestories.com/pages/jacob-and-esau-story-l-jacob-goes-back-home",
      title: "Jacob Goes Back Home", creator: "Tiny Bible Stories", format: "Animated retelling" },
    { id: "bibleproject-genesis-family", url: "https://bibleproject.com/videos/genesis-12-50/",
      title: "Genesis 12–50 overview", creator: "BibleProject", format: "Companion lesson" },
  ],
  "baby-moses": [saddleback("vf-4x4iefQE", "Baby Moses (Exodus 1–2)")],
  "red-sea": [
    saddleback("h5Sj-ZotsXw", "Moses and the Red Sea"),
    { id: "bibleproject-exodus", url: "https://bibleproject.com/videos/exodus-1-18/",
      title: "Exodus 1–18 overview", creator: "BibleProject", format: "Companion lesson" },
  ],
  "samuel-hears-god": [
    saddleback("g9aIbNjFjWk", "Samuel and Eli"),
    { id: "bibleproject-samuel", url: "https://bibleproject.com/videos/1-samuel/",
      title: "1 Samuel overview", creator: "BibleProject", format: "Companion lesson" },
  ],
  zacchaeus: [
    saddleback("5BjtbJFz2ug", "Zacchaeus"),
    { ...crossroads("crossroads-zacchaeus", "God’s Story: Zacchaeus"), url: "https://vimeo.com/57088533" },
  ],
  "lost-sheep": [
    saddleback("ad7eUq5rQIw", "The Parable of the Lost Sheep"),
    crossroads("smvcsgMv6Dw", "God’s Story: One Lost Sheep"),
  ],
  "wise-builders": [saddleback("I6S3cRVLMFQ", "The Parable of the Two Builders")],
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
    { id: "forchildren-storm", url: "https://vimeo.com/130594052",
      title: "Jesus Calms the Storm (Clay Animation)", creator: "ForChildren.com", format: "Animated retelling" },
  ],
  samaritan: [
    saddleback("osfQg4yKtq8", "The Good Samaritan"),
    { ...crossroads("crossroads-samaritan", "God’s Story: The Good Samaritan"), url: "https://vimeo.com/210808541" },
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

export function familyVideoUrl(video: StoryVideoLink): string {
  return video.url ?? `https://www.youtube.com/watch?v=${video.id}`;
}

export function familyStoryVideos(storyId: string): readonly StoryVideoLink[] {
  return videosByStory[storyId] ?? [];
}

const animations: Partial<Record<string, { file: string; title: string; format: string; note: string }>> = {
  pentecost: {
    file: "heard-at-pentecost-short.mp4",
    title: "Heard at Pentecost",
    format: "animated short",
    note: "A silent animation with on-screen story text. Wind and flame shapes lead into a scene of people hearing in their own languages.",
  },
  "baby-moses": {
    file: "basket-among-reeds-short.mp4",
    title: "A Basket Among the Reeds",
    format: "animated short",
    note: "A silent animation with on-screen story text. Moses’s sister watches by the Nile as a princess comes toward the basket.",
  },
  "wise-builders": {
    file: "two-builders-short.mp4",
    title: "Two houses, one storm",
    format: "animated short",
    note: "A silent animation with on-screen story text. Rain falls on both houses. The house on sand tumbles while the one on rock stands.",
  },
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
