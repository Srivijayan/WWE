// One wrestler in the ring: position, meters, current action, and the body pose
// used to draw them for that action.
(function () {
  // Ring edges (rope positions), floor line and the height of the top turnbuckle.
  RR.RING = { L: 160, R: 800, FLOOR: 412, PERCH: -74 };

  class Fighter {
    constructor(def, outfit, side) {
      this.def = def; this.outfit = outfit; this.side = side;
      this.maxHp = def.hp;
      this.walkSpeed = 2.0 + 0.3 * def.speed;
      this.scale = def.build.h; this.width = def.build.w;
      this.ai = null; this.opp = null;
      this.reset(side === 0 ? 300 : 660);
    }
    reset(x) {
      this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
      this.facing = this.side === 0 ? 1 : -1;
      this.hp = this.maxHp; this.dispHp = this.maxHp; this.stamina = 100; this.meter = 0;
      this.state = 'idle'; this.t = 0;
      this.move = null; this.moveKey = null; this.hitDone = false; this.startup = 0; this.attackId = 0;
      this.hitstun = 0; this.blockstun = 0; this.downTimer = 0;
      this.combo = 0; this.lastPunchHit = -999; this.lastGrapPress = -999; this.lastSpecPress = -999;
      this.scenePose = null; this.whipDir = 0;
      this.stats = { dmg: 0, hits: 0, reversals: 0, finishers: 0 };
    }
    set(state, force) { if (this.state !== state || force) { this.state = state; this.t = 0; } }
    canAct() { return ['idle', 'walk', 'run', 'block'].includes(this.state) && this.blockstun <= 0 && this.y >= 0; }
    hittable() { return ['idle', 'walk', 'run', 'block', 'attack', 'jump', 'dizzy', 'hit', 'whipped', 'climb'].includes(this.state) && this.y > -45; }
    grabbable() { return ['idle', 'walk', 'run', 'block', 'attack', 'dizzy', 'hit', 'whipped'].includes(this.state) && this.y > -10; }
    canReverse() { return ['idle', 'walk', 'run', 'block', 'attack'].includes(this.state) && this.y > -10; }
    get hpFrac() { return this.hp / this.maxHp; }
    get colors() { return { skin: this.def.skin, trunks: this.outfit[0], accent: this.outfit[1], hair: this.def.hair, beard: this.def.beard, top: this.def.top }; }
  }
  RR.Fighter = Fighter;

  // ---- Poses ----
  // Angles are radians from straight down; positive swings toward the way the wrestler faces.
  // arm/leg = [upper angle, bend at elbow/knee]. rot tilts the whole body; lie 0..1 lowers the hips to the mat.
  const PI = Math.PI;
  RR.basePose = () => ({ rot: 0, lie: 0, lean: 0.05, crouch: 0, dx: 0, dy: 0, armF: [0.5, -1.7], armB: [0.3, -1.6], legF: [0.16, -0.05], legB: [-0.16, -0.05] });
  RR.lyingPose = () => ({ rot: -PI / 2, lie: 1, lean: 0, crouch: 0, dx: 0, dy: 0, armF: [2.7, 0], armB: [2.4, 0.1], legF: [0.06, 0], legB: [-0.04, 0] });
  const lerp = (a, b, k) => a + (b - a) * k;
  const mix = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
  RR.lerp = lerp; RR.mix = mix;

  function walkLegs(P, ph, amp) {
    P.legF = [Math.sin(ph) * amp, -0.15 - Math.max(0, -Math.cos(ph)) * amp * 0.9];
    P.legB = [-Math.sin(ph) * amp, -0.15 - Math.max(0, Math.cos(ph)) * amp * 0.9];
  }

  RR.getPose = function (f, frame) {
    const t = f.t;
    if (f.state === 'scene' && f.scenePose) return f.scenePose;
    let P = RR.basePose();
    const breathe = Math.sin(frame * 0.08) * 1.5;
    switch (f.state) {
      case 'idle':
      case 'block':
        P.crouch = 3 + breathe;
        if (f.state === 'block') { P.crouch = 8; P.lean = -0.05; P.armF = [1.25, -2.5]; P.armB = [1.1, -2.4]; }
        break;
      case 'walk': {
        const ph = frame * (0.16 + f.def.speed * 0.012);
        walkLegs(P, ph, 0.45);
        P.armF = [0.6 - Math.sin(ph) * 0.2, -1.7]; P.armB = [0.4 + Math.sin(ph) * 0.2, -1.6];
        break;
      }
      case 'run':
      case 'whipped': {
        const ph = frame * 0.38;
        walkLegs(P, ph, 0.8);
        P.lean = 0.35; P.armF = [Math.sin(ph) * 0.9, -1.4]; P.armB = [-Math.sin(ph) * 0.9, -1.4];
        break;
      }
      case 'jump':
        P.legF = [0.7, -1.3]; P.legB = [0.2, -1.1]; P.armF = [2.4, -0.4]; P.armB = [2.2, -0.3];
        break;
      case 'attack': {
        const m = f.moveKey, su = f.startup, act = f.move ? f.move.active : 4;
        const w = Math.min(1, t / Math.max(1, su));
        const out = t < su ? 0 : t < su + act ? 1 : Math.max(0, 1 - (t - su - act) / 10);
        if (m === 'punch') {
          P.armF = mix(mix([0.5, -1.7], [0.2, -2.1], w), [1.6, -0.05], out); P.lean = 0.05 + 0.15 * out; P.dx = 6 * out;
        } else if (m === 'kick') {
          P.legF = mix(mix([0.16, -0.05], [0.8, -1.5], w), [1.55, 0], out); P.lean = -0.25 * Math.max(w, out); P.legB = [-0.1, 0];
        } else if (m === 'run') {
          walkLegs(P, frame * 0.38, 0.7); P.lean = 0.4; P.armF = mix([0.6, -1.4], [1.65, 0.1], Math.max(w, out));
        } else if (m === 'stomp') {
          P.legF = mix(mix([0.16, -0.05], [1.0, -1.4], w), [0.45, -0.1], out); P.lean = -0.1; P.armF = [0.8, -1.2];
        } else if (m === 'grapple' || m === 'special') {
          P.armF = mix([0.5, -1.7], [1.35, -0.35], Math.max(w, out)); P.armB = mix([0.3, -1.6], [1.2, -0.4], Math.max(w, out));
          P.lean = 0.2 * Math.max(w, out); P.crouch = 4;
        }
        break;
      }
      case 'hit':
        P.lean = -0.4; P.crouch = 5; P.armF = [-0.3, -0.6]; P.armB = [-0.5, -0.4]; P.dx = -4;
        break;
      case 'dizzy':
        P.lean = Math.sin(frame * 0.1) * 0.25; P.crouch = 7; P.armF = [0.1, -0.1]; P.armB = [0.05, -0.1];
        break;
      case 'down':
      case 'pinned':
      case 'ko':
        P = RR.lyingPose();
        if (f.state === 'pinned') P.legF = [0.3 + Math.sin(frame * 0.4) * 0.15, -0.3];
        break;
      case 'getup': {
        const k = Math.min(1, t / 26);
        const L = RR.lyingPose();
        P.rot = lerp(L.rot, 0, k); P.lie = 1 - k; P.crouch = 18 * (1 - k);
        P.armF = mix(L.armF, P.armF, k); P.armB = mix(L.armB, P.armB, k);
        P.legF = mix([0.9, -1.6], P.legF, k); P.legB = mix([0.3, -0.8], P.legB, k);
        break;
      }
      case 'climb': {
        const ph = t * 0.4;
        P.legF = [0.6 + Math.sin(ph) * 0.5, -1.0]; P.legB = [0.1, -0.4]; P.armF = [2.6, -0.3]; P.armB = [2.3, -0.2];
        break;
      }
      case 'perched':
        P.crouch = 12; P.lean = 0.25; P.armF = [2.4, -0.5]; P.armB = [2.0, -0.4]; P.legF = [0.5, -0.9]; P.legB = [-0.2, -0.6];
        break;
      case 'dive':
        P.rot = Math.min(1, t / 14) * 1.3; P.armF = [2.9, 0]; P.armB = [2.7, 0]; P.legF = [0.05, 0]; P.legB = [-0.1, 0];
        break;
      case 'pinning':
        P.rot = 1.35; P.lie = 0.75; P.armF = [1.5, -0.3]; P.armB = [1.2, -0.3]; P.legF = [0.2, -0.6]; P.legB = [-0.3, -0.4];
        break;
      case 'taunt':
      case 'victory': {
        const b = Math.abs(Math.sin(frame * 0.12));
        P.armF = [2.7 + b * 0.2, -0.2]; P.armB = [2.5 + b * 0.2, -0.2]; P.dy = -b * 4; P.lean = -0.08;
        break;
      }
      case 'entrance': {
        const ph = frame * 0.16;
        walkLegs(P, ph, 0.4);
        P.armF = [2.6 + Math.sin(frame * 0.1) * 0.2, -0.3]; P.armB = [0.4 + Math.sin(ph) * 0.2, -1.5];
        break;
      }
    }
    return P;
  };
})();
