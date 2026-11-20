/** What the website's account file (dist/account.js) offers the app. The app imports only these types. */

/** A store of documents, as the page's private database in Claude and the website's accounts both provide. */
export interface CloudCollection {
  get(): Promise<{ docs: { id: string; data(): any }[] }>;
  doc(id: string): { set(value: unknown): Promise<unknown>; delete(): Promise<unknown> };
  /** Several writes in as few requests as possible, where the store can do that. */
  setMany?(entries: [string, unknown][]): Promise<unknown>;
  deleteMany?(ids: string[]): Promise<unknown>;
}

export interface AccountConfig { url: string; key: string; redirectTo: string }
export interface AccountUser { id: string; email: string; providers: string[]; createdAt?: string }
/** Which ways of signing in the site has switched on, read from the account service's public settings. */
export interface SignInMethods { google: boolean; email: boolean; signup: boolean; confirmEmail: boolean }

export interface AccountApi {
  /** Settles once any sign-in the address carried back (from Google or an email link) has been handled. */
  ready: Promise<{ user: AccountUser | null; error: string }>;
  onChange(listener: (user: AccountUser | null) => void): () => void;
  user(): AccountUser | null;
  methods(): Promise<SignInMethods>;
  collection: CloudCollection;
  sendCode(email: string, create?: boolean): Promise<void>;
  verifyCode(email: string, code: string, purpose?: "signin" | "signup" | "reset"): Promise<AccountUser | null>;
  google(returnHash: string): Promise<void>;
  /** Sends the code that confirms a new password account's email again. */
  resendConfirmation(email: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ user: AccountUser | null; needsCode: boolean }>;
  signInWithPassword(email: string, password: string): Promise<AccountUser | null>;
  sendResetCode(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

export type AccountModule = { createAccount(config: AccountConfig): AccountApi; friendlyError(e: unknown): string };
