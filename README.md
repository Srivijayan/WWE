# Ring Rivals

A 2D wrestling fighting game that runs in any web browser. Pick from 10 original wrestlers, each with their own power, speed, defense, HP, entrance theme and finishing move, then fight the CPU or a friend on the same keyboard.

## Play

Open `index.html` in a browser, or serve the folder (for example `python3 -m http.server`) and open it. It also works on GitHub Pages. There is no install or build step.

## Features

- **10 wrestlers in 6 styles**: giants, powerhouses, brawlers, technicians, strikers and high-flyers. Stats always add up to 20 or 21, so nobody is simply the best.
- **Entrances**: lights go down, pyro fires, the announcer reads the intro and each wrestler walks out to their own theme. Press any attack button, Enter or tap to skip.
- **Entrance music**: 10 original themes made in the browser with the Web Audio API (doom metal, punk, dark waltz, taiko, pop and more). No audio files.
- **Fighting**: punches, kicks, 3-hit combos, running strikes, grapples, Irish whips, stomps, top-rope dives, blocking and grapple reversals.
- **Power system**: HP, stamina (run out and you get dizzy), and a special meter that unlocks a signature move at 50 and a finisher at 100. Under 30% HP the meter fills 50% faster.
- **Pins**: a 3-count pin wins on an opponent under 25% HP. Mash grapple to kick out.
- **Modes**: 1 player vs CPU (Easy, Normal, Hard) or 2 players on one keyboard or two gamepads. Touch buttons on phones in 1-player mode.

## Controls

| Action | Player 1 | Player 2 |
| --- | --- | --- |
| Move | A / D | ← / → |
| Jump / climb corner | W | ↑ |
| Block | S | ↓ |
| Run (hold) | Left Shift | Right Ctrl or Right Shift |
| Punch | F | J |
| Kick | G | K |
| Grapple (+ direction to whip) | H | L |
| Signature / finisher | R | I |
| Pin | E | U |
| Pause | Esc | Esc |

Gamepads: X punch, Y kick, B grapple, A pin, RB special, LB block, RT run.

## Code

| File | What it does |
| --- | --- |
| `src/roster.js` | The 10 wrestlers: stats, look, moves and theme settings |
| `src/audio.js` | Web Audio music sequencer, crowd and sound effects |
| `src/input.js` | Keyboard, gamepad and touch controls |
| `src/fighter.js` | One wrestler in the ring and their body poses |
| `src/combat.js` | Moves, damage formula, blocks, reversals, specials, pins |
| `src/ai.js` | CPU opponent and difficulty levels |
| `src/render.js` | Arena, crowd, ring, wrestlers, HUD and effects |
| `src/state.js` | Screens: title, mode, select, entrances, match, results |
| `src/main.js` | Boot and the 60 fps game loop |

The scripts are plain (non-module) JavaScript so the game also runs when `index.html` is opened straight from disk. To add a wrestler, add one entry to `src/roster.js`.

The wrestlers, names and music are original and not affiliated with any wrestling company.
