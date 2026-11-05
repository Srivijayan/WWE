# WWE Main Event (browser wrestling game)

A 2D wrestling game that runs in any browser: 6 superstars, combos, grapples, finishers, pinfalls, a CPU opponent, and local or online 2-player.

## Play

Serve the folder and open it in a browser, for example:

```
npx http-server -p 8080 .
```

Then open http://localhost:8080. It also works on GitHub Pages. Opening `index.html` straight from disk works too, except online rooms.

## Controls

| Action | Player 1 | Player 2 (local) |
| --- | --- | --- |
| Move | A / D (or ← / → vs CPU) | ← / → |
| Jump | W | ↑ |
| Block (hold) | S | ↓ |
| Sprint (hold) | Left Shift | Right Shift |
| Combo strike | J | N or Numpad 1 |
| Heavy strike / dropkick | K | M or Numpad 2 |
| Grapple (on a downed opponent: pin) | U | , or Numpad 3 |
| Dodge roll | L | / or Numpad 5 |
| Pin | I | . or Numpad 0 |
| Finisher (momentum full) | Space | Enter |
| Pause | Esc or P | Esc or P |

Moves pressed while another move is finishing are queued, so combos flow. When pinned, mash your attack keys to kick out. On phones and tablets an on-screen joystick and buttons appear automatically.

## Online career and leaderboard (Unity Gaming Services)

Each browser signs in anonymously to Unity Gaming Services when the game loads. Wins against the CPU and in online rooms are saved to the player's career (Cloud Save) and their total wins are posted to the `wins` leaderboard. The 🏆 button shows the top 10, your stats and rank, and lets you pick a leaderboard name.

Settings are at the top of `js/ugs.js` (project ID, environment, leaderboard ID). In the Unity Cloud dashboard the project needs: Authentication with anonymous sign-in, Cloud Save, and a leaderboard with ID `wins`, sorted highest first, keeping the best score. If anything is unreachable the game keeps working without online stats.

Scores are sent from the player's browser, so a determined player could fake them. To prevent that, move score posting into a Unity Cloud Code script and block direct writes with an access policy.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole game: roster, fighting, AI, pinfalls, online play |
| `js/ugs.js` | Unity Gaming Services: sign-in, career save, leaderboard, player names |
| `css/tailwind.css` | Prebuilt styles (generated, don't edit by hand) |
| `lib/peerjs.min.js` | PeerJS 1.5.2, used for online rooms |
| `tailwind.config.js`, `css-input.css`, `package.json` | Build setup for the styles |

### After changing Tailwind classes

The styles are prebuilt instead of compiled in the browser, which keeps the game smooth. If you add or change Tailwind classes in `index.html`, rebuild them:

```
npm install
npm run build:css
```
