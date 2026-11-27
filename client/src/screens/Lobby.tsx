import { BOT_DIFFICULTIES, type BotDifficulty, type RoomView } from '@rcoi/shared';

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
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
              {s.bot &&
                (isHost ? (
                  <>
                    <label className="sr-only" htmlFor={`diff-${s.playerId}`}>
                      Difficulty for {s.name}
                    </label>
                    <select
                      id={`diff-${s.playerId}`}
                      className="lobby__difficulty"
                      value={s.bot}
                      onChange={(e) => void commands.setBotDifficulty(s.playerId, e.target.value as BotDifficulty)}
                    >
                      {BOT_DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {DIFFICULTY_LABEL[d]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn--ghost btn--icon btn--small lobby__remove"
                      onClick={() => void commands.removeBot(s.playerId)}
                      title={`Remove ${s.name}`}
                      aria-label={`Remove ${s.name}`}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span className="badge badge--bot">bot · {DIFFICULTY_LABEL[s.bot]}</span>
                ))}
            </li>
          ))}
          {Array.from({ length: room.maxPlayers - n }, (_, i) =>
            isHost ? (
              <li key={`empty${i}`} className="lobby__seat lobby__seat--empty lobby__seat--addable">
                <button className="lobby__add" onClick={() => void commands.addBot()} aria-label="Add a bot to this seat">
                  <span className="lobby__empty-dot">
                    <span className="lobby__plus" aria-hidden="true">
                      +
                    </span>
                  </span>
                  <span className="lobby__add-text muted">
                    <span className="lobby__add-idle">Empty seat</span>
                    <span className="lobby__add-hover">Add a bot</span>
                  </span>
                </button>
              </li>
            ) : (
              <li key={`empty${i}`} className="lobby__seat lobby__seat--empty">
                <span className="lobby__empty-dot" />
                <span className="muted">Empty seat</span>
              </li>
            ),
          )}
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
