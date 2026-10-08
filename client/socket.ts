// Two transports, same API:
// - server mode (default): Socket.IO to the Node server (multi-device).
// - local mode (VITE_TRANSPORT=local, used for the Vercel demo): a SharedWorker runs the engine in the browser.

type Handler = (data: any) => void;

interface Transport {
  on(event: string, fn: Handler): void;
  off(event: string, fn: Handler): void;
  request(event: string, payload: object): Promise<any>;
}

export const LOCAL_MODE = import.meta.env.VITE_TRANSPORT === 'local';

function createEmitter() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event: string, fn: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    },
    off(event: string, fn: Handler) {
      handlers.get(event)?.delete(fn);
    },
    fire(event: string, data?: unknown) {
      handlers.get(event)?.forEach((fn) => fn(data));
    },
  };
}

function localTransport(): Transport {
  const em = createEmitter();
  const pending = new Map<number, (res: unknown) => void>();
  let seq = 0;
  let port: MessagePort;
  if (typeof SharedWorker !== 'undefined') {
    const w = new SharedWorker(new URL('./hub.worker.ts', import.meta.url), { type: 'module', name: 'thinkcircle-hub' });
    port = w.port;
  } else {
    // Single-tab fallback: run the hub on this page.
    const ch = new MessageChannel();
    port = ch.port1;
    void import('./hub.worker').then((m) => m.attach(ch.port2));
  }
  port.onmessage = (e: MessageEvent) => {
    const msg = e.data as { type: string; id?: number; res?: unknown; event?: string; data?: unknown };
    if (msg.type === 'reply' && msg.id !== undefined) {
      pending.get(msg.id)?.(msg.res);
      pending.delete(msg.id);
    } else if (msg.type === 'event' && msg.event) em.fire(msg.event, msg.data);
  };
  port.start();
  window.addEventListener('pagehide', () => port.postMessage({ type: 'bye' }));
  return {
    on: em.on,
    off: em.off,
    request(event, payload) {
      return new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        port.postMessage({ type: 'request', id, event, payload });
      });
    },
  };
}

function socketTransport(): Transport {
  const em = createEmitter();
  let sock: any;
  const queue: (() => void)[] = [];
  import('socket.io-client').then(({ io }) => {
    sock = io({ transports: ['websocket', 'polling'] });
    sock.onAny((event: string, data: unknown) => em.fire(event, data));
    sock.on('connect', () => em.fire('connect'));
    queue.splice(0).forEach((f) => f());
  });
  const whenReady = (f: () => void) => (sock ? f() : queue.push(f));
  return {
    on: em.on,
    off: em.off,
    request(event, payload) {
      return new Promise((resolve) => whenReady(() => sock.emit(event, payload, resolve)));
    },
  };
}

const transport: Transport = LOCAL_MODE ? localTransport() : socketTransport();

export const socket = { on: transport.on, off: transport.off };

export type Reply<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

/** Request with an acknowledgement, as a promise. Rejects with the server's error message. */
export function call<T = Record<string, unknown>>(event: string, payload: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server did not respond. Check your connection.')), 10_000);
    transport.request(event, payload).then((res: Reply<T>) => {
      clearTimeout(timer);
      if (res && res.ok) resolve(res as T);
      else reject(new Error((res as { error?: string })?.error ?? 'Something went wrong.'));
    });
  });
}

function makeStore(kind: 'local' | 'session') {
  const s = () => (kind === 'local' ? localStorage : sessionStorage);
  return {
    get(key: string): string | null {
      try {
        return s().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string | null) {
      try {
        if (value === null) s().removeItem(key);
        else s().setItem(key, value);
      } catch {
        /* storage unavailable: still works, just without auto-rejoin */
      }
    },
  };
}

/** Teacher sign-in survives tabs; student identity is per tab so several students can share one computer. */
export const store = makeStore('local');
export const tabStore = makeStore('session');

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
