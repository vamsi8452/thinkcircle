import { useState } from 'react';
import { call, tabStore as store } from '../socket';
import { ErrorNote, Logo } from '../ui';
import { go } from '../App';

export function StudentJoin({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="page">
      <header className="topbar">
        <Logo />
      </header>
      <form
        className="card narrow"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await call<{ token: string }>('student:join', { code, nickname });
            store.set('tc.student', r.token);
            go('/play');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Join a ThinkCircle</h1>
        <label htmlFor="code">Join code</label>
        <input id="code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7} autoComplete="off" required />
        <label htmlFor="nick">Pick a nickname</label>
        <input id="nick" value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={2} maxLength={20} autoComplete="off" required aria-describedby="nick-help" />
        <p id="nick-help" className="help">
          Use a fun nickname, not your real name (like “BlueFox”). 2–20 characters.
        </p>
        <ErrorNote error={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Joining…' : "Let's go"}
        </button>
      </form>
    </main>
  );
}
