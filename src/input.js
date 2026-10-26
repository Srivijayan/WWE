// Keyboard, gamepad and touch controls, turned into one "intent" per player per frame.
(function () {
  const BIND = [
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], run: ['ShiftLeft'], punch: ['KeyF'], kick: ['KeyG'], grapple: ['KeyH'], special: ['KeyR'], pin: ['KeyE'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], run: ['ControlRight', 'ShiftRight'], punch: ['KeyJ'], kick: ['KeyK'], grapple: ['KeyL'], special: ['KeyI'], pin: ['KeyU'] },
  ];
  // Standard gamepad layout: X punch, Y kick, B grapple, A pin, RB special, LB block, RT run.
  const PAD = { punch: 2, kick: 3, grapple: 1, pin: 0, special: 5, down: 4, run: 7, up: 12, left: 14, right: 15 };
  const ACTIONS = Object.keys(BIND[0]);
  const EDGE = ['punch', 'kick', 'grapple', 'special', 'pin', 'up'];

  const held = new Set(), tapped = new Set(), touch = new Set(), touchTapped = new Set();
  const cur = [{}, {}], prev = [{}, {}];
  const listeners = [];

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
    const b = gp.buttons[PAD[action]];
    if (b && (b.pressed || b.value > 0.5)) return true;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (action === 'left') return ax < -0.5;
    if (action === 'right') return ax > 0.5;
    if (action === 'up') return ay < -0.7;
    return false;
  }

  RR.Input = {
    BIND,
    poll() {
      for (let p = 0; p < 2; p++) {
        for (const a of ACTIONS) {
          cur[p][a] = BIND[p][a].some(c => held.has(c) || tapped.has(c)) || padState(p, a) || (p === 0 && (touch.has(a) || touchTapped.has(a)));
        }
      }
    },
    endFrame() {
      for (let p = 0; p < 2; p++) Object.assign(prev[p], cur[p]);
      tapped.clear(); touchTapped.clear();
    },
    intent(p) {
      const c = cur[p], o = prev[p], it = {};
      for (const a of ACTIONS) it[a] = !!c[a];
      for (const a of EDGE) it[a + 'Pressed'] = !!c[a] && !o[a];
      // attacks act on the press, not while held
      it.punch = it.punchPressed; it.kick = it.kickPressed; it.grapple = it.grapplePressed;
      it.special = it.specialPressed; it.pin = it.pinPressed;
      return it;
    },
    anyPressed(p) {
      const c = cur[p], o = prev[p];
      return ['punch', 'kick', 'grapple', 'special', 'pin'].some(a => c[a] && !o[a]);
    },
    onKey(fn) { listeners.push(fn); },
    touchDown(a) { touch.add(a); touchTapped.add(a); },
    touchUp(a) { touch.delete(a); },
    clearTouch() { touch.clear(); touchTapped.clear(); },
  };

  RR.blankIntent = () => ({ left: false, right: false, up: false, down: false, run: false, upPressed: false, punch: false, kick: false, grapple: false, special: false, pin: false });
})();
