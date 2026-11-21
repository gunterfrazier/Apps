import type { AgeGroup } from "./family";

interface StoryCraft {
  title: string;
  minutes: number;
  supplies: string[];
  steps: Record<AgeGroup, string[]>;
  artTile: number;
  artAlt: string;
}

interface StoryCollection {
  craft: StoryCraft;
  play: Record<AgeGroup, { title: string; instructions: string }>;
}

export const STORY_COLLECTIONS: Partial<Record<string, StoryCollection>> = {
  noah: {
    craft: {
      title: "Make a rainbow promise wheel",
      minutes: 15,
      supplies: ["Card or thick paper", "Crayons", "Scissors", "A paper fastener"],
      steps: {
        young: ["Ask an adult to cut out a circle and an arrow.", "Color a rainbow at the top of the circle. Add two clouds and a little ark.", "Ask an adult to fasten the arrow in the middle. Point it to the ark, then the rainbow, as you tell the story."],
        middle: ["Divide a paper circle into four sections. Draw the ark, the dove, dry land, and the rainbow in story order.", "Make a paper pointer and attach it in the middle.", "Use the wheel to retell the story. Match each picture to a verse in Genesis 8–9."],
        teen: ["Divide a paper circle into three sections labeled Sign, Promise, and Recipients.", "Use Genesis 9:8–17 to draw a symbol and cite a verse in each section.", "Attach a paper pointer. Have a partner choose a section and explain how it connects to the other two."],
      },
      artTile: 0,
      artAlt: "A paper wheel with a rainbow, clouds, and a blue pointer.",
    },
    play: {
      young: { title: "Animal pairs", instructions: "Name an animal from the ark. Have a partner copy its sound or movement. Switch turns and see how many pairs you can make." },
      middle: { title: "The dove’s three trips", instructions: "Act out each trip. Have a partner guess whether the dove returns empty, comes back with a leaf, or stays away. Check your order in Genesis 8:8–12." },
      teen: { title: "Who is included?", instructions: "Read Genesis 9:8–17 aloud together. Each time the promise mentions a recipient, make a tally. Compare your lists and discuss which details are easy to overlook." },
    },
  },
  ruth: {
    craft: {
      title: "Weave a harvest basket",
      minutes: 20,
      supplies: ["Two colors of paper", "Scissors", "Tape", "Pencil or markers"],
      steps: {
        young: ["Ask an adult to cut a basket shape and short strips in another color.", "Lay strips across the basket and tape their ends down.", "Draw and cut out pieces of barley. Add them to the basket one at a time as you tell how Ruth helped Naomi."],
        middle: ["Fold the basket shape and cut parallel slits, stopping short of the edges.", "Weave narrow strips over and under the slits. Tape their ends down.", "Add paper barley stems. Write one action Ruth or Boaz took on each stem."],
        teen: ["Weave a paper basket using parallel slits and strips, or draw an interwoven basket.", "Cut three paper stems labeled Ruth, Naomi, and Boaz. On each, record one choice and its effect on another person.", "Use the finished basket to explain how individual decisions changed what was possible for the others."],
      },
      artTile: 1,
      artAlt: "A woven paper basket with green barley stems.",
    },
    play: {
      young: { title: "Gather and share", instructions: "Scatter folded paper scraps as pretend grain. Take turns gathering them and sharing the pile. Name one way you can share something with a person this week." },
      middle: { title: "Follow the choices", instructions: "Take turns naming a choice Ruth, Naomi, or Boaz makes. Before the next turn, explain how that choice changes things for someone else in the story." },
      teen: { title: "Trace the help in Ruth 2", instructions: "Read Ruth 2:8–18 together. One person tracks what Ruth does and the other tracks what Boaz does. Where do you see help that protects Ruth’s ability to act?" },
    },
  },
  samaritan: {
    craft: {
      title: "Make a neighbor-care card",
      minutes: 15,
      supplies: ["Paper", "Markers", "Tape", "Adhesive bandages or cut paper strips"],
      steps: {
        young: ["Fold a sheet of paper in half and draw a big heart on the front.", "Put two bandages or paper strips across the heart.", "Draw one kind thing you can do inside. Give the card to someone with an adult’s help."],
        middle: ["Fold a card and decorate the cover with a heart and crossed paper strips.", "Inside, draw three small scenes showing how the Samaritan noticed, acted, and followed through.", "Add one concrete way you can do each of those things for a neighbor."],
        teen: ["Make a fold-out card with three panels called Notice, Act, and Follow through.", "Use Luke 10:33–35 to write one detail in each panel.", "On the back, sketch a realistic plan to help someone with their agreement, including one follow-up step."],
      },
      artTile: 2,
      artAlt: "A mint-green card decorated with a red heart and two crossed bandages.",
    },
    play: {
      young: { title: "What could a helper do?", instructions: "Have an adult act out dropping a pencil, looking for a book, or feeling left out. Take turns showing one kind way to respond." },
      middle: { title: "Freeze and help", instructions: "Pause an acted-out scene from the story just before the Samaritan helps. Suggest a next action, then read Luke 10:33–35 and compare your idea with what he does." },
      teen: { title: "Switch the question", instructions: "Read the opening and closing questions in Luke 10:25–37. In pairs, rewrite both in everyday language and test how each question changes the way you respond to the same situation." },
    },
  },
  "burning-bush": {
    craft: {
      title: "Make a burning bush paper collage",
      minutes: 15,
      supplies: ["Blue, brown, and green paper", "Red, orange, or yellow tissue paper", "Glue stick", "Scissors"],
      steps: {
        young: ["Glue a brown trunk and green leaves onto the blue paper.", "Tear colored tissue into flame shapes and glue them around the leaves. Leave green patches showing.", "Point to the leaves and tell someone why Moses stopped to look."],
        middle: ["Cut out a trunk, branches, and green leaves. Layer torn tissue around the bush so both the flames and the leaves stay visible.", "Add three paper labels for what Moses saw, heard, and was asked to do.", "Write a short phrase from the story on each label and place it beside your collage."],
        teen: ["Make the collage with a clear focus on the intact green leaves and bright paper flames.", "Arrange three cards around it with Exodus 3:7, 3:10, and 3:12. Sketch a symbol for what God sees, asks, and promises.", "Use the arrangement to explain how the promise of presence supports the commission."],
      },
      artTile: 3,
      artAlt: "A paper collage of green leaves and tissue-paper flames on a blue background.",
    },
    play: {
      young: { title: "See, stop, listen", instructions: "Take three pretend steps with Moses and stop when a partner says ‘bush!’ Point to what surprised him, then use a pretend listening pose when his name is called." },
      middle: { title: "Put the conversation in order", instructions: "Write four cards for Moses seeing the bush, hearing his name, being sent to Pharaoh, and hearing God’s promise. Mix them up, reorder them, and verify the sequence in Exodus 3." },
      teen: { title: "Questions and answers", instructions: "Pair up and split Exodus 3:11–15 and 4:10–17. Each person reads one exchange aloud and describes what changes between Moses’ question and the answer. Compare your findings." },
    },
  },
};
