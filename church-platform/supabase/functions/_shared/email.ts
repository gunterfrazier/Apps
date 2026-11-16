// The look of every email the app sends: one design for the app's own emails (sign-in emails use the same design, in
// supabase/templates) and for emails a church sends, which carry that church's name and color instead.
// Email clients are fussy, so it's built from tables with inline styles, at most 560px wide, and reads fine with
// images off. Keep it in step with supabase/templates/build.mjs, which makes the sign-in email templates.
import { env } from "./util.ts";

export const APP = "Our Faithful Church App";
export const APP_COLOR = "#4250d6";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const appUrl = () => { const u = env("APP_URL"); return u ? (u.endsWith("/") ? u : `${u}/`) : ""; };
const hex = (c: unknown) => /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : APP_COLOR;
/** White or near-black, whichever reads better on the color. */
function onColor(c: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1d2430" : "#ffffff";
}
const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export type Email = {
  heading: string;
  /** Paragraphs of plain text. Blank lines inside one keep it as separate paragraphs. */
  paragraphs?: string[];
  /** A code to type, shown large. */
  code?: string;
  button?: [string, string];
  /** Small print under the message: why they got it, who sent it. */
  footer?: string;
  /** The line inbox lists show after the subject. */
  preheader?: string;
  /** A church's email: its name and color in the header instead of the app's. */
  church?: { name: string; color?: string; logo?: string };
};

export function emailHtml(m: Email): string {
  const color = hex(m.church?.color), ink = onColor(color), brand = m.church?.name || APP, base = appUrl();
  const logo = m.church
    ? (/^https:\/\//.test(m.church.logo || "") ? `<img src="${esc(m.church.logo)}" width="36" height="36" alt="" style="display:block;border-radius:9px;background:#fff">`
      : `<div style="width:36px;height:36px;border-radius:9px;background:#ffffff;color:${color};font:700 14px/36px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;text-align:center">${esc(initials(brand))}</div>`)
    : base ? `<img src="${base}icons/icon-192.png" width="36" height="36" alt="" style="display:block;border-radius:9px">` : "";
  const paras = (m.paragraphs || []).flatMap((p) => String(p).split(/\n{2,}/)).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const code = m.code ? `<div style="margin:6px 0 18px;padding:16px;background:#f3f4f8;border-radius:12px;text-align:center;font:800 32px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:8px;color:#1d2430">${esc(m.code)}</div>` : "";
  const button = m.button ? `<tr><td style="padding:4px 28px 26px"><a href="${esc(m.button[1])}" style="display:inline-block;background:${color};color:${ink};text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">${esc(m.button[0])}</a></td></tr>` : "";
  const font = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(m.heading)}</title></head>
<body style="margin:0;padding:0;background:#eef0f4">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef0f4">${esc(m.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;font-family:${font};color:#1d2430">
<tr><td style="background:${color};border-radius:16px 16px 0 0;padding:16px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo ? `<td style="padding-right:12px">${logo}</td>` : ""}<td style="color:${ink};font:700 17px/1.3 ${font}">${esc(brand)}</td></tr></table></td></tr>
<tr><td style="padding:28px 28px 8px;font-size:16px;line-height:1.55"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#1d2430">${esc(m.heading)}</h1>${paras}${code}</td></tr>
${button}
${m.footer ? `<tr><td style="padding:16px 28px 22px;border-top:1px solid #e6e8ec;font-size:13px;line-height:1.5;color:#6b7280">${esc(m.footer)}</td></tr>` : ""}
</table>
<p style="margin:14px 0 0;font:12px/1.5 ${font};color:#8a909a">${m.church ? `Sent through ${APP}` : APP}${base ? ` · <a href="${base}" style="color:#8a909a">${esc(base.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</p>
</td></tr></table></body></html>`;
}
/** The same email as plain text, for clients that don't show HTML. */
export const emailText = (m: Email) => [m.heading, ...(m.paragraphs || []), ...(m.code ? [m.code] : []), ...(m.button ? [`${m.button[0]}: ${m.button[1]}`] : []), ...(m.footer ? [m.footer] : []), m.church ? `${m.church.name}, sent through ${APP}` : APP].join("\n\n");
