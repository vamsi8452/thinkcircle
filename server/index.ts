import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Server } from 'socket.io';
import { rulesProvider, type AiProvider } from './ai/provider.js';
import { createOllamaProvider, ollamaAvailable } from './ai/ollama.js';
import { createHub } from './hub.js';
import { buildReportCsv } from './engine/report.js';

// In dev, Vite owns PORT and proxies to the API on API_PORT; in production one server serves both.
const PORT = Number(process.env.NODE_ENV === 'production' ? (process.env.PORT ?? 4000) : (process.env.API_PORT ?? 4000));
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: false } });

const hub = createHub({
  emit: (room, event, data) => io.to(room).emit(event, data),
  hasListeners: (room) => !!io.sockets.adapter.rooms.get(room)?.size,
  join: (clientId, room) => io.sockets.sockets.get(clientId)?.join(room),
});
const engine = hub.engine;

async function chooseProvider(): Promise<AiProvider> {
  const mode = (process.env.AI_PROVIDER ?? 'auto').toLowerCase();
  if (mode === 'rules') return rulesProvider;
  if (await ollamaAvailable()) return createOllamaProvider();
  if (mode === 'ollama') console.warn('[ai] Ollama not reachable; falling back to rules provider');
  return rulesProvider;
}

io.on('connection', (socket) => {
  socket.onAny(async (event: string, payload: unknown, ack: unknown) => {
    const res = await hub.request(socket.id, socket.handshake.address, event, payload);
    if (typeof ack === 'function') ack(res);
  });
  socket.on('disconnect', () => hub.disconnect(socket.id));
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: engine.aiName }));

function teacherOwns(req: express.Request) {
  const t = engine.teacherFromToken(String(req.query.token ?? ''));
  return !!t && engine.ownsSession(t.id, String(req.params.id));
}

app.get('/api/sessions/:id/report.csv', (req, res) => {
  if (!teacherOwns(req)) return res.status(403).send('Forbidden');
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="thinkcircle-report-${req.params.id}.csv"`);
  res.send(buildReportCsv(engine.teacherState(String(req.params.id))));
});

app.get('/api/sessions/:id/audit.json', (req, res) => {
  if (!teacherOwns(req)) return res.status(403).send('Forbidden');
  res.json(engine.auditLog(String(req.params.id)));
});

const dist = path.resolve(__dirname, '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|socket\.io)).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const provider = await chooseProvider();
engine.setAi(provider);
engine.startTicker();
http.listen(PORT, () => {
  console.log(`ThinkCircle server on http://localhost:${PORT}  ·  AI: ${provider.name}`);
});
