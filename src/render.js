// Drawing: arena, crowd, ring, wrestlers, HUD and effects. Everything is canvas shapes, no image files.
(function () {
  const W = 960, H = 540, RING = RR.RING, PI = Math.PI;
  const DISPLAY = "'Bungee', Impact, 'Arial Black', sans-serif";
  const BODY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  RR.W = W; RR.H = H;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = c => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  RR.shade = shade;

  // ---- crowd, built once ----
  const crowd = [];
  (function () {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tones = ['#2a2f52', '#3b3157', '#26304a', '#433a5c', '#30304a', '#3a2c44'];
    for (let row = 0; row < 4; row++) {
      for (let x = -10; x < W + 20; x += 17 + rnd() * 6) {
        crowd.push({ x: x + row * 7, row, y: 196 + row * 26, c: tones[Math.floor(rnd() * tones.length)], ph: rnd() * PI * 2, sign: rnd() < 0.05 });
      }
    }
  })();

  RR.drawArena = function (ctx, frame, excite, tron) {
    // house
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#090b18'); g.addColorStop(0.55, '#141836'); g.addColorStop(1, '#0b0d1c');
    ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);

    // light beams
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = Math.sin(frame * 0.006 + i * 1.7) * 0.35, x0 = 120 + i * 240;
      ctx.fillStyle = i % 2 ? 'rgba(58,167,255,0.05)' : 'rgba(255,197,49,0.045)';
      ctx.beginPath(); ctx.moveTo(x0, -10);
      ctx.lineTo(x0 + Math.sin(a) * 600 - 70, H); ctx.lineTo(x0 + Math.sin(a) * 600 + 70, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // big screen
    const tw = 330, th = 118, tx = (W - tw) / 2, ty = 22;
    ctx.fillStyle = '#05060d'; ctx.fillRect(tx - 6, ty - 6, tw + 12, th + 12);
    const tg = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
    const c1 = tron && tron.c1 || '#1d2550', c2 = tron && tron.c2 || '#3a1d4a';
    tg.addColorStop(0, c1); tg.addColorStop(1, c2);
    ctx.fillStyle = tg; ctx.fillRect(tx, ty, tw, th);
    ctx.save(); ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
    for (let i = 0; i < th; i += 4) ctx.fillRect(tx, ty + i, tw, 1);
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    if (tron && tron.title) {
      ctx.fillStyle = '#fff'; ctx.font = `30px ${DISPLAY}`;
      fitText(ctx, tron.title, W / 2, ty + 62, tw - 24);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `600 18px ${BODY}`;
      ctx.fillText(tron.sub || '', W / 2, ty + 92);
    } else {
      ctx.fillStyle = '#ffc531'; ctx.font = `34px ${DISPLAY}`; ctx.fillText('RING RIVALS', W / 2, ty + 70);
    }
    ctx.restore();

    // crowd
    for (const p of crowd) {
      const bob = Math.max(0, Math.sin(frame * (0.08 + excite * 0.12) + p.ph)) * (2 + excite * 7);
      const y = p.y - bob;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 7, y + 6, 14, 30);
      ctx.beginPath(); ctx.arc(p.x, y, 7, 0, PI * 2); ctx.fill();
      if (excite > 0.55 && Math.sin(frame * 0.05 + p.ph * 3) > 0.6) { // arms up
        ctx.strokeStyle = p.c; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p.x - 6, y + 10); ctx.lineTo(p.x - 10, y - 10); ctx.moveTo(p.x + 6, y + 10); ctx.lineTo(p.x + 10, y - 10); ctx.stroke();
      }
      if (p.sign) { ctx.fillStyle = '#e8ebf2'; ctx.fillRect(p.x - 14, y - 26, 28, 16); ctx.fillStyle = '#ef3e4a'; ctx.fillRect(p.x - 10, y - 21, 20, 5); }
    }
    // camera flashes
    if (Math.random() < 0.05 + excite * 0.25) {
      const p = crowd[Math.floor(Math.random() * crowd.length)];
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y - 2, 2.5, 0, PI * 2); ctx.fill();
    }
    // barricade
    ctx.fillStyle = '#0d0f1f'; ctx.fillRect(-200, 300, W + 400, 34);
    ctx.fillStyle = '#1f2547'; ctx.fillRect(-200, 300, W + 400, 4);
  };

  function fitText(ctx, text, x, y, maxW) {
    const w = ctx.measureText(text).width;
    if (w > maxW) { ctx.save(); ctx.translate(x, y); ctx.scale(maxW / w, 1); ctx.fillText(text, 0, 0); ctx.restore(); }
    else ctx.fillText(text, x, y);
  }
  RR.fitText = fitText;

  // ring parts drawn behind the wrestlers
  RR.drawRingBack = function (ctx) {
    // apron and mat
    ctx.fillStyle = '#c9cfdc';
    ctx.beginPath(); ctx.moveTo(RING.L - 40, 336); ctx.lineTo(RING.R + 40, 336); ctx.lineTo(RING.R + 90, 440); ctx.lineTo(RING.L - 90, 440); ctx.closePath(); ctx.fill();
    const mg = ctx.createLinearGradient(0, 336, 0, 440);
    mg.addColorStop(0, '#d6dbe6'); mg.addColorStop(1, '#eef1f6');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.moveTo(RING.L - 22, 340); ctx.lineTo(RING.R + 22, 340); ctx.lineTo(RING.R + 70, 436); ctx.lineTo(RING.L - 70, 436); ctx.closePath(); ctx.fill();
    // centre logo on the mat
    ctx.save(); ctx.translate(480, 392); ctx.scale(1, 0.32);
    ctx.fillStyle = 'rgba(239,62,74,0.16)'; ctx.beginPath(); ctx.arc(0, 0, 120, 0, PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(160,30,40,0.35)'; ctx.font = `22px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.fillText('RR', 480, 400);
    // ring skirt
    ctx.fillStyle = '#12152c'; ctx.fillRect(RING.L - 90, 436, RING.R - RING.L + 180, 74);
    ctx.fillStyle = '#ffc531'; ctx.font = `26px ${DISPLAY}`; ctx.fillText('RING RIVALS', 480, 484);
    ctx.fillStyle = '#2c3364'; ctx.fillRect(RING.L - 90, 436, RING.R - RING.L + 180, 3);
    // back posts and ropes
    post(ctx, RING.L - 22, 232, 340); post(ctx, RING.R + 22, 232, 340);
    ropes(ctx, RING.L - 22, RING.R + 22, [258, 282, 306], 0.95);
  };

  // front ropes and posts drawn over the wrestlers
  RR.drawRingFront = function (ctx) {
    post(ctx, RING.L - 70, 306, 440); post(ctx, RING.R + 70, 306, 440);
    ctx.save(); ctx.globalAlpha = 0.55;
    ropes(ctx, RING.L - 70, RING.R + 70, [336, 362, 388], 1);
    ctx.restore();
    // side ropes, front post to back post
    ctx.strokeStyle = 'rgba(239,62,74,0.8)'; ctx.lineWidth = 3;
    [[0, 0], [26, 24], [52, 48]].forEach(([a, b]) => {
      ctx.beginPath(); ctx.moveTo(RING.L - 70, 336 + a); ctx.lineTo(RING.L - 22, 258 + b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(RING.R + 70, 336 + a); ctx.lineTo(RING.R + 22, 258 + b); ctx.stroke();
    });
  };

  function post(ctx, x, y0, y1) {
    ctx.fillStyle = '#3a3f55'; ctx.fillRect(x - 5, y0, 10, y1 - y0);
    ctx.fillStyle = '#ef3e4a'; ctx.fillRect(x - 8, y0 + 18, 16, 14);
    ctx.fillStyle = '#e8ebf2'; ctx.fillRect(x - 8, y0 + 42, 16, 14);
    ctx.fillStyle = '#3aa7ff'; ctx.fillRect(x - 8, y0 + 66, 16, 14);
  }
  function ropes(ctx, x0, x1, ys, a) {
    const cols = ['#ef3e4a', '#e8ebf2', '#3aa7ff'];
    ys.forEach((y, i) => { ctx.strokeStyle = cols[i]; ctx.globalAlpha *= a; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.globalAlpha /= a; });
  }

  // ---- wrestler body ----
  // o: { x, ground, y, facing, s, w, colors, pose, glow }
  RR.drawBody = function (ctx, o) {
    const { s, w, colors: C } = o, P = o.pose;
    const thigh = 26 * s, shin = 25 * s, torso = 50 * s, up = 23 * s, fore = 23 * s, head = 12.5 * s;
    const standHip = o.ground + o.y - (thigh + shin) * 0.97 + P.crouch + P.dy;
    const lieHip = o.ground + o.y - 11 * w + P.dy;
    const hipY = RR.lerp(standHip, lieHip, P.lie || 0);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(o.x, o.ground + 2, 34 * w * (1 + (P.lie || 0) * 0.6), 7, 0, 0, PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(o.x + P.dx * o.facing, hipY);
    ctx.scale(o.facing, 1);
    ctx.rotate(P.rot || 0);
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 22; }

    const skinB = shade(C.skin, -0.18), boot = shade(C.trunks, -0.35);
    const limb = (x0, y0, a1, l1, a2, l2, wid, col, endCol) => {
      const x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
      const x2 = x1 + Math.sin(a1 + a2) * l2, y2 = y1 + Math.cos(a1 + a2) * l2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = wid; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (endCol) {
        ctx.strokeStyle = endCol; ctx.lineWidth = wid + 1;
        ctx.beginPath(); ctx.moveTo((x1 + x2 * 2) / 3, (y1 + y2 * 2) / 3); ctx.lineTo(x2, y2); ctx.stroke();
      }
    };
    const shoulder = () => ({ x: 0, y: -torso + 8 * s });

    // back arm
    ctx.save(); ctx.rotate(P.lean);
    const sh = shoulder();
    limb(sh.x - 3, sh.y, P.armB[0], up, P.armB[1], fore, 9.5 * w, skinB, shade(C.accent, -0.2));
    ctx.restore();
    // back leg
    limb(-4 * w, 0, P.legB[0], thigh, P.legB[1], shin, 11.5 * w, skinB, boot);

    // torso
    ctx.save(); ctx.rotate(P.lean);
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.moveTo(-12 * w, 4); ctx.lineTo(12 * w, 4);
    ctx.lineTo(17 * w, -torso + 10 * s); ctx.quadraticCurveTo(0, -torso - 4 * s, -17 * w, -torso + 10 * s);
    ctx.closePath(); ctx.fill();
    if (C.top) { ctx.fillStyle = C.trunks; ctx.fillRect(-15 * w, -torso + 12 * s, 30 * w, 18 * s); ctx.fillStyle = C.accent; ctx.fillRect(-15 * w, -torso + 26 * s, 30 * w, 3 * s); }
    // neck + head
    ctx.fillStyle = C.skin; ctx.fillRect(-4 * s, -torso - 6 * s, 8 * s, 10 * s);
    const hx = 2 * s, hy = -torso - head - 2 * s;
    drawHead(ctx, hx, hy, head, s, C);
    ctx.restore();

    // trunks
    ctx.fillStyle = C.trunks;
    ctx.beginPath(); ctx.moveTo(-13 * w, -8 * s); ctx.lineTo(13 * w, -8 * s); ctx.lineTo(14 * w, 12 * s); ctx.lineTo(-14 * w, 12 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.accent; ctx.fillRect(-13 * w, -8 * s, 26 * w, 4 * s);

    // front leg
    limb(5 * w, 0, P.legF[0], thigh, P.legF[1], shin, 12 * w, C.skin, boot);
    // front arm
    ctx.save(); ctx.rotate(P.lean);
    const sh2 = shoulder();
    limb(sh2.x + 3, sh2.y, P.armF[0], up, P.armF[1], fore, 10 * w, C.skin, C.accent);
    ctx.restore();
    ctx.restore();
  };

  function drawHead(ctx, x, y, r, s, C) {
    const hair = C.hair || { style: 'bald', color: '#222' };
    if (hair.style === 'long' || hair.style === 'ponytail') {
      ctx.fillStyle = hair.color;
      if (hair.style === 'long') ctx.fillRect(x - r * 1.05, y - r * 0.4, r * 1.2, r * 2.2);
      else { ctx.beginPath(); ctx.ellipse(x - r * 1.2, y + r * 0.2, r * 0.45, r * 1.1, 0.5, 0, PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    if (C.beard) { ctx.fillStyle = C.beard; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.35, r * 0.72, 0.1, PI - 0.4); ctx.fill(); }
    ctx.fillStyle = hair.color;
    switch (hair.style) {
      case 'short': case 'buzz': case 'long': case 'ponytail':
        ctx.beginPath(); ctx.arc(x, y, r * 1.02, PI * 1.02, PI * 2.05); ctx.fill();
        if (hair.style !== 'buzz') ctx.fillRect(x - r, y - r * 0.2, r * 0.6, r * 0.7);
        break;
      case 'mohawk':
        ctx.fillRect(x - r * 0.5, y - r * 1.7, r * 0.75, r * 0.9);
        break;
      case 'spiky':
        ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.3);
        for (let i = 0; i <= 5; i++) { const a = PI + i * PI / 5; ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6); ctx.lineTo(x + Math.cos(a + PI / 10) * r, y + Math.sin(a + PI / 10) * r); }
        ctx.closePath(); ctx.fill();
        break;
      case 'topknot':
        ctx.beginPath(); ctx.arc(x, y, r * 1.02, PI * 1.02, PI * 2.05); ctx.fill();
        ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 1.15, r * 0.4, 0, PI * 2); ctx.fill();
        break;
      case 'mask':
        ctx.beginPath(); ctx.arc(x, y, r * 1.03, 0, PI * 2); ctx.fill();
        ctx.fillStyle = C.accent; ctx.fillRect(x - r, y - r * 0.15, r * 2, r * 0.18);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(x + r * 0.5, y - r * 0.2, r * 0.28, r * 0.16, -0.2, 0, PI * 2); ctx.fill();
        return;
    }
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.15, Math.max(1.4, r * 0.12), 0, PI * 2); ctx.fill();
  }

  RR.drawFighter = function (ctx, f, frame) {
    const pose = RR.getPose(f, frame);
    const glow = f.state === 'attack' && f.moveKey === 'special' ? (f.meter >= 100 ? '#ffc531' : '#ffffff') : null;
    RR.drawBody(ctx, { x: f.x, ground: RING.FLOOR, y: f.y, facing: f.facing, s: f.scale, w: f.width, colors: f.colors, pose, glow });
    if (f.state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.12 + i * 2.1;
        ctx.fillStyle = '#ffc531';
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 20, RING.FLOOR - 128 * f.scale + Math.sin(a) * 6, 4, 0, PI * 2); ctx.fill();
      }
    }
    if (f.flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, f.flashT / 20) + ')';
      ctx.font = `600 16px ${BODY}`; ctx.textAlign = 'center';
      ctx.fillText(f.flashMsg, f.x, RING.FLOOR - 140 * f.scale);
    }
  };

  // ---- whole frame ----
  RR.renderWorld = function (ctx, opts) {
    const { frame, match, excite, tron, fighters, dark, spot } = opts;
    ctx.save();
    if (match) {
      const z = match.zoom, k = Math.min(1, Math.max(0, (z - 1) / 0.35));
      const cx = RR.lerp(W / 2, match.focusX, k), cy = RR.lerp(H / 2, RING.FLOOR - 110, k);
      const sh = reduceMotion ? 0 : match.shake;
      ctx.translate(W / 2 + (Math.random() - 0.5) * sh, H / 2 + (Math.random() - 0.5) * sh);
      ctx.scale(z, z); ctx.translate(-cx, -cy);
    }
    RR.drawArena(ctx, frame, excite, tron);
    RR.drawRingBack(ctx);
    const list = (fighters || []).slice().sort((a, b) => (a.state === 'scene' && b.state === 'scene' ? 0 : depth(a) - depth(b)));
    list.forEach(f => RR.drawFighter(ctx, f, frame));
    RR.drawRingFront(ctx);
    if (match) drawFx(ctx, match);
    ctx.restore();

    if (dark > 0) {
      ctx.save();
      const gx = spot ? spot.x : W / 2, gy = spot ? spot.y : 330;
      const rg = ctx.createRadialGradient(gx, gy, 30, gx, gy, 230);
      rg.addColorStop(0, `rgba(5,6,14,${dark * 0.15})`); rg.addColorStop(1, `rgba(5,6,14,${dark})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (match && match.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${match.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
  };
  const depth = f => (['down', 'pinned', 'ko'].includes(f.state) ? 0 : 1);

  function drawFx(ctx, m) {
    for (const p of m.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    for (const t of m.texts) {
      ctx.globalAlpha = Math.min(1, t.life / 25);
      ctx.font = `700 20px ${BODY}`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(t.msg, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.msg, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD (screen space) ----
  RR.drawHUD = function (ctx, m, labels) {
    m.f.forEach((f, i) => drawPanel(ctx, f, i, labels[i], m.frame));
    // banners
    for (const b of m.banners) {
      const age = b.max - b.life, inK = Math.min(1, age / 8), outK = Math.min(1, b.life / 12);
      ctx.save(); ctx.globalAlpha = outK;
      ctx.translate(W / 2, 250); ctx.scale(0.6 + 0.4 * inK, 0.6 + 0.4 * inK); ctx.rotate(-0.04);
      ctx.textAlign = 'center'; ctx.font = `56px ${DISPLAY}`;
      ctx.lineWidth = 10; ctx.strokeStyle = '#0b0d1c'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
      if (b.sub) { ctx.font = `600 24px ${BODY}`; ctx.lineWidth = 6; ctx.strokeText(b.sub, 0, 34); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 34); }
      ctx.restore();
    }
    // pin kick-out bar
    if (m.pin && !m.pin.auto) {
      const P = m.pin, k = Math.min(1, P.presses / P.need), x = W / 2 - 150, y = 330;
      ctx.fillStyle = 'rgba(11,13,28,0.85)'; ctx.fillRect(x - 10, y - 30, 320, 62);
      ctx.fillStyle = '#fff'; ctx.font = `700 18px ${BODY}`; ctx.textAlign = 'center';
      ctx.fillText(P.on.ai ? 'KICK OUT!' : 'MASH ANY BUTTON TO KICK OUT', W / 2, y - 10);
      ctx.fillStyle = '#2c3364'; ctx.fillRect(x, y, 300, 18);
      ctx.fillStyle = P.mashT > 0 ? '#ffffff' : '#39c6f0'; ctx.fillRect(x, y, 300 * k, 18);
    }
  };

  function drawPanel(ctx, f, i, label, frame) {
    const right = i === 1, bw = 276, x = right ? W - 24 - bw : 24, y = 18;
    const col = right ? '#3aa7ff' : '#ef3e4a';
    ctx.textAlign = right ? 'right' : 'left';
    ctx.font = `18px ${DISPLAY}`; ctx.fillStyle = '#fff';
    ctx.fillText(f.def.short, right ? x + bw : x, y + 16);
    const nameW = ctx.measureText(f.def.short).width;
    ctx.font = `700 15px ${BODY}`; ctx.fillStyle = col;
    ctx.fillText(label, right ? x + bw - nameW - 10 : x + nameW + 10, y + 15);
    // HP
    const by = y + 26, hpK = f.hp / f.maxHp, dispK = f.dispHp / f.maxHp;
    ctx.fillStyle = '#0b0d1c'; ctx.fillRect(x - 2, by - 2, bw + 4, 22);
    ctx.fillStyle = '#ffffff'; fillBar(ctx, x, by, bw, 18, dispK, right);
    ctx.fillStyle = hpK < 0.25 ? (frame % 20 < 10 ? '#ef3e4a' : '#ff7a7a') : hpK < 0.5 ? '#ffc531' : '#5fe08a';
    fillBar(ctx, x, by, bw, 18, hpK, right);
    ctx.font = `700 14px ${BODY}`; ctx.fillStyle = '#0b0d1c'; ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(`${Math.ceil(f.hp)} / ${f.maxHp} HP`, right ? x + bw - 6 : x + 6, by + 14);
    // stamina
    ctx.fillStyle = '#0b0d1c'; ctx.fillRect(x, by + 22, bw, 6);
    ctx.fillStyle = f.stamina < 25 ? '#ef3e4a' : '#9cd6ff'; fillBar(ctx, x, by + 22, bw, 6, f.stamina / 100, right);
    // special meter
    const my = by + 34, mw = bw, mx = x;
    ctx.fillStyle = '#0b0d1c'; ctx.fillRect(mx, my, mw, 12);
    const full = f.meter >= 100;
    ctx.fillStyle = full ? (frame % 16 < 8 ? '#ffc531' : '#fff2b0') : f.meter >= 50 ? '#ffffff' : '#8a90b8';
    fillBar(ctx, mx, my, mw, 12, f.meter / 100, right);
    ctx.fillStyle = '#0b0d1c'; ctx.fillRect(mx + mw / 2 - 1, my, 2, 12);
    ctx.font = `700 13px ${BODY}`; ctx.fillStyle = full ? '#ffc531' : '#cfd3ea'; ctx.textAlign = right ? 'right' : 'left';
    const tag = full ? 'FINISHER READY' : f.meter >= 50 ? 'SIGNATURE READY' : 'SPECIAL';
    ctx.fillText(tag, right ? mx + mw : mx, my + 30);
  }
  function fillBar(ctx, x, y, w, h, k, fromRight) {
    k = Math.max(0, Math.min(1, k));
    if (fromRight) ctx.fillRect(x + w * (1 - k), y, w * k, h); else ctx.fillRect(x, y, w * k, h);
  }

  // ---- select-screen portrait ----
  RR.drawPortrait = function (canvas, def, outfit, frame) {
    const ctx = canvas.getContext('2d'), cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, shade(outfit[0], 0.15)); g.addColorStop(1, '#0b0d1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    const k = ch / 150;
    ctx.save(); ctx.scale(k, k);
    const pose = RR.basePose(); pose.crouch = 2 + Math.sin((frame || 0) * 0.08) * 1.5;
    pose.armF = [0.9, -2.0]; pose.armB = [0.7, -1.9];
    RR.drawBody(ctx, { x: (cw / k) / 2, ground: 210, y: 0, facing: 1, s: 1.15, w: def.build.w * 1.05, colors: { skin: def.skin, trunks: outfit[0], accent: outfit[1], hair: def.hair, beard: def.beard, top: def.top }, pose });
    ctx.restore();
  };
})();
