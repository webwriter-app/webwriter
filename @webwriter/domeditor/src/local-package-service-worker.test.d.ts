// The test TypeScript program uses DOM libs and imports the worker entry for
// lifecycle coverage, while the worker program supplies service-worker libs.
interface ExtendableMessageEvent extends Event {
  readonly data: any;
  readonly ports: readonly MessagePort[];
  waitUntil(promise: Promise<any>): void;
}

interface ServiceWorkerGlobalScope extends EventTarget {
  readonly indexedDB?: IDBFactory;
  readonly clients: {claim(): Promise<void>};
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void, options?: boolean | AddEventListenerOptions): void;
}
