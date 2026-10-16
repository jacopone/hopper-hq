# Hopper HQ — The Lobby design

Date: 2026-10-16
Status: proposed design, pre-implementation. Mockup: `2026-10-16-lobby-mockup.svg`.

## 1. Problem

The building shows who works. On a machine that several people and one orchestrator share, three things happen outside the building and stay invisible:

1. **Who is waiting to come in, and why.** An orchestrator admits each launch through a gate that weighs memory, load, disk, memory pressure, the sessions' share of their memory cap and the pace of launches. A launch the gate refuses waits in a retry loop nobody sees.
2. **How much room each account has left.** Every account has a five-hour and a seven-day allowance. When the one in use runs out, the team changes seat: the next account with margin takes over. Today a band above each prompt says so, inside the session; the building does not.
3. **How close the machine is to its limits.** The sessions share one memory cap; a watchdog pauses sessions and stops launches at 85 % of it. A paused session looks idle from the building.

The building has a ground floor, the Lobby, that is drawn and never used. This design fills it.

## 2. Goals and non-goals

Goals:

- Show the gate: its last verdict, and the launches waiting outside with the reason each one waits.
- Show the seats: one elevator per account, its two allowances as bars, and the turn to take when the one in use is full.
- Show the power: the sessions' memory against their cap, with the watchdog's mark, and the sessions it has paused.
- Show each desk's task id, so the building and the orchestrator's registry name the same thing.
- Keep the core generic: a `Gatekeeper` interface with a provider per orchestrator. The first provider reads the files of ours (Gordon). A demo provider plays the Lobby without one.
- Stay inside the building's visual language: the same robots, tags, panels and colours.

Non-goals:

- Acting on the gate: launching, pausing, resuming, changing seat. The Lobby reads.
- Running the orchestrator's scripts. Its gate script measures by writing to the memory cgroup; the Lobby never runs it. It reads what the orchestrator writes.
- A Lobby without a gatekeeper. With none configured, the façade stays as it is.

## 3. Domain model

Agent-agnostic, in `src/core/types.ts`:

```ts
/** One reading of an allowance window. */
interface Allowance { usedPct: number; resetsAt: number | null; readAt: number }

interface Seat {
  /** The account: an email, or the label the gatekeeper gives it. */
  account: string;
  /** A short name for the cabin's sign ('Leonardo'). */
  name: string;
  session: Allowance | null;   // five hours
  week: Allowance | null;      // seven days
  /** The seat the team uses now. */
  current: boolean;
  /** Over the gatekeeper's limit: the cabin is full. */
  full: boolean;
  /** Readings older than the gatekeeper's staleness window. */
  stale: boolean;
}

type GateReasonKind = 'memory' | 'load' | 'disk' | 'pressure' | 'slice' | 'pacing' | 'rebuild' | 'cap' | 'other';
interface GateReason { kind: GateReasonKind; text: string }

interface GateVerdict { go: boolean; text: string; reasons: GateReason[]; at: number }

/** A launch waiting outside. */
interface Waiting {
  id: string;            // the orchestrator's id for it ('G-270'), unique in the queue
  name: string;
  account: string | null;
  since: number;
  reason: GateReason | null;
}

interface Power {
  usedBytes: number;
  maxBytes: number | null;
  /** The watchdog's mark, as a percentage of maxBytes (85). */
  warnPct: number;
  /** Launches are stopped by the watchdog (the working cap is 0). */
  held: boolean;
  /** Panes of the sessions the watchdog paused and has not released. */
  pausedPanes: string[];
}

interface Lobby {
  doorman: { name: string; sessionId: string | null };   // the orchestrator's own session, when it is in the building
  gate: GateVerdict | null;
  queue: Waiting[];
  seats: Seat[];
  /** The next seat to take when the current one is full; null when every seat is full or unread. */
  turnTo: string | null;
  power: Power | null;
  cap: { working: number; max: number } | null;
  updatedAt: number;
}
```

`Session` gains `task: string | null`: the orchestrator's task id. The scene's `Occupant` and `AttentionEntry` carry it; the desk's nameplate and panel show it.

## 4. Architecture

```
GatekeeperProvider (adapter) ──► Collector.setLobby(lobby) ──► scene.lobby, /api/lobby ──► Facade (L button), LobbyStage, LobbyPanel
```

- **`GatekeeperProvider`** (`src/adapters/gatekeepers/`): `start(emit: (lobby: Lobby) => void)`, `stop()`. It polls its sources every 5 s and emits a whole `Lobby` each time something changed. It also emits `task` events per session (`{ type: 'task'; task: string | null }`), applied only to known sessions, like `pane`.
- **Collector** keeps the latest `Lobby`, tells the listeners when it changes, and includes a summary in the scene.
- **Scene** (`SCENE_VERSION` 7): `BuildingScene.lobby: LobbySummary | null` (counts for the façade label: waiting, seats full, power percentage, held). `GET /api/lobby` serves the `LobbyDetail`: the whole `Lobby` cleaned, plus a fixed plan (§6).
- **Routes**: `#/lobby`, and `#/lobby/seat/<account>` for a seat's panel.
- **Providers**: `gordon` (ours, §5), `demo` (synthetic, for `hopper-hq demo`). Chosen with `--gatekeeper gordon|none` and `HOPPER_HQ_GATEKEEPER`; default `none`. The provider's directory: `--gatekeeper gordon=DIR`, default `~/.local/state/alfred/gordon`.

## 5. The Gordon provider

Read-only. Every file is optional: a missing or unreadable one empties its section of the Lobby and sets nothing else. Parsing is tolerant: unknown fields are ignored.

| Lobby field | Source | Reading |
| --- | --- | --- |
| `gate`, `queue`, `cap.working` | `lobby.json` (new; Gordon writes it, schema below) | As written. `gate.text` is the gate's own line (`VIA: …` / `ASPETTA: …`); `reasons` are split on `;` and classified by keyword (`memoria`→memory, `carico`→load, `disco`→disk, `pressione`→pressure, `slice`→slice, `ultimo avvio`→pacing, `rebuild`→rebuild). |
| `cap.max` | `limits.json` | `sessions_max`. `0` with a watchdog note means launches are held. |
| `power.pausedPanes`, `power.held` | `watchdog-stopgap.log` | The last `WATCHDOG:` line. `pausa mandata a: <panes>` lists the paused panes; a later `pressione passata` line releases them. |
| `power.usedBytes`, `power.maxBytes` | `/sys/fs/cgroup/…/claude.slice/memory.stat`, `memory.max` | `anon + shmem` (what the gate counts; `memory.current` includes page cache the kernel drops by itself) and `memory.max` (`max` → null). `warnPct` 85. |
| `seats` | `seats-accounts.json` (seat → email), `~/.local/state/claude-limits/<email>.json` (readings), `seats.jsonl` (the current seat, last `set`), `seats-order.txt` (the order of turns) | The same rule as the `turni` mod: `full` at 80 %, `stale` after 360 min, `turnTo` is the first seat in order under the limit with fresh readings, or none. The personal account is listed but never a turn. |
| `doorman` | the building | The session whose name is `gordon`, or whose cwd is Gordon's, when it is in the building. |
| `task` per session | the session's name (`^G-\d+`), else `tasks.jsonl` (`sessions[].pane` ↔ the session's pane) | The latest entry wins. |

### `lobby.json`

Gordon writes it on every launch decision and every retry, atomically (write to a temporary file, rename):

```json
{
  "updated_at": "2026-10-16T14:02:11+02:00",
  "gate": { "verdict": "ASPETTA", "text": "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);", "at": "2026-10-16T14:02:11+02:00" },
  "waiting": [
    { "id": "G-270", "name": "G-270 segnali a J", "profile": "leonardo", "since": "2026-10-16T13:58:00+02:00", "reason": "slice delle sessioni al 84% del tetto (watchdog all'85%)" }
  ],
  "working": 6
}
```

`verdict` is `VIA` or `ASPETTA`; `reason` is the first reason of the launch's own last refusal; `profile` maps to an account through the config directories hopper-hq watches.

## 6. The Lobby floor

The Lobby is a floor on the 3D stage, with a fixed plan (no seating: nobody has a desk here):

- **The doors**, on the south wall, in the middle: the building's entrance, two leaves like the elevator's.
- **The queue**, outside the doors, south of the wall: one robot per waiting launch, `still` pose, in the body colour of its repository when known, else grey. A tag over each says its name and, up close, its reason. The first in line stands at the doors.
- **The doorman**: a reception counter just inside the doors, a robot behind it in a cap (the hard hat, recoloured), its tag the gate's last verdict: a green `VIA` line, or a red `ASPETTA` line with the reasons. Without `lobby.json` the tag says `No word from the gate`.
- **The elevators**, along the north wall: one cabin per seat, in seat order, the current seat's doors open. Two vertical bars on the doors, five hours on the left, the week on the right, filled from the bottom, in the state colours (working yellow under 60 %, no-signal amber to 80 %, needs-you red above). A full cabin has a red frame and its sign reads `Turn → <name>`. Stale readings are hatched. The personal account's cabin stands apart, unmarked for turns.
- **The power gauge**, on the east wall: a panel with a horizontal bar, GiB used of max, a red mark at 85 %, and the words `launches held` when the watchdog holds them.
- **The notice board**, on the west wall: `6 / 7 working`, and the paused panes as a list of session names.
- **Paused sessions** on the floors above: the robot sits `resting` at its desk with a `clock` badge, and the desk panel says `Paused by the watchdog`.

The façade's `L · Lobby` label becomes a button, with a meta line like the floors': `3 waiting · 2 seats full · power 72%`. The Lobby's side panel lists the same four sections in words, and is what a browser without WebGL gets.

## 7. Error handling

- A provider that throws stops nothing: the error is logged once per cause, the Lobby keeps its last reading and says how old it is (`read 4 min ago`).
- Readings older than the staleness window are shown faded, never hidden.
- Strings from files are cleaned like everything shown (control and bidi characters removed, lengths capped).
- The provider reads at most one file of each kind per poll, with a size cap per file (1 MB; the watchdog log is read from its tail).

## 8. Testing

- Provider: recorded fixtures of every file, anonymised, with a missing, empty and corrupt variant each; the turn rule against the `turni` mod's own cases.
- Scene: the Lobby summary and detail, cleaning, the version bump, the snapshot.
- UI: the façade button and its meta line; the Lobby panel's four sections; the cabin bars' colours by percentage; the paused badge on a desk.
- Renderer: a smoke test that builds the Lobby floor from the demo provider.

## 9. Milestones

1. **L1 — the data and the panel.** Domain model, `GatekeeperProvider`, the Gordon provider, `/api/lobby`, the façade button, the Lobby panel (2D), the task id on desks. Shown with real data.
2. **L2 — the floor.** The 3D Lobby: doors, queue, doorman, elevators, gauge, board; paused robots upstairs.
3. **L3 — the demo and the proposal upstream.** A demo provider for `hopper-hq demo`; the generic parts (types, scene, renderer, interface, demo) proposed upstream; the Gordon provider stays ours.

## 10. Risks

- `lobby.json` does not exist yet: until Gordon writes it, the gate and the queue are empty and the Lobby shows seats and power only. The schema above is the contract.
- The watchdog log is a human log; its lines may change. The parser reads two patterns and ignores the rest; a change empties the paused list rather than breaking the Lobby.
- The memory figure differs from the watchdog's when they count differently (cache). Both now count `anon + shmem`; the Lobby names its source in the gauge's tooltip.
