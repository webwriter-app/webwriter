// TypeScript's DOM lib does not include service-worker-specific globals.
interface ExtendableMessageEvent extends Event {
  readonly data: any;
  readonly ports: readonly MessagePort[];
  waitUntil(promise: Promise<any>): void;
}

interface ServiceWorkerGlobalScope extends EventTarget {
  readonly clients: Clients;
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void, options?: boolean | AddEventListenerOptions): void;
}

interface Clients {claim(): Promise<void>}
