/**
 * Turns verse text into what the built-in voice reads. The voice is a Piper model: it reads eSpeak's IPA, one
 * character per id, with each clause's punctuation kept so it can pause and fall at the right places. These steps
 * follow Piper's own (piper/phonemize_espeak.py and phoneme_ids.py), so the model hears what it was trained on.
 */

/** Verse text made ready to speak: brackets, quote marks and dashes become plain text and pauses, and capitals
 * such as "LORD" are read as words, not spelled out. */
export function cleanVerse(text: string): string {
  return text
    .replace(/[[\]]/g, "")
    .replace(/[“”"«»]/g, "")
    .replace(/(\p{L})[’'`](\p{L})/gu, "$1'$2")
    .replace(/[‘’`]|(?<!\p{L})'|'(?!\p{L})/gu, "")
    .replace(/\s*\)\s*$/, "")
    .replace(/\s*[—–()]\s*/g, ", ")
    .replace(/\b(\p{Lu})(\p{Lu}+)\b/gu, (_m, a: string, b: string) => a + b.toLowerCase())
    .replace(/\s+/g, " ")
    .replace(/(\s*,)+\s*([,.;:!?])/g, "$2")
    .replace(/^[\s,]+/, "")
    .trim();
}

/** Splits text after each piece of punctuation that ends a clause, keeping the punctuation. */
function splitAfter(text: string, marks: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`[${marks}]+(?=\\s|$)`, "g");
  let from = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const piece = text.slice(from, end).trim();
    if (piece) out.push(piece);
    from = end;
  }
  const rest = text.slice(from).trim();
  if (rest) out.push(rest);
  return out;
}

/** The pieces the voice speaks one at a time: sentences, with long ones split at semicolons, colons, then commas,
 * so the first words of a verse start soon and no single run of the model takes long. */
export function speechUnits(text: string, max = 220): string[] {
  const units: string[] = [];
  const add = (piece: string, levels: string[]) => {
    if (piece.length <= max || !levels.length) { units.push(piece); return; }
    const parts = splitAfter(piece, levels[0]);
    if (parts.length < 2) { add(piece, levels.slice(1)); return; }
    let cur = "";
    for (const p of parts) {
      if (cur && cur.length + 1 + p.length > max) { add(cur, levels.slice(1)); cur = p; }
      else cur = cur ? `${cur} ${p}` : p;
    }
    if (cur) add(cur, levels.slice(1));
  };
  for (const s of splitAfter(cleanVerse(text), ".!?")) add(s, [";:", ","]);
  return units;
}

export interface Clause { text: string; end: string }

/** A unit's clauses, each with the punctuation that closes it ("" for none). */
export function clauses(unit: string): Clause[] {
  return splitAfter(unit, ",;:.!?").map((piece) => {
    const m = /[,;:.!?]+$/.exec(piece);
    const end = m ? m[0].slice(-1) : "";
    return { text: m ? piece.slice(0, m.index).trim() : piece, end };
  }).filter((c) => /\p{L}|\d/u.test(c.text));
}

/** Piper's phoneme string for a unit, given eSpeak's IPA for each clause: the IPA, then the clause's
 * punctuation, then a space after a comma, colon or semicolon (or after any clause but the last). */
export function phonemeString(parts: { ipa: string; end: string }[]): string {
  return parts.map((p, i) => {
    const ipa = p.ipa.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const pause = p.end === "," || p.end === ":" || p.end === ";" || i < parts.length - 1;
    return ipa + p.end + (pause ? " " : "");
  }).join("").normalize("NFD");
}

/** Piper's ids: start, then each known character followed by the pad id, then end. */
export function phonemeIds(phonemes: string, map: Record<string, number[]>): number[] {
  const ids = [...map["^"], ...map["_"]];
  for (const ch of phonemes) {
    const id = map[ch];
    if (id) ids.push(...id, ...map["_"]);
  }
  ids.push(...map["$"]);
  return ids;
}
