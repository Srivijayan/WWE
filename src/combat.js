// The match: moves, hit detection, damage formula, blocks, reversals, specials, pins and knockouts.
(function () {
  const RING = RR.RING, PI = Math.PI, lerp = RR.lerp, mix = RR.mix;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

  // Frame counts are at 60 frames per second. Startup is scaled by the wrestler's speed.
  const MOVES = RR.MOVES = {
    punch: { name: 'Punch', base: 5, cost: 5, startup: 6, active: 4, recovery: 9, range: 74, kind: 'strike', combo: true },
    kick: { name: 'Kick', base: 8, cost: 10, startup: 10, active: 5, recovery: 13, range: 98, kind: 'strike' },
    run: { name: 'Running strike', base: 10, cost: 15, startup: 5, active: 9, recovery: 18, range: 84, kind: 'strike', knockdown: true },
    stomp: { name: 'Stomp', base: 4, cost: 5, startup: 8, active: 4, recovery: 10, range: 84, kind: 'stomp' },
    grapple: { name: 'Grapple', base: 12, cost: 18, startup: 7, active: 4, recovery: 16, range: 86, kind: 'grapple' },
    special: { name: 'Special', base: 0, cost: 0, startup: 14, active: 4, recovery: 16, range: 112, kind: 'special' },
  };
  const IMPACT = { throw: 0.72, lift: 0.7, strike: 0.45, dropkick: 0.45, leap: 0.75, spear: 0.45, ddt: 0.62, lock: 2 };

  class Match {
    constructor(sel, opts) {
      this.f = sel.map((s, i) => new RR.Fighter(s.def, s.outfit, i));
      this.f[0].opp = this.f[1]; this.f[1].opp = this.f[0];
      this.mode = opts.mode; this.difficulty = opts.difficulty;
      if (opts.mode === '1p') this.f[1].ai = new RR.AI(this.f[1], opts.difficulty);
      this.onEnd = opts.onEnd;
      this.frame = 0; this.sf = 0; this.simAcc = 0; this.slow = 1; this.slowT = 0;
      this.shake = 0; this.zoom = 1; this.zoomTarget = 1; this.focusX = 480; this.flash = 0;
      this.particles = []; this.texts = []; this.banners = [];
      this.scene = null; this.pin = null; this.pendingKO = null;
      this.started = false; this.over = false; this.endT = 0; this.winner = null; this.method = '';
      this.excite = 0.3;
    }

    begin() {
      this.started = true;
      this.banner('FIGHT!', '', '#ffc531', 70);
      RR.Audio.bell(1); RR.Audio.setCrowd(0.35);
    }

    // ---------- main update ----------
    update() {
      this.frame++;
      this.updateFx();
      if (!this.started) return;
      if (this.slowT > 0 && --this.slowT === 0) this.slow = 1;
      this.simAcc += this.slow;
      while (this.simAcc >= 1) { this.simAcc -= 1; this.sim(); }
      this.zoom += (this.zoomTarget - this.zoom) * 0.08;
      const mid = (this.f[0].x + this.f[1].x) / 2;
      this.focusX += (mid - this.focusX) * 0.1;
      for (const f of this.f) if (f.dispHp > f.hp) f.dispHp = Math.max(f.hp, f.dispHp - 0.35);
      const low = Math.min(this.f[0].hpFrac, this.f[1].hpFrac);
      const target = 0.3 + (1 - low) * 0.5 + (this.pin ? 0.3 : 0);
      this.excite += (target - this.excite) * 0.02;
      if (this.frame % 30 === 0) RR.Audio.setCrowd(this.excite);
      if (this.over) {
        this.endT++;
        if (this.endT === 70 && this.winner.state !== 'scene') this.winner.set('victory');
        if (this.endT === 230 && this.onEnd) this.onEnd(this);
      }
    }

    sim() {
      this.sf++;
      const intents = this.f.map((f, i) => this.over ? RR.blankIntent() : (f.ai ? f.ai.intent(this) : RR.Input.intent(i)));
      this.f.forEach((f, i) => this.think(f, intents[i]));
      if (this.scene) this.updateScene();
      if (this.pin) this.updatePin();
      this.f.forEach(f => this.updateFighter(f));
      this.separate();
    }

    // ---------- reading a player's intent ----------
    think(f, it) {
      const o = f.opp, dx = o.x - f.x, dist = Math.abs(dx), toward = Math.sign(dx) || f.facing;
      if (it.grapple) f.lastGrapPress = this.sf;
      if (it.special) f.lastSpecPress = this.sf;
      if (f.state === 'pinned') { if (it.grapple && this.pin) { this.pin.presses++; this.pin.mashT = 8; } return; }
      if (f.state === 'perched') {
        if (it.kick || it.punch) this.startDive(f);
        else if (it.down) { f.y = 0; f.set('idle'); }
        return;
      }
      if (!f.canAct()) return;
      f.facing = f.state === 'run' && f.vx ? Math.sign(f.vx) : toward;
      const moveDir = (it.right ? 1 : 0) - (it.left ? 1 : 0);

      if (it.pin && o.state === 'down' && dist < 125) return this.startPin(f);
      if (it.special) {
        if (f.meter >= 50) return this.startMove(f, 'special');
        f.flashMsg = 'NEED 50 METER'; f.flashT = 50; return;
      }
      if (it.grapple) return this.startMove(f, 'grapple', { whipDir: moveDir });
      if (it.punch) {
        if ((o.state === 'down' || o.state === 'getup') && dist < 95) return this.startMove(f, 'stomp');
        return this.startMove(f, f.state === 'run' ? 'run' : 'punch');
      }
      if (it.kick) return this.startMove(f, f.state === 'run' ? 'run' : 'kick');
      if (it.upPressed) {
        if (this.atCorner(f)) return this.startClimb(f);
        f.vy = -9.5; f.y = -1; f.set('jump'); return;
      }
      if (it.down) { f.vx = 0; f.set('block'); return; }
      if (moveDir) {
        const running = it.run;
        f.set(running ? 'run' : 'walk');
        if (running) f.facing = moveDir;
        f.vx = moveDir * f.walkSpeed * (running ? 1.8 : 1);
      } else {
        f.set('idle'); f.vx = 0;
      }
    }

    atCorner(f) {
      return (f.x < RING.L + 45 && f.opp.x > f.x) || (f.x > RING.R - 45 && f.opp.x < f.x);
    }

    // ---------- moves ----------
    startMove(f, key, extra) {
      const m = MOVES[key];
      if (f.stamina <= 0) return;
      f.stamina = Math.max(0, f.stamina - m.cost);
      f.move = m; f.moveKey = key; f.hitDone = false; f.attackId++;
      f.whipDir = extra && extra.whipDir ? extra.whipDir : 0;
      f.startup = Math.max(2, Math.round(m.startup * (1.25 - 0.05 * f.def.speed)));
      f.set('attack', true);
      f.vx = key === 'run' ? f.facing * f.walkSpeed * 1.8 : 0;
      if (key !== 'special') RR.Audio.whoosh();
    }

    updateAttack(f) {
      const m = f.move, su = f.startup;
      if (f.moveKey === 'run') f.vx *= 0.96;
      if (f.t >= su && f.t < su + m.active && !f.hitDone) this.tryHit(f);
      if (f.state !== 'attack') return; // the move turned into a scene
      if (f.t >= su + m.active + m.recovery) {
        f.move = null;
        if (f.stamina <= 0) { f.set('dizzy'); this.text(f, 'DIZZY', '#ffc531'); } else f.set('idle');
      }
    }

    tryHit(f) {
      const o = f.opp, m = f.move, dist = Math.abs(o.x - f.x);
      const facingOk = Math.sign(o.x - f.x) === f.facing || dist < 12;
      if (!facingOk || dist > m.range) return;

      if (m.kind === 'stomp') {
        if (o.state !== 'down' && o.state !== 'getup') return;
        f.hitDone = true;
        this.applyDamage(f, o, m.base, {});
        if (o.state !== 'ko') { o.set('down'); o.downTimer = Math.min(o.downTimer + 24, 90); }
        return;
      }
      if (m.kind === 'grapple' || m.kind === 'special') {
        if (!o.grabbable()) return;
        f.hitDone = true;
        return m.kind === 'grapple' ? this.grab(f) : this.connectSpecial(f);
      }
      // strikes
      if (o.state === 'perched' || o.state === 'climb') {
        f.hitDone = true;
        this.applyDamage(f, o, 6, {});
        o.y = 0; this.banner('KNOCKED OFF!', '', '#fff', 45);
        if (o.state !== 'ko') this.knockDown(o, 60, f);
        return;
      }
      if (!o.hittable()) return;
      if (m === MOVES.run && o.y < -30) return;
      f.hitDone = true;
      const blocking = o.state === 'block' && Math.sign(f.x - o.x) === o.facing;
      let mult = 1, knock = !!m.knockdown;
      if (m.combo && !blocking) {
        f.combo = this.sf - f.lastPunchHit < 45 ? f.combo + 1 : 1;
        f.lastPunchHit = this.sf;
        if (f.combo >= 3) { mult = 1.5; f.combo = 0; this.text(f, '3-HIT COMBO', '#ffc531'); }
      }
      if (o.state === 'whipped') { mult *= 1.3; knock = true; }
      this.applyDamage(f, o, m.base * mult, { blocked: blocking });
      if (o.state === 'ko') return;
      if (blocking) { o.blockstun = 10; o.vx = Math.sign(o.x - f.x) * 3; return; }
      if (knock) this.knockDown(o, 70, f); else this.stagger(o, f, m === MOVES.kick ? 18 : 15);
    }

    reversed(f, o, extraWindow) {
      if (!o.canReverse()) return false;
      if (o.ai) return Math.random() < o.ai.L.reverse;
      const win = 12 + o.def.defense * 1.2 + (extraWindow || 0);
      return this.sf - o.lastGrapPress <= win;
    }

    grab(f) {
      const o = f.opp;
      if (this.reversed(f, o)) return this.reversal(o, f, 'REVERSAL!');
      if (f.whipDir) return this.whip(f, o, f.whipDir);
      this.startScene(f, o, this.throwSpec());
    }

    throwSpec() { return { kind: 'throw', name: 'Throw', anim: 'throw', base: 12, len: 44, impact: IMPACT.throw }; }

    reversal(winner, loser, text) {
      winner.stats.reversals++;
      this.gainMeter(winner, 6);
      this.banner(text, winner.def.short, '#39c6f0', 70);
      RR.Audio.cheer(0.7);
      winner.move = null;
      this.startScene(winner, loser, this.throwSpec());
    }

    connectSpecial(f) {
      const o = f.opp, fin = f.meter >= 100;
      const spec = fin ? f.def.finisher : f.def.signature;
      f.meter = fin ? 0 : f.meter - 50;
      if (fin && o.meter >= 100 && o.canReverse()) {
        const rev = o.ai ? Math.random() < o.ai.L.reverse : this.sf - Math.max(o.lastGrapPress, o.lastSpecPress) <= 16 + o.def.defense * 1.2;
        if (rev) { o.meter = 0; return this.reversal(o, f, 'FINISHER REVERSED!'); }
      }
      if (!fin && this.reversed(f, o)) return this.reversal(o, f, 'REVERSAL!');
      this.startScene(f, o, {
        kind: fin ? 'finisher' : 'signature', name: spec.name, anim: spec.anim, limb: spec.limb, flip: spec.flip,
        base: fin ? 30 : 18, len: fin ? 100 : 70, impact: IMPACT[spec.anim],
      });
    }

    whip(f, o, dir) {
      o.set('whipped', true);
      o.vx = dir * 9; o.facing = dir; o.whipBounced = false; o.whipper = f;
      this.text(o, 'IRISH WHIP', '#fff');
    }

    updateWhip(f) {
      const atRope = (f.vx < 0 && f.x <= RING.L + 2) || (f.vx > 0 && f.x >= RING.R - 2);
      if (atRope && !f.whipBounced) {
        f.vx = -f.vx; f.facing = Math.sign(f.vx); f.whipBounced = true; RR.Audio.rope();
      }
      if (f.whipBounced) {
        const w = f.whipper, passed = Math.sign(w.x - f.x) !== Math.sign(f.vx);
        if (passed || f.t > 150) { f.vx = 0; f.set('idle'); }
      }
    }

    stagger(o, from, frames) {
      o.set('hit', true); o.hitstun = frames; o.move = null;
      o.vx = Math.sign(o.x - from.x) * 4;
    }

    knockDown(o, frames, from) {
      o.set('down', true); o.downTimer = frames; o.y = 0; o.vy = 0; o.move = null;
      o.vx = from ? Math.sign(o.x - from.x) * 3.5 : 0;
      RR.Audio.thud();
    }

    // ---------- top rope ----------
    startClimb(f) {
      f.set('climb', true); f.vx = 0;
      f.x = f.x < 480 ? RING.L + 6 : RING.R - 6;
      f.facing = f.x < 480 ? 1 : -1;
    }

    startDive(f) {
      if (f.stamina <= 0) return;
      f.stamina = Math.max(0, f.stamina - 25);
      f.set('dive', true);
      f.diveFrom = f.x; f.diveTo = clamp(f.opp.x, RING.L, RING.R);
      f.facing = Math.sign(f.diveTo - f.x) || f.facing;
      this.banner('OFF THE TOP!', '', '#fff', 40);
      RR.Audio.whoosh(); RR.Audio.cheer(0.6);
    }

    updateDive(f) {
      const p = Math.min(1, f.t / 34);
      f.x = lerp(f.diveFrom, f.diveTo, p);
      f.y = RING.PERCH * (1 - p) - Math.sin(p * PI) * 70;
      if (p < 1) return;
      f.y = 0;
      const o = f.opp;
      if (Math.abs(o.x - f.diveTo) < 60 && (o.hittable() || o.state === 'down' || o.state === 'getup')) {
        this.applyDamage(f, o, 16, {});
        this.shake = 10; RR.Audio.slam(0.7);
        if (o.state !== 'ko') this.knockDown(o, 85, f);
        this.knockDown(f, 26);
      } else {
        this.text(f, 'MISSED!', '#ef3e4a');
        this.selfDamage(f, 6);
        if (f.state !== 'ko') this.knockDown(f, 60);
      }
    }

    // ---------- scenes: throws, signatures, finishers ----------
    startScene(att, def, spec) {
      att.set('scene', true); def.set('scene', true);
      att.vx = def.vx = 0; att.y = def.y = 0; att.move = def.move = null;
      const dir = Math.sign(def.x - att.x) || att.facing;
      att.facing = dir; def.facing = -dir;
      const ax = clamp(att.x, RING.L + 70, RING.R - 70);
      this.scene = Object.assign({ att, def, dir, ax, t: 0, done: false, ticks: 0 }, spec);
      if (spec.kind === 'finisher') {
        this.slow = 0.55; this.zoomTarget = 1.35;
        this.banner(spec.name.toUpperCase(), att.def.short, '#ffc531', 120);
        RR.Audio.sting(att.def.theme); RR.Audio.cheer(1);
        att.stats.finishers++;
      } else if (spec.kind === 'signature') {
        this.banner(spec.name.toUpperCase(), 'SIGNATURE MOVE', '#ffffff', 80);
        RR.Audio.cheer(0.6);
      }
      RR.animateScene(this.scene, 0);
    }

    updateScene() {
      const S = this.scene;
      S.t++;
      const p = Math.min(1, S.t / S.len);
      RR.animateScene(S, p);
      if (!S.done && p >= S.impact) {
        S.done = true;
        const big = S.kind === 'finisher';
        this.applyDamage(S.att, S.def, S.base, {});
        this.shake = big ? 20 : 10; this.flash = big ? 1 : 0;
        RR.Audio.slam(big ? 1 : 0.6);
        this.burst(S.def.x, RING.FLOOR - 24, big ? 26 : 14, '#ffffff');
      }
      if (S.anim === 'lock' && S.ticks < 4 && p >= 0.3 + S.ticks * 0.16) {
        S.ticks++;
        this.applyDamage(S.att, S.def, S.base / 4, {});
        this.shake = 4;
        if (S.ticks === 1) this.text(S.def, 'WILL THEY TAP?', '#ffc531');
      }
      if (S.t >= S.len) {
        this.scene = null; this.slow = 1; this.zoomTarget = 1;
        S.att.scenePose = S.def.scenePose = null;
        S.att.y = S.def.y = 0;
        if (S.endFacing) S.def.facing = S.endFacing;
        S.att.facing = Math.sign(S.def.x - S.att.x) || S.att.facing;
        S.att.set('idle'); S.att.vx = 0;
        if (this.over && this.winner === S.att) S.att.set('victory');
        if (this.pendingKO) { const k = this.pendingKO; this.pendingKO = null; this.ko(k); }
        else this.knockDown(S.def, S.kind === 'finisher' ? 120 : 85);
      }
    }

    // ---------- pins ----------
    startPin(f) {
      const o = f.opp;
      f.set('pinning', true); o.set('pinned', true);
      f.vx = o.vx = 0;
      f.facing = Math.sign(o.x - f.x) || f.facing;
      f.x = o.x - f.facing * 12;
      const frac = o.hpFrac;
      this.pin = {
        by: f, on: o, t: 0, presses: 0, mashT: 0,
        auto: frac >= 0.25 ? 48 + Math.floor(Math.random() * 10) : 0,
        need: frac >= 0.25 ? 1 : Math.ceil(6 * Math.pow(0.25 / Math.max(frac, 0.05), 0.683)),
      };
      this.banner('PIN!', '', '#ffffff', 40);
    }

    updatePin() {
      const P = this.pin;
      P.t++;
      if (P.mashT > 0) P.mashT--;
      if ((P.auto && P.t >= P.auto) || (!P.auto && P.presses >= P.need)) {
        this.pin = null;
        P.on.set('getup', true);
        P.by.set('idle'); P.by.x -= P.by.facing * 40;
        this.banner('KICK OUT!', '', '#39c6f0', 50);
        RR.Audio.cheer(0.8);
        return;
      }
      if (P.t % 60 === 0) {
        const n = P.t / 60;
        RR.Audio.count(); RR.Audio.cheer(0.4 + n * 0.2);
        this.banner(String(n), '', n === 3 ? '#ffc531' : '#ffffff', 45);
        if (n === 3) {
          this.pin = null;
          P.on.set('down', true); P.on.downTimer = 9999;
          P.by.set('idle');
          this.endMatch(P.by, 'Pinfall');
        }
      }
    }

    // ---------- damage ----------
    applyDamage(att, def, base, opts) {
      const blocked = opts && opts.blocked;
      let dmg = base * (0.6 + 0.08 * att.def.power) * (1 - 0.04 * def.def.defense) * (blocked ? 0.25 : 1);
      dmg = Math.round(dmg * 10) / 10;
      def.hp = Math.max(0, def.hp - dmg);
      att.stats.dmg += dmg;
      if (!blocked) { att.stats.hits++; this.gainMeter(att, 8); this.gainMeter(def, 4); }
      this.text(def, (blocked ? 'BLOCK ' : '') + Math.max(1, Math.round(dmg)), blocked ? '#9aa3c7' : '#ffffff');
      const hx = (att.x + def.x) / 2, hy = RING.FLOOR + def.y - 80 * def.scale;
      this.burst(hx, hy, blocked ? 4 : 9, blocked ? '#9cd6ff' : '#ffd85a');
      if (blocked) RR.Audio.block(); else RR.Audio.hit(Math.min(1, base / 20));
      if (!blocked) this.shake = Math.max(this.shake, Math.min(8, base / 2));
      if (def.hp <= 0 && !this.over) { if (this.scene) this.pendingKO = def; else this.ko(def); }
      return dmg;
    }

    selfDamage(f, n) {
      f.hp = Math.max(0, f.hp - n);
      this.text(f, String(n), '#ef3e4a');
      if (f.hp <= 0 && !this.over) this.ko(f);
    }

    gainMeter(f, n) {
      const was = f.meter;
      f.meter = Math.min(100, f.meter + n * (f.hpFrac < 0.3 ? 1.5 : 1));
      if (was < 100 && f.meter >= 100) this.text(f, 'FINISHER READY', '#ffc531');
      else if (was < 50 && f.meter >= 50) this.text(f, 'SIGNATURE READY', '#ffffff');
    }

    ko(def) {
      def.hp = 0; def.set('ko', true); def.vx = 0; def.y = 0;
      this.endMatch(def.opp, 'Knockout');
    }

    endMatch(winner, method) {
      if (this.over) return;
      this.over = true; this.winner = winner; this.method = method;
      this.slow = 0.4; this.slowT = 90;
      this.banner(method === 'Knockout' ? 'K.O.!' : 'WINNER!', winner.def.short, '#ffc531', 150);
      RR.Audio.bell(3); RR.Audio.cheer(1);
    }

    // ---------- physics ----------
    updateFighter(f) {
      f.t++;
      if (f.flashT > 0) f.flashT--;
      const s = f.state;
      if (s === 'scene' || s === 'pinning' || s === 'pinned' || s === 'ko' || s === 'victory') return;
      if (s !== 'attack' && s !== 'dive' && f.stamina < 100) f.stamina = Math.min(100, f.stamina + 0.2);
      if (f.blockstun > 0) f.blockstun--;
      switch (s) {
        case 'attack': this.updateAttack(f); break;
        case 'hit': if (--f.hitstun <= 0) f.set('idle'); break;
        case 'down': if (--f.downTimer <= 0) f.set('getup'); break;
        case 'getup': if (f.t >= 26) f.set('idle'); break;
        case 'dizzy': if (f.t >= 90) { f.stamina = 30; f.set('idle'); } break;
        case 'whipped': this.updateWhip(f); break;
        case 'climb': f.y = RING.PERCH * Math.min(1, f.t / 20); if (f.t >= 20) f.set('perched'); return;
        case 'perched': f.y = RING.PERCH; if (f.t > 300) { f.y = 0; f.set('idle'); } return;
        case 'dive': this.updateDive(f); return;
      }
      f.x += f.vx;
      const sliding = f.state === 'walk' || f.state === 'run' || f.state === 'whipped' || (f.state === 'attack' && f.moveKey === 'run');
      if (!sliding) f.vx *= 0.82;
      if (f.y < 0 || f.vy < 0) {
        f.vy += 0.55; f.y += f.vy;
        if (f.y >= 0) { f.y = 0; f.vy = 0; if (f.state === 'jump') f.set('idle'); }
      }
      f.x = clamp(f.x, RING.L, RING.R);
    }

    separate() {
      const [a, b] = this.f, solid = f => !['scene', 'pinning', 'pinned', 'down', 'ko', 'dive', 'getup', 'climb', 'perched'].includes(f.state);
      if (!solid(a) || !solid(b) || a.y < -20 || b.y < -20) return;
      const d = b.x - a.x, min = 22 * (a.width + b.width);
      if (Math.abs(d) < min) {
        const push = (min - Math.abs(d)) / 2, s = Math.sign(d) || 1;
        a.x = clamp(a.x - s * push, RING.L, RING.R);
        b.x = clamp(b.x + s * push, RING.L, RING.R);
      }
    }

    // ---------- effects ----------
    burst(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * PI * 2, sp = 2 + Math.random() * 5;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 24 + Math.random() * 16, max: 40, color, size: 2 + Math.random() * 3, g: 0.2 });
      }
    }
    pyro(x, y, colors) {
      for (let i = 0; i < 60; i++) {
        const a = -PI / 2 + (Math.random() - 0.5) * 0.9, sp = 5 + Math.random() * 9;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 50 + Math.random() * 40, max: 90, color: colors[i % colors.length], size: 2 + Math.random() * 3, g: 0.18 });
      }
    }
    text(f, msg, color) { this.texts.push({ x: f.x + (Math.random() - 0.5) * 20, y: RING.FLOOR + f.y - 150 * f.scale, msg, color, life: 60 }); }
    banner(text, sub, color, life) { this.banners = [{ text, sub, color, life, max: life }]; }

    updateFx() {
      this.particles = this.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98; return --p.life > 0; });
      this.texts = this.texts.filter(t => { t.y -= 0.8; return --t.life > 0; });
      this.banners = this.banners.filter(b => --b.life > 0);
      if (this.shake > 0) this.shake *= 0.85;
      if (this.shake < 0.3) this.shake = 0;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.05);
    }
  }
  RR.Match = Match;

  // ---------- scene choreography ----------
  // Places both wrestlers and sets their poses for progress p (0..1) through a throw or special move.
  RR.animateScene = function (S, p) {
    const A = S.att, D = S.def, dir = S.dir, ax = S.ax;
    let pa = RR.basePose(), pd = RR.basePose();
    A.x = ax; D.x = ax + dir * 58; A.y = 0; D.y = 0;
    const lying = (k) => { const L = RR.lyingPose(); L.lie = k; L.rot = -PI / 2 * k; return L; };

    switch (S.anim) {
      case 'throw': { // suplex: over the shoulder and down behind
        const q = seg(p, 0.15, 0.72);
        pa.crouch = 8 * seg(p, 0, 0.15) * (1 - q); pa.lean = -0.9 * Math.sin(q * PI * 0.9);
        pa.armF = [2.5, -0.5]; pa.armB = [2.3, -0.5];
        if (q < 1) {
          D.x = ax + dir * 58 * (1 - 2 * q); D.y = -Math.sin(q * PI) * 95;
          pd = RR.basePose(); pd.rot = -q * PI * 1.5; pd.armF = [2.4, 0]; pd.legF = [0.3, -0.4];
        } else {
          D.x = ax - dir * 62; D.facing = dir; pd = lying(1); S.endFacing = dir;
        }
        break;
      }
      case 'lift': { // overhead, hold, slam down in front
        const a = seg(p, 0, 0.35), b = seg(p, 0.55, 0.7);
        pa.armF = mix([3.0, -0.2], [1.5, 0], b); pa.armB = mix([2.9, -0.2], [1.4, 0], b);
        pa.crouch = 10 * (1 - a) * (a > 0 ? 1 : 0) + 14 * b; pa.lean = -0.1 + 0.4 * b;
        if (b === 0) {
          D.x = ax + dir * lerp(58, 4, a); D.y = -a * 122 + (p > 0.35 ? Math.sin(S.t * 0.5) * 2 : 0);
          pd = lying(0); pd.rot = -PI / 2 * a; pd.armF = [2.0, -0.4]; pd.legF = [0.4, -0.5];
        } else {
          D.x = ax + dir * lerp(4, 64, b); D.y = lerp(-122, 0, b * b);
          pd = lying(Math.max(b, 0.01)); pd.rot = -PI / 2; pd.lie = b;
        }
        break;
      }
      case 'strike':
      case 'dropkick': {
        const wind = seg(p, 0, 0.35), hit = seg(p, 0.35, 0.47), fly = seg(p, 0.45, 0.75);
        if (S.anim === 'dropkick') {
          const j = seg(p, 0.05, 0.45), land = seg(p, 0.5, 0.75);
          A.x = ax - dir * 20 + dir * 30 * j; A.y = -Math.sin(Math.min(1, j) * PI * 0.85) * 80 * (1 - land);
          pa.rot = -0.9 * j * (1 - land); pa.legF = [1.5 * j, -1.2 * (1 - j)]; pa.legB = [1.4 * j, -1.2 * (1 - j)]; pa.armF = [2.4, 0]; pa.armB = [2.2, 0];
        } else if (S.limb === 'leg') {
          pa.legF = mix(mix([0.16, -0.05], [-0.5, -0.8], wind), [1.75, 0], hit); pa.lean = -0.1 - 0.3 * hit; pa.legB = [-0.15, 0];
        } else if (S.limb === 'head') {
          pa.lean = lerp(-0.35 * wind, 0.75, hit); pa.armF = [-0.2, -0.4]; pa.armB = [-0.3, -0.4]; pa.dx = 10 * hit;
        } else {
          pa.armF = mix(mix([0.5, -1.7], [-0.7, -1.0], wind), [1.65, 0], hit); pa.lean = lerp(-0.25 * wind, 0.3, hit); pa.dx = 12 * hit;
        }
        if (fly > 0) {
          D.x = ax + dir * (58 + 70 * fly); D.y = -Math.sin(fly * PI) * 40;
          pd = lying(fly);
        } else { pd.lean = -0.1; pd.crouch = 4; }
        break;
      }
      case 'spear': {
        const back = seg(p, 0, 0.25), dash = seg(p, 0.25, 0.45), fall = seg(p, 0.45, 0.7), up = seg(p, 0.8, 1);
        A.x = ax - dir * 30 * back + dir * 70 * dash + dir * 30 * fall;
        pa.crouch = 16 * back * (1 - fall); pa.lean = 0.5 * back + 0.5 * dash; pa.armF = [1.4, -0.3]; pa.armB = [1.2, -0.3];
        if (dash > 0 && fall === 0) { pa.legF = [Math.sin(S.t) * 0.7, -0.5]; pa.legB = [-Math.sin(S.t) * 0.7, -0.5]; }
        if (fall > 0) { pa.rot = 1.3 * fall * (1 - up); pa.lie = 0.8 * fall * (1 - up); }
        D.x = ax + dir * (58 + 50 * fall);
        if (fall > 0) pd = lying(fall); else { pd.lean = -0.1; }
        break;
      }
      case 'ddt': {
        const hold = seg(p, 0, 0.45), fall = seg(p, 0.45, 0.62), up = seg(p, 0.75, 1);
        D.x = ax + dir * 40;
        pa.armF = [1.7, -1.5]; pa.armB = [1.2, -1.2];
        pd.lean = 1.1 * hold; pd.crouch = 10 * hold; pd.armF = [0.6, -0.4]; pd.armB = [0.4, -0.3];
        if (fall > 0) {
          pa.rot = -PI / 2 * fall * (1 - up); pa.lie = fall * (1 - up);
          pd = RR.lyingPose(); pd.rot = PI / 2 * fall + (1 - fall) * 1.1; pd.lie = fall; pd.lean = 0;
          S.endFacing = dir;
          if (fall >= 1) { pd = lying(1); D.facing = dir; }
        }
        break;
      }
      case 'leap': { // moonsault / splash onto a downed opponent
        const knock = seg(p, 0, 0.12), q = seg(p, 0.12, 0.75), up = seg(p, 0.82, 1);
        D.x = ax + dir * lerp(58, 110, knock);
        pd = lying(knock);
        A.x = ax + dir * 100 * q; A.y = -Math.sin(q * PI) * 130 - (q >= 1 ? 10 * (1 - up) : 0);
        if (S.flip) pa.rot = -q * PI * 1.5; else pa.rot = q * PI / 2;
        if (q >= 1) { pa.rot = PI / 2 * (1 - up); pa.lie = 0.6 * (1 - up); }
        pa.armF = [2.8, 0]; pa.armB = [2.6, 0]; pa.legF = [0.1, -0.3 * (1 - q)]; pa.legB = [-0.1, -0.3 * (1 - q)];
        break;
      }
      case 'lock': { // submission hold on a downed opponent
        const k = seg(p, 0, 0.15), struggle = Math.sin(S.t * 0.35);
        D.x = ax + dir * 34;
        pd = RR.lyingPose(); pd.rot = PI / 2 * k; pd.lie = k; pd.armF = [2.7 + struggle * 0.2, 0]; pd.legF = [0.1, -0.2 + struggle * 0.2];
        A.x = ax + dir * 6;
        pa.crouch = 30 * k; pa.lean = -0.35 * k; pa.armF = [1.9, -1.4 + struggle * 0.1]; pa.armB = [1.7, -1.3];
        pa.legF = [1.2 * k, -2.0 * k]; pa.legB = [-0.4 * k, -1.6 * k];
        S.endFacing = -dir;
        break;
      }
    }
    A.scenePose = pa; D.scenePose = pd;
  };
})();
