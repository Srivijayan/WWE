// CPU opponent: makes a decision every few hundred milliseconds and plays to its wrestler's style.
(function () {
  RR.AI_LEVELS = {
    easy: { interval: 36, block: 0.15, reverse: 0.05, mash: 4, finisher: 'sometimes', pinBelow: 0.10, idle: 0.3 },
    normal: { interval: 24, block: 0.35, reverse: 0.2, mash: 7, finisher: 'half', pinBelow: 0.25, idle: 0.12 },
    hard: { interval: 13, block: 0.6, reverse: 0.45, mash: 10, finisher: 'now', pinBelow: 0.25, idle: 0.03 },
  };

  const press = (key, wait) => ({ key, wait: wait || 1 });

  class AI {
    constructor(f, level) {
      this.f = f; this.L = RR.AI_LEVELS[level] || RR.AI_LEVELS.normal;
      this.timer = 30; this.plan = null; this.queue = []; this.blockFor = 0; this.seenAttack = -1;
    }

    intent(match) {
      const it = RR.blankIntent(), f = this.f, o = f.opp, L = this.L;
      const dx = o.x - f.x, dist = Math.abs(dx), dirTo = Math.sign(dx) || 1;
      const go = d => { it[d > 0 ? 'right' : 'left'] = true; };

      if (f.state === 'pinned') { if (Math.random() < L.mash / 60) it.grapple = true; return it; }
      if (f.state === 'perched') { if (dist < 320 && dist > 40 && Math.random() < 0.06) it.kick = true; return it; }

      // react to an incoming strike
      if (o.state === 'attack' && o.move && o.move.kind === 'strike' && o.attackId !== this.seenAttack) {
        this.seenAttack = o.attackId;
        this.blockFor = dist < 140 && Math.random() < L.block ? 22 : 0;
      }
      if (this.blockFor > 0) { this.blockFor--; it.down = true; return it; }

      if (this.queue.length) {
        const q = this.queue[0];
        if (--q.wait <= 0) {
          this.queue.shift();
          if (q.key === 'up') it.upPressed = it.up = true; else it[q.key] = true;
        }
        return it;
      }

      if (--this.timer <= 0) {
        this.timer = L.interval + Math.floor(Math.random() * 8);
        if (f.canAct()) this.decide(match, dist);
      }

      const p = this.plan;
      if (!p) return it;
      if (p.type === 'approach') {
        if (dist > p.range) { go(dirTo); it.run = !!p.run; if (--p.frames <= 0) this.plan = null; }
        else { this.plan = null; this.queue.push(...p.then); }
      } else if (p.type === 'retreat') {
        go(-dirTo); if (--p.frames <= 0) this.plan = null;
      } else if (p.type === 'corner') {
        const cx = f.x < 480 ? RR.RING.L : RR.RING.R;
        if (Math.abs(f.x - cx) > 30) go(Math.sign(cx - f.x));
        else { this.plan = null; this.queue.push(press('up', 2)); }
      } else if (p.type === 'wait') {
        if (--p.frames <= 0) this.plan = null;
      }
      return it;
    }

    decide(match, dist) {
      const f = this.f, o = f.opp, L = this.L, r = Math.random(), hpO = o.hpFrac;
      const approach = (range, then, run) => { this.plan = { type: 'approach', range, then, run, frames: 240 }; };

      if (o.state === 'down' || o.state === 'getup') {
        if (o.state === 'down' && hpO < L.pinBelow) return approach(95, [press('pin')]);
        if (r < 0.55) return approach(70, [press('punch')]);
        this.plan = { type: 'wait', frames: 15 }; return;
      }
      if (r < L.idle) { this.plan = { type: 'wait', frames: 20 }; return; }
      if (f.stamina < 25) { this.plan = { type: 'retreat', frames: 40 }; return; }

      if (f.meter >= 100) {
        const use = L.finisher === 'now' || (L.finisher === 'half' && hpO < 0.5) || (L.finisher === 'sometimes' && Math.random() < 0.4);
        if (use) return approach(85, [press('special')]);
      } else if (f.meter >= 50 && Math.random() < 0.3) {
        return approach(85, [press('special')]);
      }

      switch (f.def.ai) {
        case 'grappler':
          if (r < 0.45) return approach(70, [press('grapple')]);
          if (r < 0.75) return approach(64, [press('punch'), press('punch', 18), press('punch', 18)]);
          if (r < 0.9) return approach(90, [press('kick')]);
          this.plan = { type: 'wait', frames: 12 }; return;
        case 'flyer':
          if (dist > 220 && r < 0.35) return approach(80, [press('punch')], true);
          if (dist > 200 && dist < 420 && r < 0.55 && (f.x < 280 || f.x > 680)) { this.plan = { type: 'corner' }; return; }
          if (r < 0.75) return approach(90, [press('kick'), press('punch', 20)]);
          if (r < 0.88) return approach(70, [press('grapple')]);
          this.plan = { type: 'retreat', frames: 25 }; return;
        case 'striker':
          if (r < 0.5) return approach(64, [press('punch'), press('punch', 16), press('punch', 16)]);
          if (r < 0.8) return approach(92, [press('kick'), press('kick', 24)]);
          if (r < 0.9) return approach(70, [press('grapple')]);
          this.plan = { type: 'retreat', frames: 20 }; return;
        default:
          if (r < 0.35) return approach(66, [press('punch'), press('punch', 18), press('kick', 20)]);
          if (r < 0.65) return approach(70, [press('grapple')]);
          if (r < 0.85) return approach(92, [press('kick')]);
          this.plan = { type: 'wait', frames: 14 };
      }
    }
  }
  RR.AI = AI;
})();
