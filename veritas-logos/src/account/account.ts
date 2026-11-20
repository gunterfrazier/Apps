/**
 * Veritas Logos accounts on the website, built as its own file (dist/account.js) so the app loads it only where the
 * site has accounts switched on (site.config.json). The page published to Claude never loads it: there, the owner's
 * Claude account keeps their data.
 *
 * Sign-in is through Supabase Auth: a code sent by email, a Google account, or an email and password. Each reader's
 * data sits in the user_docs table, which row-level security limits to its owner (supabase/migrations).
 */
import { createClient, type AuthError, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountApi, AccountConfig, AccountUser, CloudCollection, SignInMethods } from "./types";
import type { AgeGroup, FamilyProfile, FamilyTheme } from "../core/family";

const FAMILY_COLUMNS = "id,nickname,age_group,theme";
const familyProfileOf = (row: { id: string; nickname: string; age_group: AgeGroup; theme: FamilyTheme }): FamilyProfile =>
  ({ id: row.id, nickname: row.nickname, ageGroup: row.age_group, theme: row.theme });

const PAGE = 1000;
/** Keeps each save request well under the server's limit when many guides change at once. */
const BATCH_BYTES = 1_500_000;

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account. Check them, or sign in with an email code.",
  email_not_confirmed: "This email hasn't been confirmed yet. Enter the code we sent, or ask for a new one.",
  otp_expired: "That code is wrong or has expired. Ask for a new one.",
  otp_disabled: "Sign-in codes aren't switched on for this site yet.",
  user_already_exists: "There's already an account with this email. Sign in instead.",
  email_exists: "There's already an account with this email. Sign in instead.",
  weak_password: "Choose a longer password: at least 8 characters, mixing letters and numbers.",
  same_password: "That's the password you already have. Choose a new one.",
  email_address_invalid: "That email address doesn't look right.",
  email_address_not_authorized: "This site can't send email yet. Try another way to sign in, or try again later.",
  over_email_send_rate_limit: "Too many emails were sent just now. Wait a minute, then try again.",
  over_request_rate_limit: "Too many tries just now. Wait a minute, then try again.",
  signup_disabled: "New accounts aren't open right now.",
  email_provider_disabled: "Email sign-in isn't switched on for this site yet.",
  provider_disabled: "That way of signing in isn't switched on for this site yet.",
  user_not_found: "There's no account with that email.",
  session_not_found: "You've been signed out. Sign in again.",
  reauthentication_needed: "For your safety, sign in again before changing your password.",
  passkey_disabled: "Passkeys are unavailable right now. You can still sign in with an email code.",
  webauthn_credential_not_found: "This passkey isn't registered. Sign in with an email code to add a passkey.",
  webauthn_credential_exists: "This passkey is already registered to your account.",
  too_many_passkeys: "Your account has reached its passkey limit. Remove an old passkey to add one.",
};

export function friendlyError(e: unknown): string {
  const err = e as Partial<AuthError> & { message?: string; hint?: string; code?: string };
  if (err?.hint === "veritas:too-many") return "Your account already holds 2,000 saved items. Delete some guides to save more.";
  if (err?.hint === "veritas:too-big") return "Your account's saved data is over 25 MB. Delete some guides or notes to save more.";
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code];
  const m = String(err?.message ?? "");
  if (/password/i.test(m) && /(short|weak|characters)/i.test(m)) return MESSAGES.weak_password;
  if (/rate limit/i.test(m)) return MESSAGES.over_request_rate_limit;
  if (/expired|invalid.*(otp|token)/i.test(m)) return MESSAGES.otp_expired;
  if (/fetch|network|load failed/i.test(m)) return "Couldn't reach the account service. Check your connection and try again.";
  return m || "Something went wrong. Try again.";
}

const fail = (error: unknown): never => { throw Object.assign(new Error(friendlyError(error)), { cause: error }); };
function failPasskey(error: unknown): never {
  const detail = error as { name?: string; code?: string; cause?: { name?: string } } | null;
  if (detail?.name === "NotAllowedError" || detail?.cause?.name === "NotAllowedError" ||
      detail?.code === "ERROR_CEREMONY_ABORTED") {
    throw new Error("The passkey prompt didn’t finish. Try again or use another sign-in method.");
  }
  return fail(error);
}

function userOf(session: Session | null): AccountUser | null {
  const u = session?.user;
  if (!u) return null;
  const providers = (u.identities ?? []).map((i) => i.provider);
  return { id: u.id, email: u.email ?? "", providers: providers.length ? providers : [u.app_metadata?.provider ?? "email"], createdAt: u.created_at };
}

export function createAccount(config: AccountConfig): AccountApi {
  const passkeyOrigin = ["https://veritaslogos.com", "https://www.veritaslogos.com"].includes(location.origin);
  const sb: SupabaseClient = createClient(config.url, config.key, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "veritas.account",
      experimental: { passkey: passkeyOrigin } },
  });
  let session: Session | null = null;
  const listeners = new Set<(u: AccountUser | null) => void>();
  const emit = () => { const u = userOf(session); listeners.forEach((l) => l(u)); };

  // Coming back from Google or from a link in an email, the address carries ?code=… (or ?error=…). The client trades
  // the code for a session when it starts; the address is then put back as it was, without the query.
  const params = new URLSearchParams(location.search);
  const returnedWithError = params.get("error_description") || params.get("error");
  const ready = sb.auth.getSession().then(async ({ data, error }) => {
    session = data.session;
    if (params.has("code") || returnedWithError) history.replaceState(history.state, "", location.pathname + location.hash);
    // A saved sign-in can outlive its account, deleted or signed out everywhere from another device. Asking the
    // service once per visit finds that out; without a connection, the saved sign-in stands.
    if (session) {
      const check = await sb.auth.getUser();
      const code = (check.error as { code?: string } | null)?.code;
      if (check.error && (code === "user_not_found" || code === "session_not_found" || check.error.name === "AuthSessionMissingError")) {
        await sb.auth.signOut({ scope: "local" }).catch(() => {});
        session = null;
      }
    }
    return error ?? (returnedWithError ? { message: returnedWithError.replace(/\+/g, " ") } : null);
  });
  sb.auth.onAuthStateChange((_event, s) => {
    const before = session?.user?.id ?? null;
    session = s;
    if ((s?.user?.id ?? null) !== before) setTimeout(emit, 0);
  });

  const methods = async (): Promise<SignInMethods> => {
    try {
      const res = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } });
      const s = await res.json();
      return {
        google: Boolean(s?.external?.google), email: s?.external?.email !== false, signup: !s?.disable_signup,
        confirmEmail: !s?.mailer_autoconfirm,
        passkeys: passkeyOrigin && s?.passkeys_enabled === true && Boolean(window.PublicKeyCredential) &&
          typeof navigator.credentials?.create === "function" && typeof navigator.credentials?.get === "function",
      };
    } catch {
      return { google: false, email: true, signup: true, confirmEmail: true, passkeys: false };
    }
  };

  const uid = () => {
    const id = session?.user?.id;
    if (!id) throw new Error("You've been signed out. Sign in again.");
    return id;
  };

  const familyTable = (owner: string) => {
    if (uid() !== owner) throw new Error("Sign in again to manage these profiles.");
    return sb.from("family_profiles");
  };

  const collection: CloudCollection = {
    async get() {
      const docs: { id: string; data: () => unknown }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from("user_docs").select("doc_id,data").eq("user_id", uid()).order("doc_id").range(from, from + PAGE - 1);
        if (error) fail(error);
        for (const row of data ?? []) docs.push({ id: row.doc_id, data: () => row.data });
        if (!data || data.length < PAGE) break;
      }
      return { docs };
    },
    doc(id: string) {
      return {
        set: (value: unknown) => collection.setMany!([[id, value]]),
        delete: () => collection.deleteMany!([id]),
      };
    },
    async setMany(entries) {
      const user_id = uid();
      let batch: { user_id: string; doc_id: string; data: unknown }[] = [];
      let bytes = 0;
      const send = async () => {
        if (!batch.length) return;
        const { error } = await sb.from("user_docs").upsert(batch, { onConflict: "user_id,doc_id" });
        if (error) fail(error);
        batch = [];
        bytes = 0;
      };
      for (const [doc_id, data] of entries) {
        const size = JSON.stringify(data).length;
        if (bytes + size > BATCH_BYTES) await send();
        batch.push({ user_id, doc_id, data });
        bytes += size;
      }
      await send();
    },
    async deleteMany(ids) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from("user_docs").delete().eq("user_id", uid()).in("doc_id", ids.slice(i, i + 200));
        if (error) fail(error);
      }
    },
  };

  const signedIn = (s: Session | null) => { session = s; emit(); return userOf(s); };

  return {
    ready: ready.then((err) => ({ user: userOf(session), error: err ? friendlyError(err) : "" })),
    onChange(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    user: () => userOf(session),
    methods,
    collection,
    family: {
      async list(owner) {
        const { data, error } = await familyTable(owner).select(FAMILY_COLUMNS).eq("owner_id", owner).order("created_at").order("id");
        if (error) fail(error);
        return (data ?? []).map(familyProfileOf);
      },
      async get(owner, id) {
        const { data, error } = await familyTable(owner).select(FAMILY_COLUMNS).eq("owner_id", owner).eq("id", id).maybeSingle();
        if (error) fail(error);
        return data ? familyProfileOf(data) : null;
      },
      async save(owner, settings, id) {
        const values = { nickname: settings.nickname.trim(), age_group: settings.ageGroup, theme: settings.theme };
        const table = familyTable(owner);
        const change = id ? table.update(values).eq("owner_id", owner).eq("id", id) : table.insert(values);
        const { data, error } = await change.select(FAMILY_COLUMNS).single();
        if (error || !data) return fail(error);
        return familyProfileOf(data);
      },
      async remove(owner, id) {
        const { error } = await familyTable(owner).delete().eq("owner_id", owner).eq("id", id);
        if (error) fail(error);
      },
    },

    async sendCode(email, create = true) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: create, emailRedirectTo: config.redirectTo } });
      if (error) fail(error);
    },
    async verifyCode(email, code, purpose = "signin") {
      const token = code.replace(/\s+/g, "");
      const types = purpose === "reset" ? (["recovery"] as const) : purpose === "signup" ? (["email", "signup"] as const) : (["email", "magiclink"] as const);
      let last: unknown = null;
      for (const type of types) {
        const { data, error } = await sb.auth.verifyOtp({ email, token, type });
        if (!error) return signedIn(data.session);
        last = error;
      }
      return fail(last);
    },
    async google(returnHash) {
      try { sessionStorage.setItem("veritas.return", returnHash); } catch { /* fine */ }
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: config.redirectTo, queryParams: { prompt: "select_account" } } });
      if (error) fail(error);
    },
    async resendConfirmation(email) {
      const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: config.redirectTo } });
      if (error) fail(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: config.redirectTo } });
      if (error) fail(error);
      if (data.session) return { user: signedIn(data.session), needsCode: false };
      // An address that already has an account comes back with no sign-in methods and no email is sent.
      if (data.user && !(data.user.identities ?? []).length) fail({ code: "user_already_exists" });
      return { user: null, needsCode: true };
    },
    async signInWithPassword(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) fail(error);
      return signedIn(data.session);
    },
    async signInWithPasskey(signal) {
      const { data, error } = await sb.auth.signInWithPasskey({ options: { signal } });
      if (error || !data?.session) return failPasskey(error);
      return signedIn(data.session);
    },
    async registerPasskey(signal) {
      const { error } = await sb.auth.registerPasskey({ options: { signal } });
      if (error) failPasskey(error);
    },
    async listPasskeys() {
      const { data, error } = await sb.auth.passkey.list();
      if (error) fail(error);
      return data ?? [];
    },
    async removePasskey(id) {
      const { error } = await sb.auth.passkey.delete({ passkeyId: id });
      if (error) fail(error);
    },
    async sendResetCode(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: config.redirectTo });
      if (error) fail(error);
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) fail(error);
    },
    async signOut() {
      const { error } = await sb.auth.signOut({ scope: "local" });
      session = null;
      emit();
      if (error && error.name !== "AuthSessionMissingError") fail(error);
    },
    async deleteAccount() {
      uid();
      const { error } = await sb.rpc("delete_my_account");
      if (error) fail(error);
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      session = null;
      emit();
    },
  };
}
