// The wave tiles in 3D. The STLs are the files that were printed; this spins
// them in the page. Three.js loads only when someone asks for it.
(function () {
  var TILE = { tasteful: { w: 203.2, d: 177.8, cols: 6 }, light: { w: 250, d: 250, cols: 5 }, v1: { w: 250, d: 250, cols: 5 } };
  var LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.147.0/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/STLLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
  ];
  var libs = null, geos = {};
  function script(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function ready() { return libs || (libs = LIBS.reduce(function (p, u) { return p.then(function () { return script(u); }); }, Promise.resolve())); }
  function geo(url) {
    return geos[url] || (geos[url] = new Promise(function (ok, no) { new THREE.STLLoader().load(url, function (g) { ok(g); }, undefined, no); }));
  }

  // one viewer per figure: a canvas that takes the plate's place
  function Viewer(fig, build) {
    this.fig = fig; this.build = build; this.spec = TILE[build];
    var box = document.createElement('div'); box.className = 'v3d'; box.hidden = true;
    box.innerHTML = '<canvas aria-label="The tile, in 3D. Drag to orbit, scroll to zoom."></canvas><span class="v3d-state mono" aria-live="polite"></span>';
    fig.insertBefore(box, fig.querySelector('figcaption'));
    this.box = box; this.canvas = box.querySelector('canvas'); this.state = box.querySelector('.v3d-state');
    this.scene = null; this.group = null; this.raf = 0; this.idle = true;
  }
  Viewer.prototype.boot = function () {
    if (this.scene) return;
    var c = this.canvas, r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9d9a94, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 1.35); sun.position.set(0.6, -0.7, 1.1); scene.add(sun);
    var fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-1, 0.4, 0.5); scene.add(fill);
    var cam = new THREE.PerspectiveCamera(32, 16 / 10, 1, 8000); cam.up.set(0, 0, 1);
    var ctl = new THREE.OrbitControls(cam, c); ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.autoRotate = true; ctl.autoRotateSpeed = 0.6; ctl.enablePan = false;
    var self = this; c.addEventListener('pointerdown', function () { ctl.autoRotate = false; self.idle = false; });
    this.renderer = r; this.scene = scene; this.cam = cam; this.ctl = ctl;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xcdc8bf, roughness: 0.68, metalness: 0.0, flatShading: false });
    this.size();
    addEventListener('resize', function () { self.size(); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { self.visible = e.isIntersecting; if (self.visible) self.loop(); }); }, { threshold: 0.05 });
    io.observe(c);
  };
  Viewer.prototype.size = function () {
    var w = this.box.clientWidth || 600, h = Math.round(w * 10 / 16);
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  };
  Viewer.prototype.loop = function () {
    var self = this; if (this.raf) return;
    var tick = function () { self.raf = 0; if (!self.visible || self.box.hidden) return; self.ctl.update(); self.renderer.render(self.scene, self.cam); self.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  };
  Viewer.prototype.frame = function () {
    var b = new THREE.Box3().setFromObject(this.group), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    var span = Math.max(s.x, s.y * 1.25, s.z * 1.6), dist = span / (2 * Math.tan(this.cam.fov * Math.PI / 360)) * 0.9;
    this.ctl.target.copy(c); this.cam.position.set(c.x - dist * 0.25, c.y - dist * 0.85, c.z + dist * 0.8); this.cam.near = dist / 50; this.cam.far = dist * 20; this.cam.updateProjectionMatrix();
    this.ctl.minDistance = dist * 0.3; this.ctl.maxDistance = dist * 3; this.ctl.autoRotate = this.idle;
  };
  // tiles: [{id, stl}] with ids r<row>_c<col>; a single tile sits at the origin, a run lays out on the grid
  Viewer.prototype.show = function (tiles) {
    var self = this; this.box.hidden = false; this.fig.classList.add('is-3d');
    this.state.textContent = 'loading ' + (tiles.length === 1 ? tiles[0].id.replace('_', ' ') : tiles.length + ' tiles') + ' …';
    return ready().then(function () { self.boot(); self.size(); return Promise.all(tiles.map(function (t) { return geo(t.stl); })); }).then(function (gs) {
      if (self.group) self.scene.remove(self.group);
      var g = new THREE.Group(), spec = self.spec;
      gs.forEach(function (geom, i) {
        var m = new THREE.Mesh(geom, self.mat), rc = /r(\d+)_c(\d+)/.exec(tiles[i].id);
        if (tiles.length > 1 && rc) { m.position.set(+rc[2] * spec.w, +rc[1] * spec.d, 0); }
        g.add(m);
      });
      self.group = g; self.scene.add(g); self.frame(); self.state.textContent = ''; self.visible = true; self.loop();
    }).catch(function () { self.state.textContent = 'the 3D view could not load'; });
  };
  Viewer.prototype.hide = function () { this.box.hidden = true; this.fig.classList.remove('is-3d'); };

  window.Wave3D = { Viewer: Viewer };
})();
