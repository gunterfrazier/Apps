/**
 * Writes a guide as a real Word document with real footnotes. A .docx is a zip of XML parts, and the parts here are plain
 * enough to build by hand, so no library is needed. Files are stored uncompressed.
 */
import type { ResolvedGuide } from "./guide";
import { DATA_CREDIT_TEXT, ORIGIN_LABEL } from "./guide";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const run = (t: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${inner}</w:p>`;

export function guideDocumentXml(g: ResolvedGuide): { document: string; footnotes: string } {
  const notes: string[] = [];
  const foot = (text: string) => {
    notes.push(text);
    return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${notes.length}"/></w:r>`;
  };
  const body: string[] = [para(run(g.title), "Title")];
  if (g.subtitle) body.push(para(run(g.subtitle, "<w:i/>")));
  for (const s of g.sections) {
    body.push(para(run(s.heading), "Heading1"));
    if (s.origin !== "you") body.push(para(run(ORIGIN_LABEL[s.origin], "<w:i/>")));
    for (const p of (s.body ?? "").split(/\n{2,}/).filter(Boolean)) body.push(para(run(p)));
    if (s.verses) {
      const t = s.verses.map((v) => `${v.verse} ${v.text || "(not in this translation)"}`).join(" ");
      body.push(para(run(t) + foot(`${s.ref} (${g.translation}).`), "Quote"));
    }
    (s.items ?? []).forEach((it, i) => {
      const lead = s.kind === "questions" ? `${i + 1}. ` : "";
      const looksLikeSource = s.kind === "views" && it.label && /\(\d|\bvol\.|edition|ed\.|trans\.|Schaff|Fathers|Commentary|Dictionary/.test(it.label);
      const label = !looksLikeSource && it.label ? run(`${it.label}: `, "<w:b/>") : "";
      const ref = it.ref ? run(`${it.ref}${it.quote ? `: ${it.quote}` : ""} `, "<w:b/>") : "";
      const text = it.text ? run(lead + it.text) : lead ? run(lead) : "";
      body.push(para(label + ref + text + (looksLikeSource ? foot(it.label!) : "")));
    });
  }
  body.push(para(run(g.notice, "<w:i/>")), para(run(DATA_CREDIT_TEXT, "<w:i/>")));
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notes.map((n, i) => `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(` ${n}`)}</w:p></w:footnote>`).join("")}</w:footnotes>`;
  return { document, footnotes };
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Times New Roman"/><w:sz w:val="23"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style></w:styles>`;

let table: Uint32Array | null = null;
function crc32(b: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A plain zip with no compression. Word and other readers accept it. */
export function zipStored(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const num = (view: DataView, at: number, v: number, n: 2 | 4) => (n === 2 ? view.setUint16(at, v, true) : view.setUint32(at, v, true));
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const head = new Uint8Array(30), hv = new DataView(head.buffer);
    num(hv, 0, 0x04034b50, 4); num(hv, 4, 20, 2); num(hv, 6, 0x0800, 2); num(hv, 14, crc, 4); num(hv, 18, data.length, 4); num(hv, 22, data.length, 4); num(hv, 26, nm.length, 2);
    chunks.push(head, nm, data);
    const c = new Uint8Array(46), cv = new DataView(c.buffer);
    num(cv, 0, 0x02014b50, 4); num(cv, 4, 20, 2); num(cv, 6, 20, 2); num(cv, 8, 0x0800, 2); num(cv, 16, crc, 4); num(cv, 20, data.length, 4); num(cv, 24, data.length, 4); num(cv, 28, nm.length, 2); num(cv, 42, offset, 4);
    central.push(c, nm);
    offset += head.length + nm.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  num(ev, 0, 0x06054b50, 4); num(ev, 8, files.length, 2); num(ev, 10, files.length, 2); num(ev, 12, size, 4); num(ev, 16, offset, 4);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; }
  return out;
}

export function guideToDocx(g: ResolvedGuide): Uint8Array {
  const { document, footnotes } = guideDocumentXml(g);
  return zipStored([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`],
    ["word/document.xml", document],
    ["word/footnotes.xml", footnotes],
    ["word/styles.xml", STYLES],
  ]);
}
