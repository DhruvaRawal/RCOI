import { useEffect } from 'react';
import { ALL_CARD_IMAGES } from './assets/manifest';
import { Toasts } from './components/Panels';
import { useStore } from './net/store';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';

export function App() {
  const room = useStore((s) => s.room);
  const view = useStore((s) => s.view);
  const session = useStore((s) => s.session);
  const connected = useStore((s) => s.connected);

  // Preload all card art so flips and reveals never show a blank face.
  useEffect(() => {
    for (const src of ALL_CARD_IMAGES) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  const inGame = !!session && !!room && room.status !== 'lobby' && !!view;

  return (
    <>
      {!session || !room ? <Home /> : room.status === 'lobby' || !view ? <Lobby room={room} /> : <Table room={room} view={view} />}
      {session && !connected && <div className="reconnecting">Reconnecting to the court…</div>}
      <Toasts />
      <div className={`rotate-hint${inGame ? ' is-game' : ''}`}>
        <div>
          <p className="display" style={{ fontSize: '1.6rem' }}>
            Please turn your device
          </p>
          <p className="muted">The royal court is best seen in landscape.</p>
        </div>
      </div>
    </>
  );
}
