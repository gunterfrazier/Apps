// Drafts for teachers: discussion questions, kids lessons, sermon summaries. The app builds the prompt with the passage
// text; this checks the person may use it, keeps a daily limit, calls Claude and returns the JSON it wrote.
import { admin, caller, can, env, fail, handle, json } from "../_shared/util.ts";

const TEACHING = ["build.studies", "build.lessons", "build.sermons", "lead.groups", "teach.classes", "manage.sermons"];
const DAILY = Number(env("AI_DAILY_LIMIT", "40"));

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { prompt, churchId } = await req.json();
  if (typeof prompt !== "string" || prompt.length > 30000) return fail("The request is too long");
  let allowed = false;
  for (const p of TEACHING) if (await can(client, churchId, p)) { allowed = true; break; }
  if (!allowed) return fail("AI drafts are for people who teach or lead", 403);
  const db = admin(), day = new Date().toISOString().slice(0, 10);
  const { data: use } = await db.from("ai_usage").select("n").eq("user_id", user.id).eq("day", day).maybeSingle();
  if ((use?.n || 0) >= DAILY) return fail("You've reached today's limit for AI drafts. Try again tomorrow.", 429);
  await db.from("ai_usage").upsert({ user_id: user.id, day, n: (use?.n || 0) + 1 }, { onConflict: "user_id,day" });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"), max_tokens: 2500, system: "Reply with one JSON value only. No prose, no code fences.", messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return fail(`The AI service answered ${res.status}`, 502);
  const out = await res.json();
  const text = (out.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  try { return json(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""))); }
  catch { return fail("The draft came back in the wrong shape. Try again.", 502); }
});
