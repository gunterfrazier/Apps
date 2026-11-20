import { getPassage, refOf, type TranslationId } from "../core/bible";
import type { HighlightColor, UserData } from "./store";

export interface NotebookEntry {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
  ref?: string;
  noteId?: string;
  colors: HighlightColor[];
  bookmarked?: boolean;
}

function passageMark(key: string) {
  const match = /^(\d+):(\d+):(\d+)(?:-(\d+))?$/.exec(key);
  if (!match) return;
  const [book, chapter, verse] = match.slice(1, 4).map(Number);
  const end = match[4] ? Number(match[4]) : verse;
  if (book >= 1 && book <= 66 && chapter > 0 && verse > 0 && end >= verse && end <= 176) return { book, chapter, verse, end };
}

export function passageMarkReference(key: string): string | undefined {
  const mark = passageMark(key);
  if (mark) return refOf(mark.book, mark.chapter, mark.verse, mark.end);
}

export function notebookEntries({ notebook, notes, highlights, bookmarks }: Pick<UserData, "notebook" | "notes" | "highlights" | "bookmarks">): NotebookEntry[] {
  const saved = new Set([...Object.keys(notes), ...Object.keys(highlights), ...bookmarks]);
  const marked = new Set(bookmarks);
  const passages: NotebookEntry[] = [];
  for (const key of saved) {
    const note = notes[key];
    const ref = passageMarkReference(key) ?? note?.ref;
    if (!ref) continue;
    const mark = passageMark(key);
    const colors = new Set<HighlightColor>();
    if (mark) for (let verse = mark.verse; verse <= mark.end; verse++) {
      const color = highlights[`${mark.book}:${mark.chapter}:${verse}`];
      if (color) colors.add(color);
    }
    passages.push({
      id: `passage:${key}`, title: ref, ref, body: note?.text ?? "", tags: note?.tags ?? [], updatedAt: note?.updatedAt ?? "",
      colors: [...colors], bookmarked: marked.has(key),
    });
  }
  return [
    ...notebook.map((n) => ({ id: `note:${n.id}`, noteId: n.id, title: n.title ?? "", body: n.body ?? "", tags: n.tags ?? [], updatedAt: n.updatedAt ?? "", colors: [] })),
    ...passages,
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, undefined, { numeric: true }));
}

export function notebookEntryText(entry: NotebookEntry): string {
  const colors = entry.colors.map((color) => color[0].toUpperCase() + color.slice(1));
  const highlight = colors.length ? `${colors.join(", ")} ${colors.length === 1 ? "highlight" : "highlights"}` : "";
  return [highlight, entry.bookmarked && "Bookmark"].filter(Boolean).join(" · ");
}

export async function resolveNotebook(entries: NotebookEntry[], translation: TranslationId) {
  return Promise.all(entries.map(async (entry) => {
    const passage = entry.ref ? await getPassage(translation, entry.ref).catch(() => null) : null;
    const quote = passage?.parts.flatMap((part) => part.verses.map((v) => v.text).filter(Boolean)).join(" ");
    return { ...entry, quote, translation: passage?.translation, notice: passage?.notice };
  }));
}

export type ResolvedNotebook = Awaited<ReturnType<typeof resolveNotebook>>;

export function notebookToMarkdown(title: string, entries: ResolvedNotebook): string {
  const notices = [...new Set(entries.filter((entry) => entry.quote && entry.notice).map((entry) => entry.notice))];
  return [
    `# ${title}`,
    ...entries.map((entry) => [
      `## ${entry.title || "Untitled note"}`,
      notebookEntryText(entry),
      entry.quote && `> ${entry.quote.replace(/\r?\n/g, "\n> ")}\n>\n> — ${entry.ref} (${entry.translation})`,
      entry.body,
      entry.tags.length > 0 && entry.tags.map((tag) => `#${tag}`).join(" "),
    ].filter(Boolean).join("\n\n")),
    ...notices,
    "",
  ].join("\n\n");
}
