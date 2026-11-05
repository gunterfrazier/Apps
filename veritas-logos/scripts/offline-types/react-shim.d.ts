// Used only by tsconfig.offline.json when @types/react can't be installed. Normal builds use @types/react.
declare module "react" {
  export type ReactNode = any;
  export type CSSProperties = Record<string, string | number | undefined>;
  export type Dispatch<A> = (a: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export interface RefObject<T> { current: T }
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(init: T): RefObject<T>;
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T): T;
  export const Fragment: any;
  export const StrictMode: any;
  export function lazy(fn: () => Promise<any>): any;
  export const Suspense: any;
  export class Component<P = any, S = any> { constructor(props: P); props: P; state: S; setState(s: Partial<S>): void; }
}
declare module "react/jsx-runtime" { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module "react-dom/client" { export function createRoot(el: Element): { render(n: any): void }; }
declare namespace React { type ReactNode = any; }
declare namespace JSX {
  interface IntrinsicElements { [k: string]: any }
  interface ElementChildrenAttribute { children: {} }
  type Element = any;
  interface ElementClass { render(): any }
  interface ElementAttributesProperty { props: {} }
  interface IntrinsicAttributes { key?: any }
}
