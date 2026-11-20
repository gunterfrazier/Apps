export const AGE_GROUPS = [
  { id: "young", label: "Ages 5–8", description: "Short stories to read together" },
  { id: "middle", label: "Ages 9–12", description: "Stories with questions to explore" },
  { id: "teen", label: "Ages 13–17", description: "Bible study and reflection" },
] as const;
export type AgeGroup = typeof AGE_GROUPS[number]["id"];

export const FAMILY_THEMES = [
  { id: "ocean", label: "Ocean blue" },
  { id: "orchard", label: "Berry purple" },
  { id: "grove", label: "Forest green" },
] as const;
export type FamilyTheme = typeof FAMILY_THEMES[number]["id"];

export interface FamilySettings { nickname: string; ageGroup: AgeGroup; theme: FamilyTheme }
export interface FamilyProfile extends FamilySettings { id: string }
