// 3D view of the sync: Shopify and Salesforce as two stations, the sync service as a hub,
// and a parcel for every event that moves between them.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const host = document.getElementById('scene3d');
if (host) {
  try { init(); } catch (e) { console.error(e); host.classList.add('no3d'); }
}

function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 2.5, 0.1, 100);
  const target = new THREE.Vector3(0, 0.45, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdb8, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(-3.5, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 25 });
  sun.shadow.radius = 7;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe8eefc, 0.5);
  fill.position.set(4, 3, -3);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const paperMat = new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.82 });

  function station(x, color) {
    const g = new THREE.Group();
    g.position.x = x;
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.7, 1.7, 6, 0.16), paperMat);
    base.position.y = 0.35;
    base.castShadow = base.receiveShadow = true;
    const plateMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: 0x000000 });
    const plate = new THREE.Mesh(new RoundedBoxGeometry(1.34, 0.12, 1.34, 4, 0.05), plateMat);
    plate.position.y = 0.76;
    plate.castShadow = true;
    g.add(base, plate);
    scene.add(g);
    return { g, plate, plateMat, home: new THREE.Color(color), pulse: 0, x };
  }
  const shop = station(-2.75, 0x5e8e3e);
  const sf = station(2.75, 0x0b86c8);

  const hub = new THREE.Group();
  const hubBody = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.36, 64), new THREE.MeshStandardMaterial({ color: 0x1d1b18, roughness: 0.38 }));
  hubBody.position.y = 0.18;
  hubBody.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 12, 72, Math.PI * 1.6), new THREE.MeshStandardMaterial({ color: 0xf2eee5, roughness: 0.3 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.37;
  hub.add(hubBody, ring);
  scene.add(hub);

  // tracks between the stations and the hub
  const curveL = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-2.75, 0.95, 0), new THREE.Vector3(-1.35, 2.0, 0), new THREE.Vector3(0, 0.52, 0));
  const curveR = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.52, 0), new THREE.Vector3(1.35, 2.0, 0), new THREE.Vector3(2.75, 0.95, 0));
  const dash = new THREE.LineDashedMaterial({ color: 0x191816, dashSize: 0.07, gapSize: 0.09, transparent: true, opacity: 0.35 });
  [curveL, curveR].forEach(c => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(60)), dash);
    line.computeLineDistances();
    scene.add(line);
  });

  const boxGeo = new RoundedBoxGeometry(0.5, 0.35, 0.42, 3, 0.045);
  const tapeGeo = new THREE.BoxGeometry(0.51, 0.357, 0.09);
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xe9dab9, roughness: 0.55 });
  const ringGeo = new THREE.RingGeometry(0.62, 0.68, 64);

  const TINT = { dup: 0x93600b, loop: 0x5e477f, retry: 0x93600b, fail: 0xa3321f };
  const parcels = new Map();
  const ripples = [];

  function makeParcel() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc79d66, roughness: 0.88, transparent: true });
    const g = new THREE.Group();
    const b = new THREE.Mesh(boxGeo, mat);
    b.castShadow = true;
    const t = new THREE.Mesh(tapeGeo, tapeMat.clone());
    t.material.transparent = true;
    g.add(b, t);
    scene.add(g);
    return { g, mat, tape: t.material };
  }
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const pointOn = (curve, t, reverse) => curve.getPoint(reverse ? 1 - t : t);

  function startParcel(id, dir) {
    const p = { id, dir, ...makeParcel(), phase: 'toHub', t: 0, status: null, spin: Math.random() * 6 };
    p.from = dir === 's2f' ? shop : sf;
    p.to = dir === 's2f' ? sf : shop;
    p.inCurve = dir === 's2f' ? [curveL, false] : [curveR, true];
    p.outCurve = dir === 's2f' ? [curveR, false] : [curveL, true];
    p.g.position.copy(pointOn(p.inCurve[0], 0, p.inCurve[1]));
    p.g.scale.setScalar(0.01);
    parcels.set(id, p);
  }
  function tint(p, hex) { p.mat.color.lerp(new THREE.Color(hex), 0.55); }
  function setStatus(id, kind) {
    const p = parcels.get(id);
    if (!p) return;
    p.status = kind;
    if (p.phase === 'wait') decide(p);
  }
  function decide(p) {
    const k = p.status;
    if (!k || k === 'run') return;
    if (k === 'ok' || k === 'recovered') { p.phase = 'toDest'; p.t = 0; if (k === 'recovered') p.mat.color.set(0xc79d66); }
    else if (k === 'dup') { tint(p, TINT.dup); p.phase = 'drop'; p.t = 0; p.vy = 0; p.vx = (p.dir === 's2f' ? 1 : -1) * 0.6; }
    else if (k === 'loop') { tint(p, TINT.loop); p.phase = 'fade'; p.t = 0; }
    else if (k === 'fail') { tint(p, TINT.fail); p.phase = 'fade'; p.t = 0; }
    else if (k === 'retry') { tint(p, TINT.retry); p.phase = 'wait'; }
  }
  function ripple(st) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: st.home, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(st.x, 0.84, 0);
    scene.add(m);
    ripples.push({ m, t: 0 });
    st.pulse = 1;
  }
  function remove(p) { scene.remove(p.g); parcels.delete(p.id); }

  let offline = false;
  window.addEventListener('sync3d', e => {
    const d = e.detail || {};
    if (d.type === 'start') startParcel(d.id, d.dir);
    else if (d.type === 'status') setStatus(d.id, d.kind);
    else if (d.type === 'outage') offline = !!d.on;
    else if (d.type === 'reset') { [...parcels.values()].forEach(remove); offline = false; }
  });

  // labels under each station
  const labels = { shop: host.querySelector('.l-shop'), hub: host.querySelector('.l-hub'), sf: host.querySelector('.l-sf') };
  const tmp = new THREE.Vector3();
  function placeLabel(el, x, y, z) {
    if (!el) return;
    tmp.set(x, y, z).project(camera);
    el.style.transform = `translate(${((tmp.x + 1) / 2) * host.clientWidth}px, ${((1 - tmp.y) / 2) * host.clientHeight}px) translate(-50%, 0)`;
  }

  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole row of stations in view at any width
    const need = 8.4, vfov = THREE.MathUtils.degToRad(camera.fov);
    const dist = Math.max((need / 2) / (Math.tan(vfov / 2) * camera.aspect), 3.2 / Math.tan(vfov / 2) / 1.6);
    camera.userData.dist = dist;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(host);
  fit();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 }).observe(host);

  const clock = new THREE.Clock();
  let time = 0;
  const offCol = new THREE.Color(0xa3321f);
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    time += dt;

    const d = camera.userData.dist || 10;
    const sway = Math.sin(time * 0.25) * 0.55;
    camera.position.set(sway, d * 0.52, d * 0.86);
    camera.lookAt(target);

    ring.rotation.z -= dt * (parcels.size ? 2.2 : 0.5);

    sf.plateMat.color.lerp(offline ? offCol : sf.home, 0.08);
    sf.g.position.y += ((offline ? -0.06 : 0) - sf.g.position.y) * 0.1;
    [shop, sf].forEach(st => {
      st.pulse = Math.max(0, st.pulse - dt * 2.2);
      st.plate.position.y = 0.76 + Math.sin(st.pulse * Math.PI) * 0.08;
      st.plateMat.emissive.setScalar(st.pulse * 0.18);
    });

    for (const p of [...parcels.values()]) {
      p.spin += dt;
      if (p.phase === 'toHub') {
        p.t = Math.min(1, p.t + dt / 0.75);
        p.g.position.copy(pointOn(p.inCurve[0], ease(p.t), p.inCurve[1]));
        p.g.scale.setScalar(Math.min(1, p.t * 4));
        p.g.rotation.set(Math.sin(p.spin * 3) * 0.25, p.spin * 2.2, 0);
        if (p.t >= 1) { p.phase = 'wait'; decide(p); }
      } else if (p.phase === 'wait') {
        p.g.position.set(0, 0.68 + Math.sin(p.spin * 4) * 0.06, 0);
        p.g.rotation.y += dt * 1.2;
        if (p.status === 'retry') p.mat.emissive.setRGB(0.25 * (0.5 + 0.5 * Math.sin(p.spin * 6)), 0.12 * (0.5 + 0.5 * Math.sin(p.spin * 6)), 0);
      } else if (p.phase === 'toDest') {
        p.mat.emissive.setScalar(0);
        p.t = Math.min(1, p.t + dt / 0.7);
        p.g.position.copy(pointOn(p.outCurve[0], ease(p.t), p.outCurve[1]));
        p.g.rotation.set(Math.sin(p.spin * 3) * 0.25, p.spin * 2.2, 0);
        if (p.t > 0.85) p.g.scale.setScalar(Math.max(0.01, (1 - p.t) / 0.15));
        if (p.t >= 1) { ripple(p.to); remove(p); }
      } else if (p.phase === 'drop') {
        p.t += dt;
        p.vy -= dt * 6;
        p.g.position.x += p.vx * dt;
        p.g.position.y = Math.max(0.14, p.g.position.y + p.vy * dt);
        p.g.rotation.z += dt * 3 * Math.sign(p.vx);
        if (p.t > 0.6) { const o = Math.max(0, 1 - (p.t - 0.6) / 0.6); p.mat.opacity = o; p.tape.opacity = o; }
        if (p.t > 1.2) remove(p);
      } else if (p.phase === 'fade') {
        p.t += dt;
        p.g.position.y += dt * 0.5;
        p.g.rotation.y += dt * 2;
        const o = Math.max(0, 1 - p.t / 0.9);
        p.mat.opacity = o; p.tape.opacity = o;
        p.g.scale.setScalar(0.6 + 0.4 * o);
        if (p.t > 0.9) remove(p);
      }
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt;
      r.m.scale.setScalar(1 + r.t * 1.6);
      r.m.material.opacity = Math.max(0, 0.7 * (1 - r.t / 0.9));
      if (r.t > 0.9) { scene.remove(r.m); ripples.splice(i, 1); }
    }

    renderer.render(scene, camera);
    placeLabel(labels.shop, -2.75, -0.05, 0.9);
    placeLabel(labels.hub, 0, -0.05, 0.6);
    placeLabel(labels.sf, 2.75, -0.05, 0.9);
    if (labels.sf) labels.sf.classList.toggle('off', offline);
  }
  frame();
  host.classList.add('ready');
}
