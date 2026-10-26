// Boot and game loop: fixed 60 updates per second, drawn once per screen refresh.
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = RR.W * dpr; canvas.height = RR.H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function drawSelectPortraits(frame) {
    if (RR.Game.screen !== 'select') return;
    [0, 1].forEach(p => {
      const c = document.querySelector(`#pp-${p} canvas.big`);
      if (!c) return;
      const def = RR.ROSTER[RR.Game.cursor[p]];
      RR.drawPortrait(c, def, def.outfits[RR.Game.outfit[p]], frame);
    });
  }

  RR.Game.init();

  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= STEP) {
      RR.Input.poll();
      RR.Game.update();
      RR.Input.endFrame();
      acc -= STEP;
    }
    RR.Game.render(ctx);
    drawSelectPortraits(RR.Game.frame);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
