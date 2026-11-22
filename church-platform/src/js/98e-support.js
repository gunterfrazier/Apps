// Temporary support cases and consent-based household account links.
const ACCOUNT_CODE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
let linkedFamily = [];
let linkedFamilyUser = null;
let supportView = null;

async function accountRpc(method, args) {
  const client = Backend.client;
  if (!client || !Backend.user) throw new Error("Sign in to use this feature.");
  const { data, error } = await client.rpc(method, args);
  if (error) throw error;
  return data;
}
async function refreshLinkedFamily() {
  const user = Backend.user?.id;
  if (linkedFamilyUser !== user) linkedFamily = [];
  linkedFamilyUser = user;
  if (!user) return;
  try {
    const list = await accountRpc("family_accounts");
    if (Backend.user?.id === user) linkedFamily = list || [];
  } catch {}
}
const enterAccountCode = (form, label) => html`<form data-form="${form}" novalidate>
  <label class="field"><span>${label}</span><input name="code" required maxlength="36" autocomplete="off" autocapitalize="none"></label>
  <button class="btn">Continue</button></form>`;
function showAccountCode(title, code, instructions) {
  openSheet(title, html`<p>${instructions}</p><div class="copy-line">
    <input readonly aria-label="${title}" value="${code}">
    <button class="btn" data-act="copy" data-text="${code}">Copy</button></div>`);
}
Screens.familylinks = () => {
  if (!Backend.user) return { title: "Linked family accounts", back: "household", body: html`<p>Sign in to link accounts.</p>` };
  return { title: "Linked family accounts", back: "household", body: html`
    <section class="sec panel"><p>Link another family member who has their own login. Linking shows their name when you confirm group attendance. Each account records its own attendance.</p>
      <button class="btn" data-act="family-invite">Create invitation</button>
      ${enterAccountCode("family-accept", "Invitation code")}</section>
    <section class="sec"><h2>Linked accounts</h2><div class="rows" data-family-list></div></section>`,
    async after() {
      await refreshLinkedFamily();
      const list = $("[data-family-list]");
      if (list) list.innerHTML = flat(linkedFamily.length ? linkedFamily.map((p) => html`<div class="row"><span class="body">${p.name}</span><button class="btn ghost sm" data-act="family-unlink" data-id="${p.id}">Unlink</button></div>`) : empty("No linked accounts."));
    } };
};
Actions["family-invite"] = async () => {
  try { showAccountCode("Family invitation", await accountRpc("family_create_invite"), "Share this one-time code with the person you want to link. It expires in 24 hours."); }
  catch (error) { toast(error.message); }
};
Forms["family-accept"] = async (d, f) => {
  if (!ACCOUNT_CODE.test(d.code)) return formError(f, "Enter the full invitation code.");
  try { await accountRpc("family_accept", { code: d.code }); toast("Family accounts linked"); render(); }
  catch (error) { formError(f, error.message); }
};
Actions["family-unlink"] = async (el) => {
  try { await accountRpc("family_unlink", { other: el.dataset.id }); render(); }
  catch (error) { toast(error.message); }
};

Screens.help = () => {
  const church = S.church();
  return { title: "Help & support", back: church ? "me" : "churches", body: html`
    ${Backend.user ? html`<div class="panel btns" style="margin-top:16px">
      <span>Signed in as <b>${Backend.user.email}</b></span>
      <button class="btn ghost" data-act="sign-out">Sign out</button>
    </div>` : ""}
    <section class="sec panel"><h2>Get help</h2>
      <p>Include the feature, device and steps that led to the issue when you contact support.</p>
      ${church?.email ? html`<p><a class="btn ghost" href="mailto:${church.email}">Contact the church office</a></p>` : ""}
      ${Backend.user ? html`<div data-support-controls></div>` : html`<p>Sign in to manage diagnostic access.</p>`}</section>`,
    async after() {
      const panel = $("[data-support-controls]");
      if (!panel) return;
      const user = Backend.user?.id;
      if (supportView?.user !== user) supportView = null;
      try {
        const [staff, cases] = await Promise.all([accountRpc("help_is_staff"), accountRpc("help_cases")]);
        if (!panel.isConnected || Backend.user?.id !== user) return;
        if (supportView && !cases?.some((c) => c.id === supportView.id)) supportView = null;
        panel.innerHTML = flat(html`
          ${staff ? enterAccountCode("help-redeem", "Support access key") : html`
            <p>Generate a one-time key to let support view account diagnostics for up to 24 hours. Close the case at any time to end access.</p>
            <div class="btns"><button class="btn" data-act="help-create">Generate personal account key</button>
              ${church && S.isPrimary() ? html`<button class="btn ghost" data-act="help-create" data-church="${church.id}">Generate church account key</button>` : ""}</div>`}
          <h3>Open support cases</h3><div class="rows">${(cases || []).map((c) => html`
            <div class="row"><span class="body"><b>${c.church_id ? "Church account" : "Personal account"}</b><span class="s">${c.redeemed ? "Access granted" : "Awaiting key redemption"} · Expires ${fmtWhen(c.expires_at)}</span></span>
              ${staff ? html`<button class="btn sm" data-act="help-inspect" data-id="${c.id}">View</button>` : ""}
              <button class="btn ghost sm" data-act="help-close" data-id="${c.id}">Close</button></div>`)}${cases?.length ? "" : empty("No open support cases.")}</div>
          ${staff && supportView ? html`<section class="sec"><h3>Account diagnostics</h3><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${JSON.stringify(supportView.data, null, 2)}</pre></section>` : ""}`);
      } catch { if (panel.isConnected) panel.textContent = "Remote diagnostics are currently unavailable."; }
    } };
};
Actions["help-create"] = async (el) => {
  try {
    const code = await accountRpc("help_create", { c: el.dataset.church || null });
    render();
    showAccountCode("Support access key", code, "Send this key to the support agent handling your issue. It expires in 24 hours or when the case is closed.");
  } catch (error) { toast(error.message); }
};
Forms["help-redeem"] = async (d, f) => {
  if (!ACCOUNT_CODE.test(d.code)) return formError(f, "Enter the full support access key.");
  try {
    const id = await accountRpc("help_redeem", { code: d.code });
    await Actions["help-inspect"]({ dataset: { id } });
  } catch (error) { formError(f, error.message); }
};
Actions["help-inspect"] = async (el) => {
  const user = Backend.user?.id;
  try {
    const data = await accountRpc("help_diagnostics", { case_id: el.dataset.id });
    if (Backend.user?.id !== user || location.hash !== "#help") return;
    supportView = { user, id: el.dataset.id, data };
    render();
  } catch (error) { supportView = null; toast(error.message); render(); }
};
Actions["help-close"] = async (el) => {
  try { await accountRpc("help_close", { case_id: el.dataset.id }); supportView = null; render(); }
  catch (error) { toast(error.message); }
};
addEventListener("hashchange", () => { supportView = null; });
