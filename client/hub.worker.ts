/// <reference lib="webworker" />
// Browser demo mode: the whole engine runs here, shared by every tab on this computer.
import { createHub } from '../server/hub';
import { rulesProvider } from '../server/ai/provider';

interface Client {
  id: string;
  port: MessagePort;
  rooms: Set<string>;
}

const clients = new Map<string, Client>();
let n = 0;

const hub = createHub(
  {
    emit(room, event, data) {
      for (const c of clients.values()) if (c.rooms.has(room)) c.port.postMessage({ type: 'event', event, data });
    },
    hasListeners: (room) => [...clients.values()].some((c) => c.rooms.has(room)),
    join: (clientId, room) => clients.get(clientId)?.rooms.add(room),
  },
  { ai: { ...rulesProvider, name: 'rules (in-browser demo)' } },
);
hub.engine.startTicker();

function attach(port: MessagePort) {
  const client: Client = { id: `c${++n}`, port, rooms: new Set() };
  clients.set(client.id, client);
  port.onmessage = async (e: MessageEvent) => {
    const msg = e.data as { type: string; id?: number; event?: string; payload?: unknown };
    if (msg.type === 'bye') {
      clients.delete(client.id);
      hub.disconnect(client.id);
      return;
    }
    if (msg.type === 'request' && msg.event) {
      const res = await hub.request(client.id, 'local', msg.event, msg.payload);
      port.postMessage({ type: 'reply', id: msg.id, res });
    }
  };
  port.start();
  port.postMessage({ type: 'event', event: 'connect' });
}

const scope = self as unknown as { onconnect: ((e: MessageEvent) => void) | null; onmessage: ((e: MessageEvent) => void) | null };
// SharedWorker: one port per tab.
scope.onconnect = (e: MessageEvent) => attach(e.ports[0]);
// Exported for the single-tab fallback when SharedWorker isn't supported.
export { attach };
