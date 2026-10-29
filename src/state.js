// Screen state machine: title, mode select, character select, entrances, match, results.
(function () {
  const $ = id => document.getElementById(id);
  const RING = RR.RING;
  const MENUS = ['title', 'howto', 'sound', 'mode', 'select', 'pause', 'results'];
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function loadRecord() {
    try { return JSON.parse(localStorage.getItem('rr-record') || 'null') || { played: 0, wins: {} }; } catch (e) { return { played: 0, wins: {} }; }
  }
  function saveRecord(r) { try { localStorage.setItem('rr-record', JSON.stringify(r)); } catch (e) { /* storage blocked */ } }

  // ---------- entrances ----------
  class Entrance {
    constructor(match) {
      this.m = match; this.idx = 0; this.t = 0; this.done = false;
      match.f.forEach(f => { f.state = 'offstage'; f.x = f.side === 0 ? -120 : 1080; });
    }
    get cur() { return this.m.f[this.idx]; }
    update() {
      const m = this.m, f = this.cur, target = this.idx === 0 ? 300 : 660, from = this.idx === 0 ? -80 : 1040;
      const t = ++this.t;
      m.f.forEach(x => x.t++);
      if (t === 1) { f.x = from; f.set('entrance'); f.facing = Math.sign(target - from); }
      if (t === 24) RR.Audio.playTheme(f.def.theme);
      if (t === 26) RR.Audio.pyro();
      if (t === 26 || t === 38 || t === 50) m.pyro([RING.L - 22, 480, RING.R + 22][(t - 26) / 12], 300, [f.outfit[1], '#ffc531', '#ffffff']);
      if (t === 64) RR.Audio.say(`Introducing. From ${f.def.hometown}. Weighing in at ${f.def.weight}. ${f.def.name.replace(/"/g, '')}!`);
      if (t >= 60 && f.state === 'entrance') {
        f.x += Math.sign(target - f.x) * 2.2;
        if (Math.abs(f.x - target) < 3) {
          f.x = target; f.set('taunt');
          m.pyro(target - 60, RING.FLOOR - 30, [f.outfit[1], '#ffffff']); m.pyro(target + 60, RING.FLOOR - 30, [f.outfit[1], '#ffffff']);
          RR.Audio.pyro(); RR.Audio.cheer(0.8);
        }
      }
      if (t >= 470) this.next();
    }
    get dark() {
      if (this.idx > 1) return 0;
      const t = this.t;
      if (t < 24) return (t / 24) * 0.78;
      if (t > 440) return Math.max(0, 0.78 * (1 - (t - 440) / 30));
      return 0.78;
    }
    skip() { if (this.t > 20) this.next(); }
    next() {
      const f = this.cur, target = this.idx === 0 ? 300 : 660;
      RR.Audio.stopTheme(0.5); RR.Audio.hush();
      f.x = target; f.y = 0; f.set('idle', true); f.facing = this.idx === 0 ? 1 : -1;
      this.idx++; this.t = 0;
      if (this.idx > 1) {
        this.done = true;
        this.m.f.forEach(x => { x.facing = x.side === 0 ? 1 : -1; x.set('idle', true); });
        this.m.begin();
        Game.screen = 'match';
      }
    }
  }

  // ---------- game ----------
  const Game = RR.Game = {
    screen: 'title', mode: '1p', difficulty: 'normal', frame: 0,
    cursor: [0, 5], outfit: [0, 1], confirmed: [false, false],
    match: null, entrance: null, pausedFrom: null, previewTimer: null,

    init() {
      this.buildRoster();
      document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { RR.Audio.ui(); this.show(b.dataset.back); }));
      $('btn-play').addEventListener('click', () => { RR.Audio.init(); RR.Audio.ui(); this.show('mode'); });
      $('btn-howto').addEventListener('click', () => { RR.Audio.init(); this.show('howto'); });
      $('btn-sound').addEventListener('click', () => { RR.Audio.init(); this.show('sound'); });
      document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { RR.Audio.init(); this.mode = '1p'; this.difficulty = b.dataset.diff; this.openSelect(); }));
      $('btn-2p').addEventListener('click', () => { RR.Audio.init(); this.mode = '2p'; this.openSelect(); });
      $('btn-resume').addEventListener('click', () => this.togglePause());
      $('btn-quit').addEventListener('click', () => this.quit());
      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('btn-rematch').addEventListener('click', () => this.startMatch());
      $('btn-new').addEventListener('click', () => { this.endMatchView(); this.openSelect(); });
      $('btn-menu').addEventListener('click', () => this.quit());
      $('game').addEventListener('click', () => { if (this.screen === 'entrance' && this.entrance) this.entrance.skip(); });

      // volume sliders (two copies: sound screen and pause screen)
      const v = RR.Audio.volumes;
      [['vol-music', 'music'], ['vol-sfx', 'sfx'], ['pause-music', 'music'], ['pause-sfx', 'sfx']].forEach(([id, kind]) => {
        const el = $(id); el.value = v[kind];
        el.addEventListener('input', () => { RR.Audio.setVolume(kind, parseFloat(el.value)); this.syncSliders(); });
      });
      const mute = $('btn-mute');
      mute.textContent = v.muted ? 'Unmute' : 'Mute';
      mute.addEventListener('click', () => { RR.Audio.init(); mute.textContent = RR.Audio.toggleMute() ? 'Unmute' : 'Mute'; });

      // touch controls
      document.querySelectorAll('#touch button').forEach(b => {
        const a = b.dataset.a;
        const down = e => { e.preventDefault(); RR.Input.touchDown(a); b.classList.add('on'); };
        const up = e => { e.preventDefault(); RR.Input.touchUp(a); b.classList.remove('on'); };
        b.addEventListener('pointerdown', down);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, up));
      });

      RR.Input.onKey(e => this.onKey(e));
      this.showRecord();
      this.show('title');
    },

    syncSliders() {
      const v = RR.Audio.volumes;
      $('vol-music').value = $('pause-music').value = v.music;
      $('vol-sfx').value = $('pause-sfx').value = v.sfx;
    },

    show(name) {
      MENUS.forEach(s => { $('screen-' + s).hidden = s !== name; });
      if (MENUS.includes(name)) this.screen = name;
      if (name === 'title') { this.showRecord(); RR.Audio.stopTheme(0.4); }
      if (name !== 'select') clearTimeout(this.previewTimer);
      const panel = $('screen-' + name);
      if (panel) { const first = panel.querySelector('.btn.primary, .btn'); if (first && !isTouch) first.focus({ preventScroll: true }); }
      this.updateChrome();
    },

    updateChrome() {
      const inRing = this.screen === 'match' || this.screen === 'entrance';
      $('touch').hidden = !(isTouch && this.mode === '1p' && this.screen === 'match');
      $('btn-pause').hidden = !inRing;
      if (!inRing) RR.Input.clearTouch();
    },

    showRecord() {
      const r = loadRecord();
      if (!r.played) { $('record').textContent = ''; return; }
      let best = null;
      for (const id in r.wins) if (!best || r.wins[id] > r.wins[best]) best = id;
      const def = RR.ROSTER.find(d => d.id === best);
      $('record').textContent = `Matches played: ${r.played}` + (def ? ` · Most wins: ${def.short} (${r.wins[best]})` : '');
    },

    // ---------- character select ----------
    buildRoster() {
      const grid = $('roster');
      RR.ROSTER.forEach((def, i) => {
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'card'; card.dataset.i = i;
        card.setAttribute('aria-label', `${def.name}, ${def.style}`);
        card.innerHTML = `<canvas width="120" height="150"></canvas><span class="nm">${def.short}</span><span class="tag t0">P1</span><span class="tag t1">P2</span>`;
        card.addEventListener('click', () => this.clickCard(i));
        grid.appendChild(card);
        RR.drawPortrait(card.querySelector('canvas'), def, def.outfits[0], 0);
      });
    },

    openSelect() {
      this.confirmed = [false, false];
      this.cursor = [this.cursor[0] || 0, this.cursor[1] == null ? 5 : this.cursor[1]];
      this.show('select');
      this.refreshSelect();
      this.preview(0);
    },

    activePicker() {
      if (this.mode === '1p') return this.confirmed[0] ? 1 : 0;
      return null;
    },

    refreshSelect() {
      const one = this.mode === '1p';
      $('select-title').textContent = one ? (this.confirmed[0] ? 'Choose your opponent' : 'Choose your wrestler') : 'Choose your wrestlers';
      $('select-hint').textContent = one
        ? 'Arrows to move · Enter or J to pick · K to change outfit · Esc to go back'
        : 'P1: W A S D, F to pick, G for outfit · P2: arrows, J to pick, K for outfit · Esc to go back';
      document.querySelectorAll('#roster .card').forEach((card, i) => {
        card.classList.toggle('p1', this.cursor[0] === i);
        card.classList.toggle('p2', this.cursor[1] === i && (!one || this.confirmed[0]));
        card.querySelector('.t1').textContent = one ? 'CPU' : 'P2';
      });
      [0, 1].forEach(p => this.renderPanel(p));
    },

    renderPanel(p) {
      const el = $('pp-' + p), one = this.mode === '1p';
      if (one && p === 1 && !this.confirmed[0]) {
        el.innerHTML = `<p class="who">CPU · ${this.difficulty}</p><p class="wait">Pick your wrestler first.</p>`;
        return;
      }
      const def = RR.ROSTER[this.cursor[p]], o = this.outfit[p], ready = this.confirmed[p];
      const stat = (label, v, max) => `<div class="stat"><span>${label}</span><span class="bar"><i style="width:${(v / max) * 100}%"></i></span><b>${v}</b></div>`;
      el.innerHTML = `
        <p class="who">${one ? (p === 0 ? 'Player 1' : 'CPU · ' + this.difficulty) : 'Player ' + (p + 1)}</p>
        <canvas class="big" width="180" height="200"></canvas>
        <h3>${def.short}</h3>
        <p class="nick">${def.nick} · ${def.style}</p>
        ${stat('Power', def.power, 10)}${stat('Speed', def.speed, 10)}${stat('Defense', def.defense, 10)}${stat('HP', def.hp, 140)}
        <dl>
          <dt>Signature</dt><dd>${def.signature.name}</dd>
          <dt>Finisher</dt><dd>${def.finisher.name}</dd>
          <dt>Theme</dt><dd>${def.theme.name} <span class="muted">(${def.theme.feel})</span></dd>
        </dl>
        <div class="swatches" role="group" aria-label="Outfit colour">
          ${def.outfits.map((c, i) => `<button type="button" class="sw${i === o ? ' on' : ''}" data-o="${i}" style="--a:${c[0]};--b:${c[1]}" aria-label="Outfit ${i + 1}"></button>`).join('')}
        </div>
        <button type="button" class="btn small ${ready ? '' : 'primary'} pick">${ready ? 'Ready ✓' : 'Pick ' + def.short}</button>`;
      el.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => { if (!this.confirmed[p]) { this.outfit[p] = +b.dataset.o; this.fixOutfits(p); this.refreshSelect(); } }));
      el.querySelector('.pick').addEventListener('click', () => this.confirm(p));
    },

    clickCard(i) {
      RR.Audio.init();
      let p = this.activePicker();
      if (p === null) p = !this.confirmed[0] ? 0 : !this.confirmed[1] ? 1 : null;
      if (p === null || this.confirmed[p]) return;
      if (this.cursor[p] === i) return this.confirm(p);
      this.cursor[p] = i; this.outfit[p] = 0; this.fixOutfits(p);
      RR.Audio.ui(); this.refreshSelect(); this.preview(p);
    },

    moveCursor(p, dx, dy) {
      if (this.confirmed[p]) return;
      const i = this.cursor[p], cols = 5, rows = Math.ceil(RR.ROSTER.length / cols);
      let col = i % cols, row = Math.floor(i / cols);
      col = (col + dx + cols) % cols; row = (row + dy + rows) % rows;
      this.cursor[p] = Math.min(RR.ROSTER.length - 1, row * cols + col);
      this.outfit[p] = 0; this.fixOutfits(p);
      RR.Audio.ui(); this.refreshSelect(); this.preview(p);
    },

    cycleOutfit(p) {
      if (this.confirmed[p]) return;
      this.outfit[p] = (this.outfit[p] + 1) % 4; this.fixOutfits(p);
      RR.Audio.ui(); this.refreshSelect();
    },

    // both players can pick the same wrestler, but not in the same colours
    fixOutfits(changed) {
      const other = 1 - changed;
      if (this.cursor[0] === this.cursor[1] && this.outfit[0] === this.outfit[1]) {
        if (this.confirmed[other] || changed === 1) this.outfit[changed] = (this.outfit[changed] + 1) % 4;
        else this.outfit[other] = (this.outfit[other] + 1) % 4;
      }
    },

    confirm(p) {
      if (this.confirmed[p]) return;
      this.fixOutfits(p);
      this.confirmed[p] = true;
      RR.Audio.bell(1);
      if (this.mode === '1p' && p === 0 && this.cursor[1] === this.cursor[0]) this.cursor[1] = (this.cursor[0] + 5) % RR.ROSTER.length;
      if (this.mode === '1p' && p === 0) { this.outfit[1] = this.cursor[1] === this.cursor[0] ? (this.outfit[0] + 1) % 4 : 0; this.preview(1); }
      this.refreshSelect();
      if (this.confirmed[0] && this.confirmed[1]) setTimeout(() => { if (this.screen === 'select') this.startMatch(); }, 700);
    },

    unconfirm() {
      const p = this.confirmed[1] ? 1 : this.confirmed[0] ? 0 : -1;
      if (p < 0) return this.show('mode');
      this.confirmed[p] = false; this.refreshSelect();
    },

    preview(p) {
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => {
        if (this.screen !== 'select') return;
        RR.Audio.playTheme(RR.ROSTER[this.cursor[p]].theme, { duration: 5, sting: false });
      }, 280);
    },

    // ---------- match flow ----------
    startMatch() {
      clearTimeout(this.previewTimer);
      RR.Audio.stopTheme(0.2);
      const sel = [0, 1].map(p => { const def = RR.ROSTER[this.cursor[p]]; return { def, outfit: def.outfits[this.outfit[p]] }; });
      RR.Input.setMode(this.mode);
      this.match = new RR.Match(sel, { mode: this.mode, difficulty: this.difficulty, onEnd: m => this.showResults(m) });
      this.entrance = new Entrance(this.match);
      MENUS.forEach(s => { $('screen-' + s).hidden = true; });
      this.screen = 'entrance';
      RR.Audio.setCrowd(0.5);
      this.updateChrome();
    },

    togglePause() {
      if (this.screen === 'pause') {
        $('screen-pause').hidden = true;
        this.screen = this.pausedFrom; this.pausedFrom = null;
        this.updateChrome();
      } else if (this.screen === 'match' || this.screen === 'entrance') {
        this.pausedFrom = this.screen;
        this.syncSliders();
        this.show('pause');
      }
    },

    quit() {
      this.endMatchView();
      RR.Audio.setCrowd(0); RR.Audio.hush();
      this.show('title');
    },

    endMatchView() { this.match = null; this.entrance = null; this.pausedFrom = null; RR.Audio.stopTheme(0.3); },

    showResults(m) {
      const w = m.winner, l = w.opp;
      const r = loadRecord(); r.played++; r.wins[w.def.id] = (r.wins[w.def.id] || 0) + 1; saveRecord(r);
      $('res-method').textContent = `Winner by ${m.method.toLowerCase()}`;
      $('res-winner').textContent = w.def.short;
      const labels = this.labels();
      const row = (name, a, b) => `<tr><th scope="row">${name}</th><td>${a}</td><td>${b}</td></tr>`;
      const [a, b] = m.f;
      $('res-table').innerHTML = `<thead><tr><th></th><th>${a.def.short}<small>${labels[0]}</small></th><th>${b.def.short}<small>${labels[1]}</small></th></tr></thead><tbody>
        ${row('HP left', Math.ceil(a.hp) + ' / ' + a.maxHp, Math.ceil(b.hp) + ' / ' + b.maxHp)}
        ${row('Damage dealt', Math.round(a.stats.dmg), Math.round(b.stats.dmg))}
        ${row('Hits landed', a.stats.hits, b.stats.hits)}
        ${row('Reversals', a.stats.reversals, b.stats.reversals)}
        ${row('Finishers', a.stats.finishers, b.stats.finishers)}</tbody>`;
      void l;
      RR.Audio.playTheme(w.def.theme);
      this.show('results');
    },

    labels() {
      return this.mode === '1p' ? ['P1', 'CPU · ' + this.difficulty.toUpperCase()] : ['P1', 'P2'];
    },

    // ---------- keyboard for menus ----------
    onKey(e) {
      const k = e.code;
      if (k === 'Escape') {
        if (this.screen === 'match' || this.screen === 'entrance' || this.screen === 'pause') return this.togglePause();
        if (this.screen === 'select') return this.unconfirm();
        if (['howto', 'sound', 'mode'].includes(this.screen)) return this.show(this.screen === 'mode' ? 'title' : 'title');
      }
      if (this.screen === 'entrance' && (k === 'Enter' || k === 'Space')) { this.entrance.skip(); return; }
      if (this.screen !== 'select' || e.repeat) return;
      const one = this.mode === '1p', act = this.activePicker();
      const p1 = one ? act : 0;
      const map1 = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
      const map2 = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (map1[k]) return this.moveCursor(p1, ...map1[k]);
      if (map2[k]) return this.moveCursor(one ? act : 1, ...map2[k]);
      if (k === 'KeyF' || (one && ['Enter', 'Space', 'KeyJ', 'KeyZ'].includes(k))) { e.preventDefault(); return this.confirm(p1); }
      if (k === 'KeyG' || (one && ['KeyK', 'KeyX'].includes(k))) return this.cycleOutfit(p1);
      if (!one && k === 'KeyJ') return this.confirm(1);
      if (!one && k === 'KeyK') return this.cycleOutfit(1);
    },

    // ---------- per frame ----------
    update() {
      this.frame++;
      if (this.screen === 'pause') return;
      if (this.screen === 'entrance' && this.entrance) {
        this.entrance.update();
        this.match.updateFx();
        if (this.entrance.t > 20 && (RR.Input.anyPressed(0) || RR.Input.anyPressed(1))) this.entrance.skip();
      } else if (this.match && (this.screen === 'match' || this.screen === 'results')) {
        this.match.update();
      }
      if (this.screen === 'match' || this.screen === 'entrance') this.updateChrome();
    },

    render(ctx) {
      const m = this.match;
      if (m) {
        const e = this.entrance && !this.entrance.done ? this.entrance : null;
        const cur = e ? e.cur : null;
        const tron = cur && e.t > 20
          ? { title: cur.def.short, sub: `${cur.def.nick} · ♪ ${cur.def.theme.name}`, c1: RR.shade(cur.outfit[0], 0.1), c2: RR.shade(cur.outfit[1], -0.3) }
          : { title: 'RING RIVALS', sub: this.mode === '1p' ? `1 Player vs CPU · ${this.difficulty}` : '2 Players' };
        const fighters = m.f.filter(f => f.state !== 'offstage');
        RR.renderWorld(ctx, { frame: this.frame, match: m, excite: m.excite, tron, fighters, dark: e ? e.dark : 0, spot: cur ? { x: cur.x, y: RING.FLOOR - 70 } : null });
        if (e && e.t > 40 && e.t < 460) drawCard(ctx, cur, e.t);
        if (!e) RR.drawHUD(ctx, m, this.labels());
        if (!e && !isTouch && m.started && m.frame - m.beganAt < 600) drawKeyHint(ctx, this.mode, m.frame - m.beganAt);
        if (e) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = "600 15px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'right';
          ctx.fillText('Press any button or tap to skip', RR.W - 20, RR.H - 16);
        }
      } else {
        RR.renderWorld(ctx, { frame: this.frame, excite: 0.35, tron: null, fighters: [] });
      }
    },
  };

  // control reminder for the first 10 seconds of a match
  function drawKeyHint(ctx, mode, t) {
    const text = mode === '1p'
      ? '← → move  ·  ↑ jump  ·  ↓ block  ·  J attack  ·  K grab  ·  L special  ·  tap twice to run'
      : 'P1: A D move · F attack · G grab · H special     P2: ← → move · J attack · K grab · L special';
    ctx.save(); ctx.globalAlpha = Math.min(1, (600 - t) / 40);
    ctx.font = "600 17px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 32;
    ctx.fillStyle = 'rgba(11,13,28,0.85)'; ctx.fillRect(RR.W / 2 - w / 2, RR.H - 44, w, 30);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, RR.W / 2, RR.H - 23);
    ctx.restore();
  }

  // announcer card during an entrance
  function drawCard(ctx, f, t) {
    const k = Math.min(1, (t - 40) / 14), x = 24 - (1 - k) * 300, y = RR.H - 128;
    ctx.save(); ctx.globalAlpha = Math.min(1, (460 - t) / 14);
    ctx.fillStyle = 'rgba(11,13,28,0.88)'; ctx.fillRect(x, y, 380, 100);
    ctx.fillStyle = f.outfit[1]; ctx.fillRect(x, y, 6, 100);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = "24px 'Bungee', Impact, sans-serif";
    RR.fitText(ctx, f.def.name.toUpperCase(), x + 20, y + 34, 350);
    ctx.font = "600 17px 'Barlow Condensed', sans-serif"; ctx.fillStyle = '#cfd3ea';
    ctx.fillText(`From ${f.def.hometown} · ${f.def.weight}`, x + 20, y + 60);
    ctx.fillStyle = '#ffc531';
    ctx.fillText(`♪ ${f.def.theme.name} · ${f.def.style} · ${f.maxHp} HP`, x + 20, y + 84);
    ctx.restore();
  }
})();
