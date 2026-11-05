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

/** One person from BibleData. Every family link cites the verse it comes from. */
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
}
