// The church's podcast feed: GET /functions/v1/podcast?church=<church ID>. Submit this address to Apple Podcasts and Spotify.
// Built from every sermon with an audio file, with the same tags as the feed.xml download in the app.
import { admin, env } from "../_shared/util.ts";

const x = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s || "");

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("church") || "";
  const db = admin();
  const { data: c } = await db.from("churches").select("id, name, data").eq("id", id).maybeSingle();
  if (!c) return new Response("No such church", { status: 404 });
  const { data: rows } = await db.from("records").select("id, location_id, data").eq("kind", "sermons").eq("church_id", id);
  const { data: privateLocs } = await db.from("locations").select("id").eq("church_id", id).eq("visibility", "private");
  const hidden = new Set((privateLocs || []).map((l) => l.id));
  const p = { title: `${c.name} sermons`, author: c.name, description: c.data.tagline || `Sunday messages from ${c.name}.`, email: c.data.email || "", category: "Christianity", artwork: c.data.logo || "", language: "en-us", ...(c.data.podcast || {}) };
  const app = env("APP_URL"), self = `${env("SUPABASE_URL")}/functions/v1/podcast?church=${encodeURIComponent(id)}`;
  const eps = (rows || []).filter((r) => (r.data.audioUrl || /\.(mp3|m4a)(\?|$)/i.test(r.data.mediaUrl || "")) && !hidden.has(r.location_id)).sort((a, b) => +new Date(b.data.date) - +new Date(a.data.date));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${x(p.title)}</title><link>${x(c.data.website || `${app}#church-${id}`)}</link><language>${x(p.language)}</language><description>${x(p.description)}</description>
  <itunes:author>${x(p.author)}</itunes:author><itunes:owner><itunes:name>${x(p.author)}</itunes:name><itunes:email>${x(p.email)}</itunes:email></itunes:owner>
  <itunes:explicit>false</itunes:explicit><itunes:type>episodic</itunes:type>
  <itunes:category text="Religion &amp; Spirituality"><itunes:category text="${x(p.category)}"/></itunes:category>
  ${isUrl(p.artwork) ? `<itunes:image href="${x(p.artwork)}"/>` : ""}
  <atom:link href="${x(self)}" rel="self" type="application/rss+xml"/>
${eps.map((r) => { const s = r.data, audio = s.audioUrl || s.mediaUrl; return `  <item>
    <title>${x(s.title)}</title>
    <description>${x([s.summary, `${s.passage}. ${s.speaker}.`, s.series ? `Series: ${s.series}.` : ""].filter(Boolean).join(" "))}</description>
    <enclosure url="${x(audio)}" length="${s.audioBytes || 0}" type="${/\.m4a(\?|$)/i.test(audio) ? "audio/x-m4a" : "audio/mpeg"}"/>
    <guid isPermaLink="false">${x(`${id}:${r.id}`)}</guid><pubDate>${new Date(s.date).toUTCString()}</pubDate>
    <itunes:duration>${(s.minutes || 35) * 60}</itunes:duration><itunes:author>${x(s.speaker)}</itunes:author><link>${x(`${app}#sermon-${r.id}`)}</link>
  </item>`; }).join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900", "access-control-allow-origin": "*" } });
});
