import type { PlayerView, RoomView } from '@rcoi/shared';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { winReasonText } from '../game/describe';
import { commands, nameOf } from '../net/store';

export function Winner({ room, view }: { room: RoomView; view: PlayerView }) {
  const isHost = room.hostId === view.you;
  const winner = view.winner;
  const seat = winner ? room.seats.find((s) => s.playerId === winner.player) : null;
  const enough = room.seats.length >= room.minPlayers;

  return (
    <Modal
      title={room.endedByHost && !winner ? 'The court is adjourned' : winner?.player === view.you ? 'Victory!' : 'The court has a winner'}
      className="winner"
      actions={
        <>
          {isHost ? (
            <button className="btn btn--gold" onClick={commands.rematch} disabled={!enough}>
              Rematch
            </button>
          ) : (
            <span className="muted small">Waiting for the host to start a rematch…</span>
          )}
          <button className="btn btn--ghost" onClick={commands.leave}>
            Leave room
          </button>
        </>
      }
    >
      {room.endedByHost && !winner ? (
        <p className="winner__text">The host ended the game. There is no winner.</p>
      ) : (
        winner &&
        seat && (
          <div className="winner__hero">
            <Avatar avatar={seat.avatar} color={seat.color} name={seat.name} size="112px" />
            <p className="winner__name display">{winner.player === view.you ? 'You win!' : `${nameOf(winner.player)} wins!`}</p>
            <p className="winner__text">{winReasonText(winner.reason)}</p>
          </div>
        )
      )}
      {!enough && isHost && <p className="muted small">At least {room.minPlayers} players are needed for a rematch.</p>}
    </Modal>
  );
}
