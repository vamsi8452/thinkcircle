import { useEffect, useState } from 'react';
import type { PackSummary } from '../../shared/types';
import { call, socket, store } from '../socket';
import { ErrorNote, Logo } from '../ui';
import { go } from '../App';

interface SessionRow {
  id: string;
  code: string;
  status: string;
  packTitle: string;
  createdAt: number;
  students: number;
}

export function useTeacherToken() {
  const [token, setToken] = useState<string | null>(() => store.get('tc.teacher'));
  const [email, setEmail] = useState<string | null>(() => store.get('tc.teacherEmail'));
  return {
    token,
    email,
    signIn(t: string, e: string) {
      store.set('tc.teacher', t);
      store.set('tc.teacherEmail', e);
      setToken(t);
      setEmail(e);
    },
    signOut() {
      store.set('tc.teacher', null);
      store.set('tc.teacherEmail', null);
      setToken(null);
      setEmail(null);
    },
  };
}

function SignIn({ onDone }: { onDone: (token: string, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await call<{ token: string; email: string }>('teacher:login', { email });
          onDone(r.token, r.email);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1>Teacher sign-in</h1>
      <label htmlFor="t-email">School email</label>
      <input id="t-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <p className="help">Prototype sign-in. Google and email-link sign-in come before the pilot.</p>
      <ErrorNote error={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Continue'}
      </button>
    </form>
  );
}

export function TeacherHome() {
  const auth = useTeacherToken();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [packId, setPackId] = useState('');
  const [groupSize, setGroupSize] = useState(4);
  const [duration, setDuration] = useState(20);
  const [showInd, setShowInd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) return;
    const load = () => {
      call<{ packs: PackSummary[]; aiProvider: string }>('teacher:packs').then((r) => {
        setPacks(r.packs);
        setAiProvider(r.aiProvider);
        setPackId((p) => p || r.packs[0]?.id || '');
      });
      call<{ sessions: SessionRow[] }>('teacher:sessions', { token: auth.token })
        .then((r) => setSessions(r.sessions))
        .catch(() => auth.signOut());
    };
    load();
    socket.on('connect', load);
    return () => {
      socket.off('connect', load);
    };
  }, [auth.token]);

  if (!auth.token) {
    return (
      <main className="page">
        <header className="topbar">
          <Logo />
        </header>
        <SignIn onDone={auth.signIn} />
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <span className="muted-text">{auth.email}</span>
          <button className="btn ghost small" onClick={auth.signOut}>
            Sign out
          </button>
        </div>
      </header>

      <form
        className="card create"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const r = await call<{ sessionId: string }>('teacher:create', { token: auth.token, packId, groupSize, durationMin: duration, showIndividualRankings: showInd });
            go(`/teacher/s/${r.sessionId}`);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <h1>Start a session</h1>
        <fieldset>
          <legend>Concept pack</legend>
          <div className="packs">
            {packs.map((p) => (
              <label key={p.id} className={`pack ${packId === p.id ? 'selected' : ''}`}>
                <input type="radio" name="pack" value={p.id} checked={packId === p.id} onChange={() => setPackId(p.id)} />
                <span className="pack-strand">
                  Grade {p.grade} {p.subject} · {p.strand}
                </span>
                <span className="pack-title">{p.title}</span>
                <span className="pack-goal">{p.learningGoal}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <div className="field">
            <label htmlFor="gs">Group size</label>
            <select id="gs" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} students
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="dur">
              Duration: <b>{duration} min</b>
            </label>
            <input id="dur" type="range" min={10} max={40} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <label className="check">
            <input type="checkbox" checked={showInd} onChange={(e) => setShowInd(e.target.checked)} /> Show individual rankings at the end
          </label>
        </div>
        <ErrorNote error={error} />
        <div className="row end">
          <span className="muted-text small">AI: {aiProvider}</span>
          <button className="btn primary" disabled={!packId}>
            Start session
          </button>
        </div>
      </form>

      {sessions.length > 0 && (
        <section className="card">
          <h2>Your sessions</h2>
          <ul className="session-list">
            {[...sessions].reverse().map((s) => (
              <li key={s.id}>
                <a href={`#/teacher/s/${s.id}`}>
                  <span className="mono">{s.code}</span> {s.packTitle}
                </a>
                <span className={`pill ${s.status}`}>{s.status}</span>
                <span className="muted-text small">{s.students} students</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
