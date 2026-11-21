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
} as const;

type Scene = (typeof scenes)[keyof typeof scenes];

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
  const historical = age === "teen" && variant !== "ink" ? story.image : undefined;
  if (historical) return <img className="family-historical-art" src={`family/${historical.file}`}
    alt={decorative ? "" : historical.alt} loading={decorative ? "lazy" : "eager"} />;
  const scene: Scene | undefined = scenes[story.id as keyof typeof scenes];
  if (!scene) return null;
  const [index, description] = scene;
  // The color atlas stacks the Story Club grid above the Bible Explorers grid.
  const row = Math.floor(index / 4) + (age === "middle" && variant !== "ink" ? 4 : 0);
  const alt = variant === "ink" && story.id === "feeding-the-crowd"
    ? "A basket holds loaves of bread and fish."
    : description;
  return <span className={grayscale ? "family-art-tile family-art-grayscale" : "family-art-tile"}>
    <img src={`family/story-${variant === "ink" ? "ink" : "color"}.webp`} alt={decorative ? "" : alt}
      loading={decorative ? "lazy" : "eager"}
      style={{ left: `-${(index % 4) * 100}%`, top: `-${row * 100}%` }} />
  </span>;
}
