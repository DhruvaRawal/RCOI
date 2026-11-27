# RCOI: Royal Courts of India

An online bluffing card game for 2–5 players. Each player uses their own browser. The
server holds the full game state, and each player only ever receives their own view.

- **Stack:** TypeScript, React 19 + Vite (client), Node + Express + Socket.IO (server), Vitest (tests).
- **Monorepo:** `shared/` (rules engine and data), `server/` (rooms, timers, networking), `client/` (UI only).

---

## 1. Setup and running

You need **Node 20 or newer** (developed on Node 26) and npm.

```powershell
npm install
```

### Development (hot reload)

```powershell
npm run dev
```

This starts the game server on port **3000** and the Vite client on port **5173**. Open
**http://localhost:5173**. Vite forwards the `/socket.io` connection to the server.

### Production build (one process serves everything)

```powershell
npm run build
npm start
```

Open **http://localhost:3000**. The server serves the built client from `client/dist`.
Set `PORT` to use another port.

### Tests

```powershell
npm test            # rules engine + server (about 210 tests)
npm run typecheck   # all three packages
```

---

## 2. Testing with several players

### On one machine

Each **browser tab is a separate player**. The seat token is stored per tab in
`sessionStorage`, so:

1. Open http://localhost:5173 in a tab and **Create a room**.
2. Open more tabs (or a private window) at the invite link `http://localhost:5173/?room=CODE`.
   Join with a different name in each.
3. The host clicks **Begin the court** once 2–5 players are seated.

Reloading a tab puts you back in your seat. Closing a tab disconnects that player. Their
turns then time out (drawing a card), and they can come back with their rejoin code (see below).

**Bots in the lobby.** The host can fill empty seats with computer players. Hover an empty
seat (or tap the "+") to add a bot named `BOT {name}`, then pick **Easy**, **Medium** or
**Hard** from its dropdown, or remove it with ✕. Bots run on the server and decide only from
their own player view, so they never see hidden cards:
- **Easy** plays random legal moves.
- **Medium** plays honestly when it can, saves Vidushaka for its last card, challenges players
  who are close to winning and uses its abilities sensibly.
- **Hard** also counts the cards it can account for, to judge how likely a card is a bluff. It
  challenges only when it's confident or someone is about to win. Over 400 seeded games it
  beat Medium about 76% of the time and Easy about 93%.

Strategies are in `shared/src/bots/strategy.ts`. The bot "thinking" delay is
`timers.botMinMs` / `botMaxMs` in `config.ts`.

**Bot script.** You can also fill seats with random-move bots from the command line. They
connect over Socket.IO like a browser.

```powershell
npm run bots -- --room ABCDE --count 3
```

Options: `--delay 1500` (ms between bot moves) and `--url http://localhost:3000`.

### On a local network

1. Find your computer's IP address. `npm run dev` and `npm start` both print it, for
   example `http://192.168.1.2:5173`.
2. On the other devices, open that address:
   - with `npm run dev`, use port **5173**;
   - with `npm start`, use port **3000**.
3. If other devices can't connect, allow Node.js through the Windows Defender firewall for
   private networks.

### Moving a seat to another device

In the game menu (☰) each player sees a personal **rejoin code**. On the other device,
choose **Rejoin a seat from another device** on the home screen and enter the room code and
the rejoin code. The old tab is disconnected. Keep the code private, because it opens your
hand. Wrong guesses are rate-limited.

---

## 3. Folder structure

```
F:\RCOI
├─ Assets\                     original card art (source; the client uses copies)
├─ package.json                npm workspaces: dev / build / start / test / bots
├─ shared\                     @rcoi/shared - pure, no UI or network code
│  ├─ src\config.ts            ALL tunable values + ruling switches
│  ├─ src\data\cards.ts        card types, counts, names, ability text
│  ├─ src\data\winMatrix.ts    the explicit "beats" table
│  ├─ src\data\players.ts      seat colours, avatar count
│  ├─ src\engine\
│  │  ├─ types.ts              GameState, actions, events, legal actions
│  │  ├─ rng.ts                seeded ChaCha20 generator (serialisable)
│  │  ├─ setup.ts              createGame()
│  │  ├─ reducer.ts            applyAction() / applyTimeout(): (state, action) -> state + events
│  │  ├─ legal.ts              what a player may do, with reasons for disabled actions
│  │  ├─ challenge.ts          challenge reveal + resolution steps
│  │  ├─ turn.ts               clockwise turn passing, auto-pass
│  │  ├─ ops.ts                low-level state operations (draw, give, win check...)
│  │  ├─ rulings.ts            section-5 rulings, each an isolated function
│  │  ├─ view.ts               per-player view + event filtering (the only way state leaves)
│  │  ├─ invariants.ts         card conservation and structural checks
│  │  └─ abilities\            registry.ts + one handler file per ability card
│  ├─ src\protocol.ts          socket event names + zod payload schemas
│  ├─ src\testing\             random bot, scenario builder (tests and dev tools)
│  └─ test\                    engine tests
├─ server\                     @rcoi/server
│  ├─ src\app.ts               Express + Socket.IO; serves client/dist
│  ├─ src\net\handlers.ts      socket handlers (validation, binding sockets to seats)
│  ├─ src\rooms\Room.ts        lobby, seats, colours, avatars, host, rejoin, rematch
│  ├─ src\rooms\RoomManager.ts room codes, lookup
│  ├─ src\game\GameSession.ts  runs the engine, timers, sends filtered updates
│  ├─ scripts\bots.ts          `npm run bots`
│  └─ test\                    rooms, timers, full networked games + leak checks
└─ client\                     @rcoi/client - UI only
   ├─ src\assets\manifest.ts   THE one map from card type -> image
   ├─ src\assets\cards\        copied card art
   ├─ src\avatars\portraits.tsx original SVG portrait set (10)
   ├─ src\net\                 socket + store (update queue, animations)
   ├─ src\game\                turn-UI state machine, log text, preview, countdown
   ├─ src\components\          Card, CardStack, Avatar, Meeple, Modal, Seat, Pile, Hand,
   │                           ActionBar, ChallengeReveal, FlyLayer, Panels (log, rules, prompts)
   ├─ src\screens\             Home, Lobby, Table, Winner
   └─ src\theme\               theme.css (tokens, controls) + game.css (table)
```

---

## 4. How it works

### Rules engine (`shared/`)
- **Pure and deterministic.** `applyAction(state, playerId, action)` and `applyTimeout(state)`
  return a new state and a list of events. They never mutate their input. Randomness comes
  only from `state.rng`, a ChaCha20 stream seeded at `createGame`. The same seed and the same
  actions always give the same game.
- The server seeds each game with 256 random bits. ChaCha20 is used instead of a small PRNG
  so that players can't brute-force the seed from their own cards and recover the deck order.
- **Legality lives in one place.** `legal.ts` both validates actions and produces the
  `LegalActions` sent to the acting player. The client highlights targets and disables
  buttons from that data, with the engine's reason text. It never decides legality itself.

### Hidden information (`shared/src/engine/view.ts`)
The server only sends `toPlayerView(state, player)` and `filterEvent(event, player)`:
- Other players' hands and abilities are sent as **counts only**. Decks are counts only, never their order.
- Face-down pile cards carry **no card id and no type**. The one exception is your own
  **top** cards, which are sent only to you for the "My top cards" toggle.
- **Card ids are random per game** and are only ever sent together with a face the viewer
  may see. A card revealed earlier can't be tracked when it is played face down again.
- Event secrets (drawn cards, the card passed in a give, Mahamantri hands) reach only the players involved.
- The ability discard pile sends a count and the top card only.

Tests check all of this, both on the engine (re-dealing every hidden card must give an
identical view) and on full networked games (every payload each socket received).

### Server
- **Authoritative.** Every action is validated with zod, then by the engine.
- **Timers** live on the server: 45 s per turn and 20 s per follow-up. A challenge reveal
  pauses everything for 4.5 s so everyone can read it. Clients draw the timer rings from the
  server's deadlines, corrected for clock offset.
- **Rejoin.** Each tab has a secret token; a personal rejoin code moves a seat to another device.
- **Disconnects.** After 2 minutes away, a player's timers drop to 5 s. The host can end the
  game with no winner. Seats are never removed mid-game.

---

## 5. Rules and rulings implemented

The rules follow the build prompt. Decisions made with you:

| Topic | Implemented as |
|---|---|
| Challenge eligibility | **Per placement.** A challenged card that stays on its pile can't be challenged again; if it returns to a hand or the deck it is a fresh card. |
| Revealed cards | Stay **face up** when covered; turn face down only when reshuffled (ruling 8). |
| Own face-down cards | Hidden by default; the **My top cards** toggle shows only your current top cards, only to you. |
| Ability discard | Face-up stack showing the top card and a count; not browsable. |
| Chikitsaka window | Opens whenever the caught bluffer holds **any** ability card, so the pause doesn't reveal a Chikitsaka. |
| Disconnects | 5 s timers after 2 min away; host can end the game. |
| Defaults | Lazy deck reshuffle (when a draw is needed); Dandanayaka disabled when nothing can be drawn; a forced single-card give resolves automatically; rematch keeps seats; joining a finished room before a rematch is allowed. |

Rulings 1–11 are in `shared/src/engine/rulings.ts`, one function each. The ones with an
obvious alternative are switches in `shared/src/config.ts` (`GameConfig.rulings`):
`tieWinner`, `mahamantriExchangesAbilities`, `dandanayakaDrawCount`,
`chikitsakaChallengerDrawsAbility`, `reactionWindow`, `uncoveredCardRegainsMeeple`,
`reshuffleCoveredCards`, `dandanayakaNeedsDrawableCards` and `autoResolveForcedGive`. Timers,
hand size, pile count and player limits are also in `config.ts`.

---

## 6. Adding a new ability card

Example: a hypothetical **Rajdoot** card whose effect is "another player draws 1 bluffing card".

1. **Data:** add the type to `ABILITY_TYPES` and an entry to `ABILITY_CARDS` in
   `shared/src/data/cards.ts` (name, count, effect text).
2. **Behaviour:** create `shared/src/engine/abilities/rajdoot.ts` that exports a
   `TurnAbilityHandler` (or a `ReactionAbilityHandler` for out-of-turn cards). It has:
   - `availability(state, player)`: whether it can be used now, the reason if not, and the valid targets;
   - `validate(state, player, params)`: checks the chosen target;
   - `apply(ctx, player, params)`: the effect. Use helpers from `ops.ts` and emit events with `ctx.emit`;
   - `afterUse`: `'discard'` or `'destroy'`; `needs`: `'otherPlayer' | 'ownBluffCard' | 'none'`.
3. **Register** it in `shared/src/engine/abilities/registry.ts`. TypeScript refuses to compile until you do.
4. **Art:** put the image in `client/src/assets/cards/ability/` and map it in
   `client/src/assets/manifest.ts`. Until then a labelled placeholder is drawn.
5. If the effect needs new log text or a confirm sentence, add it in `client/src/game/describe.ts` and
   `client/src/game/turnUI.ts` (`currentStep`).
6. Add tests next to `shared/test/rulings.test.ts`. The random-game tests start using the card automatically.

The turn logic, the server and the networking need no changes.

---

## 7. Card art

`client/src/assets/manifest.ts` is the only place that maps card types to images. The art in
`Assets\` was copied with simple names. `Yuvaraj.jpg` is used as **Yuvaraja**, and
`Raj Bhandari.png` (1057×1488, 3.2 MB) was resized to a 728×1024 JPG like the others. To swap
art, replace the file or change the import. An entry set to `null` shows a labelled placeholder.

---

## 8. Development helpers

These are available in the browser console in dev mode only:

- `__rcoi.autoplay(true)`: this tab plays random legal moves.
- `__rcoi.sandbox('lastcard' | 'nomatch' | 'abilities' | 'reaction' | 'give')`: renders the table for an exact engine scenario, offline, for visual checks.
- `__rcoi.state()`: the client store.
