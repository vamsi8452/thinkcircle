import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { TeacherHome } from './pages/TeacherHome';
import { TeacherLive } from './pages/TeacherLive';
import { StudentJoin } from './pages/StudentJoin';
import { StudentRoom } from './pages/StudentRoom';
import { Demo } from './pages/Demo';

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function go(path: string) {
  window.location.hash = path;
}

export function App() {
  const hash = useHash();
  const raw = hash.replace(/^#/, '');
  const path = raw.startsWith('/') ? raw : '/';
  const live = path.match(/^\/teacher\/s\/([\w-]+)/);
  if (live) return <TeacherLive sessionId={live[1]} />;
  if (path.startsWith('/demo')) return <Demo />;
  if (path.startsWith('/teacher')) return <TeacherHome />;
  if (path.startsWith('/join')) return <StudentJoin initialCode={new URLSearchParams(path.split('?')[1] ?? '').get('code') ?? ''} />;
  if (path.startsWith('/play')) return <StudentRoom />;
  return <Home />;
}
