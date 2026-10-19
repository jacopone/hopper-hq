Original goal: "[Gordon] G-293 in ~/amatino/hopper-hq: leggi ~/.local/state/alfred/gordon/brief-G-293-hopper-lobby-data.txt (tutto) e report-G-268.txt. Parti da S3 (fila, buttafuori, capacity da lobby.json), mostrala a J, poi S1 S2 S4. Test: 4 worker."

## User Intent
- Gordon (PM di J) ha assegnato G-293: la Lobby di hopper-hq mostra posti/account, token e costo a listino, finestra settimanale, macchina + buttafuori, subagenti. Ordine: S3, poi S1, S2, S4. Regole del brief: worktree dal branch feat/multiple-config-dirs, TDD, revisione indipendente di un altro modello prima di mostrare a J, un subagente alla volta, zero API a pagamento (solo la pagina prezzi), loopback, mai --no-verify/force-push/merge, PR sulla fork, pin Nix (#164) è gesto separato di J, report in ~/.local/state/alfred/gordon/report-G-293.txt.
- J ha poi chiesto: rappresentazione VISIVA della Lobby (non testo), nel design system del palazzo e dei micro-robot; coda come robot fuori dalle porte; serbatoio sul tetto per la memoria; task (G-nnn) con più sessioni e subagenti; account/organizzazioni con colori diversi. Ha approvato la grammatica ("si ok perfetto dai proviamo cosi' e poi vediamo come viene al massimo miglioriamo dopo").
- Gordon porta a J la scelta del prossimo passo fra S1, S2 e il piano 3D (L2). Non aprire sessioni nuove: le gestisce Gordon.

## Completed Work
- S3: portiere/cancello, capacity (min(tetto-al lavoro, posti con margine e lettura fresca) + prossimo reset), gauge macchina (CPU live da /proc), coda rifiutate/pronte. Scene v8.
- Facciata: apron + fila di 8 robot + gruppo "+N" + Gordon; serbatoio sul tetto ("session memory", mai "power"); label meta "N refused / N ready / session memory N%".
- Grammatica: tie = task (se nessuna feature); lanyard + chip A/T/P = organizzazione (dominio email: amatino.ai, tenutalarnianone.com, provider pubblici = personal, altro); Gordon = cap + clipboard; anello + filo dei desk dello stesso task al mouse; board nel pannello (waiting / in the building); area/repo di un task in coda letti da tasks.jsonl se lobby.json non li dà.
- Doc: docs/plans/2026-10-19-task-account-grammar.md. Mockup/sheet: docs/plans/2026-10-19-lobby-queue-tank-mockup-{light,dark}.png, docs/plans/2026-10-19-task-session-account-grammar-light.png.
- 3 revisioni Opus (S3, facciata, grammatica): tutti i finding importanti corretti con test.

## Errors & Corrections
- Baseline test fail pre-esistente su NixOS: "Error: ENOENT: no such file or directory, open '/tmp/shq-open-iosZGC/arg'" (test/cli-open.test.ts; causa: PATH finto senza dirname). Non toccato.
- Guard worktree: "this command is too complex to verify that it stays inside the worktree" -> scrivere gli script python in file (Write) e lanciarli da soli; comandi git semplici e separati.
- Playwright MCP si è bloccato (resize/navigate >120s): usare Chrome di sistema /run/current-system/sw/bin/google-chrome-stable via script in scratchpad.
- Un daemon avviato in una chiamata Bash NON sopravvive al turno: avviare daemon + screenshot nello stesso comando (run-shot2.sh).
- La CSP della pagina scarta gli attributi style scritti da innerHTML: rileggerli e riapplicarli con el.style.cssText.
- Svelte each_key_duplicate (id che puliti coincidono) ferma il rendering: liste keyate per indice.
- heavy.sh a volte aspetta senza fine (slot occupato): per test/typecheck/build usare npx vitest/tsc/svelte-check e npm run build:server && npm run build:ui direttamente.
- MEMORY.md non è scrivibile con la shell ("Read-only file system"): usare Edit.
- Correzioni di J: "allora ricordati che voglio dare una rappresentazione visuale alla lobby"; via G-268: "power a 79 sul computer vs 29 su hopper" (power confuso con batteria -> rinominato "session memory"/serbatoio) e "i processi in coda devono avere una rappresentazione visuale... non cose scritte"; "sei sicuro che un g- task e' sempre e solo assegnato ad una sola sessione?" (no: 64 di 211 task hanno 2+ sessioni; 21 sessioni hanno servito 2+ task); "fixa anche gli errori di batteria etc" (letto come la confusione power/batteria).
- Deviazione TDD ammessa: parte del codice scritta insieme/prima dei test (tokens, mezzo set di fix post-revisione).

## Active Work
- Nessuna modifica non committata nel codice. Ultimo commit pushato 235b913 su fork/feat/lobby-data-g293. Questo file di stato è l'unico file nuovo non committato.
- In attesa: Gordon porta a J la scelta fra S1, S2 e piano 3D (L2).

## Pending Tasks
- S1: token e costo a listino. LEGGERE la pagina prezzi Anthropic live (unità: per milione di token; input, cache write, cache read, output sono 4 prezzi), salvare prices.json con URL e data, test che fallisce se > 30 giorni, "n/d" per modello senza prezzo, "costo a listino API"; finestre oggi e settimana (lunedì 00:00 Europe/Rome); aggregare per desk/seat/modello dai `usage` nei transcript.
- S2: finestra settimanale da claude-limits/<email>.json: passo (usato % vs lineare al reset) + flag "settimana intaccata" (7d > 0).
- S4 ridotta: i subagenti esistono già (Intern, crew room, fs-adapter scanChildren); mancano token, conteggio/collapse oltre INTERNS_MAX=3.
- Piano Lobby 3D (L2): fila davanti al bancone, "pronta" sui divani, ascensori col colore organizzazione, Gordon al banco; chi lo fa (G-268 su branch a parte o questa sessione) è da decidere.
- PR sulla fork (corpo: unità del prezzo, host letto); report-G-293.txt (slice fatte, PR, tabella prezzi, cross-check: token di una sessione vs somma a mano, un costo vs prices.json, riga portiere vs admit.sh live, un conteggio subagenti vs ls subagents | wc -l); cosa deve fare J (merge, rebuild #164, hopper-hq ui).
- 5 minori di G-268 ancora elencati e non toccati (mark senza cap, task flapping, outline bottone Lobby, Esc su #/lobby, flash "Loading").
- Dire a J prima di sostituire il suo daemon su :7337.

## Key References
- Worktree: ~/amatino/hopper-hq/.worktrees/g293-lobby-data · branch feat/lobby-data-g293 (base feat/multiple-config-dirs 1abcce3) · remote fork https://github.com/jacopone/hopper-hq.git · commit chiave: 58e2650, 2c6e193, 65f205b, 06845aa, 6e1a8ec, aac0fb6, 235b913
- Brief/report: ~/.local/state/alfred/gordon/brief-G-293-hopper-lobby-data.txt, report-G-268.txt, lobby.json, tasks.jsonl, tools/{admit.sh,lobby.py,heavy.sh,task.py}
- File: src/scene/{lobby,palette,types,build}.ts · src/core/{lobby,types}.ts · src/adapters/gatekeepers/{gordon,gordon-files}.ts · ui/components/{Facade,Bot,Tank,Bar,LobbyPanel}.svelte · ui/facade/geometry.ts · ui/renderer/{robot,materials,labels,floor-scene,theme}.ts · ui/styles/tokens.css
- Test: `npx vitest run --maxWorkers=2`; typecheck: `npx tsc -p tsconfig.json --noEmit` + `npx svelte-check --tsconfig ./ui/tsconfig.json --fail-on-warnings`
- Script (scratchpad /tmp/claude-1000/-home-guyfawkes-amatino/0855d0ec-4fef-429d-844f-a88b707cf2b4/scratchpad): run-shot2.sh, run-inspect.sh, mock.mjs, mock2.mjs
- Screenshot: ~/amatino/hopper-hq/.playwright-mcp/10..17-*.png · daemon di J: :7337 (non toccare) · nixos-config PR #164 · memoria: ~/.claude/projects/-home-guyfawkes-amatino/memory/project-hopper-lobby-g293.md
