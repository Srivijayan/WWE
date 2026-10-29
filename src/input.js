// Keyboard, gamepad and touch controls, turned into one "intent" per player per frame.
// Simple controls: move, block, and three buttons (Attack, Grab, Special). The match
// decides punch or kick, stomp or pin, from where the opponent is.
(function () {
  const BIND_2P = [
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], run: ['ShiftLeft'], attack: ['KeyF'], grab: ['KeyG'], special: ['KeyH'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], run: ['ShiftRight'], attack: ['KeyJ', 'Numpad1'], grab: ['KeyK', 'Numpad2'], special: ['KeyL', 'Numpad3'] },
  ];
  // 1 player: either hand position works.
  const BIND_1P = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], run: ['ShiftLeft', 'ShiftRight'],
    attack: ['KeyJ', 'KeyZ', 'KeyF', 'Space'], grab: ['KeyK', 'KeyX', 'KeyG'], special: ['KeyL', 'KeyC', 'KeyH'],
  };
  // Standard gamepad layout: A or X attack, B grab, Y or RB special, LB block, RT run.
  const PAD = { attack: [0, 2], grab: [1], special: [3, 5], down: [4], run: [7], up: [12], left: [14], right: [15] };
  const ACTIONS = Object.keys(BIND_1P);
  const BUTTONS = ['attack', 'grab', 'special'];
  const DOUBLE_TAP = 16; // frames between taps of a direction to start running

  const held = new Set(), tapped = new Set(), touch = new Set(), touchTapped = new Set();
  const cur = [{}, {}], prev = [{}, {}];
  const lastTap = [{ left: -99, right: -99 }, { left: -99, right: -99 }], runDir = [null, null];
  const listeners = [];
  let mode = '1p', frame = 0;

  window.addEventListener('keydown', e => {
    const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
    if (!inField && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) { held.add(e.code); tapped.add(e.code); }
    listeners.forEach(fn => fn(e));
  });
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  function padState(p, action) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[p];
    if (!gp) return false;
    if (PAD[action].some(i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5))) return true;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (action === 'left') return ax < -0.5;
    if (action === 'right') return ax > 0.5;
    if (action === 'up') return ay < -0.7;
    if (action === 'down') return ay > 0.7;
    return false;
  }

  function bindFor(p) { return mode === '1p' ? (p === 0 ? BIND_1P : null) : BIND_2P[p]; }

  RR.Input = {
    setMode(m) { mode = m; },
    poll() {
      frame++;
      for (let p = 0; p < 2; p++) {
        const bind = bindFor(p), c = cur[p], o = prev[p];
        for (const a of ACTIONS) {
          c[a] = (!!bind && bind[a].some(k => held.has(k) || tapped.has(k))) || padState(p, a) || (p === 0 && (touch.has(a) || touchTapped.has(a)));
        }
        // double-tap a direction and keep holding it to run
        for (const d of ['left', 'right']) {
          if (c[d] && !o[d]) { if (frame - lastTap[p][d] <= DOUBLE_TAP) runDir[p] = d; lastTap[p][d] = frame; }
        }
        if (runDir[p] && !c[runDir[p]]) runDir[p] = null;
        c.run = c.run || !!runDir[p];
      }
    },
    endFrame() {
      for (let p = 0; p < 2; p++) Object.assign(prev[p], cur[p]);
      tapped.clear(); touchTapped.clear();
    },
    intent(p) {
      const c = cur[p], o = prev[p];
      return {
        simple: true,
        left: !!c.left, right: !!c.right, up: !!c.up, down: !!c.down, run: !!c.run,
        upPressed: !!c.up && !o.up,
        attack: !!c.attack && !o.attack, grab: !!c.grab && !o.grab, special: !!c.special && !o.special,
      };
    },
    anyPressed(p) {
      const c = cur[p], o = prev[p];
      return BUTTONS.some(a => c[a] && !o[a]);
    },
    onKey(fn) { listeners.push(fn); },
    touchDown(a) { touch.add(a); touchTapped.add(a); },
    touchUp(a) { touch.delete(a); },
    clearTouch() { touch.clear(); touchTapped.clear(); },
  };

  RR.blankIntent = () => ({ left: false, right: false, up: false, down: false, run: false, upPressed: false, punch: false, kick: false, grapple: false, special: false, pin: false });
})();
