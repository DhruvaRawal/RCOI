import { ROOM_CONFIG } from '@rcoi/shared';
import { type FormEvent, useState } from 'react';
import { PortraitSvg } from '../avatars/portraits';
import { Card } from '../components/Card';
import { nameStore } from '../net/socket';
import { commands, useStore } from '../net/store';

export function Home() {
  const connected = useStore((s) => s.connected);
  const busy = useStore((s) => s.busy);
  const closedReason = useStore((s) => s.closedReason);
  const [name, setName] = useState(nameStore.load());
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [rejoin, setRejoin] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(() => commands.create(name));
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    void run(() => commands.join(code, name));
  };
  const resume = (e: FormEvent) => {
    e.preventDefault();
    void run(() => commands.resumeWithCode(code, rejoinCode));
  };

  return (
    <div className="home">
      <div className="home__art" aria-hidden="true">
        <Card kind="bluff" type="RANI" width="min(16vw, 150px)" previewable={false} className="home__card home__card--l" />
        <Card kind="bluff" type="RAJA" width="min(18vw, 170px)" previewable={false} className="home__card home__card--c" />
        <Card kind="bluff" type="VIDUSHAKA" width="min(16vw, 150px)" previewable={false} className="home__card home__card--r" />
      </div>
      <div className="home__panel panel">
        <h1 className="home__title">RCOI</h1>
        <p className="home__subtitle display">Royal Courts of India</p>
        <p className="muted small home__tag">A game of bluffing for 2–5 courtiers. Each player uses their own device.</p>
        <hr className="ornament" />
        {closedReason && <p className="error-text">{closedReason}</p>}
        {!connected && <p className="muted small">Connecting to the court…</p>}

        <label className="field">
          Your name
          <input
            className="input"
            value={name}
            maxLength={ROOM_CONFIG.maxNameLength}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chanakya"
            autoComplete="nickname"
          />
        </label>

        {!rejoin ? (
          <>
            <form onSubmit={create} className="home__row">
              <button className="btn btn--gold home__wide" disabled={!connected || busy || !name.trim()}>
                Create a room
              </button>
            </form>
            <div className="home__or">
              <span>or join a friend</span>
            </div>
            <form onSubmit={join} className="home__row">
              <input
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                maxLength={8}
                aria-label="Room code"
              />
              <button className="btn btn--teal" disabled={!connected || busy || !name.trim() || code.trim().length < 3}>
                Join
              </button>
            </form>
            <button className="btn btn--ghost btn--small home__link" onClick={() => setRejoin(true)}>
              Rejoin a seat from another device
            </button>
          </>
        ) : (
          <form onSubmit={resume} className="home__rejoin">
            <p className="small muted">Enter the room code and the personal rejoin code shown in your game menu.</p>
            <div className="home__row">
              <input
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ROOM"
                maxLength={8}
                aria-label="Room code"
              />
              <input
                className="input input--code"
                value={rejoinCode}
                onChange={(e) => setRejoinCode(e.target.value.toUpperCase())}
                placeholder="REJOIN"
                maxLength={12}
                aria-label="Rejoin code"
              />
            </div>
            <div className="home__row">
              <button className="btn btn--teal home__wide" disabled={!connected || busy || !code || !rejoinCode}>
                Rejoin my seat
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setRejoin(false)}>
                Back
              </button>
            </div>
          </form>
        )}
        <p className="error-text" role="alert">
          {error}
        </p>
        <div className="home__court" aria-hidden="true">
          {[0, 1, 4, 5, 6].map((i) => (
            <span key={i} className="home__face">
              <PortraitSvg index={i} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
