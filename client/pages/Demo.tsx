import { useEffect, useState } from 'react';
import type { PackSummary } from '../../shared/types';
import { call, store, tabStore } from '../socket';
import { ErrorNote, Logo, SiteFooter } from '../ui';
import { StudentRoom } from './StudentRoom';
import { TeacherLive } from './TeacherLive';

// One-click guided demo for students and parents: you + 3 simulated classmates, with the teacher's view alongside.

const FUN_NAMES = ['BlueFox', 'StarGazer', 'RocketRay', 'MapleMoose', 'PixelPanda', 'CometCat', 'LunaLynx', 'TurboTurtle', 'ZipZap', 'NovaKid'];
const PACK_EMOJI: Record<string, string> = { Fluids: '🚢', Cells: '🔬', 'Water Systems': '🌊' };
const DEMO_TEACHER = 'demo.teacher@thinkcircle.demo';

export function Demo() {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [packId, setPackId] = useState('');
  const [nickname, setNickname] = useState(() => FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)]);
  const [sessionId, setSessionId] = useState<string | null>(() => tabStore.get('tc.demoSession'));
  const [ended, setEnded] = useState(false);
  const [view, setView] = useState<'student' | 'teacher'>('student');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ packs: PackSummary[] }>('teacher:packs').then((r) => {
      setPacks(r.packs);
      setPackId((p) => p || r.packs[0]?.id || '');
    });
    // A reload with no other tabs open restarts the in-browser engine, so the old demo is gone.
    if (sessionId) {
      call('teacher:watch', { token: store.get('tc.teacher'), sessionId }).catch(() => reset());
    }
  }, []);

  function reset() {
    tabStore.set('tc.demoSession', null);
    tabStore.set('tc.student', null);
    setSessionId(null);
    setEnded(false);
    setView('student');
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const t = await call<{ token: string; email: string }>('teacher:login', { email: DEMO_TEACHER });
      store.set('tc.teacher', t.token);
      store.set('tc.teacherEmail', t.email);
      const s = await call<{ sessionId: string; code: string }>('teacher:create', { token: t.token, packId, groupSize: 4, durationMin: 10 });
      await call('teacher:addSims', { token: t.token, sessionId: s.sessionId, count: 3, personas: ['eager', 'quiet', 'builder'] });
      const j = await call<{ token: string }>('student:join', { code: s.code, nickname });
      tabStore.set('tc.student', j.token);
      await call('teacher:begin', { token: t.token, sessionId: s.sessionId });
      tabStore.set('tc.demoSession', s.sessionId);
      setSessionId(s.sessionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!sessionId) {
    return (
      <main className="page">
        <header className="topbar">
          <Logo />
          <a className="btn ghost small" href="#/">
            ← Home
          </a>
        </header>
        <form
          className="card demo-intro"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <h1>Try ThinkCircle in 2 minutes</h1>
          <ol className="demo-steps">
            <li>
              <b>Join a small group.</b> Your 3 classmates are practice students run by the computer.
            </li>
            <li>
              <b>Talk it through.</b> The AI guide asks questions to help your group figure it out. It won't just tell you the answer. Try asking it!
            </li>
            <li>
              <b>Earn points for good thinking,</b> like giving reasons and building on a classmate's idea. Being fast earns nothing.
            </li>
          </ol>

          <fieldset>
            <legend>Pick a question to explore</legend>
            <div className="packs">
              {packs.map((p) => (
                <label key={p.id} className={`pack ${packId === p.id ? 'selected' : ''}`}>
                  <input type="radio" name="pack" value={p.id} checked={packId === p.id} onChange={() => setPackId(p.id)} />
                  <span className="pack-emoji" aria-hidden="true">
                    {PACK_EMOJI[p.strand] ?? '💡'}
                  </span>
                  <span className="pack-title">{p.title}</span>
                  <span className="pack-strand">
                    Grade {p.grade} {p.subject} · {p.strand}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="demo-nick">Your nickname</label>
          <input id="demo-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={2} maxLength={20} required autoComplete="off" />
          <p className="help">Use a fun nickname, never your real name.</p>
          <ErrorNote error={error} />
          <button className="btn primary big" disabled={busy || !packId}>
            {busy ? 'Setting up your group…' : '▶ Start the demo'}
          </button>
          <p className="help small">This demo runs entirely in your browser. Nothing you type is sent anywhere.</p>
        </form>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main className="demo">
      <header className="topbar demo-bar">
        <Logo size={24} />
        <span className="pill waiting">Demo</span>
        <div className="topbar-right">
          {!ended && (
            <button
              className="btn small"
              onClick={async () => {
                await call('teacher:end', { token: store.get('tc.teacher'), sessionId }).catch(() => {});
                setEnded(true);
                setView('student');
                window.scrollTo({ top: 0 });
              }}
            >
              🏁 Finish & see results
            </button>
          )}
          <button className="btn ghost small" onClick={reset}>
            ↺ Start over
          </button>
        </div>
      </header>

      <div className="demo-tabs" role="tablist" aria-label="Choose a view">
        <button role="tab" aria-selected={view === 'student'} className={view === 'student' ? 'active' : ''} onClick={() => setView('student')}>
          💬 My view
        </button>
        <button role="tab" aria-selected={view === 'teacher'} className={view === 'teacher' ? 'active' : ''} onClick={() => setView('teacher')}>
          🧑‍🏫 Teacher's view
        </button>
      </div>

      <div className={`demo-grid show-${view}`}>
        <section className="pane student-pane" aria-label="Student view">
          <h2 className="pane-title">💬 You, as a student</h2>
          <StudentRoom embedded coach />
        </section>
        <section className="pane teacher-pane" aria-label="Teacher view">
          <h2 className="pane-title">🧑‍🏫 What the teacher sees</h2>
          <p className="pane-note">
            Only the teacher sees this side: who might be stuck or quiet, <b>why</b> the AI asked each question, and safety alerts. The teacher can
            pause the group or step in at any time.
          </p>
          <TeacherLive sessionId={sessionId} embedded />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
