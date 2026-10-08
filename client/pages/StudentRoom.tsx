import { useEffect, useRef, useState } from 'react';
import type { ScoreEvent, StudentState } from '../../shared/types';
import { STAGES, STAGE_LABELS } from '../../shared/types';
import { call, socket, tabStore as store } from '../socket';
import { ChatLog, Countdown, ErrorNote, Logo, Scoreboard, StageStepper } from '../ui';
import { go } from '../App';

interface Toast {
  id: string;
  kind: 'award' | 'notice';
  text: string;
  points?: number;
}

/** Kid-friendly description of each stage, shown under the stepper. */
const STAGE_HINT: Record<string, string> = {
  hook: 'First guesses: any idea is welcome',
  probe: 'Dig into why',
  challenge: 'Test your ideas against a tricky case',
  construct: 'Put the group’s ideas together',
  consolidate: 'Explain it in your own words',
};

export function StudentRoom({ embedded = false, coach = false }: { embedded?: boolean; coach?: boolean } = {}) {
  const [st, setSt] = useState<StudentState | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [removed, setRemoved] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const pushToast = (t: Toast) => {
    setToasts((x) => [...x.slice(-3), t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), t.kind === 'notice' ? 9000 : 5000);
  };

  useEffect(() => {
    const token = store.get('tc.student');
    if (!token) {
      if (!embedded) go('/join');
      return;
    }
    const resume = () =>
      call<{ state: StudentState }>('student:resume', { token })
        .then((r) => setSt(r.state))
        .catch(() => {
          store.set('tc.student', null);
          if (!embedded) go('/join');
        });
    resume();
    const onState = (s: StudentState) => setSt(s);
    const onAward = (events: ScoreEvent[]) =>
      events.forEach((e) => pushToast({ id: e.id, kind: 'award', points: e.points, text: e.reason }));
    const onNotice = (n: { kind: string; text: string }) => pushToast({ id: `${Date.now()}${Math.random()}`, kind: 'notice', text: n.text });
    const onRemoved = () => {
      store.set('tc.student', null);
      setRemoved(true);
    };
    socket.on('student:state', onState);
    socket.on('student:award', onAward);
    socket.on('student:notice', onNotice);
    socket.on('student:removed', onRemoved);
    socket.on('connect', resume); // NFR-004: rejoin after a dropped connection
    return () => {
      socket.off('student:state', onState);
      socket.off('student:award', onAward);
      socket.off('student:notice', onNotice);
      socket.off('student:removed', onRemoved);
      socket.off('connect', resume);
    };
  }, []);

  if (removed) {
    return (
      <main className="page">
        <header className="topbar">
          <Logo />
        </header>
        <div className="card narrow">
          <h1>You've left this session</h1>
          <p>Your teacher removed you from this session. Ask them if you think this is a mistake.</p>
        </div>
      </main>
    );
  }

  if (!st) {
    return (
      <main className="page">
        <p className="muted-text">Connecting…</p>
      </main>
    );
  }

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    try {
      await call('student:send', { text: t });
      setText('');
      inputRef.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const g = st.group;
  const paused = !!g?.paused;
  const canSend = st.sessionStatus === 'running' && !!g && !paused;

  return (
    <main className={`student ${embedded ? 'embedded' : ''}`}>
      <header className="topbar">
        {!embedded && <Logo size={24} />}
        <div className="topbar-right">
          {g && <span className="team-name">{g.name}</span>}
          <span className="points" aria-label={`You have ${st.me.points} points`}>
            ⭐ {st.me.points}
          </span>
          {g && <span className="points team" aria-label={`Team score ${g.teamScore}`}>👥 {g.teamScore}</span>}
          {st.sessionStatus === 'running' && <Countdown endsAt={st.endsAt} />}
        </div>
      </header>

      {st.sessionStatus === 'waiting' && (
        <section className="waiting card narrow">
          <div className="pulse" aria-hidden="true" />
          <h1>You're in, {st.me.nickname}!</h1>
          <p>Waiting for your teacher to begin. {st.waitingCount} {st.waitingCount === 1 ? 'player has' : 'players have'} joined.</p>
          <p className="muted-text">Today's question: {st.packTitle}</p>
        </section>
      )}

      {st.sessionStatus === 'ended' && st.scoreboard && (
        <section className="card ended">
          <h1>Great thinking today, {st.me.nickname}!</h1>
          <Scoreboard board={st.scoreboard} meId={st.me.id} />
        </section>
      )}

      {st.sessionStatus === 'running' && g && (
        <section className="room">
          <div className="room-head">
            <div>
              <p className="muted-text small">{st.packTitle}</p>
              <StageStepper stage={g.stage} />
              <p className="stage-hint">
                Stage {STAGES.indexOf(g.stage) + 1} of 5: {STAGE_HINT[g.stage]}
              </p>
            </div>
            <ul className="mates" aria-label="Your group">
              {g.members.map((m) => (
                <li key={m.id} className={`${m.id === st.me.id ? 'me' : ''} ${m.left ? 'left' : ''}`}>
                  {m.nickname}
                </li>
              ))}
            </ul>
          </div>
          {paused && (
            <div className="banner" role="status">
              ⏸ Paused by your teacher. You can send messages again when they resume.
            </div>
          )}
          {st.warning && !paused && (
            <div className="banner soft" role="status">
              ⏳ {st.warning}. Start wrapping up your ideas!
            </div>
          )}
          {g.status === 'complete' && (
            <div className="banner good" role="status">
              🎉 Your group finished all five stages! Keep chatting, or wait for your teacher.
            </div>
          )}
          <ChatLog messages={st.messages} meId={st.me.id} thinking={g.thinking} />
          {coach && canSend && (
            <div className="coach" aria-label="Ideas to try">
              <span className="coach-label">Try saying:</span>
              {coachIdeas(st.me.id, g.members).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setText(c.text);
                    inputRef.current?.focus();
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="say" className="sr-only">
              Your message
            </label>
            <textarea
              id="say"
              ref={inputRef}
              rows={2}
              value={text}
              disabled={!canSend}
              maxLength={600}
              placeholder={paused ? 'Paused by your teacher' : `Share your thinking (${STAGE_LABELS[g.stage]})… Try “because…”`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="btn primary" disabled={!canSend || !text.trim()}>
              Send
            </button>
          </form>
          <ErrorNote error={error} />
          <p className="help small">Points come from good thinking, like giving reasons, building on a classmate's idea, and asking good questions. Being fast doesn't earn points.</p>
        </section>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'award' && <b>+{t.points}</b>} {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

function coachIdeas(meId: string, members: { id: string; nickname: string }[]) {
  const peer = members.find((m) => m.id !== meId)?.nickname ?? 'a classmate';
  return [
    { label: '🙋 Ask for the answer', text: 'Can you just tell us the answer?' },
    { label: '💡 Give a reason', text: 'I think it happens because ' },
    { label: `🤝 Build on ${peer}`, text: `I agree with ${peer} because ` },
    { label: '❓ Ask a why question', text: 'Why does that happen, though?' },
    { label: '🔄 Change your mind', text: 'I changed my mind because ' },
  ];
}
