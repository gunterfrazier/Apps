// ---------- Deleting your own account (Me, Delete my account) ----------
// Required for Google Play: anyone with an account can delete it from inside the app. The database function
// delete_my_account() (supabase/upgrade-25.sql) does the work: it deletes what's personal and leaves the records a
// church has to keep (giving for tax statements, ticket payments, kids' check-in history, safety reports, and the
// sermons, lessons and media someone made for the church) with the church, without the account. The website's
// /delete-account/ page explains the same for people who no longer have the app.

const PRIVACY_EMAIL = "privacy@ourfaithfulchurch.com";
let deletingAccount = false;

/** What has to be sorted out first: churches this person is the primary account holder of, and recurring gifts. */
function deleteAccountBlockers() {
  const me = S.me().id;
  const owned = S.myChurches().filter((c) => c.ownerId === me);
  const recurring = (S.state.recurring || []).filter((r) => r.by === me && r.active);
  return { owned, recurring };
}

Screens["delete-account"] = () => {
  const live = Backend.on && Backend.user;
  const mail = html`<a href="mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("Delete my account")}">${PRIVACY_EMAIL}</a>`;
  if (!live) {
    return {
      title: "Delete your account", back: "me",
      body: html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">${Backend.on ? html`Sign in first, then come back here to delete your account.`
          : html`This preview keeps everything on this device; there's no account on a server to delete.`}</p>
        <p class="muted" style="margin-bottom:0">Can't sign in? Email ${mail} from the address you sign in with, and we'll delete your account within 30 days.</p></div>`,
    };
  }
  const { owned, recurring } = deleteAccountBlockers(), blocked = owned.length || recurring.length;
  return {
    title: "Delete your account", back: "me",
    body: html`<div class="delete-account">
      <p class="muted" style="margin-top:16px">This deletes your ${PLATFORM.name} account, ${html`<b>${S.me().email}</b>`}, from every church you belong to. It can't be undone.</p>
      <section class="sec"><h2 class="sec-head">What's deleted</h2><div class="panel"><ul class="plain-list">
        <li>Your profile, contact details and private settings</li>
        <li>Your family, including your children's information and authorized pickups</li>
        <li>Your memberships, and your place in groups, classes and serving teams</li>
        <li>Your prayer requests, messages, posts, form answers and registrations</li>
        <li>Your notifications, and this app's notifications on your devices</li></ul></div></section>
      <section class="sec"><h2 class="sec-head">What your church keeps</h2><div class="panel"><p style="margin-top:0">Some records belong to the church, so they stay, with your account removed from them:</p><ul class="plain-list">
        <li>Giving records and pledges, which the church needs for tax statements</li>
        <li>Ticket and registration payments</li>
        <li>Your children's past check-in history, and safety reports</li>
        <li>Sermons, lessons and media you made for the church</li></ul>
        <p class="faint" style="margin-bottom:0">To have any of these changed, ask the church.</p></div></section>
      ${blocked ? html`<section class="sec"><h2 class="sec-head">Before you can delete it</h2><div class="panel delete-blockers">
        ${owned.map((c) => html`<p>${icon("star")}<span>You're the primary account holder of <b>${c.name}</b>. Make someone else the primary account holder (Admin, People, then a person), or deactivate the church.</span></p>`)}
        ${recurring.length ? html`<p>${icon("give")}<span>You have ${plural(recurring.length, "recurring gift")} running. Stop ${recurring.length === 1 ? "it" : "them"} on Give, so nothing is charged after your account is gone.</span></p>` : ""}
        <div class="btns">${owned.length ? html`<a class="btn ghost sm" href="#admin-people">${icon("people")}People</a>` : ""}${recurring.length ? html`<a class="btn ghost sm" href="#give">${icon("give")}Give</a>` : ""}</div>
      </div></section>` : ""}
      <section class="sec"><form data-form="delete-account" class="panel" novalidate>
        <label class="field" style="margin-top:0"><span>To confirm, type DELETE</span><input type="text" name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" ${attr(blocked, "disabled")}></label>
        <div class="btns"><button class="btn danger" ${attr(blocked || deletingAccount, "disabled")}>${icon("trash")}${deletingAccount ? "Deleting..." : "Delete my account"}</button><a class="btn ghost" href="#me">Keep my account</a></div>
      </form></section>
      <p class="faint">Questions? Email ${mail}. The <a href="${IN_PREVIEW ? `https://${SITE_DOMAIN}/` : SITE_ROOT}privacy/">privacy policy</a> has the details.</p>
    </div>`,
  };
};

Forms["delete-account"] = async (d, f) => {
  if ((d.confirm || "").trim().toUpperCase() !== "DELETE") return formError(f, "Type DELETE to confirm.");
  if (deletingAccount) return;
  deletingAccount = true; render();
  try {
    const { error } = await Backend.client.rpc("delete_my_account");
    if (error) throw error;
  } catch (e) {
    deletingAccount = false; render();
    const form = $('form[data-form="delete-account"]');
    return formError(form || f, e?.message && !/fetch|network/i.test(e.message) ? e.message : "Couldn't delete your account. Check your connection and try again.");
  }
  // The account is gone: sign out here and forget this device's copy of it.
  try { await Backend.signOut(); } catch {}
  // Nothing more of this account is written to this device on the way out (leaving the page saves otherwise).
  clearTimeout(S._timer); S.save = () => {}; S.flush = () => {};
  try { Object.keys(localStorage).filter((k) => /^(our-faithful|sb-)/.test(k) && k !== "our-faithful-device").forEach((k) => localStorage.removeItem(k)); } catch {}
  deletingAccount = false;
  location.replace(`${IN_PREVIEW ? `https://${SITE_DOMAIN}/` : SITE_ROOT}delete-account/?done`);
};
