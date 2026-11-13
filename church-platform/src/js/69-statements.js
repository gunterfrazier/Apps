// ---------- Year-end giving statements as PDF ----------
// A small PDF writer (Helvetica, text and lines) so statements download as real PDFs with no library.
// Members download their own; staff with giving access download one file with a page per giver.

/** Builds a PDF from pages of drawing commands: { t: text, x, y, size, bold } and { line: [x1, y1, x2, y2] }. Letter size, points. */
function makePdf(pages) {
  // Windows-1252 for the standard fonts: keeps accents and curly quotes; anything else becomes "?".
  const cp = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };
  const enc = (s) => [...String(s)].map((ch) => { const c = ch.charCodeAt(0); const b = c < 128 || (c >= 160 && c < 256) ? c : cp[ch] || 63; return String.fromCharCode(b); }).join("").replace(/[\\()]/g, (m) => `\\${m}`);
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(""), pagesObj = add(""), font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = pages.map((cmds) => {
    const stream = cmds.map((c) => c.line ? `0.75 G 0.6 w ${c.line[0]} ${c.line[1]} m ${c.line[2]} ${c.line[3]} l S` : `BT /${c.bold ? "F2" : "F1"} ${c.size || 10} Tf ${c.gray ? "0.35 g" : "0 g"} ${c.x} ${c.y} Td (${enc(c.t)}) Tj ET`).join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 255)], { type: "application/pdf" });
}
/** Approximate Helvetica width, to right-align amounts. */
const textWidth = (s, size) => [...String(s)].reduce((n, ch) => n + (/[il.,:;'|!]/.test(ch) ? 0.28 : /[mwMW]/.test(ch) ? 0.83 : /[A-Z0-9$]/.test(ch) ? 0.64 : 0.52), 0) * size;

/** One giver's statement as pages of PDF drawing commands. */
function statementPages(c, giver, year, gifts) {
  const pages = [], total = gifts.reduce((n, g) => n + g.amount, 0), perPage = 30;
  const head = (first) => {
    const p = [{ t: c.name, x: 54, y: 738, size: 18, bold: true }];
    const contact = [c.address, c.email, c.phone, c.website].filter(Boolean).join("   ");
    if (contact) p.push({ t: contact, x: 54, y: 720, size: 9, gray: true });
    p.push({ line: [54, 708, 558, 708] });
    if (first) {
      p.push({ t: `Giving statement for ${year}`, x: 54, y: 680, size: 14, bold: true });
      p.push({ t: giver.name, x: 54, y: 660, size: 11 });
      if (giver.address) p.push({ t: giver.address, x: 54, y: 646, size: 10, gray: true });
      p.push({ t: `Total given: ${money(total)}`, x: 558 - textWidth(`Total given: ${money(total)}`, 12), y: 660, size: 12, bold: true });
    }
    return p;
  };
  for (let i = 0; i === 0 || i < gifts.length; i += perPage) {
    const p = head(i === 0); let y = i === 0 ? 612 : 680;
    p.push({ t: "Date", x: 54, y, size: 9, bold: true }, { t: "Fund", x: 170, y, size: 9, bold: true }, { t: "Method", x: 360, y, size: 9, bold: true }, { t: "Amount", x: 558 - textWidth("Amount", 9), y, size: 9, bold: true });
    p.push({ line: [54, y - 6, 558, y - 6] }); y -= 22;
    gifts.slice(i, i + perPage).forEach((g) => {
      const amt = money(g.amount);
      p.push({ t: fmt(g.at, { month: "short", day: "numeric", year: "numeric" }), x: 54, y, size: 10 }, { t: fundName(g.fundId, c), x: 170, y, size: 10 }, { t: methodLabel(g.method), x: 360, y, size: 10 }, { t: amt, x: 558 - textWidth(amt, 10), y, size: 10 });
      y -= 18;
    });
    if (i + perPage >= gifts.length) {
      p.push({ line: [54, y + 8, 558, y + 8] });
      p.push({ t: "Total", x: 54, y: y - 8, size: 11, bold: true }, { t: money(total), x: 558 - textWidth(money(total), 11), y: y - 8, size: 11, bold: true });
      const note = [`No goods or services were provided in exchange for these contributions${c.taxId ? `. ${c.name} is a tax-exempt organization, EIN ${c.taxId}` : ""}.`, "Please keep this statement for your tax records."];
      note.forEach((t, k) => p.push({ t, x: 54, y: Math.min(y - 44, 120) - k * 14, size: 9, gray: true }));
    }
    pages.push(p);
  }
  return pages;
}
const giftsIn = (list, year) => list.filter((g) => new Date(g.at).getFullYear() === year && g.status !== "refunded").sort((a, b) => new Date(a.at) - new Date(b.at));
Actions["statement-pdf"] = (el) => {
  const c = S.church(), y = +el.dataset.year, me = S.me();
  saveFile(`${slugify(c.name)}-giving-${y}.pdf`, makePdf(statementPages(c, { name: me.name }, y, giftsIn(myGifts(), y))));
};
Actions["statements-all"] = (el) => {
  const c = S.church(), y = +($("#stmt-year")?.value || el.dataset.year);
  const byGiver = new Map();
  giftsIn(S.list("gifts"), y).forEach((g) => { const k = g.by || g.name; if (!byGiver.has(k)) byGiver.set(k, { name: S.user(g.by)?.name || g.name, gifts: [] }); byGiver.get(k).gifts.push(g); });
  if (!byGiver.size) { toast(`No gifts in ${y}`); return; }
  const pages = [...byGiver.values()].sort((a, b) => a.name.localeCompare(b.name)).flatMap((v) => statementPages(c, v, y, v.gifts));
  saveFile(`${slugify(c.name)}-statements-${y}.pdf`, makePdf(pages));
  toast(`${plural(byGiver.size, "statement")} in one PDF`);
};
Actions["statements-csv"] = () => {
  const c = S.church(), y = +($("#stmt-year")?.value || new Date().getFullYear()), q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["Date", "Giver", "Fund", "Method", "Frequency", "Amount", "Status"].map(q).join(","),
    ...giftsIn(S.list("gifts"), y).map((g) => [isoDay(g.at), S.user(g.by)?.name || g.name, fundName(g.fundId, c), g.method, g.frequency, g.amount, g.status || (g.demo || g.sample ? "test" : "paid")].map(q).join(","))];
  saveFile(`${slugify(c.name)}-gifts-${y}.csv`, rows.join("\n") + "\n");
};
