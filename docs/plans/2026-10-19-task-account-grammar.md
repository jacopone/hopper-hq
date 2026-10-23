# Hopper HQ — tasks, accounts and the orchestrator in the building

Date: 2026-10-19
Status: implemented on the façade, the panel and the 3D desks; the 3D Lobby floor (L2) is not built. Sheet: `2026-10-19-task-session-account-grammar-light.png`.

## 1. Problem

An orchestrator hands out units of work (tasks, `G-nnn`). A task is not one session: it can run in several sessions, in different repositories and floors, at once or one after the other; each session can run subagents. Two further facts have no place in the building: the account a session runs under (amatino, the farm, a person's own), and the orchestrator's own role (it admits launches and sends each task to a seat).

## 2. The grammar

Characters encode information (design 2026-10-09 §10). The channels in use stay as they are; two are added.

| Concept | Drawn as | State |
| --- | --- | --- |
| Repository | body colour, rug | unchanged |
| Session | robot at a desk; state is pose, badge, window colour | unchanged |
| Subagent | intern: small, on a jetpack, hovering by the desk (3, then `+N`); a crew gets a room | unchanged |
| Workflow run | meeting room; agents in hard hats | unchanged |
| Task | tie colour, equal on every robot of the task on every floor; id on the tag | added; the tie is free in floors-by-repository mode |
| Organisation | lanyard colour on the chest; letter chip on the tag and in the panel | added |
| Orchestrator | cap, headset and clipboard; the hard hat stays the workflow agent's | added kind |
| Task waiting | robot in line outside the doors, holding its brief (a folder), in its task's tie and its organisation's lanyard | extends the queue |
| Gate refusal | needs badge | unchanged |

## 3. Task

- A session's tie is its feature's colour; a session with no feature wears its task's colour (`slotOf(task, FEATURE_SLOTS)`). In floors-by-repository mode no branch makes a feature, so every orchestrated session wears its task's colour.
- A waiting task wears the colour of its id: the robot keeps its tie when it is admitted.
- Hovering a desk on the façade rings every desk of the same task, on every floor, and joins them with a thread.
- The Lobby panel lists the tasks waiting (turned away, ready) and the tasks with a session in the building; each live task is a card with its sessions as robots and its subagent count. A robot opens its desk.
- The board lists only what waits at the door or has a session in the building. The orchestrator's registry also holds tasks whose status says they work or wait for the owner and that have no live session; they are not drawn.
- The tie has 8 slots: two live tasks can share one. The id on the tag and the ring tell them apart.

## 4. Organisation

An account's organisation comes from its email's domain (`orgOfAccount`): `amatino.ai` and its subdomains, `tenutalarnianone.com`, a public mail provider (personal), any other domain (other). An account that is not an email (a config directory's label) has none, and no lanyard.

A waiting task's organisation is the orchestrator's area for it (`amatino`, `tenuta`, `personali`) when `lobby.json` gives one, else the account of the profile it asked for.

Colours (`--org-*`), day and night:

| Organisation | Day | Night |
| --- | --- | --- |
| amatino | `#1F4FD8` | `#4D7BFF` |
| tenuta | `#F26B1D` | `#FF8A3D` |
| personal | `#F4F1E8` | `#F4F1E8` |
| other | `#2B303B` | `#8C94A6` |

The three main colours stay apart under protan, deutan and tritan simulation (CIELAB distance, day: smallest 58.9; night: 51.2). The state, repo and feature palettes use most of the hue circle, so the organisation sits on a small separate channel (the lanyard) and carries a letter on the tag and in the panel.

## 5. Orchestrator

The doorman is the orchestrator's own robot: cap, headset, clipboard. At the door it admits; its tag is the gate's verdict. Dispatch to a seat (an elevator whose cabin wears the account's organisation colour) belongs to the 3D Lobby floor.

## 6. Data

- Session: `task`, `account` (existing).
- `lobby.json` `waiting[]`: `id`, `name`, `profile`, `since`, `reason`, `kind`, and optional `area`, `repo`. When `lobby.json` gives neither, the Gordon provider reads them from `tasks.jsonl` (the last word on each task; the area of the repository when none is written, as the registry does). The repository colours a waiting robot's body: its own name, or the one repository whose name starts or ends with it, or has its initials; the task's name is the last resort.
- Scene: `Robot.tie` and `Robot.org`; `Occupant.org`; `FacadeWindow.task`; `LobbySummary.queue[]` with `tie` and `org`; `LobbyDetail.tasks[]` and `seats[].org`.

## 7. Failure modes

- A task name that begins with a word fitting several repositories, or a repository name shared by two roots, colours no body: the robot is grey.
- An account that is not an email has no lanyard.
- The queue shows the first 8 launches; the rest are a group with a count.
- Subagents and workflow agents wear no lanyard and the tie of their host (its feature's, else its task's).
- The panel's robots and the façade's rings use the task's colour; in feature-floor mode a session whose 3D robot wears its feature's tie differs from them.
- The task ring on the façade follows the pointer only; the Lobby board is the keyboard's way to a task's desks.
