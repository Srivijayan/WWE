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

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole game: roster, fighting, AI, pinfalls, online play |
| `css/tailwind.css` | Prebuilt styles (generated, don't edit by hand) |
| `lib/peerjs.min.js` | PeerJS 1.5.2, used for online rooms |
| `tailwind.config.js`, `css-input.css`, `package.json` | Build setup for the styles |

### After changing Tailwind classes

The styles are prebuilt instead of compiled in the browser, which keeps the game smooth. If you add or change Tailwind classes in `index.html`, rebuild them:

```
npm install
npm run build:css
```
