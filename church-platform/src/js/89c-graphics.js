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
/** The three colors a design draws with. */
function gfxColors(d) {
  const c = S.church();
  const t = GFX_THEMES[d.theme] || GFX_THEMES.brand;
  if (t.bg) return { bg: t.bg, ink: t.ink, accent: t.accent };
  const bg = okHex(d.theme === "custom" ? d.color : c.color, "#3b5bdb"), ink = onColor(bg);
  return { bg, ink, accent: mixHex(bg, ink, ink === "#ffffff" ? 0.72 : 0.55) };
}

// ----- Starting points, filled from the app -----
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (t) => fmtTime(new Date(`2000-01-01T${t || "09:00"}`)).replace(":00 ", " ");
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
  const [photo, logo, qr, orn] = await Promise.all([
    gfxImage(d.photo), d.logo ? gfxImage(c.logo) : null,
    gfxQrUrl(d) ? gfxSvgImage(qrSvg(gfxQrUrl(d), { size: 400, dark: "#111111", light: "#ffffff" })) : null,
    d.ornament && d.ornament !== "none" && GRAPHICS[d.ornament] ? gfxSvgImage(GRAPHICS[d.ornament].svg(col.accent)) : null,
  ]);
  return { photo, logo, qr, orn, col, f };
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
 * Returns the height used, after drawing (unless dry).
 */
function gfxStack(ctx, blocks, box, { align = "center", valign = "middle", dry = false } = {}) {
  const items = blocks.filter((b) => String(b.text || "").trim());
  if (!items.length) return 0;
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
  if (dry) return used;
  let y = box.y + (valign === "top" ? 0 : valign === "bottom" ? box.h - used : (box.h - used) / 2);
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
  return used;
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

/** Draws a design at its full size onto ctx (already scaled by the caller for previews and print). */
function gfxDraw(ctx, d, a) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post, W = fm.w, H = fm.h, { col, f } = a;
  const m = Math.min(W, H), pad = m * 0.08, wide = W / H > 1.2, tall = H / W > 1.5;
  const photoOn = !!a.photo, ink = photoOn && ["center", "left", "verse", "frame"].includes(d.layout) ? "#ffffff" : col.ink;
  const soft = (hex, o) => { const v = hex.replace("#", ""); return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${o})`; };
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
  const kicker = (size, extra = {}) => ({ text: d.kicker, font: [f.body[0], 700], size: size * tsz, min: m * 0.018, color: photoOn && ink === "#ffffff" ? "#ffffff" : col.accent, track: 0.04, gap: 0.9, ...extra });
  const body = (size, extra = {}) => ({ text: d.body, font: f.body, size: size * tsz, min: m * 0.018, color: ink, lh: 1.32, gap: 1.1, maxLines: 6, ...extra });
  const details = (size, extra = {}) => ({ text: d.details, font: [f.body[0], 600], size: size * tsz, min: m * 0.017, color: ink, lh: 1.35, gap: 0, ...extra });

  // The footer line (web address) and logo share a strip along the bottom; the QR code sits above it on the right.
  const footH = d.footer || a.logo ? m * 0.09 : 0;
  const qrS = a.qr ? m * (wide ? 0.2 : 0.19) : 0;
  const drawFoot = (color = ink, area = { x: pad, w: W - pad * 2, y: H - pad - footH }) => {
    if (!footH) return;
    let lx = area.x;
    if (a.logo) lx += gfxContain(ctx, a.logo, area.x, area.y, m * 0.22, footH, "left") + m * 0.025;
    if (d.footer) { ctx.font = fontStr([f.body[0], 600], m * 0.03); ctx.fillStyle = color; ctx.textAlign = a.logo ? "left" : "left"; ctx.fillText(d.footer, lx, area.y + footH / 2 + m * 0.011, area.w - (lx - area.x)); }
  };
  const drawOrn = (x, y, s, o = 0.85) => { if (!a.orn) return; ctx.globalAlpha = o; ctx.drawImage(a.orn, x, y, s, s); ctx.globalAlpha = 1; };
  const qrBlock = (x, y) => a.qr && gfxQr(ctx, a.qr, x, y, qrS, "", ink, f.body);

  switch (d.layout) {
    case "left": {
      drawOrn(W - pad - m * 0.24, pad, m * 0.24, 0.7);
      if (a.logo && !footH) gfxContain(ctx, a.logo, pad, pad, m * 0.24, m * 0.09, "left");
      const bottom = H - pad - footH - (footH ? m * 0.04 : 0), qrBelow = a.qr && !wide;
      const box = { x: pad, y: pad + m * 0.2, w: (W - pad * 2) * (wide ? 0.64 : 1), h: bottom - pad - m * 0.2 - (qrBelow ? qrS + m * 0.05 : 0) };
      const stack = [kicker(m * 0.034), head(m * 0.13), body(m * 0.038), details(m * 0.034)];
      const used = gfxStack(ctx, stack, box, { align: "left", valign: "bottom", dry: true });
      ctx.fillStyle = col.accent; ctx.fillRect(pad, box.y + box.h - used - m * 0.055, m * 0.09, m * 0.014);
      gfxStack(ctx, stack, box, { align: "left", valign: "bottom" });
      if (a.qr) qrBlock(W - pad - qrS, bottom - qrS);
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
      gfxStack(ctx, [kicker(m * 0.032, { color: col.accent }), head(m * 0.1, { color: col.ink }), body(m * 0.034, { color: col.ink }), details(m * 0.03, { color: col.ink })], { x: bx, y: by, w: bw, h: bh }, { align: "left", valign: across ? "middle" : "top" });
      if (a.qr) qrBlock(bx, H - pad - footH - qrS - (footH ? m * 0.03 : 0));
      drawFoot(col.ink, { x: bx, w: bw, y: H - pad - footH });
      break;
    }
    case "band": {
      // The photo fills the space; a solid band of color holds the words.
      const bandH = H * (wide ? 0.46 : tall ? 0.42 : 0.47), y0 = H - bandH;
      if (a.photo) gfxCover(ctx, a.photo, 0, 0, W, y0 + 2); else { ctx.fillStyle = glow; ctx.fillRect(0, 0, W, y0); drawOrn(W / 2 - m * 0.18, y0 / 2 - m * 0.18, m * 0.36, 0.8); }
      ctx.fillStyle = col.bg; ctx.fillRect(0, y0, W, bandH);
      ctx.fillStyle = col.accent; ctx.fillRect(0, y0, W, m * 0.012);
      if (a.logo) { ctx.fillStyle = "rgba(255,255,255,.92)"; const lw = m * 0.2, lh = m * 0.085; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(pad, pad, lw + m * 0.04, lh + m * 0.03, m * 0.02) : ctx.rect(pad, pad, lw + m * 0.04, lh + m * 0.03); ctx.fill(); gfxContain(ctx, a.logo, pad + m * 0.02, pad + m * 0.015, lw, lh); }
      const tw = W - pad * 2 - (a.qr ? qrS + m * 0.05 : 0), th = bandH - pad * 1.6 - (d.footer ? m * 0.06 : 0);
      gfxStack(ctx, [kicker(m * 0.03), head(m * (wide ? 0.125 : 0.1), { color: col.ink }), body(m * 0.036, { color: col.ink, maxLines: 3 }), details(m * 0.03, { color: col.ink })], { x: pad, y: y0 + pad * 0.8, w: tw, h: th }, { align: "left", valign: "middle" });
      if (a.qr) qrBlock(W - pad - qrS, y0 + (bandH - qrS) / 2 - (d.footer ? m * 0.02 : 0));
      if (d.footer) { ctx.font = fontStr([f.body[0], 600], m * 0.026); ctx.fillStyle = col.ink; ctx.globalAlpha = 0.8; ctx.textAlign = "left"; ctx.fillText(d.footer, pad, H - pad * 0.6); ctx.globalAlpha = 1; }
      break;
    }
    case "frame": {
      const inset = m * 0.045;
      ctx.strokeStyle = col.accent; ctx.lineWidth = m * 0.006; ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      ctx.lineWidth = m * 0.002; ctx.strokeRect(inset + m * 0.014, inset + m * 0.014, W - (inset + m * 0.014) * 2, H - (inset + m * 0.014) * 2);
      const ip = pad * 1.35;
      let top = ip;
      if (a.logo) { gfxContain(ctx, a.logo, W / 2 - m * 0.13, top, m * 0.26, m * 0.09); top += m * 0.13; } else if (a.orn) { drawOrn(W / 2 - m * 0.06, top, m * 0.12, 0.95); top += m * 0.16; }
      const bottom = H - ip - (a.qr ? qrS + m * 0.06 : 0) - (d.footer ? m * 0.06 : 0);
      const used = gfxStack(ctx, [kicker(m * 0.03), head(m * 0.105, { lh: 1.08 }), body(m * 0.036, { gap: 0.9 }), details(m * 0.032)], { x: ip, y: top, w: W - ip * 2, h: bottom - top }, { align: "center" });
      if (a.qr) qrBlock(W / 2 - qrS / 2, H - ip - qrS - (d.footer ? m * 0.06 : 0));
      if (d.footer) { ctx.font = fontStr([f.body[0], 600], m * 0.027); ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.fillText(d.footer, W / 2, H - ip + m * 0.01); }
      void used;
      break;
    }
    case "verse": {
      ctx.font = fontStr(["Fraunces", 700], m * 0.42); ctx.fillStyle = soft(col.accent, photoOn ? 0.55 : 0.35); ctx.textAlign = "left";
      ctx.fillText("“", pad * 0.7, pad + m * 0.3);
      const bottom = H - pad - footH - (a.qr ? 0 : 0);
      const tw = W - pad * 2 - (a.qr && wide ? qrS + m * 0.05 : 0);
      gfxStack(ctx, [{ text: d.body, font: f.head, size: m * (String(d.body || "").length > 160 ? 0.06 : 0.085), min: m * 0.026, color: ink, lh: 1.22, gap: 0.9 },
        { text: d.kicker, font: [f.body[0], 700], size: m * 0.036, min: m * 0.02, color: photoOn ? "#ffffff" : col.accent, track: 0.03, gap: 0.6 },
        { text: d.headline, font: f.body, size: m * 0.03, min: m * 0.018, color: ink, gap: 0 }], { x: pad, y: pad + m * 0.22, w: tw, h: bottom - pad - m * 0.26 - (a.qr && !wide ? qrS + m * 0.04 : 0) }, { align: "left", valign: "middle" });
      if (a.qr) qrBlock(W - pad - qrS, bottom - qrS - m * 0.02);
      drawFoot();
      break;
    }
    default: { // center
      let top = pad;
      if (a.logo) { gfxContain(ctx, a.logo, W / 2 - m * 0.15, top, m * 0.3, m * 0.1); top += m * 0.14; }
      drawOrn(wide ? W - pad - m * 0.2 : W - pad - m * 0.16, wide ? pad : pad * 0.8, wide ? m * 0.2 : m * 0.16, 0.6);
      const bottom = H - pad - (a.qr ? qrS + m * 0.05 : 0) - (d.footer ? m * 0.05 : 0);
      gfxStack(ctx, [kicker(m * 0.034), head(m * 0.13), body(m * 0.04), details(m * 0.034)], { x: pad, y: top, w: W - pad * 2, h: bottom - top }, { align: "center" });
      if (a.qr) qrBlock(W / 2 - qrS / 2, H - pad - qrS - (d.footer ? m * 0.05 : 0));
      if (d.footer) { ctx.font = fontStr([f.body[0], 600], m * 0.028); ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.textAlign = "center"; ctx.fillText(d.footer, W / 2, H - pad + m * 0.008); ctx.globalAlpha = 1; }
    }
  }
  ctx.restore();
}

/** The design on a new canvas. scale 1 is its pixel size; flyers export at 2 (300 dpi). */
async function gfxCanvas(d, { scale = 1, width = 0, safe = false } = {}) {
  const fm = GFX_FORMATS[d.format] || GFX_FORMATS.post, a = await gfxAssets(d);
  if (safe) { // drop pictures from sites that don't allow copying
    for (const k of ["photo", "logo"]) if (a[k] && !/^(data|blob):/.test(a[k].src) && new URL(a[k].src, location.href).origin !== location.origin) a[k] = null;
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
Screens.graphic = (id) => {
  if (!canGfx()) return { redirect: "ministry" };
  const g = S.get("graphics", id);
  if (!g) return { redirect: "graphics" };
  const fm = GFX_FORMATS[g.format] || GFX_FORMATS.post, c = S.church();
  const opt = (v, cur, label) => html`<option value="${v}" ${attr(v === cur, "selected")}>${label}</option>`;
  const targets = typeof qrTargetGroups === "function" ? qrTargetGroups() : [];
  const qrCustom = g.qr && isUrl(g.qr);
  const playlists = S.list("signage");
  const src = g.source?.kind === "event" ? S.get("events", g.source.id) : null;
  return {
    title: g.title || "Graphic", back: "graphics",
    body: html`<div class="gfx-editor">
      <div class="gfx-stage"><div class="gfx-pv-wrap"><div class="gfx-preview" style="aspect-ratio:${fm.w}/${fm.h}"><canvas id="gfx-canvas" role="img" aria-label="${g.headline || g.title}"></canvas></div></div>
        <p class="faint gfx-size">${fm.label}, ${fm.scale ? `${fm.w * fm.scale} × ${fm.h * fm.scale}` : `${fm.w} × ${fm.h}`} pixels</p>
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
        </section>
        <section class="panel"><h3>Look</h3>
          <div class="gfx-themes" role="radiogroup" aria-label="Colors">${Object.entries(GFX_THEMES).map(([k, t]) => {
            const col = gfxColors({ ...g, theme: k });
            return html`<label class="gfx-theme" title="${t.label}"><input type="radio" name="theme" value="${k}" ${attr(k === g.theme, "checked")}><span style="background:${col.bg};color:${col.ink}"><i style="background:${col.accent}"></i>Aa</span><small>${t.label}</small></label>`;
          })}</div>
          ${g.theme === "custom" ? html`<label class="field"><span>Color</span><input type="color" name="color" value="${okHex(g.color, "#3b5bdb")}"></label>` : ""}
          <label class="field"><span>Lettering</span><select name="font">${Object.entries(GFX_FONTS).map(([k, f]) => opt(k, g.font, f.label))}</select></label>
          ${imageField("photo", "Photo (optional)", g.photo, g.layout === "split" ? "Fills one side." : g.layout === "band" ? "Fills the space above the color band." : "Goes behind the words, darkened so they're easy to read.", 2000)}
          ${g.photo && !["split", "band"].includes(g.layout) ? html`<label class="field"><span>Darken the photo</span><input type="range" name="dim" min="10" max="85" step="5" value="${g.dim ?? 45}"></label>` : ""}
          <label class="field"><span>Decoration</span><select name="ornament">${opt("none", g.ornament, "None")}${Object.entries(GRAPHICS).map(([k, x]) => opt(k, g.ornament, x.label))}</select></label>
          ${c.logo ? html`<label class="check"><input type="checkbox" name="logo" ${attr(g.logo, "checked")}><span>Church logo</span></label>` : html`<p class="faint">Add your logo in Admin, Landing page, and it can go on every graphic.</p>`}
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
    after: () => gfxPaint(g.id),
  };
};

let gfxPaintSeq = 0;
/** Draws the big preview and the layout thumbnails. */
async function gfxPaint(id) {
  const g = S.get("graphics", id), seq = ++gfxPaintSeq; if (!g) return;
  const cv = $("#gfx-canvas"); if (!cv) return;
  const fm = GFX_FORMATS[g.format] || GFX_FORMATS.post, w = Math.min(fm.w, 1400);
  const big = await gfxCanvas(g, { width: w });
  if (seq !== gfxPaintSeq || !cv.isConnected) return;
  cv.width = big.width; cv.height = big.height; cv.getContext("2d").drawImage(big, 0, 0);
  cv.setAttribute("aria-label", [g.kicker, g.headline, g.body, g.details].filter(Boolean).join(". "));
  for (const mini of document.querySelectorAll("canvas[data-gfx-layout]")) {
    const sm = await gfxCanvas({ ...g, layout: mini.dataset.gfxLayout }, { width: 200 });
    if (seq !== gfxPaintSeq || !mini.isConnected) return;
    mini.width = sm.width; mini.height = sm.height; mini.getContext("2d").drawImage(sm, 0, 0);
  }
}

let gfxSaveTimer = 0;
/** Every change saves and redraws. Choices that change the controls themselves redraw the screen. */
Inputs.gfx = (form, e) => {
  const el = e?.target || form, f = form.closest("form") || form, g = S.get("graphics", f?.dataset.id); if (!g || el.name === "ref") return;
  const v = (n) => f.elements[n]?.value ?? g[n];
  const patch = {
    format: f.querySelector("[name=format]:checked")?.value || g.format, layout: f.querySelector("[name=layout]:checked")?.value || g.layout,
    theme: f.querySelector("[name=theme]:checked")?.value || g.theme, color: v("color"), font: v("font"), photo: v("photo"), dim: +(v("dim") ?? 45),
    ornament: v("ornament"), logo: f.elements.logo ? f.elements.logo.checked : g.logo, kicker: v("kicker"), headline: v("headline"), body: v("body"),
    details: v("details"), footer: v("footer"), title: v("title") || g.title,
  };
  const qrSel = v("qr");
  patch.qr = qrSel === "~" ? (isUrl(f.elements.qrUrl?.value) ? f.elements.qrUrl.value.trim() : "~") : qrSel;
  const structural = ["format", "layout", "theme", "qr"].includes(el.name) || el.name === "photo" && !!patch.photo !== !!g.photo;
  Object.assign(g, patch, { updatedAt: new Date().toISOString() });
  clearTimeout(gfxSaveTimer); gfxSaveTimer = setTimeout(() => S.update("graphics", g.id, {}), 500);
  if (structural) return keepFocus(render);
  gfxPaint(g.id);
};
Forms.gfx = () => {};
Forms["gfx-pick"] = () => {};

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

