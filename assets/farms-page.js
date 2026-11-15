// Stilwell Farms: the in-page Game Boy Color player. Nothing here loads the emulator core, the ROM or an
// AudioContext until the Play pill is pressed. Core: binjgb (MIT), vendored in assets/vendor/binjgb.
(function () {
  'use strict';
  var root = document.getElementById('gbc'); if (!root) return;
  var screen = document.getElementById('gbc-screen'), canvas = document.getElementById('gbc-canvas'),
    play = document.getElementById('gbc-play'), pad = document.getElementById('gbc-pad'), dpad = document.getElementById('gbc-dpad'),
    ctl = document.getElementById('gbc-ctl'), pauseBtn = document.getElementById('gbc-pause'), muteBtn = document.getElementById('gbc-mute'),
    stateEl = document.getElementById('gbc-state');
  if (!screen || !canvas || !play || !window.WebAssembly) { if (play) play.hidden = true; return; }

  var TICKS = 4194304, FRAMES = 4096, NEW_FRAME = 1, AUDIO_FULL = 2, UNTIL = 4, MAX_STEP = 5 / 60, LATENCY = 0.1;
  var SAVE_KEY = 'stilwell-farms.sav';
  var M = null, e = 0, joy = 0, actx = null, ctx2d = null, image = null;
  var raf = 0, lastSec = 0, leftover = 0, audioAt = 0, saveTimer = 0;
  var started = false, userPaused = false, onScreen = true, muted = false;

  function say(t) { if (stateEl) stateEl.textContent = t; }
  function view(ptr, size) { return new Uint8Array(M.HEAP8.buffer, ptr, size); }

  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('core')); }; document.head.appendChild(s); });
  }

  // ── battery RAM: the valley lives there, so it is kept in this browser ──
  function withExtRam(fn) {
    var fd = M._ext_ram_file_data_new(e), out = fn(fd, view(M._get_file_data_ptr(fd), M._get_file_data_size(fd)));
    M._file_data_delete(fd); M._free(fd); return out;
  }
  function loadSave() {
    var s = null; try { s = localStorage.getItem(SAVE_KEY); } catch (x) {}
    if (!s) return;
    try {
      var bin = atob(s);
      withExtRam(function (fd, buf) {
        if (buf.byteLength !== bin.length) return;
        for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        M._emulator_read_ext_ram(e, fd);
      });
    } catch (x) {}
  }
  function writeSave() {
    if (!e) return;
    try {
      var s = withExtRam(function (fd, buf) {
        M._emulator_write_ext_ram(e, fd);
        var out = '', n = buf.byteLength;
        for (var i = 0; i < n; i += 0x8000) out += String.fromCharCode.apply(null, buf.subarray(i, Math.min(n, i + 0x8000)));
        return btoa(out);
      });
      localStorage.setItem(SAVE_KEY, s);
    } catch (x) {}
  }

  // ── the loop ──
  function pushAudio() {
    if (!actx || muted) return;
    var now = actx.currentTime, src = view(M._get_audio_buffer_ptr(e), M._get_audio_buffer_capacity(e));
    if (!audioAt || audioAt < now) audioAt = now + LATENCY;
    var b = actx.createBuffer(2, FRAMES, actx.sampleRate), l = b.getChannelData(0), r = b.getChannelData(1);
    for (var i = 0; i < FRAMES; i++) { l[i] = src[2 * i] * 0.5 / 255; r[i] = src[2 * i + 1] * 0.5 / 255; }
    var n = actx.createBufferSource(); n.buffer = b; n.connect(actx.destination); n.start(audioAt);
    audioAt += FRAMES / actx.sampleRate;
  }
  function runUntil(t) {
    var drew = false;
    for (;;) {
      var ev = M._emulator_run_until_f64(e, t);
      if (ev & NEW_FRAME) { image.data.set(view(M._get_frame_buffer_ptr(e), M._get_frame_buffer_size(e))); drew = true; }
      if (ev & AUDIO_FULL) pushAudio();
      if (ev & UNTIL) break;
    }
    if (drew) ctx2d.putImageData(image, 0, 0);
  }
  function frame(ms) {
    raf = requestAnimationFrame(frame);
    var sec = ms / 1000, d = Math.min(Math.max(sec - (lastSec || sec), 0), MAX_STEP);
    var until = M._emulator_get_ticks_f64(e) + d * TICKS - leftover;
    runUntil(until);
    leftover = (M._emulator_get_ticks_f64(e) - until) | 0;
    lastSec = sec;
  }
  function running() { return raf !== 0; }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (actx && actx.state === 'running') actx.suspend(); release(); }
  function go() { if (raf || !started) return; lastSec = 0; leftover = 0; audioAt = 0; if (actx) actx.resume(); raf = requestAnimationFrame(frame); }
  function sync() {
    var want = started && !userPaused && onScreen && !document.hidden;
    if (want) go(); else stop();
    root.classList.toggle('paused', started && !want);
    if (started) say(userPaused ? 'Paused' : want ? 'Running' : 'Paused off screen');
  }

  // ── buttons ──
  var SET = { up: '_set_joyp_up', down: '_set_joyp_down', left: '_set_joyp_left', right: '_set_joyp_right', A: '_set_joyp_A', B: '_set_joyp_B', start: '_set_joyp_start', select: '_set_joyp_select' };
  var KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyX: 'A', KeyZ: 'B', Enter: 'start', NumpadEnter: 'start', ShiftLeft: 'select', ShiftRight: 'select' };
  function press(name, on) { if (e && running()) M[SET[name]](e, on ? 1 : 0); }
  function release() { if (!e) return; for (var k in SET) M[SET[k]](e, 0); }
  function focused() { return document.activeElement === screen; }
  function onKey(ev) {
    var name = KEY[ev.code];
    if (!name || !started || !focused() || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    press(name, ev.type === 'keydown');
  }

  function bindPad() {
    [].forEach.call(pad.querySelectorAll('[data-joy]'), function (b) {
      var name = b.getAttribute('data-joy');
      var down = function (ev) { ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch (x) {} b.classList.add('on'); press(name, true); };
      var up = function () { b.classList.remove('on'); press(name, false); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    });
    var dirs = function (ev) {
      var q = dpad.getBoundingClientRect(), x = 2 * (ev.clientX - q.left) / q.width - 1, y = 2 * (ev.clientY - q.top) / q.height - 1, dz = 0.28;
      press('left', x < -dz && Math.abs(y) < Math.abs(x) * 2); press('right', x > dz && Math.abs(y) < Math.abs(x) * 2);
      press('up', y < -dz && Math.abs(x) < Math.abs(y) * 2); press('down', y > dz && Math.abs(x) < Math.abs(y) * 2);
    };
    var held = false, off = function () { held = false; dpad.classList.remove('on'); press('left', false); press('right', false); press('up', false); press('down', false); };
    dpad.addEventListener('pointerdown', function (ev) { ev.preventDefault(); held = true; try { dpad.setPointerCapture(ev.pointerId); } catch (x) {} dpad.classList.add('on'); dirs(ev); });
    dpad.addEventListener('pointermove', function (ev) { if (held) dirs(ev); });
    dpad.addEventListener('pointerup', off); dpad.addEventListener('pointercancel', off);
    dpad.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  // ── start: the only place anything is fetched ──
  function boot() {
    if (started || play.disabled) return;
    play.disabled = true; say('Loading');
    var AC = window.AudioContext || window.webkitAudioContext;
    try { actx = AC ? new AC() : null; } catch (x) { actx = null; }   // made inside the press, so sound is allowed
    Promise.all([
      loadScript(root.getAttribute('data-core')).then(function () { return window.Binjgb(); }),
      fetch(root.getAttribute('data-rom')).then(function (r) { if (!r.ok) throw new Error('rom'); return r.arrayBuffer(); })
    ]).then(function (got) {
      M = got[0]; var rom = new Uint8Array(got[1]), size = (rom.byteLength + 0x7fff) & ~0x7fff, ptr = M._malloc(size);
      var mem = view(ptr, size); mem.fill(0); mem.set(rom);
      e = M._emulator_new_simple(ptr, size, actx ? actx.sampleRate : 44100, FRAMES, 0);   // colour curve 0: the palette as authored, matching the stills
      if (!e) throw new Error('rom');
      joy = M._joypad_new(); M._emulator_set_default_joypad_callback(e, joy);
      loadSave();
      ctx2d = canvas.getContext('2d'); image = ctx2d.createImageData(160, 144);
      canvas.hidden = false; play.hidden = true; root.classList.add('on');
      pad.hidden = false; ctl.hidden = false; bindPad();
      screen.tabIndex = 0; screen.setAttribute('aria-label', 'Stilwell Farms. Arrow keys move, X is A, Z is B, Enter is Start, Shift is Select.');
      try { screen.focus({ preventScroll: true }); } catch (x) { screen.focus(); }
      started = true;
      saveTimer = setInterval(function () { if (e && M._emulator_was_ext_ram_updated(e)) writeSave(); }, 3000);
      sync();
    }).catch(function () {
      if (actx) { try { actx.close(); } catch (x) {} actx = null; }
      play.hidden = true; say('The player could not start here; the ROM is in the download below');
    });
  }

  play.addEventListener('click', boot);
  screen.addEventListener('pointerdown', function () { if (started && !focused()) { try { screen.focus({ preventScroll: true }); } catch (x) { screen.focus(); } } });
  screen.addEventListener('blur', release);
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
  pauseBtn.addEventListener('click', function () { userPaused = !userPaused; pauseBtn.setAttribute('aria-pressed', String(userPaused)); sync(); if (!userPaused) screen.focus({ preventScroll: true }); });
  muteBtn.addEventListener('click', function () { muted = !muted; audioAt = 0; muteBtn.setAttribute('aria-pressed', String(!muted)); if (started) screen.focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) writeSave(); sync(); });
  addEventListener('pagehide', writeSave);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.15 }).observe(screen);
})();
