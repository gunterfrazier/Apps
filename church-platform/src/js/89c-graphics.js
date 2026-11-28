// ---------- Graphics: social posts, slides, lobby screens and flyers, filled in from the church's own details ----------
// Every design is drawn on a canvas by one function, so what's on screen is exactly what downloads. A design is a small
// record ("graphics"): its size, layout, colors, fonts and words. Starters fill it from the app: service times, an event,
// a sermon series, a verse, the giving page. Finished graphics download as PNG or PDF, go to the media library, onto a
// signage playlist, onto an event or series, or out through the phone's share sheet.
// The Free templates tab links to other places that give churches templates (Canva, Adobe Express and others). Those
// have their own terms, so the app links to them rather than copying them; bring a finished graphic back with Find media.

if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("graphics")) RECORD_KINDS.push("graphics");
// A server that hasn't had upgrade-26.sql yet turns saved designs away; they still keep on this device.
if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("graphics")) QUIET_KINDS.push("graphics");
{
  const prevLoad = S.load.bind(S);
  S.load = function () { prevLoad(); this.state.graphics ||= []; };
  if (S.state) S.state.graphics ||= [];
}

/** Who can make graphics: the same people who build with the media library. */
const canGfx = () => S.isMember() && (canBuild() || S.can("manage.page") || S.can("services.plan") || S.can("qr.create"));

const GFX_FORMATS = {
  post: { label: "Square post", w: 1080, h: 1080, hint: "Instagram and Facebook feed" },
  portrait: { label: "Portrait post", w: 1080, h: 1350, hint: "Takes up more of the Instagram feed" },
  story: { label: "Story", w: 1080, h: 1920, hint: "Instagram and Facebook stories, phone wallpapers" },
  slide: { label: "Slide or screen", w: 1920, h: 1080, hint: "Announcement slides, lobby screens, event pictures" },
  flyer: { label: "Flyer", w: 1275, h: 1650, scale: 2, page: [612, 792], hint: "Letter paper (8.5 × 11 in), prints at 300 dpi" },
};
const GFX_LAYOUTS = {
  center: "Centered", left: "Headline low", split: "Photo and text", band: "Color band", frame: "Framed", verse: "Verse",
};
/** Background, words and accent for each color theme. "brand" uses the church's own color. */
const GFX_THEMES = {
  brand: { label: "Church color" },
  night: { label: "Night", bg: "#13213a", ink: "#f5efe4", accent: "#e8b450" },
  linen: { label: "Linen", bg: "#eee5d6", ink: "#2c2219", accent: "#a2512f" },
  sky: { label: "Sky", bg: "#d9e8f4", ink: "#13324c", accent: "#2d6cab" },
  forest: { label: "Forest", bg: "#1e3a2f", ink: "#f1ede1", accent: "#c8d996" },
  rose: { label: "Rose", bg: "#f5dbd5", ink: "#3d1e24", accent: "#b0445a" },
  plum: { label: "Plum", bg: "#3a1f47", ink: "#f7eefb", accent: "#f2a65a" },
  paper: { label: "Paper", bg: "#ffffff", ink: "#141414", accent: "#141414" },
  custom: { label: "Pick a color" },
};
/** Headline typefaces (already loaded by the app), with the body face that goes with each. */
const GFX_FONTS = {
  jakarta: { label: "Modern", head: ["Plus Jakarta Sans", 800], body: ["Inter", 500] },
  fraunces: { label: "Classic serif", head: ["Fraunces", 700], body: ["Literata", 500] },
  rubik: { label: "Friendly", head: ["Rubik", 700], body: ["Rubik", 400] },
  literata: { label: "Book", head: ["Literata", 700], body: ["Literata", 500] },
  caveat: { label: "Handwritten", head: ["Caveat", 700], body: ["Inter", 500] },
};

const mixHex = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const okHex = (h, d) => (/^#[0-9a-f]{6}$/i.test(h || "") ? h : d);
/** The colors a design draws with: the theme's, with any the person picked (background, words, accent, decoration). */
function gfxColors(d) {
  const c = S.church();
  const t = GFX_THEMES[d.theme] || GFX_THEMES.brand;
  let base;
  if (t.bg) base = { bg: t.bg, ink: t.ink, accent: t.accent };
  else {
    const bg = okHex(d.theme === "custom" ? d.color : c.color, "#3b5bdb"), ink = onColor(bg);
    base = { bg, ink, accent: mixHex(bg, ink, ink === "#ffffff" ? 0.72 : 0.55) };
  }
  const o = d.colors || {};
  const bg = okHex(o.bg, base.bg);
  // A new background picks readable words, unless the words have their own color too.
  const ink = okHex(o.ink, o.bg ? onColor(bg) : base.ink);
  const accent = okHex(o.accent, o.bg && !o.ink ? mixHex(bg, ink, ink === "#ffffff" ? 0.72 : 0.55) : base.accent);
  return { bg, ink, accent, orn: okHex(o.orn, accent) };
}
/** The logo a design uses: its own transparent copy, one of the banner's saved logos, or the account logo. */
function gfxLogoSrc(d, c = S.church()) {
  if (d.logoId === "own" && d.logoSrc) return d.logoSrc;
  if (String(d.logoId || "").startsWith("b:")) { const l = (bannerOf(c).logos || []).find((x) => `b:${x.id}` === d.logoId); if (l) return l.src; }
  return c.logo || "";
}

// ----- Starting points, filled from the app -----
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (t) => fmtClock(fromIsoDay(today(), t || "09:00")).replace(":00 ", " ");
/** "Sundays 9 AM and 11 AM" for the main location's services (or every location's, when there's no main). */
function serviceTimesText(c = S.church()) {
  const locs = S.locations(c.id), main = locs[0];
  const svcs = (main?.services?.length ? main.services : locs.flatMap((l) => l.services || [])).slice().sort((a, b) => a.day - b.day || String(a.time).localeCompare(b.time));
  if (!svcs.length) return (c.sign || [])[1] || "";
  const byDay = {};
  svcs.forEach((s) => { (byDay[s.day] ||= []).push(clock(s.time)); });
  return Object.entries(byDay).map(([day, times]) => `${DAY_NAMES[day]}s ${[...new Set(times)].join(times.length > 2 ? ", " : " and ")}`).join(" · ");
}
const mainAddress = (c = S.church()) => S.locations(c.id)[0]?.address || "";
const webAddress = (c = S.church()) => (c.handle && typeof churchAddress === "function" ? churchAddress(c) : "") || (c.website || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const sermonSeries = () => [...new Set(S.list("sermons").map((s) => s.series).filter(Boolean))];
const firstSentence = (t, max = 140) => { const s = String(t || "").split(/(?<=[.!?])\s/)[0].trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s; };

const GFX_STARTERS = [
  ["sunday", "calendar", "Sunday invite", "Your service times and address"],
  ["event", "ticket", "Event promo", "Title, date, place and a sign-up QR code"],
  ["series", "book", "Sermon series", "Series art for screens, social posts and the app"],
  ["verse", "book", "Verse", "Any verse, typeset"],
  ["welcome", "home", "Welcome", "For the lobby screen or a first-time guest"],
  ["give", "give", "Giving", "A QR code straight to your giving page"],
  ["prayer", "pray", "Prayer", "Invite prayer requests"],
  ["blank", "plus", "Blank", "Start from nothing"],
];

function gfxBase() {
  const c = S.church();
  return { title: "", format: "post", layout: "center", theme: "brand", color: okHex(c.color, "#3b5bdb"), font: "jakarta", photo: "", dim: 45,
    logo: !!c.logo, ornament: "none", qr: "", kicker: "", headline: "", body: "", details: "", footer: webAddress(c) || c.name, source: null };
}
/** A new design for a starter (and the event or series it's for). */
function gfxStart(kind, id) {
  const c = S.church(), d = gfxBase();
  switch (kind) {
    case "sunday":
      Object.assign(d, { title: "Sunday invite", kicker: c.name, headline: "Join us this Sunday", details: [serviceTimesText(c), mainAddress(c)].filter(Boolean).join("\n"), qr: `page-${c.id}`, ornament: "sparkle" });
      break;
    case "event": {
      const e = S.get("events", id) || upcomingEvents()[0];
      if (!e) { Object.assign(d, { title: "Event", headline: "Event name", details: "Date and time\nPlace" }); break; }
      const sameDay = isoDay(e.start) === isoDay(e.end);
      Object.assign(d, { title: e.title, layout: e.image ? "band" : "left", photo: e.image || "", kicker: e.category || "You're invited", headline: e.title,
        body: firstSentence(e.description), details: [`${fmtDay(e.start)}${sameDay ? `, ${fmtTime(e.start)}` : ` to ${fmt(e.end, { month: "long", day: "numeric" })}`}`, placeText(e)].filter(Boolean).join("\n"),
        qr: e.signup ? `register-event-${e.id}` : `event-${e.id}`, source: { kind: "event", id: e.id } });
      break;
    }
    case "series": {
      const name = id || sermonSeries()[0] || "Series name", art = S.list("sermons").find((s) => s.series === name && s.artwork)?.artwork || "";
      Object.assign(d, { title: name, format: "slide", layout: art ? "split" : "left", font: "fraunces", theme: "night", photo: art, kicker: "A sermon series", headline: name,
        details: serviceTimesText(c), logo: false, source: { kind: "series", id: name } });
      break;
    }
    case "verse":
      Object.assign(d, { title: "Verse", layout: "verse", font: "fraunces", theme: "linen", kicker: "Psalm 46:10", body: "Be still, and know that I am God.", footer: c.name, logo: false });
      break;
    case "welcome":
      Object.assign(d, { title: "Welcome", format: "slide", headline: "Welcome home", body: "We're so glad you're here.", details: "New here? Stop by the welcome desk.", ornament: "rings" });
      break;
    case "give":
      Object.assign(d, { title: "Giving", layout: "left", kicker: "Generosity", headline: "Give online", body: "Scan the code to give in under a minute, any time.", qr: `give-${c.id}` });
      break;
    case "prayer":
      Object.assign(d, { title: "Prayer", theme: "sky", layout: "frame", font: "fraunces", headline: "How can we pray for you?", body: "Send a prayer request any time. Our prayer team reads every one.", qr: `church-${c.id}` });
      break;
    default:
      Object.assign(d, { title: "Untitled graphic", headline: "Your headline", body: "A line or two about it." });
  }
  return d;
}

// ----- Drawing -----
const gfxImgCache = new Map();
/** Loads a picture for the canvas. Pictures from other sites have to allow copying, or the download would fail. */
function gfxImage(src) {
  if (!src) return Promise.resolve(null);
  if (!gfxImgCache.has(src)) {
    gfxImgCache.set(src, new Promise((res) => {
      const img = new Image();
      if (!/^(data|blob):/.test(src)) img.crossOrigin = "anonymous";
      img.onload = () => res(img); img.onerror = () => res(null); img.src = src;
    }));
  }
  return gfxImgCache.get(src);
}
const gfxSvgImage = (svg) => gfxImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
const gfxQrUrl = (d) => !d.qr ? "" : isUrl(d.qr) ? d.qr.trim() : appLink(d.qr);
async function gfxAssets(d) {
  const c = S.church(), col = gfxColors(d), f = GFX_FONTS[d.font] || GFX_FONTS.jakarta;
  const fonts = [`${f.head[1]} 64px "${f.head[0]}"`, `${f.body[1]} 32px "${f.body[0]}"`, `700 32px "${f.body[0]}"`];
  await Promise.all(fonts.map((x) => document.fonts?.load?.(x).catch(() => null)));
  const [photo, logo, qr, orn, ...added] = await Promise.all([
    gfxImage(d.photo), d.logo ? gfxImage(gfxLogoSrc(d, c)) : null,
    gfxQrUrl(d) ? gfxSvgImage(qrSvg(gfxQrUrl(d), { size: 400, dark: "#111111", light: "#ffffff" })) : null,
    d.ornament && d.ornament !== "none" && GRAPHICS[d.ornament] ? gfxSvgImage(GRAPHICS[d.ornament].svg(col.orn)) : null,
    ...(d.graphics || []).map((g) => g.kind === "image" ? gfxImage(g.src) : GRAPHICS[g.builtin] ? gfxSvgImage(GRAPHICS[g.builtin].svg(okHex(g.color, col.accent))) : null),
  ]);
  return { photo, logo, logoClear: gfxSeeThrough(logo), qr, orn, col, f, added: Object.fromEntries((d.graphics || []).map((g, i) => [g.id, added[i]])) };
}

/** Whether a picture's edges are see-through (a logo with its background removed). Unreadable pictures count as solid. */
const gfxClearCache = new WeakMap();
function gfxSeeThrough(img) {
  if (!img) return false;
  if (gfxClearCache.has(img)) return gfxClearCache.get(img);
  let clear = false;
  try {
    const n = 48, cv = document.createElement("canvas"); cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data; let edge = 0, see = 0;
    for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) { edge++; if (d[(y * n + x) * 4 + 3] < 40) see++; }
    clear = see / edge > 0.5;
  } catch { /* a picture from a site that doesn't allow reading it */ }
  gfxClearCache.set(img, clear);
  return clear;
}

/** Words broken into lines no wider than maxW, at this font size. Very long words break where they must. */
function gfxWrap(ctx, text, maxW) {
  const out = [];
  String(text || "").split("\n").forEach((para) => {
    let line = "";
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW) { line = next; return; }
      if (line) out.push(line);
      line = word;
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let n = line.length - 1; while (n > 1 && ctx.measureText(line.slice(0, n)).width > maxW) n--;
        out.push(line.slice(0, n)); line = line.slice(n);
      }
    });
    if (line) out.push(line);
  });
  return out;
}
const fontStr = ([family, weight], size) => `${weight} ${Math.round(size * 10) / 10}px "${family}", system-ui, sans-serif`;

/**
 * Lays out a stack of text blocks in a box: everything starts at its largest size and shrinks together until it fits.
 * Each block: { text, font: [family, weight], size, min, color, lh, gap (space after, as a share of size), track, upper, maxLines }.
 * Returns the height used and the rectangle the words cover, after drawing them (unless dry).
 */
function gfxStack(ctx, blocks, box, { align = "center", valign = "middle", dry = false } = {}) {
  const items = blocks.filter((b) => String(b.text || "").trim());
  if (!items.length) return { h: 0, rect: { x: box.x, y: box.y, w: 0, h: 0 } };
  const lay = (k) => items.map((b) => {
    const size = Math.max(b.min || 10, b.size * k);
    ctx.font = fontStr(b.font, size);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${(b.track || 0) * size}px`;
    let lines = gfxWrap(ctx, b.upper ? String(b.text).toUpperCase() : b.text, box.w);
    if (b.maxLines && lines.length > b.maxLines) { lines = lines.slice(0, b.maxLines); lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "") + "…"; }
    return { b, size, lines, h: lines.length * size * (b.lh || 1.15) };
  });
  const total = (L) => L.reduce((n, x, i) => n + x.h + (i < L.length - 1 ? x.size * (x.b.gap ?? 0.5) : 0), 0);
  let k = 1, L = lay(k);
  for (let i = 0; i < 40 && (total(L) > box.h || L.some((x) => x.lines.some((l) => { ctx.font = fontStr(x.b.font, x.size); return ctx.measureText(l).width > box.w + 1; }))); i++) { k *= 0.93; L = lay(k); }
  const used = total(L);
  const y0 = box.y + (valign === "top" ? 0 : valign === "bottom" ? box.h - used : (box.h - used) / 2);
  const widest = Math.max(...L.map((x) => { ctx.font = fontStr(x.b.font, x.size); if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${(x.b.track || 0) * x.size}px`; return Math.max(...x.lines.map((l) => ctx.measureText(l).width)); }));
  const rect = { x: align === "center" ? box.x + (box.w - widest) / 2 : align === "right" ? box.x + box.w - widest : box.x, y: y0, w: widest, h: used };
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  if (dry) return { h: used, rect };
  let y = y0;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = align;
  const x = align === "center" ? box.x + box.w / 2 : align === "right" ? box.x + box.w : box.x;
  L.forEach((it, i) => {
    ctx.font = fontStr(it.b.font, it.size);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${(it.b.track || 0) * it.size}px`;
    ctx.fillStyle = it.b.color;
    const lh = it.size * (it.b.lh || 1.15);
    it.lines.forEach((line, j) => ctx.fillText(line, x, y + j * lh + lh * 0.5 + it.size * 0.34));
    y += it.h + (i < L.length - 1 ? it.size * (it.b.gap ?? 0.5) : 0);
  });
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  return { h: used, rect };
}

/** Draws a picture to cover a box, cropped from the middle. */
function gfxCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function gfxContain(ctx, img, x, y, w, h, align = "center") {
  const r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
  const dx = align === "left" ? x : align === "right" ? x + w - dw : x + (w - dw) / 2;
  ctx.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
  return dw;
}
function gfxQr(ctx, img, x, y, s, label, color, font) {
  const pad = s * 0.07;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, s, s, s * 0.06) : ctx.rect(x, y, s, s); ctx.fill();
  ctx.drawImage(img, x + pad, y + pad, s - pad * 2, s - pad * 2);
  if (label) { ctx.font = fontStr(font, s * 0.11); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(label, x + s / 2, y + s + s * 0.16); }
}

/**
 * Draws a design at its full size onto ctx (already scaled by the caller for previews and print).
 * Each piece (the words, logo, decoration, QR code, bottom line and added graphics) goes through place(): drawn where the
 * layout puts it, or where the person dragged it, at their size and turn. Its box goes in a.boxes, for tapping.
 * opts.sel outlines the selected piece (previews only).
 */
function gfxDraw(ctx, d, a, opts = {}) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post, W = fm.w, H = fm.h, { col, f } = a;
  const m = Math.min(W, H), pad = m * 0.08, wide = W / H > 1.2, tall = H / W > 1.5;
  const photoOn = !!a.photo, ink = d.colors?.ink ? col.ink : photoOn && ["center", "left", "verse", "frame"].includes(d.layout) ? "#ffffff" : col.ink;
  const soft = (hex, o) => { const v = hex.replace("#", ""); return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${o})`; };
  const boxes = a.boxes = [];
  const place = (key, rect, fn) => {
    if (!rect || !(rect.w > 0) || !(rect.h > 0)) return;
    const pl = d.place?.[key], cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.save();
    let box = { ...rect, r: 0 };
    if (pl) {
      const sc = pl.s ?? 1, nx = (pl.x ?? cx / W) * W, ny = (pl.y ?? cy / H) * H;
      ctx.translate(nx, ny); if (pl.r) ctx.rotate(pl.r * Math.PI / 180); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      box = { x: nx - rect.w * sc / 2, y: ny - rect.h * sc / 2, w: rect.w * sc, h: rect.h * sc, r: pl.r || 0 };
    }
    fn();
    ctx.restore();
    boxes.push({ key, ...box, home: { x: cx / W, y: cy / H } });
  };
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Background: the color with a soft glow of the accent, or the photo dimmed so words read on it.
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.88, H * 0.08, 0, W * 0.88, H * 0.08, Math.max(W, H) * 0.9);
  glow.addColorStop(0, soft(col.accent, 0.28)); glow.addColorStop(1, soft(col.accent, 0));
  const fullPhoto = photoOn && !["split", "band"].includes(d.layout);
  if (fullPhoto) {
    gfxCover(ctx, a.photo, 0, 0, W, H);
    const dim = (d.dim ?? 45) / 100;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,0,0,${dim * 0.75})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, dim * 1.25)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (d.layout !== "split") { ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H); }

  // Tall sizes have room for bigger words.
  const tsz = tall ? 1.22 : H / W > 1.2 ? 1.08 : 1;
  const head = (size, extra = {}) => ({ text: d.headline, font: f.head, size: size * tsz, min: m * 0.035, color: ink, lh: d.font === "caveat" ? 0.95 : 1.04, gap: 0.42, ...extra });
  const kicker = (size, extra = {}) => ({ text: d.kicker, font: [f.body[0], 700], size: size * tsz, min: m * 0.018, color: d.colors?.ink ? col.accent : photoOn && ink === "#ffffff" ? "#ffffff" : col.accent, track: 0.04, gap: 0.9, ...extra });
  const body = (size, extra = {}) => ({ text: d.body, font: f.body, size: size * tsz, min: m * 0.018, color: ink, lh: 1.32, gap: 1.1, maxLines: 6, ...extra });
  const details = (size, extra = {}) => ({ text: d.details, font: [f.body[0], 600], size: size * tsz, min: m * 0.017, color: ink, lh: 1.35, gap: 0, ...extra });
  /** The words: laid out once to find their box, then drawn through place(). */
  const words = (stack, box, o, before) => {
    const { rect } = gfxStack(ctx, stack, box, { ...o, dry: true });
    place("text", rect, () => { before?.(rect); gfxStack(ctx, stack, box, o); });
  };
  const logo = (x, y, w, h, align = "center", plate = false) => {
    if (!a.logo) return 0;
    const r = Math.min(w / a.logo.width, h / a.logo.height), dw = a.logo.width * r, dh = a.logo.height * r;
    const dx = align === "left" ? x : align === "right" ? x + w - dw : x + (w - dw) / 2, dy = y + (h - dh) / 2;
    place("logo", { x: dx, y: dy, w: dw, h: dh }, () => {
      if (plate) { ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); const p = m * 0.018; ctx.roundRect ? ctx.roundRect(dx - p, dy - p, dw + p * 2, dh + p * 2, m * 0.02) : ctx.rect(dx - p, dy - p, dw + p * 2, dh + p * 2); ctx.fill(); }
      ctx.drawImage(a.logo, dx, dy, dw, dh);
    });
    return dw;
  };
  const footer = (x, y, size, align = "left", color = ink, alpha = 0.85, maxW = W - pad * 2) => {
    if (!d.footer) return;
    ctx.font = fontStr([f.body[0], 600], size);
    const w = Math.min(maxW, ctx.measureText(d.footer).width), rx = align === "center" ? x - w / 2 : x;
    place("footer", { x: rx, y: y - size * 0.95, w, h: size * 1.25 }, () => {
      ctx.font = fontStr([f.body[0], 600], size); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.textAlign = "left"; ctx.fillText(d.footer, rx, y, maxW);
    });
  };
  // The footer line (web address) and logo share a strip along the bottom; the QR code sits above it on the right.
  const footH = d.footer || a.logo ? m * 0.09 : 0;
  const qrS = a.qr ? m * (wide ? 0.2 : 0.19) : 0;
  const drawFoot = (color = ink, area = { x: pad, w: W - pad * 2, y: H - pad - footH }) => {
    if (!footH) return;
    let lx = area.x;
    if (a.logo) lx += logo(area.x, area.y, m * 0.22, footH, "left") + m * 0.025;
    footer(lx, area.y + footH / 2 + m * 0.011, m * 0.03, "left", color, 1, area.w - (lx - area.x));
  };
  const drawOrn = (x, y, s, o = 0.85) => { if (!a.orn) return; place("orn", { x, y, w: s, h: s }, () => { ctx.globalAlpha = o; ctx.drawImage(a.orn, x, y, s, s); }); };
  const qrBlock = (x, y) => { if (a.qr) place("qr", { x, y, w: qrS, h: qrS }, () => gfxQr(ctx, a.qr, x, y, qrS, "", ink, f.body)); };

  switch (d.layout) {
    case "left": {
      drawOrn(W - pad - m * 0.24, pad, m * 0.24, 0.7);
      if (!footH) logo(pad, pad, m * 0.24, m * 0.09, "left");
      const bottom = H - pad - footH - (footH ? m * 0.04 : 0), qrBelow = a.qr && !wide;
      const box = { x: pad, y: pad + m * 0.2, w: (W - pad * 2) * (wide ? 0.64 : 1), h: bottom - pad - m * 0.2 - (qrBelow ? qrS + m * 0.05 : 0) };
      words([kicker(m * 0.034), head(m * 0.13), body(m * 0.038), details(m * 0.034)], box, { align: "left", valign: "bottom" },
        (r) => { ctx.fillStyle = col.accent; ctx.fillRect(r.x, r.y - m * 0.055, m * 0.09, m * 0.014); });
      qrBlock(W - pad - qrS, bottom - qrS);
      drawFoot();
      break;
    }
    case "split": {
      // A photo on one side (the top, on tall sizes) and the words on a color panel.
      const across = W >= H;
      const pw = across ? W * 0.48 : W, ph = across ? H : H * (tall ? 0.48 : 0.5);
      ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
      if (a.photo) gfxCover(ctx, a.photo, 0, 0, pw, ph);
      else { ctx.fillStyle = col.accent; ctx.fillRect(0, 0, pw, ph); drawOrn(pw / 2 - m * 0.16, ph / 2 - m * 0.16, m * 0.32, 0.9); }
      const bx = across ? pw + pad : pad, by = across ? pad : ph + pad * 0.8, bw = across ? W - pw - pad * 2 : W - pad * 2;
      const bh = (across ? H - pad * 2 : H - ph - pad * 1.8) - footH - (a.qr ? qrS + m * 0.04 : 0);
      words([kicker(m * 0.032, { color: col.accent }), head(m * 0.1, { color: col.ink }), body(m * 0.034, { color: col.ink }), details(m * 0.03, { color: col.ink })], { x: bx, y: by, w: bw, h: bh }, { align: "left", valign: across ? "middle" : "top" });
      qrBlock(bx, H - pad - footH - qrS - (footH ? m * 0.03 : 0));
      drawFoot(col.ink, { x: bx, w: bw, y: H - pad - footH });
      break;
    }
    case "band": {
      // The photo fills the space; a solid band of color holds the words.
      const bandH = H * (wide ? 0.46 : tall ? 0.42 : 0.47), y0 = H - bandH;
      if (a.photo) gfxCover(ctx, a.photo, 0, 0, W, y0 + 2); else { ctx.fillStyle = glow; ctx.fillRect(0, 0, W, y0); drawOrn(W / 2 - m * 0.18, y0 / 2 - m * 0.18, m * 0.36, 0.8); }
      ctx.fillStyle = col.bg; ctx.fillRect(0, y0, W, bandH);
      ctx.fillStyle = col.accent; ctx.fillRect(0, y0, W, m * 0.012);
      // A logo with a solid background gets a white plate so it sits neatly on the photo; a see-through one goes on as is.
      logo(pad + m * 0.02, pad + m * 0.015, m * 0.2, m * 0.085, "left", !a.logoClear);
      const tw = W - pad * 2 - (a.qr ? qrS + m * 0.05 : 0), th = bandH - pad * 1.6 - (d.footer ? m * 0.06 : 0);
      words([kicker(m * 0.03), head(m * (wide ? 0.125 : 0.1), { color: col.ink }), body(m * 0.036, { color: col.ink, maxLines: 3 }), details(m * 0.03, { color: col.ink })], { x: pad, y: y0 + pad * 0.8, w: tw, h: th }, { align: "left", valign: "middle" });
      qrBlock(W - pad - qrS, y0 + (bandH - qrS) / 2 - (d.footer ? m * 0.02 : 0));
      footer(pad, H - pad * 0.6, m * 0.026, "left", col.ink, 0.8);
      break;
    }
    case "frame": {
      const inset = m * 0.045;
      ctx.strokeStyle = col.accent; ctx.lineWidth = m * 0.006; ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      ctx.lineWidth = m * 0.002; ctx.strokeRect(inset + m * 0.014, inset + m * 0.014, W - (inset + m * 0.014) * 2, H - (inset + m * 0.014) * 2);
      const ip = pad * 1.35;
      let top = ip;
      if (a.logo) { logo(W / 2 - m * 0.13, top, m * 0.26, m * 0.09); top += m * 0.13; } else if (a.orn) { drawOrn(W / 2 - m * 0.06, top, m * 0.12, 0.95); top += m * 0.16; }
      const bottom = H - ip - (a.qr ? qrS + m * 0.06 : 0) - (d.footer ? m * 0.06 : 0);
      words([kicker(m * 0.03), head(m * 0.105, { lh: 1.08 }), body(m * 0.036, { gap: 0.9 }), details(m * 0.032)], { x: ip, y: top, w: W - ip * 2, h: bottom - top }, { align: "center" });
      qrBlock(W / 2 - qrS / 2, H - ip - qrS - (d.footer ? m * 0.06 : 0));
      footer(W / 2, H - ip + m * 0.01, m * 0.027, "center", ink, 1);
      break;
    }
    case "verse": {
      ctx.font = fontStr(["Fraunces", 700], m * 0.42); ctx.fillStyle = soft(col.accent, photoOn ? 0.55 : 0.35); ctx.textAlign = "left";
      ctx.fillText("“", pad * 0.7, pad + m * 0.3);
      const bottom = H - pad - footH;
      const tw = W - pad * 2 - (a.qr && wide ? qrS + m * 0.05 : 0);
      words([{ text: d.body, font: f.head, size: m * (String(d.body || "").length > 160 ? 0.06 : 0.085), min: m * 0.026, color: ink, lh: 1.22, gap: 0.9 },
        { text: d.kicker, font: [f.body[0], 700], size: m * 0.036, min: m * 0.02, color: photoOn && !d.colors?.accent ? "#ffffff" : col.accent, track: 0.03, gap: 0.6 },
        { text: d.headline, font: f.body, size: m * 0.03, min: m * 0.018, color: ink, gap: 0 }], { x: pad, y: pad + m * 0.22, w: tw, h: bottom - pad - m * 0.26 - (a.qr && !wide ? qrS + m * 0.04 : 0) }, { align: "left", valign: "middle" });
      qrBlock(W - pad - qrS, bottom - qrS - m * 0.02);
      drawFoot();
      break;
    }
    default: { // center
      let top = pad;
      if (a.logo) { logo(W / 2 - m * 0.15, top, m * 0.3, m * 0.1); top += m * 0.14; }
      drawOrn(wide ? W - pad - m * 0.2 : W - pad - m * 0.16, wide ? pad : pad * 0.8, wide ? m * 0.2 : m * 0.16, 0.6);
      const bottom = H - pad - (a.qr ? qrS + m * 0.05 : 0) - (d.footer ? m * 0.05 : 0);
      words([kicker(m * 0.034), head(m * 0.13), body(m * 0.04), details(m * 0.034)], { x: pad, y: top, w: W - pad * 2, h: bottom - top }, { align: "center" });
      qrBlock(W / 2 - qrS / 2, H - pad - qrS - (d.footer ? m * 0.05 : 0));
      footer(W / 2, H - pad + m * 0.008, m * 0.028, "center", ink, 0.85);
    }
  }

  // Graphics the person added: shapes in their own color, or their own pictures. Always placed by hand.
  (d.graphics || []).forEach((g) => {
    const img = a.added?.[g.id]; if (!img) return;
    const s = (g.size || 20) / 100 * m, ratio = img.height / img.width || 1, w = ratio > 1 ? s / ratio : s, h = ratio > 1 ? s : s * ratio;
    const x = (g.x ?? 0.5) * W - w / 2, y = (g.y ?? 0.5) * H - h / 2;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); if (g.r) ctx.rotate(g.r * Math.PI / 180);
    ctx.globalAlpha = (g.opacity ?? 100) / 100; ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    boxes.push({ key: `g:${g.id}`, x, y, w, h, r: g.r || 0, home: { x: g.x ?? 0.5, y: g.y ?? 0.5 } });
  });

  // The selected piece gets a dashed outline in the preview (never in a download).
  const sel = opts.sel && boxes.find((b) => b.key === opts.sel);
  if (sel) {
    ctx.save();
    ctx.translate(sel.x + sel.w / 2, sel.y + sel.h / 2); if (sel.r) ctx.rotate(sel.r * Math.PI / 180);
    const p = m * 0.012, lw = m * 0.004;
    ctx.lineWidth = lw * 2.2; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeRect(-sel.w / 2 - p, -sel.h / 2 - p, sel.w + p * 2, sel.h + p * 2);
    ctx.setLineDash([m * 0.018, m * 0.012]); ctx.lineWidth = lw; ctx.strokeStyle = "#ffffff"; ctx.strokeRect(-sel.w / 2 - p, -sel.h / 2 - p, sel.w + p * 2, sel.h + p * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** The design on a new canvas. scale 1 is its pixel size; flyers export at 2 (300 dpi). */
async function gfxCanvas(d, { scale = 1, width = 0, safe = false } = {}) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post, a = await gfxAssets(d);
  if (safe) { // drop pictures from sites that don't allow copying
    const foreign = (img) => img && !/^(data|blob):/.test(img.src) && new URL(img.src, location.href).origin !== location.origin;
    for (const k of ["photo", "logo"]) if (foreign(a[k])) a[k] = null;
    for (const k in a.added) if (foreign(a.added[k])) a.added[k] = null;
  }
  const k = width ? width / fm.w : scale, cv = document.createElement("canvas");
  cv.width = Math.round(fm.w * k); cv.height = Math.round(fm.h * k);
  const ctx = cv.getContext("2d"); ctx.scale(k, k); gfxDraw(ctx, d, a);
  return cv;
}
/** The finished file as a Blob. If a picture from another site blocks the copy, it's made without that picture. */
async function gfxBlob(d, type = "image/png", { scale, quality = 0.92 } = {}) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post, s = scale || fm.scale || 1;
  const get = (cv) => new Promise((res, rej) => { try { cv.toBlob((b) => (b ? res(b) : rej(new Error("empty"))), type, quality); } catch (e) { rej(e); } });
  try { return await get(await gfxCanvas(d, { scale: s })); }
  catch { toast("A picture's website doesn't allow copying, so it was left out. Use Find media to save it to your library first."); return get(await gfxCanvas(d, { scale: s, safe: true })); }
}

/** A one-page PDF holding the graphic as a JPEG: letter size for flyers, the graphic's own size otherwise. */
async function gfxPdf(d) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post;
  const cv = await gfxCanvas(d, { scale: fm.scale || 1 });
  let jpg;
  try { jpg = new Uint8Array(await (await new Promise((res, rej) => { try { cv.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.92); } catch (e) { rej(e); } })).arrayBuffer()); }
  catch { const safe = await gfxCanvas(d, { scale: fm.scale || 1, safe: true }); jpg = new Uint8Array(await (await new Promise((res) => safe.toBlob(res, "image/jpeg", 0.92))).arrayBuffer()); }
  const [pw, ph] = fm.page || [fm.w * 0.75, fm.h * 0.75];
  const enc = new TextEncoder(), parts = [], offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const obj = (n, body, stream) => {
    offsets[n] = len;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  const draw = enc.encode(`q ${pw.toFixed(3)} 0 0 ${ph.toFixed(3)} 0 0 cm /Im1 Do Q`);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(3)} ${ph.toFixed(3)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  obj(5, `<< /Length ${draw.length} >>`, draw);
  obj(6, `<< /Title (${String(d.title || d.headline || "Graphic").replace(/[()\\]/g, "").replace(/[^\x20-\x7e]/g, "")}) /Producer (${PLATFORM.name}) >>`);
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

// ----- The list -----
let gfxTab = "mine";
Screens.graphics = (tab = "") => {
  if (!canGfx()) return { redirect: "ministry" };
  gfxTab = tab === "templates" ? "templates" : "mine";
  return {
    title: "Graphics", back: "ministry",
    body: html`<p class="muted" style="margin-top:14px">Social posts, slides, lobby screens and flyers, filled in with your church's details. Download them, share them, or put them on your screens.</p>
      ${seg([["graphics", "Make and saved"], ["graphics-templates", "Free templates"]], gfxTab === "mine" ? "graphics" : "graphics-templates", { label: "Graphics" })}
      ${gfxTab === "mine" ? gfxMineTab() : gfxTemplatesTab()}`,
    after: () => gfxThumbs(),
  };
};
function gfxMineTab() {
  const saved = S.list("graphics").slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const events = upcomingEvents().slice(0, 12), series = sermonSeries();
  return html`<section class="sec"><h2 class="sec-head">Make a graphic</h2>
      <div class="gfx-starters">${GFX_STARTERS.map(([k, ic, t, sub]) => {
        if (k === "event" && !events.length) return "";
        if (k === "series" && !series.length) return "";
        return html`<button class="gfx-starter" data-act="gfx-new" data-start="${k}">${icon(ic)}<b>${t}</b><small>${sub}</small></button>`;
      })}</div>
      ${events.length ? html`<form class="gfx-pick" data-form="gfx-pick" novalidate><label class="field"><span>An event</span><select name="id">${events.map((e) => html`<option value="${e.id}">${e.title}: ${fmt(e.start, { month: "short", day: "numeric" })}</option>`)}</select></label><button class="btn ghost sm" data-act="gfx-new" data-start="event">Make an event graphic</button></form>` : ""}
      ${series.length > 1 ? html`<form class="gfx-pick" data-form="gfx-pick" novalidate><label class="field"><span>A sermon series</span><select name="id">${series.map((s) => html`<option>${s}</option>`)}</select></label><button class="btn ghost sm" data-act="gfx-new" data-start="series">Make series art</button></form>` : ""}
    </section>
    <section class="sec"><h2 class="sec-head">Saved</h2>
      ${saved.length ? html`<div class="gfx-grid">${saved.map((g) => html`<a class="gfx-card" href="#graphic-${g.id}">
          <span class="gfx-thumb" style="aspect-ratio:${(GFX_FORMATS[g.format] || GFX_FORMATS.post).w}/${(GFX_FORMATS[g.format] || GFX_FORMATS.post).h}"><canvas data-gfx-thumb="${g.id}" aria-hidden="true"></canvas></span>
          <b>${g.title || g.headline || "Untitled"}</b><small class="faint">${(GFX_FORMATS[g.format] || GFX_FORMATS.post).label}</small></a>`)}</div>`
        : html`<div class="panel empty-state"><p style="margin:0">Your graphics show up here. Pick a starting point above; it fills in from your church's details, and you can change anything.</p></div>`}
    </section>`;
}
/** Draws the saved graphics' thumbnails after the list is on screen. */
async function gfxThumbs() {
  for (const cv of document.querySelectorAll("canvas[data-gfx-thumb]")) {
    const g = S.get("graphics", cv.dataset.gfxThumb); if (!g) continue;
    const big = await gfxCanvas(g, { width: 360 });
    if (!cv.isConnected) return;
    cv.width = big.width; cv.height = big.height; cv.getContext("2d").drawImage(big, 0, 0);
  }
}

/** Other places with free church templates. They have their own terms, so these are links, not copies. */
const GFX_TEMPLATE_SITES = [
  ["Design in your browser, free", [
    ["Canva church templates", "https://www.canva.com/templates/?query=church", "Thousands of free templates for social posts, flyers, bulletins and slides. Churches that are registered nonprofits can apply for Canva Pro free through Canva for Nonprofits."],
    ["Adobe Express church flyers", "https://www.adobe.com/express/templates/flyer/church", "Free flyer, social post and story templates for services, Easter, Pentecost and events. Look for the Free label; some are Premium."],
    ["Adobe Express church programs", "https://www.adobe.com/express/templates/program/church", "Free service program and bulletin templates."],
  ]],
  ["Free template kits for Canva", [
    ["Jam Media free church templates", "https://www.jammedia.design/free-church-templates", "Ten editable Canva social graphics: welcome, Sunday invite, prayer, announcements, small groups and more. Free with your name and email."],
    ["Subsplash church media graphics", "https://www.subsplash.com/blog/free-church-media-graphics", "Free Canva templates for groups, ministries, events and sermon media, in square, banner and wide sizes."],
    ["Subsplash sermon series kits", "https://www.subsplash.com/blog/sermon-series-graphics", "Free sermon series kits: title, verse and lower-third slides plus social graphics."],
    ["Subsplash holiday templates", "https://subsplash.com/blog/graphic-templates-for-holidays-and-important-dates", "Free Christmas, Easter and holiday templates with instructions."],
  ]],
  ["Series packages and screen media", [
    ["ChurchLeaders free creative", "https://churchleaders.com/worship/free-resources-worship-creative", "Free series packages from Open Network and others: series art, bulletin covers, invite cards and social graphics."],
    ["Church Motion Graphics", "https://www.churchmotiongraphics.com/free-worship-media/", "Free worship backgrounds and announcement slide templates."],
    ["Igniter Media", "https://www.ignitermedia.com/free-worship-backgrounds", "Ten free motion worship backgrounds in HD, sent by email."],
  ]],
];
function gfxTemplatesTab() {
  return html`<div class="panel" style="margin-top:14px"><p style="margin:0">These sites give churches free templates. Each has its own terms, so check them before you use a template, and keep the credit they ask for.
      Made something there? Download it, then add it to your <a href="#medialib">media library</a> and use it on slides, signage and events.</p>
      <div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-act="medialib-find" data-kind="image">${icon("plus")}Add a finished graphic</button></div></div>
    ${GFX_TEMPLATE_SITES.map(([group, list]) => html`<section class="sec"><h2 class="sec-head">${group}</h2><div class="rows">${list.map(([name, url, note]) => html`
      <a class="row" href="${url}" target="_blank" rel="noopener"><span class="row-icon">${icon("globe")}</span><span class="row-main"><b>${name}</b><small>${note}</small></span><span class="row-end faint">${new URL(url).hostname.replace(/^www\./, "")}</span></a>`)}</div></section>`)}`;
}

Actions["gfx-new"] = (el) => {
  const id = el.closest(".gfx-pick")?.querySelector("select")?.value || "";
  const d = gfxStart(el.dataset.start, id);
  const g = S.add("graphics", { ...d, by: S.me()?.id || "", updatedAt: new Date().toISOString() });
  go(`graphic-${g.id}`);
  if (el.dataset.start === "verse") gfxFetchVerse(g.id, d.kicker);
};
async function gfxFetchVerse(id, ref) {
  try {
    const r = parseRef(ref); if (!r) return;
    const t = await Bible.text(refLabel(r), "BSB", false);
    const g = S.get("graphics", id); if (!g) return;
    S.update("graphics", id, { body: t.length > 320 ? t.slice(0, 319).trimEnd() + "…" : t, kicker: `${refLabel(r)} (BSB)`, updatedAt: new Date().toISOString() });
    if (location.hash === `#graphic-${id}`) keepFocus(render);
  } catch { /* the words stay as typed */ }
}
// Make a graphic from an event page.
Actions["gfx-from"] = (el) => {
  const d = gfxStart(el.dataset.kind, el.dataset.id);
  const g = S.add("graphics", { ...d, by: S.me()?.id || "", updatedAt: new Date().toISOString() });
  go(`graphic-${g.id}`);
};

// ----- The editor -----
const GFX_PIECES = { text: "Words", logo: "Logo", orn: "Decoration", qr: "QR code", footer: "Bottom line" };
const gfxPieceLabel = (g, key) => key.startsWith("g:") ? (() => { const x = (g.graphics || []).find((y) => `g:${y.id}` === key); return x?.kind === "image" ? "Your picture" : GRAPHICS[x?.builtin]?.label || "Graphic"; })() : GFX_PIECES[key] || key;
/** The pieces a design shows right now, in drawing order. */
function gfxPieceKeys(g) {
  const c = S.church();
  return [["text", !!(g.kicker || g.headline || g.body || g.details)], ["logo", !!(g.logo && gfxLogoSrc(g, c))], ["orn", g.ornament && g.ornament !== "none" && g.layout !== "verse" && (g.layout !== "split" || !g.photo) && (g.layout !== "band" || !g.photo) && !(g.layout === "frame" && g.logo && gfxLogoSrc(g, c))],
    ["qr", !!(g.qr && g.qr !== "~")], ["footer", !!g.footer], ...(g.graphics || []).map((x) => [`g:${x.id}`, true])].filter(([, on]) => on).map(([k]) => k);
}
const gfxPiece = (g, key) => key.startsWith("g:") ? (g.graphics || []).find((x) => `g:${x.id}` === key) : g.place?.[key];
const gfxLocked = (g, key) => !!(g.locked || gfxPiece(g, key)?.locked);
/** A color row: automatic, the theme and church colors, white and dark, the photo's and logo's colors (filled in after), and a custom one. */
function gfxSwatches(g, target, label, current, auto) {
  const c = S.church(), fixed = [...new Set([okHex(c.color, ""), ...brandPalette(c), "#ffffff", "#111111"].filter(Boolean))];
  const sw = (col) => html`<button type="button" class="cp-swatch ${current === col ? "on" : ""}" style="background:${col}" data-act="gfx-color" data-target="${target}" data-color="${col}" aria-label="${label}: ${col}" aria-pressed="${current === col}"></button>`;
  return html`<div class="gfx-color-row" data-gfx-colors="${target}"><span class="gfx-color-k">${label}</span>
    <div class="gfx-swatch-row">
      ${auto ? html`<button type="button" class="gfx-auto ${!current ? "on" : ""}" data-act="gfx-color" data-target="${target}" data-color="" aria-pressed="${!current}">Auto</button>` : ""}
      ${fixed.map(sw)}<span class="gfx-from" data-from="photo"></span><span class="gfx-from" data-from="logo"></span>
      <label class="gfx-custom" title="Any color"><input type="color" name="c_${target}" value="${okHex(current, auto || "#3b5bdb")}" aria-label="${label}: any color"><span>${icon("plus")}</span></label>
    </div></div>`;
}

Screens.graphic = (id) => {
  if (!canGfx()) return { redirect: "ministry" };
  const g = S.get("graphics", id);
  if (!g) return { redirect: "graphics" };
  if (gfxSel.id !== id) Object.assign(gfxSel, { id, key: "" });
  const fm = GFX_FORMATS[g.format] || GFX_FORMATS.post, c = S.church(), col = gfxColors(g);
  const opt = (v, cur, label) => html`<option value="${v}" ${attr(v === cur, "selected")}>${label}</option>`;
  const targets = typeof qrTargetGroups === "function" ? qrTargetGroups() : [];
  const qrCustom = g.qr && isUrl(g.qr);
  const playlists = S.list("signage");
  const src = g.source?.kind === "event" ? S.get("events", g.source.id) : null;
  const pieces = gfxPieceKeys(g), sel = pieces.includes(gfxSel.key) ? gfxSel.key : "";
  const sp = sel && gfxPiece(g, sel), selHeld = sel && gfxLocked(g, sel);
  const bannerLogos = (bannerOf(c).logos || []);
  const hasLogo = !!(c.logo || bannerLogos.length || g.logoSrc);
  return {
    title: g.title || "Graphic", back: "graphics",
    body: html`<div class="gfx-editor">
      <div class="gfx-stage"><div class="gfx-pv-wrap"><div class="gfx-preview" style="aspect-ratio:${fm.w}/${fm.h}"><canvas id="gfx-canvas" class="${g.locked ? "" : "movable"}" role="img" aria-label="${g.headline || g.title}"></canvas></div></div>
        <p class="faint gfx-size">${fm.label}, ${fm.scale ? `${fm.w * fm.scale} × ${fm.h * fm.scale}` : `${fm.w} × ${fm.h}`} pixels. ${g.locked ? "Everything is locked." : "Drag a piece to move it; pinch to resize."}</p>
        <div class="btns gfx-out">
          <button class="btn" data-act="gfx-export" data-kind="png">${icon("download")}PNG</button>
          <button class="btn ghost" data-act="gfx-export" data-kind="pdf">${icon("download")}PDF</button>
          ${navigator.share ? html`<button class="btn ghost" data-act="gfx-share">${icon("share")}Share</button>` : ""}
          <button class="btn ghost" data-act="gfx-library">${icon("layers")}Save to library</button>
          ${S.can("manage.devices") && playlists.length ? html`<button class="btn ghost" data-act="gfx-signage">${icon("screen")}Add to a screen</button>` : ""}
          ${src && g.format === "slide" && S.can("manage.content") ? html`<button class="btn ghost" data-act="gfx-use" data-use="event">${icon("image")}Use as the event's picture</button>` : ""}
          ${g.source?.kind === "series" && g.format === "post" && S.can("manage.sermons") ? html`<button class="btn ghost" data-act="gfx-use" data-use="series">${icon("image")}Use as series artwork</button>` : ""}
        </div></div>
      <form class="gfx-controls" data-form="gfx" data-input="gfx" data-change="gfx" data-id="${g.id}" novalidate>
        <section class="panel" id="gfx-arrange"><h3>Arrange</h3>
          <p class="faint" style="margin-top:0">Tap a piece in the preview to pick it. Drag to move it, pinch or use Size to resize it, then lock it so it stays put.</p>
          <div class="rows gfx-pieces">${pieces.map((k) => {
            const p = gfxPiece(g, k), held = gfxLocked(g, k), moved = k.startsWith("g:") || !!p;
            return html`<div class="row ${k === sel ? "sel" : ""}"><button type="button" class="gfx-piece-pick" data-act="gfx-pick" data-key="${k}" aria-pressed="${k === sel}"><span class="lead-ic">${icon(held ? "lock" : "expand")}</span>
              <span class="body"><span class="t">${gfxPieceLabel(g, k)}</span><span class="s">${held ? "Locked in place" : moved ? "Placed by you" : "Where the layout puts it"}</span></span></button>
              ${moved && !k.startsWith("g:") ? html`<button type="button" class="btn ghost sm" data-act="gfx-place-auto" data-key="${k}" ${attr(held, "disabled")}>Put back</button>` : ""}
              <button type="button" class="btn ${p?.locked ? "" : "ghost "}sm" data-act="gfx-lock" data-key="${k}" aria-pressed="${!!p?.locked}" aria-label="${p?.locked ? "Unlock" : "Lock"} ${gfxPieceLabel(g, k)}" ${attr(g.locked, "disabled")}>${icon("lock")}${p?.locked ? "Locked" : "Lock"}</button></div>`;
          })}</div>
          ${sel ? html`<div class="gfx-sel-tools">
            <label class="range"><span>${gfxPieceLabel(g, sel)}: size</span><input type="range" name="selSize" min="${sel.startsWith("g:") ? 3 : 40}" max="${sel.startsWith("g:") ? 120 : 250}" value="${sel.startsWith("g:") ? sp?.size || 20 : Math.round((sp?.s ?? 1) * 100)}" ${attr(selHeld, "disabled")}><output>${sel.startsWith("g:") ? `${sp?.size || 20}%` : `${Math.round((sp?.s ?? 1) * 100)}%`}</output></label>
            ${sel === "orn" || sel === "logo" || sel.startsWith("g:") ? html`<label class="range"><span>Turn</span><input type="range" name="selTurn" min="-180" max="180" value="${sp?.r || 0}" ${attr(selHeld, "disabled")}><output>${sp?.r || 0}°</output></label>` : ""}
          </div>` : ""}
          <div class="btns"><button type="button" class="btn ${g.locked ? "" : "ghost "}sm" data-act="gfx-lock-all" aria-pressed="${!!g.locked}">${icon("lock")}${g.locked ? "Unlock everything" : "Lock everything"}</button>
            ${Object.keys(g.place || {}).length ? html`<button type="button" class="btn ghost sm" data-act="gfx-place-auto" data-key="*" ${attr(g.locked, "disabled")}>Put everything back</button>` : ""}</div>
        </section>
        <section class="panel"><h3>Size</h3>
          <div class="gfx-chips" role="radiogroup" aria-label="Size">${Object.entries(GFX_FORMATS).map(([k, f]) => html`<label class="gfx-chip"><input type="radio" name="format" value="${k}" ${attr(k === g.format, "checked")}><span><b>${f.label}</b><small>${f.hint}</small></span></label>`)}</div>
        </section>
        <section class="panel"><h3>Layout</h3>
          <div class="gfx-layouts" role="radiogroup" aria-label="Layout">${Object.entries(GFX_LAYOUTS).map(([k, label]) => html`<label class="gfx-layout"><input type="radio" name="layout" value="${k}" ${attr(k === g.layout, "checked")}><span class="gfx-mini" style="aspect-ratio:${fm.w}/${fm.h}"><canvas data-gfx-layout="${k}" aria-hidden="true"></canvas></span><small>${label}</small></label>`)}</div>
        </section>
        <section class="panel"><h3>Words</h3>
          <label class="field" style="margin-top:0"><span>Small line on top</span><input type="text" name="kicker" value="${g.kicker}" maxlength="60" placeholder="You're invited"></label>
          <label class="field"><span>Headline</span><textarea name="headline" maxlength="90" rows="2" placeholder="Join us this Sunday">${g.headline}</textarea><small>Press Enter to choose where a long headline breaks.</small></label>
          <label class="field"><span>${g.layout === "verse" ? "Verse" : "More about it"}</span><textarea name="body" maxlength="420" rows="3">${g.body}</textarea></label>
          ${g.layout === "verse" ? html`<div class="btns"><input type="text" class="gfx-ref" name="ref" placeholder="John 3:16" aria-label="Bible reference" value=""><button type="button" class="btn ghost sm" data-act="gfx-verse">${icon("book")}Fill in the verse</button></div>` : ""}
          <label class="field"><span>When and where</span><textarea name="details" maxlength="200" rows="2" placeholder="Sunday, 10 AM\n123 Main St">${g.details}</textarea>
            <small><button type="button" class="linkish" data-act="gfx-fill" data-what="times">Service times</button> · <button type="button" class="linkish" data-act="gfx-fill" data-what="address">Address</button></small></label>
          <label class="field"><span>Bottom line</span><input type="text" name="footer" value="${g.footer}" maxlength="60" placeholder="${webAddress(c) || c.name}"></label>
          <label class="field"><span>Lettering</span><select name="font">${Object.entries(GFX_FONTS).map(([k, f]) => opt(k, g.font, f.label))}</select></label>
        </section>
        <section class="panel"><h3>Photo</h3>
          ${imageField("photo", "Photo (optional)", g.photo, g.layout === "split" ? "Fills one side." : g.layout === "band" ? "Fills the space above the color band." : "Goes behind the words, darkened so they're easy to read.", 2000)}
          ${g.photo && !["split", "band"].includes(g.layout) ? html`<label class="field"><span>Darken the photo</span><input type="range" name="dim" min="10" max="85" step="5" value="${g.dim ?? 45}"></label>` : ""}
        </section>
        <section class="panel"><h3>Colors</h3>
          <div class="gfx-themes" role="radiogroup" aria-label="Color set">${Object.entries(GFX_THEMES).filter(([k]) => k !== "custom" || g.theme === "custom").map(([k, t]) => {
            const tc = gfxColors({ ...g, theme: k, colors: {} });
            return html`<label class="gfx-theme" title="${t.label}"><input type="radio" name="theme" value="${k}" ${attr(k === g.theme, "checked")}><span style="background:${tc.bg};color:${tc.ink}"><i style="background:${tc.accent}"></i>Aa</span><small>${t.label}</small></label>`;
          })}</div>
          <p class="faint">Picking a color set starts its colors fresh. Then change any of them below, including with the colors in your photo and logo.</p>
          ${gfxSwatches(g, "bg", "Background", g.colors?.bg || "", col.bg)}
          ${gfxSwatches(g, "ink", "Words", g.colors?.ink || "", col.ink)}
          ${gfxSwatches(g, "accent", "Accent: small line, bars and frame", g.colors?.accent || "", col.accent)}
          ${g.ornament && g.ornament !== "none" ? gfxSwatches(g, "orn", "Decoration", g.colors?.orn || "", col.orn) : ""}
        </section>
        <section class="panel"><h3>Logo</h3>
          ${hasLogo ? html`<label class="check" style="margin-top:0"><input type="checkbox" name="logo" ${attr(g.logo, "checked")}><span>Show the logo</span></label>
            ${g.logo ? html`<label class="field"><span>Which logo</span><select name="logoId">${opt("", g.logoId || "", "Account logo")}${bannerLogos.map((l) => opt(`b:${l.id}`, g.logoId, l.name || "Saved logo"))}${g.logoSrc ? opt("own", g.logoId, "This graphic's transparent copy") : ""}</select></label>
            <div class="gfx-logo-row"><span class="gfx-logo-swatch"><img src="${gfxLogoSrc(g, c)}" alt="The logo in use"></span>
              <button type="button" class="btn ghost sm" data-act="gfx-logo-clean">${icon("image")}Remove background</button></div>
            <small class="faint">Makes a see-through copy for this graphic, and can turn the logo all white or all dark.</small>` : ""}`
          : html`<p class="faint" style="margin:0">Add your logo in Admin, Landing page, and it can go on every graphic.</p>`}
        </section>
        <section class="panel"><h3>Graphics</h3>
          <label class="field" style="margin-top:0"><span>Layout decoration</span><select name="ornament">${opt("none", g.ornament, "None")}${Object.entries(GRAPHICS).map(([k, x]) => opt(k, g.ornament, x.label))}</select></label>
          ${(g.graphics || []).map((x) => html`<div class="gfx-added ${sel === `g:${x.id}` ? "sel" : ""}">
            <div class="gfx-added-head"><img src="${x.kind === "image" ? x.src : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GRAPHICS[x.builtin]?.svg(okHex(x.color, col.accent)) || "")}`}" alt=""><b>${gfxPieceLabel(g, `g:${x.id}`)}</b>
              <button type="button" class="btn ghost sm" data-act="gfx-pick" data-key="g:${x.id}">Pick</button><button type="button" class="btn ghost sm danger" data-act="gfx-graphic-remove" data-gid="${x.id}" aria-label="Remove this graphic">${icon("trash")}</button></div>
            ${x.kind === "image" ? "" : gfxSwatches(g, `g:${x.id}`, "Color", okHex(x.color, ""), "")}
            <label class="range"><span>See-through</span><input type="range" name="op_${x.id}" min="10" max="100" step="5" value="${x.opacity ?? 100}"><output>${x.opacity ?? 100}%</output></label>
          </div>`)}
          <div class="gfx-add"><span class="faint">Add a graphic</span><div class="gfx-add-row">${Object.entries(GRAPHICS).map(([k, x]) => html`<button type="button" class="gfx-add-btn" data-act="gfx-graphic-add" data-builtin="${k}" title="${x.label}" aria-label="Add ${x.label}"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(x.svg(okHex(c.color, "#3b5bdb")))}" alt=""></button>`)}
            <label class="gfx-add-btn" title="Your own picture">${icon("upload")}<input type="file" accept="image/*" class="sr" data-change="gfx-graphic-upload" aria-label="Add your own picture"></label></div></div>
        </section>
        <section class="panel"><h3>QR code</h3>
          <label class="field" style="margin-top:0"><span>Opens</span><select name="qr">${opt("", qrCustom ? "~" : g.qr, "No QR code")}
            ${targets.map(([group, list]) => html`<optgroup label="${group}">${list.map(([t, label]) => opt(t, g.qr, label))}</optgroup>`)}
            ${opt("~", qrCustom ? "~" : "", "Another web address")}</select></label>
          ${qrCustom || g.qr === "~" ? html`<label class="field"><span>Web address</span><input type="url" name="qrUrl" value="${qrCustom ? g.qr : ""}" placeholder="https://"></label>` : ""}
          ${g.qr && g.qr !== "~" ? html`<small class="faint">${gfxQrUrl(g).replace(/^https?:\/\//, "")}</small>` : ""}
        </section>
        <section class="panel"><h3>Name</h3>
          <label class="field" style="margin-top:0"><span>Saved as</span><input type="text" name="title" value="${g.title}" maxlength="80"></label>
          <div class="btns"><button type="button" class="btn ghost sm" data-act="gfx-copy">${icon("copy")}Make a copy</button><button type="button" class="btn ghost sm danger" data-act="gfx-delete">${icon("trash")}Delete</button></div>
        </section>
      </form></div>`,
    after: () => { gfxPaint(g.id); gfxFillSwatches(g); },
  };
};

const gfxSel = { id: "", key: "" };
/** The live preview: the design's pictures loaded once, so dragging and pinching redraw straight away. */
const gfxLive = { id: "", assets: null, scale: 1 };
let gfxPaintSeq = 0;
/** Loads the pictures and draws the big preview and the layout thumbnails. */
async function gfxPaint(id) {
  const g = S.get("graphics", id), seq = ++gfxPaintSeq; if (!g) return;
  const cv = $("#gfx-canvas"); if (!cv) return;
  const fm = GFX_FORMATS[g.format] || GFX_FORMATS.post, w = Math.min(fm.w, 1400);
  // Redraw at once with the pictures already loaded, so the preview doesn't blink while new ones load.
  if (gfxLive.id === id && gfxLive.assets) { gfxLive.scale = w / fm.w; cv.width = Math.round(fm.w * gfxLive.scale); cv.height = Math.round(fm.h * gfxLive.scale); gfxLive.assets.col = gfxColors(g); gfxRedraw(); }
  const assets = await gfxAssets(g);
  if (seq !== gfxPaintSeq || !cv.isConnected) return;
  Object.assign(gfxLive, { id, assets, scale: w / fm.w });
  cv.width = Math.round(fm.w * gfxLive.scale); cv.height = Math.round(fm.h * gfxLive.scale);
  gfxRedraw();
  cv.setAttribute("aria-label", [g.kicker, g.headline, g.body, g.details].filter(Boolean).join(". "));
  for (const mini of document.querySelectorAll("canvas[data-gfx-layout]")) {
    const sm = await gfxCanvas({ ...g, layout: mini.dataset.gfxLayout, place: {}, graphics: g.graphics }, { width: 200 });
    if (seq !== gfxPaintSeq || !mini.isConnected) return;
    mini.width = sm.width; mini.height = sm.height; mini.getContext("2d").drawImage(sm, 0, 0);
  }
}
/** Redraws the preview from the loaded pictures (no waiting), with the selected piece outlined. */
function gfxRedraw() {
  const g = S.get("graphics", gfxLive.id), cv = $("#gfx-canvas");
  if (!g || !cv || !gfxLive.assets) return;
  const ctx = cv.getContext("2d");
  ctx.setTransform(gfxLive.scale, 0, 0, gfxLive.scale, 0, 0);
  gfxDraw(ctx, g, gfxLive.assets, { sel: gfxSel.key });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
/** Adds the photo's and logo's colors to every color row. */
async function gfxFillSwatches(g) {
  const from = [["photo", g.photo, "Photo"], ["logo", g.logo ? gfxLogoSrc(g) : "", "Logo"]];
  for (const [k, src, label] of from) {
    const colors = src ? await imageColors(src).catch(() => []) : [];
    document.querySelectorAll(`.gfx-from[data-from="${k}"]`).forEach((box) => {
      const row = box.closest("[data-gfx-colors]"), target = row?.dataset.gfxColors;
      const cur = target?.startsWith("g:") ? okHex((S.get("graphics", g.id)?.graphics || []).find((x) => `g:${x.id}` === target)?.color, "") : S.get("graphics", g.id)?.colors?.[target] || "";
      box.innerHTML = colors.length ? flat(html`<span class="gfx-from-k">${label}</span>${colors.map((col) => html`<button type="button" class="cp-swatch ${cur === col ? "on" : ""}" style="background:${col}" data-act="gfx-color" data-target="${target}" data-color="${col}" aria-label="${label} color ${col}" aria-pressed="${cur === col}"></button>`)}`) : "";
    });
  }
}

let gfxSaveTimer = 0;
const gfxSave = (g) => { g.updatedAt = new Date().toISOString(); clearTimeout(gfxSaveTimer); gfxSaveTimer = setTimeout(() => S.update("graphics", g.id, {}), 400); };
/** Re-render without moving the page: the editor is long, and a redraw shouldn't scroll it. */
const gfxRerender = () => { const y = scrollY; keepFocus(render); scrollTo(0, y); };

/** Every change saves and redraws. Choices that change the controls themselves redraw the screen. */
Inputs.gfx = (form, e) => {
  const el = e?.target || form, f = form.closest("form") || form, g = S.get("graphics", f?.dataset.id); if (!g || el.name === "ref") return;
  const n = el.name || "";
  // Color pickers, size and turn of the selected piece, and how see-through an added graphic is.
  if (n.startsWith("c_")) return gfxSetColor(g, n.slice(2), el.value, e.type === "change");
  if (n === "selSize" || n === "selTurn") {
    const key = gfxSel.key; if (!key || gfxLocked(g, key)) return;
    const v = +el.value; if (el.nextElementSibling) el.nextElementSibling.textContent = n === "selTurn" ? `${v}°` : `${v}%`;
    const p = gfxEnsurePlace(g, key);
    if (n === "selTurn") p.r = v; else if (key.startsWith("g:")) p.size = v; else p.s = v / 100;
    gfxSave(g); gfxRedraw(); return;
  }
  if (n.startsWith("op_")) { const x = (g.graphics || []).find((y) => y.id === n.slice(3)); if (x) { x.opacity = +el.value; if (el.nextElementSibling) el.nextElementSibling.textContent = `${el.value}%`; gfxSave(g); gfxRedraw(); } return; }
  const v = (k) => f.elements[k]?.value ?? g[k];
  const patch = {
    format: f.querySelector("[name=format]:checked")?.value || g.format, layout: f.querySelector("[name=layout]:checked")?.value || g.layout,
    theme: f.querySelector("[name=theme]:checked")?.value || g.theme, font: v("font"), photo: v("photo"), dim: +(v("dim") ?? 45),
    ornament: v("ornament"), logo: f.elements.logo ? f.elements.logo.checked : g.logo, logoId: f.elements.logoId ? f.elements.logoId.value : g.logoId,
    kicker: v("kicker"), headline: v("headline"), body: v("body"), details: v("details"), footer: v("footer"), title: v("title") || g.title,
  };
  const qrSel = v("qr");
  patch.qr = qrSel === "~" ? (isUrl(f.elements.qrUrl?.value) ? f.elements.qrUrl.value.trim() : "~") : qrSel;
  // A new color set starts its colors fresh.
  if (n === "theme") patch.colors = {};
  const structural = ["format", "layout", "theme", "qr", "logo", "logoId", "ornament"].includes(n) || n === "photo" && !!patch.photo !== !!g.photo;
  const reload = structural || n === "photo" || n === "font";
  Object.assign(g, patch); gfxSave(g);
  if (structural) return gfxRerender();
  if (n === "photo") gfxFillSwatches(g);
  if (reload) return gfxPaint(g.id);
  gfxRedraw();
};
Forms.gfx = () => {};
Forms["gfx-pick"] = () => {};

/** Sets one of the design's colors (or an added graphic's), from a swatch or the picker. */
function gfxSetColor(g, target, color, rerender = true) {
  if (target.startsWith("g:")) { const x = (g.graphics || []).find((y) => `g:${y.id}` === target); if (!x) return; x.color = color || ""; }
  else { g.colors = { ...(g.colors || {}) }; if (color) g.colors[target] = color; else delete g.colors[target]; }
  gfxSave(g);
  if (rerender) gfxRerender(); else gfxPaint(g.id);
}
Actions["gfx-color"] = (el) => { const g = gfxCurrent(); if (g) gfxSetColor(g, el.dataset.target, el.dataset.color); };

// ----- Arranging: pick, drag, pinch, lock -----
/** The place record for a piece, starting from where the layout put it. */
function gfxEnsurePlace(g, key) {
  if (key.startsWith("g:")) return (g.graphics || []).find((x) => `g:${x.id}` === key);
  g.place = { ...(g.place || {}) };
  if (!g.place[key]) { const b = gfxLive.assets?.boxes?.find((x) => x.key === key); g.place[key] = { x: b?.home.x ?? 0.5, y: b?.home.y ?? 0.5, s: 1, r: 0 }; }
  return g.place[key];
}
function gfxSelect(key) {
  gfxSel.key = key;
  gfxRerender();
}
Actions["gfx-pick"] = (el) => gfxSelect(gfxSel.key === el.dataset.key ? "" : el.dataset.key);
Actions["gfx-lock"] = (el) => {
  const g = gfxCurrent(); if (!g) return;
  const p = gfxEnsurePlace(g, el.dataset.key); p.locked = !p.locked; gfxSave(g); gfxRerender();
  toast(p.locked ? "Locked in place" : "Unlocked");
};
Actions["gfx-lock-all"] = () => { const g = gfxCurrent(); if (!g) return; g.locked = !g.locked; gfxSave(g); gfxRerender(); toast(g.locked ? "Everything is locked" : "Unlocked"); };
Actions["gfx-place-auto"] = (el) => {
  const g = gfxCurrent(); if (!g) return;
  if (el.dataset.key === "*") g.place = Object.fromEntries(Object.entries(g.place || {}).filter(([, p]) => p.locked));
  else { g.place = { ...(g.place || {}) }; delete g.place[el.dataset.key]; }
  gfxSave(g); gfxRerender();
};
/** The piece under a point on the preview, topmost first. */
function gfxHit(ev) {
  const cv = $("#gfx-canvas"), g = S.get("graphics", gfxLive.id); if (!cv || !g || !gfxLive.assets?.boxes) return null;
  const r = cv.getBoundingClientRect(), fm = GFX_FORMATS[g.format] || GFX_FORMATS.post;
  // The canvas keeps its shape inside its box, so map through the drawn area.
  const k = Math.min(r.width / fm.w, r.height / fm.h), ox = r.left + (r.width - fm.w * k) / 2, oy = r.top + (r.height - fm.h * k) / 2;
  const x = (ev.clientX - ox) / k, y = (ev.clientY - oy) / k, slop = Math.min(fm.w, fm.h) * 0.015;
  const box = [...gfxLive.assets.boxes].reverse().find((b) => x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop);
  return { box, x, y, k, fm };
}
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest?.("#gfx-canvas") || e.button > 0 || Pinch.active) return;
  const hit = gfxHit(e), g = S.get("graphics", gfxLive.id); if (!hit || !g) return;
  if (!hit.box) { if (gfxSel.key) gfxSelect(""); return; }
  const key = hit.box.key;
  if (gfxLocked(g, key)) { if (gfxSel.key !== key) gfxSelect(key); toast(g.locked ? "Everything is locked. Unlock it in Arrange." : "That's locked. Unlock it to move it."); return; }
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false, pinched = false, start = null;
  if (gfxSel.key !== key) { gfxSel.key = key; gfxRedraw(); }
  const move = (ev) => {
    if (Pinch.active || pinched) { pinched = true; return; }
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    if (!moved) { const p = gfxEnsurePlace(g, key); start = { x: p.x ?? 0.5, y: p.y ?? 0.5 }; moved = true; }
    const p = gfxEnsurePlace(g, key);
    p.x = clampN(start.x + (ev.clientX - x0) / hit.k / hit.fm.w, 0, 1); p.y = clampN(start.y + (ev.clientY - y0) / hit.k / hit.fm.h, 0, 1);
    gfxRedraw();
  };
  const up = () => {
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
    if (moved) { const p = gfxEnsurePlace(g, key); p.x = Math.round(p.x * 1000) / 1000; p.y = Math.round(p.y * 1000) / 1000; gfxSave(g); }
    if (!pinched && !Pinch.active) gfxRerender();
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
});
// Two fingers on the preview resize the picked piece (and turn the logo, decoration and added graphics).
onPinch(".gfx-preview", {
  start(target) {
    const g = S.get("graphics", gfxLive.id); if (!g) return null;
    const key = gfxSel.key;
    if (!key) { toast("Tap a piece first, then pinch it"); return null; }
    if (gfxLocked(g, key)) { toast("That's locked. Unlock it to resize it."); return null; }
    const p = gfxEnsurePlace(g, key);
    return { g, key, p, size: key.startsWith("g:") ? p.size || 20 : p.s ?? 1, r: p.r || 0, turns: key === "orn" || key === "logo" || key.startsWith("g:") };
  },
  change(st, scale, turn) {
    if (st.key.startsWith("g:")) st.p.size = Math.round(clampN(st.size * scale, 3, 120));
    else st.p.s = Math.round(clampN(st.size * scale, 0.4, 2.5) * 100) / 100;
    if (st.turns) { let r = Math.round(st.r + turn); if (Math.abs(r % 90) < 5 || Math.abs(r % 90) > 85) r = Math.round(r / 90) * 90; st.p.r = ((r + 540) % 360) - 180; }
    gfxRedraw();
  },
  end(st) { if (st) { gfxSave(st.g); gfxRerender(); } },
});

// ----- Added graphics and the logo -----
Actions["gfx-graphic-add"] = (el) => {
  const g = gfxCurrent(); if (!g) return;
  const x = { id: uid(), kind: "builtin", builtin: el.dataset.builtin, color: gfxColors(g).accent, x: 0.5, y: 0.35, size: 22, r: 0, opacity: 100 };
  g.graphics = [...(g.graphics || []), x]; gfxSel.key = `g:${x.id}`; gfxSave(g); gfxRerender();
  toast("Added. Drag it where you want it.");
};
Inputs["gfx-graphic-upload"] = async (el) => {
  const g = gfxCurrent(), file = el.files?.[0]; if (!g || !file) return;
  try {
    const src = await readImage(file, 1000, 0.9, { preserveTransparency: true });
    const x = { id: uid(), kind: "image", src, x: 0.5, y: 0.4, size: 30, r: 0, opacity: 100 };
    g.graphics = [...(g.graphics || []), x]; gfxSel.key = `g:${x.id}`; gfxSave(g); gfxRerender();
  } catch { toast("That picture couldn't be opened. Try a PNG or JPEG."); }
};
Actions["gfx-graphic-remove"] = (el) => {
  const g = gfxCurrent(); if (!g) return;
  g.graphics = (g.graphics || []).filter((x) => x.id !== el.dataset.gid); if (gfxSel.key === `g:${el.dataset.gid}`) gfxSel.key = "";
  gfxSave(g); gfxRerender();
};
Actions["gfx-logo-clean"] = (button) => {
  const g = gfxCurrent(); if (!g) return;
  const src = gfxLogoSrc(g), id = g.id;
  openLogoCleaner({ src: logoOriginal(src), button, name: g.logoId === "own" ? "This graphic's logo" : "Logo",
    active: () => !!S.get("graphics", id),
    onSave: (name, result) => { const x = S.get("graphics", id); if (!x) return; Object.assign(x, { logoSrc: result, logoId: "own" }); gfxSave(x); gfxRerender(); toast("The see-through logo is on this graphic"); } });
};

Actions["gfx-fill"] = (el) => {
  const f = el.closest("form"), t = f.elements.details, c = S.church();
  const add = el.dataset.what === "times" ? serviceTimesText(c) : mainAddress(c);
  if (!add) return toast(el.dataset.what === "times" ? "Add service times in Admin, Locations." : "Add an address in Admin, Locations.");
  t.value = [t.value.trim(), add].filter(Boolean).join("\n");
  t.dispatchEvent(new Event("input", { bubbles: true }));
};
Actions["gfx-verse"] = async (el) => {
  const f = el.closest("form"), ref = f.elements.ref.value.trim(), r = parseRef(ref);
  if (!r) return toast("Type a reference like John 3:16");
  try {
    const text = await Bible.text(refLabel(r), "BSB", false);
    f.elements.body.value = text.length > 320 ? text.slice(0, 319).trimEnd() + "…" : text;
    f.elements.kicker.value = `${refLabel(r)} (BSB)`;
    f.elements.body.dispatchEvent(new Event("input", { bubbles: true }));
  } catch { toast("That verse wasn't found. Check the reference, or type the words in."); }
};

const gfxCurrent = () => S.get("graphics", $(".gfx-controls")?.dataset.id);
const gfxName = (g) => `${slugify(S.church().name)}-${slugify(g.title || g.headline) || "graphic"}-${g.format}`;
Actions["gfx-export"] = async (el) => {
  const g = gfxCurrent(); if (!g) return;
  el.disabled = true;
  try {
    if (el.dataset.kind === "pdf") await saveFile(`${gfxName(g)}.pdf`, await gfxPdf(g));
    else await saveFile(`${gfxName(g)}.png`, await gfxBlob(g));
  } catch (e) { toast(`The file couldn't be made: ${e.message || e}`); }
  el.disabled = false;
};
Actions["gfx-share"] = async () => {
  const g = gfxCurrent(); if (!g) return;
  const file = new File([await gfxBlob(g)], `${gfxName(g)}.png`, { type: "image/png" });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return saveFile(file.name, file);
  try { await navigator.share({ files: [file], title: g.title || g.headline }); } catch (e) { if (e?.name !== "AbortError") saveFile(file.name, file); }
};
/** Saves the finished graphic in the media library and returns its address. */
async function gfxToLibrary(g) {
  const fm = GFX_FORMATS[g.format] || GFX_FORMATS.post;
  let url;
  if (typeof Backend !== "undefined" && Backend.on) {
    const blob = await gfxBlob(g, "image/png", { scale: Math.min(fm.scale || 1, 1) });
    url = await Backend.upload(new File([blob], `${gfxName(g)}.png`, { type: "image/png" }), `library/${Date.now()}-${gfxName(g)}.png`);
  } else {
    const cv = await gfxCanvas(g, { width: Math.min(fm.w, 1600) });
    try { url = cv.toDataURL("image/jpeg", 0.88); } catch { url = (await gfxCanvas(g, { width: Math.min(fm.w, 1600), safe: true })).toDataURL("image/jpeg", 0.88); }
  }
  const rec = libraryAdd({ kind: "image", url, thumb: url, title: g.title || g.headline || "Graphic", tags: "graphic" });
  S.update("graphics", g.id, { libraryUrl: url, libraryAt: new Date().toISOString() });
  return rec?.url || url;
}
const gfxFresh = (g) => g.libraryUrl && g.libraryAt && g.libraryAt >= (g.updatedAt || "");
Actions["gfx-library"] = async (el) => {
  const g = gfxCurrent(); if (!g) return;
  el.disabled = true;
  try { await gfxToLibrary(g); toast("Saved in the media library"); } catch (e) { toast(`It wasn't saved: ${e.message || e}`); }
  el.disabled = false;
};
Actions["gfx-signage"] = () => {
  const g = gfxCurrent(); if (!g) return;
  const lists = S.list("signage");
  openSheet("Add to a screen", html`<p class="muted" style="margin-top:0">The graphic goes at the end of the playlist. Screens pick it up on their next refresh.</p>
    <div class="rows">${lists.map((pl) => html`<button class="row" data-act="gfx-signage-add" data-pl="${pl.id}"><span class="row-icon">${icon("screen")}</span><span class="row-main"><b>${pl.name}</b><small>${plural((pl.slides || []).length, "slide")}${pl.orientation === "portrait" ? ", portrait" : ""}</small></span></button>`)}</div>`);
};
Actions["gfx-signage-add"] = async (el) => {
  const g = gfxCurrent(), pl = S.get("signage", el.dataset.pl); if (!g || !pl) return;
  el.disabled = true;
  try {
    const url = gfxFresh(g) ? g.libraryUrl : await gfxToLibrary(g);
    S.update("signage", pl.id, { slides: [...(pl.slides || []), signSlide("image", { image: url, caption: "", fit: "contain" })] });
    closeSheet(); toast(`Added to ${pl.name}`);
  } catch (e) { el.disabled = false; toast(`It wasn't added: ${e.message || e}`); }
};
Actions["gfx-use"] = async (el) => {
  const g = gfxCurrent(); if (!g?.source) return;
  el.disabled = true;
  try {
    const url = gfxFresh(g) ? g.libraryUrl : await gfxToLibrary(g);
    if (el.dataset.use === "event") { S.update("events", g.source.id, { image: url }); toast("It's the event's picture now"); }
    else { S.list("sermons").filter((s) => s.series === g.source.id).forEach((s) => S.update("sermons", s.id, { artwork: url })); toast("It's the series artwork now"); }
  } catch (e) { toast(`It wasn't saved: ${e.message || e}`); }
  el.disabled = false;
};
Actions["gfx-copy"] = () => {
  const g = gfxCurrent(); if (!g) return;
  const { id, churchId, libraryUrl, libraryAt, ...rest } = g;
  const copy = S.add("graphics", { ...rest, title: `${g.title || "Graphic"} (copy)`, by: S.me()?.id || "", updatedAt: new Date().toISOString() });
  go(`graphic-${copy.id}`);
};
Actions["gfx-delete"] = () => {
  const g = gfxCurrent(); if (!g) return;
  openSheet("Delete this graphic?", html`<p style="margin-top:0">"${g.title || "Untitled"}" goes away. Copies already downloaded, in the media library or on a screen stay.</p>
    <div class="btns"><button class="btn danger" data-act="gfx-delete-yes" data-id="${g.id}">${icon("trash")}Delete</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
};
Actions["gfx-delete-yes"] = (el) => { S.remove("graphics", el.dataset.id); closeSheet(true); go("graphics"); toast("Graphic deleted"); };

