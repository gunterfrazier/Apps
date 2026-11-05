import { hashForReference } from "../routes";

/** The link to the Genre and symbols page for a passage. */
export const symbolsHash = (reference: string) => {
  const h = hashForReference(reference);
  return h ? `symbols-${h.slice(5)}` : "symbols";
};
