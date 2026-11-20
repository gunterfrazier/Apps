import type { AgeGroup } from "./family";

interface StoryEdition { paragraphs: string[]; question: string }
export interface StoryImage { file: string; alt: string; credit: string; source: string; license: string; licenseUrl: string }
interface StoryVideo { file: string; title: string; captions: string; transcript: string[] }
export interface FamilyStory {
  id: string;
  title: string;
  reference: string;
  reading: string;
  teenReading?: string;
  topic: string;
  image: StoryImage;
  illustrations?: StoryImage[];
  video?: StoryVideo;
  editions: Partial<Record<AgeGroup, StoryEdition>>;
}

const publicDomain = {
  license: "Public domain",
  licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
};

const padgett = {
  credit: "Jim Padgett, © 1984 · Distant Shores Media/Sweet Publishing",
  license: "CC BY-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
};

export const FAMILY_STORIES: FamilyStory[] = [
  {
    id: "noah",
    title: "Noah and the ark",
    reference: "Genesis 6–9",
    reading: "Genesis 8:6–12; Genesis 9:8–17",
    teenReading: "Genesis 6:11–22; Genesis 9:8–17",
    topic: "Trust and promises",
    image: {
      ...publicDomain,
      file: "noah.webp",
      alt: "Pairs of animals gather beside a large wooden ark beneath storm clouds.",
      credit: "Noah’s Ark, Edward Hicks, 1846 · Philadelphia Museum of Art",
      source: "https://commons.wikimedia.org/wiki/File:Edward_Hicks,_American_-_Noah%27s_Ark_-_Google_Art_Project.jpg",
    },
    illustrations: [
      {
        ...padgett,
        file: "noah-illustration.webp",
        alt: "Noah reaches toward a dove from a window in the ark.",
        source: "https://commons.wikimedia.org/wiki/File:Book_of_Genesis_Chapter_8-9_(Bible_Illustrations_by_Sweet_Media).jpg",
      },
      {
        ...padgett,
        file: "noah-rainbow.webp",
        alt: "Noah and his family see a rainbow in the sky.",
        source: "https://commons.wikimedia.org/wiki/File:Book_of_Genesis_Chapter_9-4_(Bible_Illustrations_by_Sweet_Media).jpg",
      },
    ],
    video: {
      file: "noah-story.mp4",
      title: "Noah and the ark in three scenes",
      captions: "noah-story.vtt",
      transcript: [
        "God told Noah to build an ark. Noah did what God asked.",
        "After the rain stopped, Noah sent out a dove. It brought back an olive leaf.",
        "God set a rainbow in the sky as a sign of his promise to all living things.",
      ],
    },
    editions: {
      young: {
        paragraphs: [
          "God told Noah to build a huge boat called an ark. Noah did what God asked. His family and animals went inside.",
          "Rain fell for many days. When the water began to go down, Noah sent out a dove. It came back with an olive leaf. Later, Noah’s family and the animals could step out onto dry land.",
          "God put a rainbow in the clouds as a sign of his promise to all living things.",
        ],
        question: "What sign did God give Noah and his family?",
      },
      middle: {
        paragraphs: [
          "Genesis says the earth was full of violence. God warned Noah about the flood and told him to build an ark to shelter his family and the animals. Noah followed those instructions.",
          "Even after the rain stopped, Noah had to wait. The dove’s olive leaf was a sign that the water was going down. Noah finally left the ark when God told him it was time.",
          "In Genesis 9, God makes a covenant, or promise, with Noah, his descendants, and every living creature. The rainbow is a sign of that promise.",
        ],
        question: "Who is included in God’s promise in Genesis 9:8–17?",
      },
      teen: {
        paragraphs: [
          "Read Genesis 6:11–22 and 9:8–17 alongside each other. The story begins with a world corrupted by violence and ends with a covenant that includes people and animals. Both scenes ask readers to pay attention to how human choices affect life beyond ourselves.",
          "The waters recede slowly in Genesis 8. The account marks time through waiting, the movement of the ark, and a dove sent out more than once. When the family finally leaves, Noah responds in worship.",
          "In Genesis 9 the sign of the covenant is directed toward all living creatures. Consider what it means that the closing scene emphasizes the preservation of life after a story about its near destruction.",
        ],
        question: "How does the scope of the covenant in Genesis 9 change how you read the opening of the flood story?",
      },
    },
  },
  {
    id: "galilee",
    title: "Jesus calms the storm",
    reference: "Mark 4:35–41",
    reading: "Mark 4:35–41",
    teenReading: "Mark 4:35–41; Psalm 107:23–30",
    topic: "Fear and faith",
    image: {
      file: "galilee.webp",
      alt: "A view of the Sea of Galilee from the hills at Gamla.",
      credit: "The Sea of Galilee as seen from Gamla · Davidbena",
      source: "https://commons.wikimedia.org/wiki/File:Sea_of_Galilee_(xxx).jpg",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus and his friends were crossing a lake in a boat. A storm came up. Wind blew, and waves splashed into the boat. Jesus was asleep!",
          "His friends woke him. Jesus spoke to the wind and the waves, and the lake became calm. His friends wondered who could make even a storm listen.",
        ],
        question: "What did Jesus’ friends do when the storm scared them?",
      },
      middle: {
        paragraphs: [
          "After a day of teaching, Jesus asked his disciples to cross the Sea of Galilee. The wind rose and the boat began to fill with water. They found Jesus asleep at the back of the boat.",
          "The disciples woke Jesus and asked whether he cared what happened to them. He spoke to the wind and sea, and the storm went quiet. Then he asked them about their fear and their faith.",
        ],
        question: "How do the disciples’ questions change from the beginning of the storm to the end?",
      },
      teen: {
        paragraphs: [
          "In Mark 4:35–41 the disciples are afraid both before and after the storm goes quiet. At first they fear for their lives. Afterward, even with the danger past, they are struck by what they have witnessed.",
          "Jesus’ question about faith sits between the disciples’ question about whether he cares and their question about who he is. Read Psalm 107:23–30 alongside Mark’s account and compare how each presents the stilling of the sea.",
        ],
        question: "What do the two questions the disciples ask reveal about what they still have to learn?",
      },
    },
  },
  {
    id: "samaritan",
    title: "The Good Samaritan",
    reference: "Luke 10:25–37",
    reading: "Luke 10:25–37",
    topic: "Mercy and neighbors",
    image: {
      ...publicDomain,
      file: "samaritan.webp",
      alt: "The Samaritan supports an injured traveler as he lifts him onto a horse.",
      credit: "The Good Samaritan (after Delacroix), Vincent van Gogh, 1890 · Kröller-Müller Museum",
      source: "https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_The_Good_Samaritan,_1890_-_Google_Art_Project.jpg",
    },
    editions: {
      young: {
        paragraphs: [
          "Jesus told a story about a traveler who was hurt and left beside the road. Two people saw him and walked past.",
          "A Samaritan stopped. He helped the traveler and brought him to a place where he could rest. Jesus taught that being a neighbor means showing kindness like that.",
        ],
        question: "What is one kind thing you could do for someone who needs help?",
      },
      middle: {
        paragraphs: [
          "A man asked Jesus who counted as his neighbor. Jesus told a story about an injured traveler on the road from Jerusalem to Jericho. A priest and a Levite saw the traveler but passed by.",
          "A Samaritan stopped, cared for the man, and paid an innkeeper to look after him. Jesus asked which person had acted like a neighbor. The answer was the one who showed mercy.",
        ],
        question: "What did it cost the Samaritan to stop and help?",
      },
      teen: {
        paragraphs: [
          "Luke 10 opens this encounter with an expert in the law asking about eternal life. He answers Jesus by naming love of God and love of neighbor, then asks who his neighbor is.",
          "Jesus shifts the question. Instead of drawing a boundary around who deserves care, he asks which traveler became a neighbor to the injured man. The Samaritan’s answer is practical: time, assistance, transportation, and an ongoing commitment to the man’s care.",
        ],
        question: "How would a real situation change if you asked how to become a neighbor to someone instead of asking whether they count as one?",
      },
    },
  },
];
