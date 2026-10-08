# ThinkCircle

**Think it through, together.** ThinkCircle is an AI-facilitated, gamified Socratic group-learning room for students in Grades 7–9. Small groups talk through a science question with an AI guide that **asks questions instead of giving answers**, draws quiet students in by name, and awards points for good thinking, never for speed.

**▶ Live demo: https://thinkcircle.vercel.app** (click *Try it now as a student*, about 2 minutes, works on phones)

> Early prototype. The online demo runs entirely in your browser with simulated classmates; nothing you type is sent to a server.

## What's in the prototype

| | |
|---|---|
| 🎟️ **Join with a nickname** | 6-character class codes, nicknames only (real-looking full names are rejected), balanced groups of 3–6 |
| 🧭 **Socratic AI guide** | Five stages (Hook → Probe → Challenge → Construct → Consolidate). Every AI message is checked by an answer-leak guard before it's shown, and replaced if it gives the answer away |
| 🗣️ **Every voice heard** | Silent students are invited by name after 60s; students who dominate the chat are not targeted; nobody is addressed 3 turns running |
| ⭐ **Points for thinking** | Rubric points for reasoning, building on a classmate, good questions, changing your mind with evidence, explaining to a peer; per-stage cap; all-voices team bonus; badges and a group summary at the end |
| 🛡️ **Safety first** | Bullying, profanity and personal info are hidden with a gentle reminder; distress triggers a private supportive reply and an urgent teacher alert; off-topic or "ignore your rules" attempts are redirected |
| 🧑‍🏫 **Teacher in control** | Live view of every group, engagement states (teacher-only), the *why* behind every AI move, pause/resume, message a group, lock joins, remove a student, change any score (logged), CSV export, delete data |

Three Grade 8 science concept packs are included: Fluids (*Why does a steel ship float?*), Cells (*Why are cells so tiny?*) and Water Systems (*Why is the ocean salty but rain isn't?*).

## Run it locally

```bash
npm install
npm run dev     # http://localhost:5190 (API on :4000)
npm test        # 58 acceptance tests
```

The AI backend is chosen at startup with `AI_PROVIDER=auto|ollama|rules` (default `auto`):
- **ollama**: a local model via [Ollama](https://ollama.com) (`gemma3:4b` by default; set `OLLAMA_MODEL` / `OLLAMA_HOST`). Free, and nothing leaves the machine.
- **rules**: a deterministic facilitator built from the concept pack. No model, instant.

`auto` uses Ollama if it's running, otherwise rules.

## Two ways to run

- **Classroom server** (`npm run build && npm start`): Node + Socket.IO, so students join from their own devices.
- **Browser demo** (`npm run build:demo`, deployed on Vercel): the same engine runs in a SharedWorker, so a teacher tab, student tabs and simulated students on one computer share a session. Deploy with `vercel --prod`.

## Project layout

```
shared/        types shared by client and server
server/core/   pure logic: moderation, signals, scoring, engagement, facilitator, answer guard
server/engine/ session engine (state, timers, audit log)
server/hub.ts  transport-neutral request/event hub
server/ai/     rules + Ollama providers
server/packs/  concept packs
server/sim/    simulated students (demo + tests)
client/        React app (home, guided demo, teacher console, student room)
tests/         acceptance tests, including a 20-session simulation
```

## Tech

TypeScript, React, Vite, Node, Express, Socket.IO, Vitest.
