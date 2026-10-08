import { useState } from 'react';
import { Logo } from '../ui';
import { go } from '../App';
import { LOCAL_MODE } from '../socket';

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function Home() {
  const [code, setCode] = useState('');
  return (
    <main className="home">
      <header className="topbar">
        <Logo />
        <nav className="topbar-right" aria-label="Main">
          <button className="btn ghost small" onClick={() => scrollToId('how')}>
            How it works
          </button>
          <button className="btn ghost small" onClick={() => scrollToId('parents')}>
            For parents
          </button>
          <a className="btn ghost small" href="#/teacher">
            Teachers
          </a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">For Grades 7–9 · Science</p>
        <h1>
          Think it through, <span className="hl">together.</span>
        </h1>
        <p className="lede">
          ThinkCircle puts students in small groups with an AI guide that <b>asks questions instead of giving answers</b>. Everyone gets a voice,
          and points go to good thinking, not to being fastest.
        </p>
        <div className="cta-row">
          <button className="btn primary big" onClick={() => go('/demo')}>
            ▶ Try it now as a student
          </button>
          <span className="muted-text small">2 minutes · no sign-up · works on phones</span>
        </div>
      </section>

      <section id="how" className="how">
        <h2>How it works</h2>
        <ol className="how-steps">
          <li className="card">
            <span className="step-icon" aria-hidden="true">
              🎟️
            </span>
            <h3>1. Join with a nickname</h3>
            <p>Students enter a class code and a fun nickname. No email, no real name, no photos.</p>
          </li>
          <li className="card">
            <span className="step-icon" aria-hidden="true">
              🧭
            </span>
            <h3>2. The AI guide asks, never tells</h3>
            <p>It asks questions that help the group reason its way to the idea, and it draws in quiet students by name.</p>
          </li>
          <li className="card">
            <span className="step-icon" aria-hidden="true">
              ⭐
            </span>
            <h3>3. Points for thinking</h3>
            <p>Giving reasons, building on a classmate's idea and asking good questions earn points. Speed never does.</p>
          </li>
          <li className="card">
            <span className="step-icon" aria-hidden="true">
              🧑‍🏫
            </span>
            <h3>4. The teacher stays in charge</h3>
            <p>Teachers see every group live, can pause or join any chat, and see why the AI asked each question.</p>
          </li>
        </ol>
      </section>

      <section id="parents" className="card parents">
        <h2>For parents: safety and privacy</h2>
        <ul className="checklist">
          <li>Students use a nickname only. We don't ask for names, emails, birthdays, photos or voice.</li>
          <li>Every message is checked for safety before anyone sees it. Unkind words and personal details (like phone numbers) are hidden.</li>
          <li>If a student seems upset or unsafe, the teacher gets an urgent alert straight away.</li>
          <li>We never guess feelings from faces or voices. There's no camera or microphone.</li>
          <li>A teacher is in the room and can see and pause every conversation.</li>
        </ul>
        <p className="muted-text small">
          ThinkCircle is an early prototype.{LOCAL_MODE && ' In this online demo, everything runs inside your own browser and nothing you type is sent anywhere.'}
        </p>
      </section>

      <section className="cards classroom">
        <form
          className="card join-card"
          onSubmit={(e) => {
            e.preventDefault();
            go(`/join?code=${encodeURIComponent(code.trim())}`);
          }}
        >
          <h2>Have a class code?</h2>
          <label htmlFor="home-code">Join code</label>
          <input
            id="home-code"
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={7}
            autoComplete="off"
            placeholder="ABC123"
            aria-describedby="home-code-help"
          />
          <p id="home-code-help" className="help">
            {LOCAL_MODE ? 'In this demo, codes work in tabs on the same computer as the teacher.' : 'Your teacher will show the code.'}
          </p>
          <button className="btn" type="submit">
            Join
          </button>
        </form>
        <div className="card">
          <h2>Teachers</h2>
          <p>Start a session from a Grade 8 science concept pack, add practice students, and watch the groups live.</p>
          <button className="btn" onClick={() => go('/teacher')}>
            Open teacher console
          </button>
        </div>
      </section>
    </main>
  );
}
