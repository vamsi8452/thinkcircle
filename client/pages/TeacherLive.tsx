import { useEffect, useMemo, useState } from 'react';
import type { Alert, EngagementState, ScoreEvent, TeacherGroupView, TeacherState } from '../../shared/types';
import { STAGE_LABELS } from '../../shared/types';
import { LOCAL_MODE, call, downloadText, socket } from '../socket';
import { ChatLog, Countdown, ErrorNote, Logo, Scoreboard, StageStepper } from '../ui';
import { useTeacherToken } from './TeacherHome';
import { go } from '../App';

const STATE_LABEL: Record<EngagementState, string> = {
  engaged: 'Engaged',
  confused: 'Confused',
  frustrated: 'Frustrated',
  disengaged: 'Quiet',
  ahead: 'Ahead',
  dominating: 'Dominating',
};

function AlertList({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string) => void }) {
  const open = alerts.filter((a) => !a.acknowledged);
  if (open.length === 0) return null;
  return (
    <section className="alerts" aria-label="Alerts">
      <h2>
        Alerts <span className="count">{open.length}</span>
      </h2>
      <ul>
        {open.slice(0, 8).map((a) => (
          <li key={a.id} className={`alert ${a.level}`} role={a.level === 'urgent' ? 'alert' : undefined}>
            <div>
              <strong>{a.text}</strong>
              {a.excerpt && <blockquote>“{a.excerpt}”</blockquote>}
              <span className="muted-text small">{new Date(a.ts).toLocaleTimeString()}</span>
            </div>
            <button className="btn ghost small" onClick={() => onAck(a.id)}>
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreEditor({ events, nick, onSave }: { events: ScoreEvent[]; nick: (id: string | null) => string; onSave: (id: string, pts: number, reason: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pts, setPts] = useState(0);
  const [reason, setReason] = useState('');
  return (
    <ul className="score-events">
      {[...events].reverse().slice(0, 30).map((e) => (
        <li key={e.id}>
          <span className="who">{nick(e.participantId)}</span>
          <span className="pts">+{e.override?.points ?? e.points}</span>
          <span className="reason">{e.reason}</span>
          {e.override && <span className="tag">changed: {e.override.reason}</span>}
          {editing === e.id ? (
            <form
              className="inline"
              onSubmit={(ev) => {
                ev.preventDefault();
                onSave(e.id, pts, reason);
                setEditing(null);
              }}
            >
              <label className="sr-only" htmlFor={`pts-${e.id}`}>
                Points
              </label>
              <input id={`pts-${e.id}`} type="number" min={0} max={10} value={pts} onChange={(x) => setPts(Number(x.target.value))} />
              <label className="sr-only" htmlFor={`why-${e.id}`}>
                Reason
              </label>
              <input id={`why-${e.id}`} placeholder="Why?" value={reason} onChange={(x) => setReason(x.target.value)} required />
              <button className="btn small">Save</button>
            </form>
          ) : (
            <button
              className="btn ghost small"
              onClick={() => {
                setEditing(e.id);
                setPts(e.override?.points ?? e.points);
                setReason('');
              }}
            >
              Change
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function GroupCard({ g, st, act }: { g: TeacherGroupView; st: TeacherState; act: (event: string, payload: object) => void }) {
  const [text, setText] = useState('');
  const people = st.participants.filter((p) => p.groupId === g.id);
  return (
    <article className={`group-card ${g.paused ? 'paused' : ''} ${g.stalled ? 'stalled' : ''}`} aria-label={g.name}>
      <header>
        <h3>{g.name}</h3>
        <span className="score">{g.teamScore} pts</span>
        {g.status === 'complete' && <span className="pill ended">complete</span>}
        {g.stalled && <span className="pill warn">stalled</span>}
        {g.paused && <span className="pill warn">paused</span>}
      </header>
      <StageStepper stage={g.stage} compact />
      <p className="muted-text small">Stage: {STAGE_LABELS[g.stage]}</p>
      <ul className="members">
        {people.map((p) => (
          <li key={p.id} className={p.left ? 'left' : ''}>
            <span className="nick">
              {p.nickname}
              {p.isSim && <span className="sim" title="Simulated student">sim</span>}
            </span>
            <span className={`state ${p.state}`} title={`Confidence ${Math.round(p.stateConfidence * 100)}%`}>
              {p.left ? 'left' : STATE_LABEL[p.state]}
            </span>
            <span className="pts">{p.points}</span>
            <span className="muted-text small">{p.messageCount} msg</span>
            {st.status !== 'ended' && (
              <button className="icon-btn" aria-label={`Remove ${p.nickname}`} title="Remove from session" onClick={() => confirm(`Remove ${p.nickname} from the session?`) && act('teacher:remove', { participantId: p.id })}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <ChatLog messages={g.messages} teacher thinking={g.thinking} height={300} />
      {st.status === 'running' && (
        <div className="group-actions">
          <form
            className="inline grow"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              act('teacher:message', { groupId: g.id, text });
              setText('');
            }}
          >
            <label className="sr-only" htmlFor={`tm-${g.id}`}>
              Message {g.name}
            </label>
            <input id={`tm-${g.id}`} placeholder={`Message ${g.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn small">Send</button>
          </form>
          <button className="btn small" onClick={() => act('teacher:pause', { groupId: g.id, paused: !g.paused })}>
            {g.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      )}
    </article>
  );
}

export function TeacherLive({ sessionId, embedded = false }: { sessionId: string; embedded?: boolean }) {
  const { token } = useTeacherToken();
  const [st, setSt] = useState<TeacherState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'groups' | 'scores'>('groups');

  useEffect(() => {
    if (!token) {
      go('/teacher');
      return;
    }
    const watch = () =>
      call<{ state: TeacherState }>('teacher:watch', { token, sessionId })
        .then((r) => setSt(r.state))
        .catch((e) => setError(e.message));
    watch();
    const onState = (s: TeacherState) => s.sessionId === sessionId && setSt(s);
    socket.on('teacher:state', onState);
    socket.on('connect', watch);
    return () => {
      socket.off('teacher:state', onState);
      socket.off('connect', watch);
    };
  }, [token, sessionId]);

  const act = (event: string, payload: object = {}) =>
    call(event, { token, sessionId, ...payload }).catch((e) => setError((e as Error).message));

  const nick = useMemo(() => {
    const m = new Map((st?.participants ?? []).map((p) => [p.id, p.nickname]));
    return (id: string | null) => (id ? (m.get(id) ?? '?') : 'Team bonus');
  }, [st?.participants]);

  if (!st) {
    return (
      <main className="page">
        <header className="topbar">
          <Logo />
        </header>
        <ErrorNote error={error} />
        {!error && <p className="muted-text">Loading session…</p>}
      </main>
    );
  }

  const joinUrl = `${window.location.origin}/#/join?code=${st.code}`;
  const urgent = st.alerts.filter((a) => a.level === 'urgent' && !a.acknowledged).length;

  return (
    <main className={`page wide ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <header className="topbar">
          <Logo />
          <div className="topbar-right">
            <a className="btn ghost small" href="#/teacher">
              ← Sessions
            </a>
          </div>
        </header>
      )}

      {!embedded && (
      <section className="live-head card">
        <div className="code-block">
          <span className="muted-text small">{LOCAL_MODE ? 'Students join in another tab with code' : `Join at ${window.location.host} with code`}</span>
          <span className="big-code" aria-label={`Join code ${st.code.split('').join(' ')}`}>
            {st.code}
          </span>
          {LOCAL_MODE ? (
            <a className="btn ghost small" href={`#/join?code=${st.code}`} target="_blank" rel="noopener">
              Open a student tab ↗
            </a>
          ) : (
            <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              Copy join link
            </button>
          )}
        </div>
        <div className="live-info">
          <h1>{st.pack.title}</h1>
          <p className="muted-text">
            Grade {st.pack.grade} {st.pack.subject} · {st.pack.strand} · groups of {st.groupSize} · {st.durationMin} min
          </p>
          <div className="row">
            <span className={`pill ${st.status}`}>{st.status}</span>
            {st.status === 'running' && <Countdown endsAt={st.endsAt} />}
            <span className="muted-text small">{st.participants.length} students</span>
            {urgent > 0 && <span className="pill urgent">{urgent} urgent</span>}
          </div>
        </div>
        <div className="live-actions">
          {st.status === 'waiting' && (
            <button className="btn primary" disabled={st.participants.length === 0} onClick={() => act('teacher:begin')}>
              Begin ({st.participants.length})
            </button>
          )}
          {st.status !== 'ended' && (
            <>
              <button className="btn small" onClick={() => act('teacher:addSims', { count: st.status === 'waiting' ? 5 : 1 })} title="Adds simulated students for demos and testing">
                + {st.status === 'waiting' ? '5 simulated students' : '1 simulated student'}
              </button>
              <button className="btn small" onClick={() => act('teacher:lock', { locked: !st.locked })}>
                {st.locked ? '🔓 Unlock joins' : '🔒 Lock joins'}
              </button>
            </>
          )}
          {st.status === 'running' && (
            <button className="btn danger small" onClick={() => confirm('End the session for every group?') && act('teacher:end')}>
              End session
            </button>
          )}
          {st.status === 'ended' && (
            <>
              <button
                className="btn small"
                onClick={() =>
                  call<{ csv: string }>('teacher:report', { token, sessionId })
                    .then((r) => downloadText(`thinkcircle-report-${st.code}.csv`, r.csv))
                    .catch((e) => setError((e as Error).message))
                }
              >
                Download CSV
              </button>
              <button className="btn small" onClick={() => window.print()}>
                Print
              </button>
              <button
                className="btn danger small"
                onClick={async () => {
                  if (!confirm('Delete this session and all its data? This cannot be undone.')) return;
                  await act('teacher:delete');
                  go('/teacher');
                }}
              >
                Delete data
              </button>
            </>
          )}
        </div>
      </section>
      )}

      <ErrorNote error={error} />
      {st.warnings.length > 0 && <p className="warn-note">{st.warnings.join(' ')}</p>}
      <AlertList alerts={st.alerts} onAck={(id) => act('teacher:ack', { alertId: id })} />

      {st.status === 'waiting' && (
        <section className="card">
          <h2>Waiting room</h2>
          {st.participants.length === 0 ? (
            <p className="muted-text">Waiting for students to join with code {st.code}…</p>
          ) : (
            <ul className="chips">
              {st.participants.map((p) => (
                <li key={p.id}>
                  {p.nickname}
                  {p.isSim && <span className="sim">sim</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {st.status === 'ended' && st.scoreboard && (
        <section className="card">
          <h2>Scoreboard</h2>
          <Scoreboard board={st.scoreboard} />
        </section>
      )}

      {st.groups.length > 0 && (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>
              Groups
            </button>
            <button role="tab" aria-selected={tab === 'scores'} className={tab === 'scores' ? 'active' : ''} onClick={() => setTab('scores')}>
              Points log ({st.scoreEvents.length})
            </button>
          </div>
          {tab === 'groups' ? (
            <section className="group-grid">
              {st.groups.map((g) => (
                <GroupCard key={g.id} g={g} st={st} act={act} />
              ))}
            </section>
          ) : (
            <section className="card">
              <p className="muted-text small">Every award has a reason. Change any score; the change and your reason are logged.</p>
              <ScoreEditor events={st.scoreEvents} nick={nick} onSave={(eventId, points, reason) => act('teacher:adjust', { eventId, points, reason })} />
            </section>
          )}
        </>
      )}

      {!embedded && <footer className="cost muted-text small">
        AI: {st.aiProvider} · {st.aiCost.calls} model calls · {st.aiCost.promptTokens + st.aiCost.outputTokens} tokens · {st.aiCost.fallbacks} fallbacks · est. cost ${st.aiCost.estimatedUsd.toFixed(4)}
        {st.aiCost.calls > 0 && ` · avg ${Math.round(st.aiCost.totalMs / st.aiCost.calls)} ms/call`}
      </footer>}
    </main>
  );
}
