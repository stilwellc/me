// Printed parts in 3D. The STLs are the files that were printed; this spins
// them in the page. Three.js is vendored under assets/vendor and loads only
// when someone asks for it. Each mesh ships as .stl.gz next to the raw .stl:
// the gzip is fetched and inflated in the browser, the raw file is the
// fallback (and what the download links point at).
(function () {
  var SPEC = {
    tasteful: { w: 203.2, d: 177.8, cols: 6, ripple: true, zmax: 64 },
    light: { w: 250, d: 250, cols: 5, ripple: true, zmax: 64 },
    v1: { w: 250, d: 250, cols: 5, ripple: true, zmax: 64 },
    ape: { w: 0, d: 0, cols: 1, ripple: false, color: 0xd6d1c8, view: 'front' }
  };
  var V = 'assets/vendor/three-0.147.0/';
  var LIBS = [V + 'three.min.js', V + 'STLLoader.js', V + 'OrbitControls.js'];
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = matchMedia('(pointer: coarse)');
  var libs = null, geos = {};
  function script(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function ready() { return libs || (libs = LIBS.reduce(function (p, u) { return p.then(function () { return script(u); }); }, Promise.resolve())); }

  function inflate(buf) {
    var b = new Uint8Array(buf);
    if (b[0] !== 0x1f || b[1] !== 0x8b) return Promise.resolve(buf);   // a server already decoded it
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  function raw(url) { return new Promise(function (ok, no) { new THREE.STLLoader().load(url, ok, undefined, no); }); }
  function geo(url) {
    if (geos[url]) return geos[url];
    var p = ('DecompressionStream' in window)
      ? fetch(url + '.gz').then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(inflate).then(function (buf) { return new THREE.STLLoader().parse(buf); })
          .catch(function () { return raw(url); })
      : raw(url);
    return (geos[url] = p);
  }

  // one viewer per figure: a canvas that takes the plate's place
  function Viewer(fig, build) {
    this.fig = fig; this.build = build; this.spec = SPEC[build] || SPEC.tasteful;
    var box = document.createElement('div'); box.className = 'v3d'; box.hidden = true;
    box.innerHTML = '<canvas></canvas><span class="v3d-state mono" aria-live="polite"></span><span class="v3d-hint mono"></span>';
    fig.insertBefore(box, fig.querySelector('figcaption'));
    this.box = box; this.canvas = box.querySelector('canvas'); this.state = box.querySelector('.v3d-state'); this.hint = box.querySelector('.v3d-hint');
    this.scene = null; this.group = null; this.raf = 0; this.idle = true; this.armed = !coarse.matches;
    box.style.touchAction = 'pan-y'; this.canvas.style.touchAction = 'pan-y';
    this.say();
  }
  Viewer.prototype.say = function () {
    this.hint.textContent = coarse.matches
      ? (this.armed ? 'drag to orbit · pinch to zoom' : 'tap to rotate · pinch to zoom')
      : 'drag to orbit · ⌘ or ctrl + scroll to zoom';
  };
  // touch: the page keeps scrolling through the viewer until a tap or a
  // two-finger gesture says the visitor means the model
  Viewer.prototype.arm = function () {
    if (this.armed) return; this.armed = true;
    this.box.style.touchAction = 'none'; this.canvas.style.touchAction = 'none';
    if (this.ctl) this.ctl.enabled = true;
    this.say();
  };
  Viewer.prototype.boot = function () {
    if (this.scene) return;
    var self = this, c = this.canvas, r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9d9a94, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 1.35); sun.position.set(0.6, -0.7, 1.1); scene.add(sun);
    var fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-1, 0.4, 0.5); scene.add(fill);
    var cam = new THREE.PerspectiveCamera(32, 16 / 10, 1, 8000); cam.up.set(0, 0, 1);
    var ctl = new THREE.OrbitControls(cam, c);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.autoRotate = !reduce.matches; ctl.autoRotateSpeed = 0.6; ctl.enablePan = false;
    ctl.enableZoom = false;              // the wheel scrolls the page; zoom is ctrl/⌘ + wheel or a pinch
    ctl.enabled = this.armed;
    c.style.touchAction = this.armed ? 'none' : 'pan-y';   // OrbitControls sets 'none' unconditionally
    c.addEventListener('pointerdown', function (e) {
      ctl.enableZoom = e.pointerType === 'touch';      // pinch dolly lives inside OrbitControls
      if (self.armed) { ctl.autoRotate = false; self.idle = false; }
    });
    var down = null;
    c.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && !self.armed) down = [e.clientX, e.clientY, Date.now()]; });
    c.addEventListener('pointerup', function (e) {
      if (!down) return; var dx = e.clientX - down[0], dy = e.clientY - down[1], dt = Date.now() - down[2]; down = null;
      if (dx * dx + dy * dy < 100 && dt < 400) self.arm();
    });
    c.addEventListener('touchstart', function (e) { if (e.touches.length > 1) self.arm(); }, { passive: true });
    c.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey) || !self.group) return;
      e.preventDefault(); ctl.autoRotate = false; self.idle = false;
      var off = cam.position.clone().sub(ctl.target), len = off.length();
      var next = Math.min(ctl.maxDistance, Math.max(ctl.minDistance, len * Math.exp(e.deltaY * 0.0022)));
      cam.position.copy(ctl.target).add(off.multiplyScalar(next / len));
    }, { passive: false });
    this.renderer = r; this.scene = scene; this.cam = cam; this.ctl = ctl;
    this.mat = new THREE.MeshStandardMaterial({ color: this.spec.color || 0xcdc8bf, roughness: 0.68, metalness: 0.0, flatShading: false });
    if (this.spec.ripple && !reduce.matches) this.ripple();
    this.size();
    addEventListener('resize', function () { self.size(); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { self.visible = e.isIntersecting; if (self.visible) self.loop(); }); }, { threshold: 0.05 });
    io.observe(c);
  };
  // a gentle ripple through the slats, following the pointer. The slats bend
  // in proportion to their height so the back plate never moves. Vertex
  // shader only: one distance and one sine per vertex.
  Viewer.prototype.ripple = function () {
    var self = this, u = { uP: { value: new THREE.Vector2(0, 0) }, uT: { value: 0 }, uA: { value: 0 }, uZ: { value: this.spec.zmax } };
    this.rip = { u: u, target: 0, last: 0, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), ray: new THREE.Raycaster(), hit: new THREE.Vector3(), t0: performance.now() };
    this.mat.onBeforeCompile = function (sh) {
      sh.uniforms.uP = u.uP; sh.uniforms.uT = u.uT; sh.uniforms.uA = u.uA; sh.uniforms.uZ = u.uZ;
      sh.vertexShader = 'uniform vec2 uP; uniform float uT; uniform float uA; uniform float uZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'vec2 wp = (modelMatrix * vec4(position, 1.0)).xy; float rd = distance(wp, uP);\n' +
        'transformed.z += uA * clamp(position.z / uZ, 0.0, 1.0) * sin(rd * 0.07 - uT * 5.0) * exp(-rd * rd / 16200.0);');
    };
    var ndc = new THREE.Vector2();
    this.canvas.addEventListener('pointermove', function (e) {
      if (!self.group) return;
      var r = self.canvas.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      self.rip.ray.setFromCamera(ndc, self.cam);
      if (self.rip.ray.ray.intersectPlane(self.rip.plane, self.rip.hit)) { u.uP.value.set(self.rip.hit.x, self.rip.hit.y); self.rip.target = 1; self.rip.last = performance.now(); }
    });
    this.canvas.addEventListener('pointerleave', function () { self.rip.target = 0; });
  };
  Viewer.prototype.tickRipple = function (now) {
    var rp = this.rip; if (!rp) return;
    if (now - rp.last > 1400) rp.target = 0;
    var a = rp.u.uA.value; a += ((rp.target * 3.2) - a) * 0.06; rp.u.uA.value = a < 0.01 ? 0 : a;
    rp.u.uT.value = (now - rp.t0) / 1000;
  };
  Viewer.prototype.size = function () {
    var w = this.box.clientWidth || 600, h = Math.round(w * 10 / 16);
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  };
  Viewer.prototype.loop = function () {
    var self = this; if (this.raf) return;
    var tick = function (now) { self.raf = 0; if (!self.visible || self.box.hidden) return; self.tickRipple(now); self.ctl.update(); self.renderer.render(self.scene, self.cam); self.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  };
  Viewer.prototype.frame = function () {
    var b = new THREE.Box3().setFromObject(this.group), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    var span = Math.max(s.x, s.y * 1.25, s.z * 1.6), dist = span / (2 * Math.tan(this.cam.fov * Math.PI / 360)) * 0.9;
    this.ctl.target.copy(c);
    if (this.spec.view === 'front') { dist = Math.max(s.x, s.z * 1.6) / (2 * Math.tan(this.cam.fov * Math.PI / 360)) * 1.05; this.cam.position.set(c.x + dist * 0.45, c.y - dist * 0.9, c.z + dist * 0.18); }
    else this.cam.position.set(c.x - dist * 0.25, c.y - dist * 0.85, c.z + dist * 0.8);
    this.cam.near = dist / 50; this.cam.far = dist * 20; this.cam.updateProjectionMatrix();
    if (this.rip) this.rip.plane.constant = -(b.min.z + s.z * 0.5);
    this.ctl.minDistance = dist * 0.3; this.ctl.maxDistance = dist * 3; this.ctl.autoRotate = this.idle && !reduce.matches;
  };
  // tiles: [{id, stl}] with ids r<row>_c<col>; a single part sits at the origin, a run lays out on the grid
  Viewer.prototype.show = function (tiles) {
    var self = this, c = this.canvas; this.box.hidden = false; this.fig.classList.add('is-3d');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', (this.build === 'ape' ? 'The ape bust' : tiles.length === 1 ? 'Tile ' + tiles[0].id.replace('_', ' ') : 'The full run, ' + tiles.length + ' tiles') + ', in 3D. ' + this.hint.textContent.charAt(0).toUpperCase() + this.hint.textContent.slice(1) + '.');
    c.style.transition = reduce.matches ? 'none' : 'opacity 240ms cubic-bezier(.2,.7,.1,1)'; c.style.opacity = '0';
    this.state.textContent = 'loading ' + (this.build === 'ape' ? 'the bust' : tiles.length === 1 ? tiles[0].id.replace('_', ' ') : tiles.length + ' tiles') + ' …';
    return ready().then(function () { self.boot(); self.size(); return Promise.all(tiles.map(function (t) { return geo(t.stl); })); }).then(function (gs) {
      if (self.group) self.scene.remove(self.group);
      var g = new THREE.Group(), spec = self.spec;
      gs.forEach(function (geom, i) {
        var m = new THREE.Mesh(geom, self.mat), rc = /r(\d+)_c(\d+)/.exec(tiles[i].id);
        if (tiles.length > 1 && rc) { m.position.set(+rc[2] * spec.w, +rc[1] * spec.d, 0); }
        g.add(m);
      });
      self.group = g; self.scene.add(g); self.frame(); self.state.textContent = ''; self.visible = true; self.loop();
      requestAnimationFrame(function () { c.style.opacity = '1'; });
    }).catch(function () { self.state.textContent = 'the 3D view could not load'; c.style.opacity = '1'; });
  };
  Viewer.prototype.hide = function () {
    this.box.hidden = true; this.fig.classList.remove('is-3d');
    this.canvas.removeAttribute('role'); this.canvas.removeAttribute('aria-label');
  };

  window.Wave3D = { Viewer: Viewer };

  // declarative: <button data-v3d="figure-id" data-build="ape" data-stl="…">
  // toggles a viewer inside that figure, so pages need no script of their own
  function wire() {
    [].forEach.call(document.querySelectorAll('button[data-v3d]'), function (b) {
      var fig = document.getElementById(b.dataset.v3d); if (!fig) return;
      var v = null, on = false;
      b.addEventListener('click', function () {
        on = !on; b.setAttribute('aria-pressed', on); b.classList.toggle('on', on);
        if (!v) v = new Viewer(fig, b.dataset.build || 'ape');
        if (on) { v.show([{ id: b.dataset.build || 'part', stl: b.dataset.stl }]); fig.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' }); }
        else v.hide();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
