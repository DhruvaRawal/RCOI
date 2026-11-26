import type { RoomView } from '@rcoi/shared';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { RulesPanel } from '../components/Panels';
import { commands, toast } from '../net/store';

export function Lobby({ room }: { room: RoomView }) {
  const isHost = room.hostId === room.you;
  const n = room.seats.length;
  const canStart = n >= room.minPlayers && n <= room.maxPlayers;
  const [rules, setRules] = useState(false);
  const link = `${location.origin}/?room=${room.code}`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to the clipboard.');
    } catch {
      toast(text);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby__panel panel">
        <p className="muted small lobby__eyebrow">Room code</p>
        <button className="lobby__code display" onClick={() => copy(room.code)} title="Copy the room code">
          {room.code}
        </button>
        <p className="muted small">
          Share the code, or{' '}
          <button className="linklike" onClick={() => copy(link)}>
            copy an invite link
          </button>
          .
        </p>
        <hr className="ornament" />
        <h2 className="lobby__heading">
          Courtiers <span className="muted">({n}/{room.maxPlayers})</span>
        </h2>
        <ul className="lobby__seats">
          {room.seats.map((s) => (
            <li key={s.playerId} className={`lobby__seat${s.connected ? '' : ' is-offline'}`} style={{ ['--pc' as string]: s.color }}>
              <Avatar avatar={s.avatar} color={s.color} name={s.name} size="52px" dim={!s.connected} />
              <span className="lobby__name">
                {s.name}
                {s.playerId === room.you && <span className="muted"> (you)</span>}
              </span>
              {s.isHost && <span className="badge">host</span>}
              {!s.connected && <span className="badge badge--off">reconnecting</span>}
            </li>
          ))}
          {Array.from({ length: room.maxPlayers - n }, (_, i) => (
            <li key={`empty${i}`} className="lobby__seat lobby__seat--empty">
              <span className="lobby__empty-dot" />
              <span className="muted">Empty seat</span>
            </li>
          ))}
        </ul>
        <div className="lobby__actions">
          {isHost ? (
            <button className="btn btn--gold" disabled={!canStart} onClick={commands.start}>
              {canStart ? 'Begin the court' : `Need ${room.minPlayers}–${room.maxPlayers} players`}
            </button>
          ) : (
            <span className="muted">Waiting for the host to begin…</span>
          )}
          <button className="btn btn--ghost" onClick={() => setRules(true)}>
            Rules
          </button>
          <button className="btn btn--ghost" onClick={commands.leave}>
            Leave
          </button>
        </div>
      </div>
      {rules && <RulesPanel onClose={() => setRules(false)} />}
    </div>
  );
}
