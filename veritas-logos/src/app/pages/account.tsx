import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ACCOUNTS_ON, IN_CLAUDE, account, currentHash, deleteAccount, signOut, useAccount } from "../account";
import { toast, useData, useSyncState } from "../store";
import { useAsync } from "../ui";
import { SyncLine } from "./library";

/** Sign in, or see and manage the account, on the website. */
export function AccountPage() {
  const acct = useAccount();
  if (!ACCOUNTS_ON) {
    return (
      <div className="page prose">
        <h1 className="page-title">Your account</h1>
        {IN_CLAUDE
          ? <p>In Claude, your guides, notes and settings are saved privately to your Claude account, so there's nothing to sign in to. To move them to the website, back them up from Library here, then sign in on the website and restore the file there.</p>
          : <p>Accounts aren't set up on this copy of Veritas Logos. Your guides, notes and settings are kept in this browser, and you can back them up from <a href="#library">Library</a>.</p>}
      </div>
    );
  }
  return (
    <div className="page prose">
      <h1 className="page-title">{acct.status === "signed-in" ? "Your account" : "Sign in"}</h1>
      {acct.status === "loading" && <p className="fine">Checking your account…</p>}
      {acct.status === "unavailable" && <p>Sign-in couldn't load. Check your connection and reload the page. Your work is still kept in this browser.</p>}
      {acct.status === "signed-out" && <SignIn />}
      {acct.status === "signed-in" && acct.user && <Details key={acct.user.id} email={acct.user.email} providers={acct.user.providers} />}
      <PrivacyNote />
    </div>
  );
}

type Step =
  | { kind: "start" }
  | { kind: "code"; purpose: "signin" | "signup" | "reset"; email: string };

function usePasskeyPrompt() {
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  return async (start: (signal: AbortSignal) => Promise<unknown>) => {
    const prompt = new AbortController();
    active.current = prompt;
    try {
      await start(prompt.signal);
      return !prompt.signal.aborted;
    } catch (error) {
      if (!prompt.signal.aborted) throw error;
      return false;
    } finally {
      active.current = null;
    }
  };
}

function SignIn() {
  const { methods } = useAccount();
  const passkeyPrompt = usePasskeyPrompt();
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [how, setHow] = useState<"code" | "password">("code");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await work(); } catch (e: any) { setError(e?.message ?? "Something went wrong. Try again."); } finally { setBusy(false); }
  };
  const cleanEmail = email.trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  if (step.kind === "code") return <CodeEntry step={step} onBack={() => setStep({ kind: "start" })} />;

  const sendCode = (e: FormEvent) => { e.preventDefault(); if (emailOk) run(async () => { await account().sendCode(cleanEmail); setStep({ kind: "code", purpose: "signin", email: cleanEmail }); }); };
  const withPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!emailOk || !password) return;
    if (mode === "signup" && password.length < 8) { setError("Choose a longer password: at least 8 characters, mixing letters and numbers."); return; }
    run(async () => {
      if (mode === "signin") { await account().signInWithPassword(cleanEmail, password); toast("Signed in"); return; }
      const r = await account().signUp(cleanEmail, password);
      if (r.needsCode) setStep({ kind: "code", purpose: "signup", email: cleanEmail });
      else toast("Account created");
    });
  };
  const forgot = () => { if (!emailOk) { setError("Enter your email above first."); return; } run(async () => { await account().sendResetCode(cleanEmail); setStep({ kind: "code", purpose: "reset", email: cleanEmail }); }); };

  return (
    <div className="form account-form">
      <p>Sign in to keep your guides, notes, highlights and settings the same on your phone, tablet and computer. Reading and studying don't need an account.</p>
      {methods?.passkeys && (
        <button type="button" className="btn big" disabled={busy} onClick={() => run(async () => {
          if (await passkeyPrompt((signal) => account().signInWithPasskey(signal))) toast("Signed in");
        })}>Sign in with a passkey</button>
      )}
      {methods?.google && (
        <>
          <button type="button" className="btn big google-btn" disabled={busy} onClick={() => run(() => account().google(currentHash()))}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" /></svg>
            Continue with Google
          </button>
          <p className="or-line"><span>or use your email</span></p>
        </>
      )}
      <div><label className="label" htmlFor="acct-email">Email</label><input id="acct-email" className="input big" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="segmented" role="tablist" aria-label="How to sign in">
        <button type="button" role="tab" aria-selected={how === "code"} className={how === "code" ? "on" : ""} onClick={() => { setHow("code"); setError(""); }}>Email me a code</button>
        <button type="button" role="tab" aria-selected={how === "password"} className={how === "password" ? "on" : ""} onClick={() => { setHow("password"); setError(""); }}>Use a password</button>
      </div>
      {how === "code" ? (
        <form onSubmit={sendCode} className="form">
          <p className="fine">We'll email you a short code. There's no password to remember, and a new account is made the first time.</p>
          <button type="submit" className="btn big primary" disabled={busy || !emailOk}>{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={withPassword} className="form">
          <div><label className="label" htmlFor="acct-password">{mode === "signin" ? "Password" : "Choose a password"}</label>
            <PasswordInput id="acct-password" value={password} onChange={setPassword} isNew={mode === "signup"} /></div>
          {mode === "signup" && <p className="fine">At least 8 characters. {methods?.confirmEmail !== false && "We'll email you a code to confirm the address."}</p>}
          <button type="submit" className="btn big primary" disabled={busy || !emailOk || !password}>{busy ? "Just a moment…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          <div className="action-row">
            {mode === "signin"
              ? <><button type="button" className="btn small" onClick={() => { setMode("signup"); setError(""); }}>New here? Create an account</button><button type="button" className="btn small" disabled={busy} onClick={forgot}>Forgot password?</button></>
              : <button type="button" className="btn small" onClick={() => { setMode("signin"); setError(""); }}>I already have an account</button>}
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, isNew }: { id: string; value: string; onChange: (v: string) => void; isNew: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-row">
      <input id={id} className="input big" type={show ? "text" : "password"} autoComplete={isNew ? "new-password" : "current-password"} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn small" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
    </div>
  );
}

const WAIT = 60;
const MAX_CODE_LENGTH = 12;
function pastedCode(text: string) {
  const digits = text.replace(/[\s-]/g, "");
  return digits.length >= 6 && digits.length <= MAX_CODE_LENGTH && /^\d+$/.test(digits) ? digits : "";
}

function CodeEntry({ step, onBack }: { step: Extract<Step, { kind: "code" }>; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [action, setAction] = useState<"verify" | "resend" | null>(null);
  const [error, setError] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const [pasting, setPasting] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const [wait, setWait] = useState(WAIT);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const reset = step.purpose === "reset";
  const updateCode = (value: string) => {
    setCode(value.replace(/\D/g, "").slice(0, MAX_CODE_LENGTH));
    setError("");
    setPasteNote("");
  };
  const acceptPaste = (text: string) => {
    const value = pastedCode(text);
    if (value) updateCode(value);
    setPasteNote(value ? "Code pasted." : "Copy just the one-time code from the email and try again.");
  };
  const paste = async () => {
    const field = codeInput.current;
    if (!field || action || pasting) return;
    const before = field.value;
    setPasting(true);
    setPasteNote("");
    try {
      const text = await navigator.clipboard.readText();
      if (field.isConnected && !field.disabled && field.value === before) acceptPaste(text);
    } catch {
      setPasteNote("You can paste directly into the Code field or type the code.");
    } finally {
      setPasting(false);
    }
    if (field.isConnected) field.focus();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (action || pasting || code.length < 6 || (reset && password.length < 8)) return;
    setAction("verify");
    setError("");
    setPasteNote("");
    try {
      await account().verifyCode(step.email, code, step.purpose);
      if (reset) { await account().setPassword(password); toast("Password changed. You're signed in."); }
      else toast(step.purpose === "signup" ? "Email confirmed. You're signed in." : "Signed in");
    } catch (err: any) {
      setError(err?.message ?? "That code didn't work. Try again.");
    } finally {
      setAction(null);
    }
  };
  const resend = async () => {
    if (action || pasting || wait > 0) return;
    setAction("resend");
    setError("");
    try {
      if (reset) await account().sendResetCode(step.email);
      else if (step.purpose === "signup") await account().resendConfirmation(step.email);
      else await account().sendCode(step.email);
      updateCode("");
      setWait(WAIT);
      toast("A new code is on its way");
    } catch (err: any) { setError(err?.message ?? "Couldn't send a new code."); } finally { setAction(null); }
  };
  return (
    <form className="form account-form" onSubmit={submit}>
      <p>{reset ? "To set a new password, enter" : step.purpose === "signup" ? "To confirm your email, enter" : "Enter"} the code we sent to <strong>{step.email}</strong>. It can take a minute to arrive, so check your spam folder too.</p>
      <div><label className="label" htmlFor="acct-code">Code</label>
        <div className="code-row">
          <input ref={codeInput} id="acct-code" className="input big code-input" inputMode="numeric" autoComplete="one-time-code"
            maxLength={MAX_CODE_LENGTH} value={code} disabled={Boolean(action)} onChange={(e) => updateCode(e.target.value)} onPaste={(e) => {
              e.preventDefault();
              acceptPaste(e.clipboardData.getData("text"));
            }} autoFocus />
          <button type="button" className="btn" disabled={Boolean(action) || pasting} onClick={paste}>Paste code</button>
        </div>
        <div role="status" className="fine">{pasteNote}</div>
      </div>
      {reset && <div><label className="label" htmlFor="acct-newpw">New password</label><PasswordInput id="acct-newpw" value={password} onChange={setPassword} isNew /><p className="fine">At least 8 characters.</p></div>}
      <button type="submit" className="btn big primary" disabled={Boolean(action) || pasting || code.length < 6 || (reset && password.length < 8)}>{action === "verify" ? "Checking…" : reset ? "Set password and sign in" : "Sign in"}</button>
      <div className="action-row">
        <button type="button" className="btn small" disabled={Boolean(action) || pasting || wait > 0} onClick={resend}>{action === "resend" ? "Sending…" : wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
        <button type="button" className="btn small" disabled={Boolean(action)} onClick={onBack}>Use a different email</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function Details({ email, providers }: { email: string; providers: string[] }) {
  const { methods } = useAccount();
  const { guides, notes, highlights, notebook } = useData();
  const sync = useSyncState();
  const [removeHere, setRemoveHere] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteGone, setDeleteGone] = useState(true);
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 8000); return () => clearTimeout(t); }, [confirmDelete]);
  const act = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (e: any) { toast(e?.message ?? "Something went wrong. Try again."); } finally { setBusy(false); } };
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return (
    <div className="form">
      <section>
        <p>Signed in as <strong>{email}</strong>{providers.includes("google") && <> with Google</>}.</p>
        <SyncLine sync={sync} target="account" />
        <p className="fine">{plural(guides.length, "guide")}, {plural(Object.keys(notes).length + notebook.length, "note")} and {plural(Object.keys(highlights).length, "highlight")}. Sign in with this email on any device to see them there.</p>
      </section>

      <section>
        <h2>Family profiles</h2>
        <p className="fine">Set a nickname, age group, and theme for each child or teen.</p>
        <a className="btn" href="#family">Manage family profiles</a>
      </section>

      {methods?.passkeys && <PasskeySettings />}
      <Section title="Password">
        <p className="fine">Set a password to sign in with it as well as with {providers.includes("google") ? "Google or " : ""}an email code.</p>
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (pw.length >= 8) act(async () => { await account().setPassword(pw); setPw(""); toast("Password saved"); }); }}>
          <div><label className="label" htmlFor="acct-setpw">New password</label><PasswordInput id="acct-setpw" value={pw} onChange={setPw} isNew /></div>
          <div><button type="submit" className="btn small primary" disabled={busy || pw.length < 8}>Save password</button></div>
        </form>
      </Section>

      <Section title="Coming from the Claude version?">
        <p className="fine">Open Veritas Logos in Claude, go to Library, then Settings, and choose Back up. Then here, in <a href="#library">Library</a> under Settings, choose Restore or import and pick that file. It's added to your account.</p>
      </Section>

      <Section title="Sign out" open>
        <label className="check-row"><input type="checkbox" checked={removeHere} onChange={(e) => setRemoveHere(e.target.checked)} /> Also remove my data from this browser. Do this on a shared or public device.</label>
        <div><button type="button" className="btn small" disabled={busy} onClick={() => act(() => signOut(removeHere))}>Sign out</button></div>
      </Section>

      <Section title="Delete account">
        <p className="fine">This deletes your account and everything saved in it, on every device, and it can't be undone. Back up first from <a href="#library">Library</a> if you want a copy.</p>
        <label className="check-row"><input type="checkbox" checked={deleteGone} onChange={(e) => setDeleteGone(e.target.checked)} /> Also remove my data from this browser.</label>
        <div>
          {confirmDelete
            ? <button type="button" className="btn small danger" disabled={busy} onClick={() => act(() => deleteAccount(deleteGone))}>Yes, delete my account</button>
            : <button type="button" className="btn small" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account…</button>}
        </div>
      </Section>
    </div>
  );
}

function PasskeySettings() {
  const passkeyPrompt = usePasskeyPrompt();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data, loading, error: listError } = useAsync(async () => account().listPasskeys(), [revision]);
  const reload = () => setRevision((value) => value + 1);
  const change = async (work: () => Promise<boolean>, message: string) => {
    setBusy(true);
    setError("");
    try {
      if (await work()) {
        reload();
        toast(message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Passkeys">
      <p className="fine">Add a passkey to sign in with your device unlock or a security key. You can also sign in with an email code.</p>
      {loading && <p role="status">Loading passkeys…</p>}
      {listError && <div>
        <p className="form-error" role="alert">Your passkeys couldn’t load.</p>
        <button className="btn small" type="button" onClick={reload}>Try again</button>
      </div>}
      {!loading && data?.length === 0 && <p className="fine">You haven't added a passkey yet.</p>}
      {data && data.length > 0 && <ul className="link-list">
        {data.map((key) => {
          const name = key.friendly_name || "Passkey";
          const date = new Date(key.created_at).toLocaleDateString();
          return (
            <li key={key.id} className="action-row">
              <span>{name} <span className="fine">· Added {date}</span></span>
              <button className="btn small" type="button" disabled={busy || loading}
                aria-label={`Remove ${name}, added ${date}`}
                onClick={() => {
                  if (!confirm(`Remove the passkey “${name}” added ${date}?`)) return;
                  void change(async () => { await account().removePasskey(key.id); return true; }, "Passkey removed");
                }}>Remove</button>
            </li>
          );
        })}
      </ul>}
      <button className="btn small primary" type="button" disabled={busy || loading || Boolean(listError)}
        onClick={() => change(() => passkeyPrompt((signal) => account().registerPasskey(signal)), "Passkey added")}>Add a passkey</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Section>
  );
}

function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return <details className="bg-key" open={open}><summary>{title}</summary>{children}</details>;
}

function PrivacyNote() {
  return (
    <details className="bg-key privacy-note">
      <summary>What an account keeps, and where</summary>
      <ul className="fine-list">
        <li>Your settings, study guides, notes, highlights, bookmarks, saved people and searches, and the details of sources you've saved. Files you attach to sources stay only in the browser you attached them in, and so does any API key.</li>
        <li>Your email address, and how you sign in. Signing in with Google shares your name, email address and profile picture, and nothing is posted for you.</li>
        <li>Any family profiles you create store a nickname, an age group and a color theme in your account.</li>
        <li>It's held by Supabase, the account service, on servers in the United States, and only you can open it. Veritas Logos doesn't sell it, share it or use it for ads.</li>
        <li>Deleting your account removes all of it at once. Signing out can remove it from the browser you're using too.</li>
      </ul>
      <p className="fine"><a href="privacy.html">Read the privacy page</a></p>
    </details>
  );
}
