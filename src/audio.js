// Web Audio music sequencer and sound effects. Every sound is generated in the
// browser, so the game ships with no audio files.
(function () {
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    penta: [0, 3, 5, 7, 10],
  };
  // k = kick, s = snare, h = hi-hat, t = taiko, c = crash
  const DRUMS = {
    rock: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    doom: { k: 'x.......x.......', s: '........x.......', h: 'x...x...x...x...', c: 'x...............' },
    punk: { k: 'x...x...x...x...', s: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.' },
    epic: { k: 'x..x....x..x....', s: '....x.......x.xx', t: 'x.......x.x.....' },
    waltz: { k: 'x...........', s: '....x...x...', h: 'x.x.x.x.x.x.' },
    industrial: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
    taiko: { k: 'x.......x.......', t: 'x..x..x.x...x.x.', h: '..x...x...x...x.' },
    four: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
  };

  let ctx = null, master, musicBus, sfxBus, noiseBuf, distCurve, crowdGain = null;
  let seq = null;
  const vol = { music: 0.7, sfx: 0.8, muted: false };
  try { const saved = JSON.parse(localStorage.getItem('rr-audio') || 'null'); if (saved) Object.assign(vol, saved); } catch (e) { /* storage blocked */ }

  function save() { try { localStorage.setItem('rr-audio', JSON.stringify(vol)); } catch (e) { /* storage blocked */ } }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(master); master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 4); }
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = vol.muted ? 0 : 1;
    musicBus.gain.value = vol.music * 0.55;
    sfxBus.gain.value = vol.sfx;
  }

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function scaleSemis(mode, deg) {
    const s = SCALES[mode] || SCALES.minor, n = s.length;
    const oct = Math.floor(deg / n), idx = ((deg % n) + n) % n;
    return s[idx] + 12 * oct;
  }

  function tone(t, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain(), gain = o.gain == null ? 0.2 : o.gain;
    const attack = o.attack || 0.005, release = o.release || 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.filter || 2400;
    let node = osc;
    if (o.drive) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; osc.connect(ws); node = ws; }
    node.connect(f); f.connect(g); g.connect(o.dest || musicBus);
    if (o.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = o.vibrato;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(t, dur, o) {
    o = o || {};
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain == null ? 0.3 : o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  function thump(t, f0, f1, dur, gain, dest) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // ---- Drums ----
  const kick = (t, d) => thump(t, 150, 45, 0.2, 0.9, d);
  const snare = (t, d) => { noise(t, 0.16, { gain: 0.32, freq: 1500, dest: d }); thump(t, 220, 150, 0.07, 0.25, d); };
  const hat = (t, d) => noise(t, 0.04, { gain: 0.1, freq: 7000, dest: d });
  const taiko = (t, d) => { thump(t, 110, 55, 0.45, 0.9, d); noise(t, 0.2, { type: 'lowpass', freq: 300, gain: 0.3, dest: d }); };
  const crash = (t, d) => noise(t, 1.4, { gain: 0.16, freq: 5000, dest: d });

  // ---- Theme sequencer ----
  function leadVoice(theme, t, freq, dur, dest) {
    const type = theme.lead === 'brass' ? 'sawtooth' : theme.lead === 'pulse' ? 'square' : theme.lead;
    tone(t, freq, dur, {
      type, gain: theme.lead === 'sine' ? 0.18 : 0.1, filter: theme.lead === 'brass' ? 1800 : 2800,
      attack: theme.lead === 'brass' ? 0.05 : 0.008, drive: theme.drive, vibrato: theme.vibrato || 0, dest,
    });
    if (theme.lead === 'pulse') tone(t, freq, dur, { type: 'square', gain: 0.06, detune: 14, filter: 2400, dest });
    if (theme.lead === 'brass') tone(t, freq / 2, dur, { type: 'sawtooth', gain: 0.06, filter: 1200, attack: 0.05, dest });
  }

  function playStep(s, t) {
    const th = s.theme, steps = th.steps || 16, i = s.step % steps, bar = Math.floor(s.step / steps);
    const chord = th.prog[bar % th.prog.length], chordSemi = scaleSemis(th.mode, chord), d = DRUMS[th.drums] || DRUMS.rock;
    const out = s.out, hit = p => p && p[i] === 'x';
    if (hit(d.k)) kick(t, out);
    if (hit(d.s)) snare(t, out);
    if (hit(d.h)) hat(t, out);
    if (hit(d.t)) taiko(t, out);
    if (hit(d.c) && bar % 2 === 0) crash(t, out);
    if (th.bass[i] === 'x') tone(t, mtof(th.root + chordSemi), s.stepDur * 1.8, { type: th.drive ? 'sawtooth' : 'square', gain: 0.2, filter: 520, dest: out });
    const m = th.melody[i];
    if (m && m !== '.') leadVoice(th, t, mtof(th.root + 24 + scaleSemis(th.mode, chord + parseInt(m, 36))), s.stepDur * 1.7, out);
    if (i === 0) {
      // soft pad chord under each bar
      [0, 2, 4].forEach(deg => tone(t, mtof(th.root + 12 + scaleSemis(th.mode, chord + deg)), s.stepDur * steps, { type: 'triangle', gain: 0.035, attack: 0.2, release: 0.3, filter: 1500, dest: out }));
    }
  }

  function schedule(s) {
    if (seq !== s) return;
    while (s.next < ctx.currentTime + 0.12) {
      if (s.endAt && s.next > s.endAt) { stopTheme(0.6); return; }
      playStep(s, s.next);
      s.next += s.stepDur; s.step++;
    }
  }

  function playSting(theme, t, dest) {
    kick(t, dest); crash(t, dest);
    [0, 7, 12, 19].forEach(semi => tone(t, mtof(theme.root + 12 + semi), 1.1, { type: 'sawtooth', gain: 0.07, drive: theme.drive, filter: 2600, release: 0.5, dest }));
  }

  function playTheme(theme, opts) {
    opts = opts || {};
    if (!init()) return;
    stopTheme(0.08);
    const out = ctx.createGain(); out.connect(musicBus);
    const s = { theme, step: 0, next: ctx.currentTime + 0.06, stepDur: 60 / theme.bpm / 4, out, endAt: opts.duration ? ctx.currentTime + opts.duration : 0 };
    if (opts.sting !== false) { playSting(theme, s.next, out); s.next += 0.9; }
    seq = s;
    s.timer = setInterval(() => schedule(s), 25);
    schedule(s);
  }

  function stopTheme(fade) {
    if (!seq) return;
    const s = seq; seq = null;
    clearInterval(s.timer);
    const f = fade == null ? 0.4 : fade;
    s.out.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, f / 3));
    setTimeout(() => s.out.disconnect(), (f + 1.5) * 1000);
  }

  // ---- Crowd ----
  function startCrowd() {
    if (!init() || crowdGain) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
    src.connect(bp); bp.connect(lp); lp.connect(crowdGain); crowdGain.connect(sfxBus);
    src.start();
  }
  function setCrowd(level) {
    if (!ctx) return;
    startCrowd();
    crowdGain.gain.setTargetAtTime(0.03 + level * 0.16, ctx.currentTime, 0.4);
  }
  function cheer(amount) {
    if (!ctx || !crowdGain) return;
    const now = ctx.currentTime;
    crowdGain.gain.setTargetAtTime(0.1 + amount * 0.3, now, 0.08);
    crowdGain.gain.setTargetAtTime(0.08, now + 0.8, 0.6);
  }

  const now = () => ctx.currentTime;
  RR.Audio = {
    init, applyVolumes, playTheme, stopTheme, setCrowd, cheer, startCrowd,
    get volumes() { return vol; },
    setVolume(kind, v) { vol[kind] = v; applyVolumes(); save(); },
    toggleMute() { vol.muted = !vol.muted; applyVolumes(); save(); return vol.muted; },
    sting(theme) { if (!init()) return; playSting(theme, now() + 0.01, musicBus); },
    hit(strength) { if (!ctx) return; const t = now(); thump(t, 130, 50, 0.15, 0.4 + 0.5 * strength); noise(t, 0.07 + 0.1 * strength, { type: 'lowpass', freq: 1600, gain: 0.3 + 0.3 * strength }); },
    slam(strength) { if (!ctx) return; const t = now(); thump(t, 95, 28, 0.55, 0.8 + 0.2 * strength); noise(t, 0.45, { type: 'lowpass', freq: 420, gain: 0.7 }); cheer(0.4 + strength * 0.5); },
    thud() { if (!ctx) return; const t = now(); thump(t, 80, 35, 0.3, 0.6); noise(t, 0.2, { type: 'lowpass', freq: 380, gain: 0.4 }); },
    block() { if (!ctx) return; const t = now(); noise(t, 0.05, { freq: 3000, gain: 0.22 }); tone(t, 880, 0.05, { type: 'square', gain: 0.04, dest: sfxBus }); },
    whoosh() { if (!ctx) return; noise(now(), 0.13, { type: 'bandpass', freq: 1300, q: 1.2, gain: 0.12 }); },
    rope() { if (!ctx) return; const t = now(); tone(t, 70, 0.35, { type: 'triangle', gain: 0.25, slide: 0.7, dest: sfxBus }); },
    count() { if (!ctx) return; const t = now(); noise(t, 0.12, { type: 'lowpass', freq: 900, gain: 0.8 }); thump(t, 90, 50, 0.12, 0.6); },
    pyro() { if (!ctx) return; const t = now(); thump(t, 70, 28, 0.9, 0.9); noise(t, 1.3, { type: 'lowpass', freq: 1400, gain: 0.45 }); },
    ui() { if (!ctx) return; tone(now(), 660, 0.05, { type: 'square', gain: 0.04, dest: sfxBus }); },
    bell(times) {
      if (!init()) return;
      for (let i = 0; i < (times || 1); i++) {
        const t = now() + i * 0.32;
        [1, 2.76, 5.4].forEach((p, j) => tone(t, 820 * p, 1.3, { type: 'sine', gain: 0.16 / (j + 1), attack: 0.002, release: 1.2, filter: 9000, dest: sfxBus }));
      }
    },
    say(text) {
      try {
        if (vol.muted || !window.speechSynthesis) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95; u.pitch = 0.6; u.volume = Math.min(1, vol.sfx + 0.1);
        speechSynthesis.speak(u);
      } catch (e) { /* speech not available */ }
    },
    hush() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  };
})();
