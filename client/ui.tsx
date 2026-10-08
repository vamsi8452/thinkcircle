import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Scoreboard as ScoreboardT, Stage } from '../shared/types';
import { STAGES, STAGE_LABELS } from '../shared/types';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <a href="#/" className="logo" aria-label="ThinkCircle home">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--brand)" strokeWidth="4" />
        <circle cx="16" cy="3.5" r="3" fill="var(--accent)" />
        <circle cx="27" cy="22" r="3" fill="var(--accent)" />
        <circle cx="5" cy="22" r="3" fill="var(--accent)" />
        <circle cx="16" cy="16" r="3.5" fill="var(--brand)" />
      </svg>
      <span>ThinkCircle</span>
    </a>
  );
}

export function StageStepper({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  const idx = STAGES.indexOf(stage);
  return (
    <ol className={`stepper ${compact ? 'compact' : ''}`} aria-label={`Stage ${idx + 1} of 5: ${STAGE_LABELS[stage]}`}>
      {STAGES.map((s, i) => (
        <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}>
          <span className="dot" aria-hidden="true">
            {i < idx ? '✓' : i + 1}
          </span>
          {!compact && <span className="label">{STAGE_LABELS[s]}</span>}
        </li>
      ))}
    </ol>
  );
}

const MOVE_LABEL: Record<string, string> = {
  open: 'Opening',
  probe: 'Probe',
  challenge: 'Challenge',
  hint: 'Hint',
  invite: 'Invite',
  connect: 'Connect',
  advance: 'Next stage',
  support: 'Support',
  redirect: 'Redirect',
  language: 'Language',
  'own-words': 'Own words',
  regroup: 'Regroup',
  summary: 'Summary',
  fallback: 'Fallback',
  distress: 'Support (private)',
};

export function ChatLog({
  messages,
  meId,
  teacher = false,
  thinking = false,
  height,
}: {
  messages: ChatMessage[];
  meId?: string;
  teacher?: boolean;
  thinking?: boolean;
  height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking]);
  return (
    <div
      className="chat"
      ref={ref}
      style={{ height }}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
    >
      {messages.map((m) => {
        const mine = m.participantId && m.participantId === meId;
        const cls = ['msg', m.sender, mine ? 'mine' : '', m.status !== 'shown' ? 'muted' : '', m.privateTo ? 'private' : ''].join(' ');
        if (m.sender === 'system') {
          return (
            <div key={m.id} className="msg system">
              {m.text}
            </div>
          );
        }
        const who = m.sender === 'ai' ? 'ThinkCircle' : m.sender === 'teacher' ? 'Teacher' : mine ? 'You' : m.nickname;
        return (
          <div key={m.id} className={cls}>
            <div className="meta">
              <span className="who">{who}</span>
              {teacher && m.move && <span className="tag">{MOVE_LABEL[m.move] ?? m.move}</span>}
              {teacher && m.flag && <span className={`tag flag ${m.status}`}>{m.status === 'shown' ? m.flag : `${m.status}: ${m.flag}`}</span>}
              {m.privateTo && <span className="tag">only {teacher ? 'this student' : 'you'} can see this</span>}
            </div>
            <div className="bubble">{m.text}</div>
            {!teacher && mine && m.status === 'hidden' && <div className="note">Not shared with your group.</div>}
            {mine && m.status === 'held' && <div className="note">Waiting for a safety check…</div>}
            {teacher && m.reason && <div className="note why">Why: {m.reason}</div>}
          </div>
        );
      })}
      {thinking && (
        <div className="msg ai thinking" aria-label="ThinkCircle is thinking">
          <div className="meta">
            <span className="who">ThinkCircle</span>
          </div>
          <div className="bubble">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>{' '}
            thinking…
          </div>
        </div>
      )}
    </div>
  );
}

export function Scoreboard({ board, meId }: { board: ScoreboardT; meId?: string }) {
  return (
    <div className="scoreboard">
      <ol className="teams">
        {board.teams.map((t) => (
          <li key={t.groupId} className={`team rank-${t.rank}`}>
            <div className="team-head">
              <span className="rank" aria-label={`Rank ${t.rank}`}>
                {t.rank === 1 ? '🏆' : `#${t.rank}`}
              </span>
              <h3>{t.name}</h3>
              <span className="score">{t.teamScore} pts</span>
            </div>
            <ul className="badges">
              {t.members.map((m) => (
                <li key={m.id} className={m.id === meId ? 'me' : ''}>
                  <span className="nick">
                    {m.nickname}
                    {m.left && <em> (left early)</em>}
                  </span>
                  <span className="badge">{m.badge}</span>
                </li>
              ))}
            </ul>
            <p className="summary">{t.summary}</p>
          </li>
        ))}
      </ol>
      {board.individual && (
        <section className="individual">
          <h3>Individual points</h3>
          <ol>
            {board.individual.map((r) => (
              <li key={r.nickname}>
                <span>{r.rank}.</span> {r.nickname} <b>{r.points}</b>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`countdown ${left < 120_000 ? 'low' : ''}`} aria-label={`${m} minutes ${s} seconds left`}>
      ⏱ {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}
