export interface ParentLink {
  kind?: "descendant" | "legal";
  refs?: string[];
  generations?: number;
  via?: string[];
  note?: string;
  tradition?: boolean;
  /** The cited verse states the relationship directly, rather than the dataset inferring it. */
  explicit?: boolean;
}

/** One person. Every family link was tested against the tagged Hebrew and Greek, and cites the verse it comes from. */
export interface Figure {
  id: string;
  name: string;
  altNames?: string;
  /** How the dataset tells this person apart from others of the same name, with a reference. */
  title: string;
  tribe?: string;
  meaning?: string;
  gender?: "male" | "female";
  parents: string[];
  parentLinks?: Record<string, ParentLink>;
  spouses: string[];
  spouseRefs?: Record<string, string>;
  children: string[];
  siblings?: string[];
  associates?: string[];
  unrecordedGenealogy?: boolean;
  messianic?: boolean;
  era?: string;
  roles?: string[];
  /** STEPBible's summary. It's secondary, so the family links and verses take priority over it. */
  bio?: string;
  /** Read directly from the text, each with its verse. */
  facts?: string[];
  lifespan?: string;
  /** Years on one named chronology. Scripture itself gives no BC dates. */
  dates?: { from: number; to: number; kind: string; approx?: boolean };
  am?: { from: number; to: number };
  unnamed?: boolean;
  places?: string[];
  scriptures?: { ref: string; note?: string }[];
}
