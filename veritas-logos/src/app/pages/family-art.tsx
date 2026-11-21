import type { AgeGroup } from "../../core/family";
import type { FamilyStory } from "../../core/family-stories";

const scenes = {
  creation: [0, "The sun rises over the sea and trees."],
  noah: [1, "Giraffes stand beside Noah’s ark under a rainbow."],
  joseph: [2, "Joseph wears a striped coat beside his brothers."],
  ruth: [3, "Ruth gathers barley while Boaz watches."],
  galilee: [4, "Jesus stands in a small boat as waves rise around it."],
  samaritan: [5, "The Samaritan helps an injured traveler beside a donkey."],
  "jesus-welcomes-children": [6, "Children gather around Jesus."],
  "prodigal-son": [7, "A father embraces his son as he returns home."],
  "feeding-the-crowd": [8, "Jesus and his followers share bread and fish."],
  resurrection: [9, "Women come to a stone tomb with its entrance open."],
  david: [10, "David holds a sling and stands beside smooth stones."],
  jonah: [11, "Jonah is in the sea beside a great fish."],
  esther: [12, "Queen Esther approaches the king as he holds out a scepter."],
  daniel: [13, "Daniel sits with lions in the den."],
  "burning-bush": [14, "Moses kneels beside a bush whose leaves glow with fire."],
  "red-sea": [15, "Families follow Moses on a dry path between walls of seawater."],
  "samuel-hears-god": [16, "Samuel sits up in bed beside a lamp at night."],
  zacchaeus: [17, "Zacchaeus looks down from a tree as Jesus greets him."],
  "lost-sheep": [18, "A shepherd carries a small sheep across a green hillside."],
  "wise-builders": [19, "Two houses sit on rocky and sandy ground as water rushes nearby."],
  "adam-and-eve": [20, "Adam and Eve stand together beside a tree in a lush garden."],
  "tower-of-babel": [21, "People stand below a tall unfinished brick tower."],
  "god-calls-abraham": [22, "Abram and Sarai travel along a path with a donkey carrying bags."],
  "sarah-laughs": [23, "Sarah smiles as she holds baby Isaac by a tent."],
  "jacob-and-esau": [24, "Jacob and Esau embrace on a path in the hills."],
  "baby-moses": [25, "A princess kneels by the basket while Moses’s sister watches from the reeds."],
  "jesus-is-born": [26, "Mary and Joseph look at baby Jesus wrapped in cloth and resting in a manger."],
  "jesus-baptism": [27, "Jesus and John stand in the Jordan River as a dove descends."],
  "first-disciples": [28, "Jesus greets two fishermen with a boat and nets beside the lake."],
  "road-to-emmaus": [29, "Jesus shares bread with his two traveling companions at Emmaus."],
  pentecost: [30, "People are gathered with small flame shapes above their heads."],
  "philip-and-the-traveler": [31, "Philip and the Ethiopian traveler read a scroll together beside a chariot."],
} as const;

type Scene = (typeof scenes)[keyof typeof scenes];
const storyArtRows = Math.ceil(Object.keys(scenes).length / 4);

export const FAMILY_SPACES = {
  young: { name: "Story Club", icon: "☀", action: "Read & color" },
  middle: { name: "Bible Explorers", icon: "✦", action: "Read & explore" },
  teen: { name: "Teen Bible Study", icon: "◈", action: "Open study" },
} as const;

export function FamilyArt({ story, age, variant, grayscale = false, decorative = false }: {
  story: FamilyStory;
  age: AgeGroup;
  variant?: "ink";
  grayscale?: boolean;
  decorative?: boolean;
}) {
  const scene: Scene | undefined = scenes[story.id as keyof typeof scenes];
  if (!scene) return null;
  const [index, description] = scene;
  // The color atlas stacks the Story Club grid above the Bible Explorers grid.
  const row = Math.floor(index / 4) + (age !== "young" && variant !== "ink" ? storyArtRows : 0);
  const atlasRows = variant === "ink" ? storyArtRows : storyArtRows * 2;
  // Give the lazy image its full aspect ratio before layout clips it to its visible tile.
  const alt = variant === "ink" && story.id === "feeding-the-crowd"
    ? "A basket holds loaves of bread and fish."
    : description;
  return <span className={grayscale ? "family-art-tile family-art-grayscale" : "family-art-tile"}>
    <img src={`family/story-${variant === "ink" ? "ink" : "color"}.webp`} alt={decorative ? "" : alt}
      loading={decorative ? "lazy" : "eager"}
      style={{ aspectRatio: `4 / ${atlasRows}`, left: `-${(index % 4) * 100}%`, top: `-${row * 100}%` }} />
  </span>;
}

export function CraftArt({ tile, alt }: { tile: number; alt: string }) {
  return <span className="family-art-tile kids-craft-art">
    <img src="family/crafts.webp" alt={alt} loading="lazy" style={{ aspectRatio: `4 / ${storyArtRows}`, left: `-${(tile % 4) * 100}%`, top: `-${Math.floor(tile / 4) * 100}%` }} />
  </span>;
}
