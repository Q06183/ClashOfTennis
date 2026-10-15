(function(){
'use strict';
/* ===== 数据：全部来自 qa/physics_report.json 与 serve_plan.json（构建时内联） ===== */
var D = window.__KAI_DATA__;
var FPS = D.fps, N = D.frames.length, F0 = D.frames[0], FN = D.frames[N - 1];
var C = D.T.contact, TAKEOFF = D.air[0], LAND = D.air[1] + 1;
var state = { f: C, playing: false, speed: 0.5, cam: 'front', chart: 'speed', t: (C - F0) / FPS };
// shareable deep link: #f=58&cam=court&speed=0.25
(function(){
  var h = (location.hash || '').replace(/^#/, ''); if (!h) return;
  h.split('&').forEach(function(kv){
    var p = kv.split('='), k = p[0], v = decodeURIComponent(p[1] || '');
    if (k === 'f' && isFinite(+v)) { state.f = Math.max(F0, Math.min(FN, +v)); state.t = (state.f - F0) / FPS; }
    if (k === 'cam' && /^(side|front|back|court)$/.test(v)) state.cam = v;
    if (k === 'speed' && /^(1|0\.5|0\.25)$/.test(v)) state.speed = +v;
  });
})();
window.__kai = state;

var PHASES = [
  { f: D.T.start,   name: '准备',     desc: '侧身站位，左脚指向网柱，重心落在两脚之间' },
  { f: D.T.release, name: '抛球',     desc: '左臂伸直上举送球，后脚开始向前脚并拢' },
  { f: D.T.trophy,  name: '奖杯位',   desc: '骨盆下沉蓄力，肩线向后拉开，双臂抬起' },
  { f: TAKEOFF,     name: '蹬地起跳', desc: '膝伸展最快的时刻，身体离地向上向前' },
  { f: D.T.drop,    name: '拍头下坠', desc: '肩外旋到最大，拍头垂到背后最低处，击球前约 0.07 秒' },
  { f: C,           name: '击球',     desc: '手臂几乎伸直，人在空中，拍头速度到达峰值', contact: true },
  { f: D.T.decel,   name: '随挥减速', desc: '前臂内旋，球拍从身体左侧收下' },
  { f: LAND,        name: '落地',     desc: '左脚先落进场内，膝盖弯曲缓冲' }
];
function phaseAt(f){ var p = PHASES[0]; for (var i = 0; i < PHASES.length; i++) if (f >= PHASES[i].f) p = PHASES[i]; return p; }

/* ===== DOM ===== */
var $ = function(id){ return document.getElementById(id); };
var el = { vp: $('viewport'), loading: $('loading'), fallback: $('fallback'), fbMsg: $('fallbackMsg'),
  phase: $('bPhase'), rel: $('bRel'), air: $('bAir'), track: $('track'), fill: $('fill'), head: $('head'),
  airZone: $('airZone'), tickLabels: $('tickLabels'), chart: $('chart'), note: $('chartNote'),
  play: $('btnPlay'), lblPlay: $('lblPlay'), icoPlay: $('icoPlay'), phases: $('phases'), qa: $('qa'),
  rFrame: $('rFrame'), rSpeed: $('rSpeed'), rKnee: $('rKnee'), rElbow: $('rElbow'), rPel: $('rPel'), rFeet: $('rFeet'), foot: $('foot'), hint: $('hint') };

function pct(f){ return ((f - F0) / (FN - F0)) * 100; }
// ticks + labels
(function buildTimeline(){
  var html = '', lab = '';
  PHASES.forEach(function(p){
    html += '<div class="tick' + (p.contact ? ' c' : '') + '" style="left:' + pct(p.f).toFixed(2) + '%"></div>';
    if (p.name === '准备' || p.name === '奖杯位' || p.name === '击球' || p.name === '落地' || p.name === '抛球')
      lab += '<span' + (p.contact ? ' class="c"' : '') + ' style="left:' + Math.min(96, Math.max(3, pct(p.f))).toFixed(2) + '%">' + p.name + '</span>';
  });
  el.head.insertAdjacentHTML('beforebegin', html);
  el.tickLabels.innerHTML = lab;
  el.airZone.style.left = pct(TAKEOFF).toFixed(2) + '%';
  el.airZone.style.width = (pct(LAND) - pct(TAKEOFF)).toFixed(2) + '%';
})();
(function buildPhases(){
  el.phases.innerHTML = PHASES.map(function(p, i){
    var t = ((p.f - C) / FPS);
    var rel = p.f === C ? '0.00 s' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2) + ' s';
    return '<li data-i="' + i + '" class="' + (p.contact ? 'c' : '') + '"><span class="rail"><span class="dot"></span></span>' +
      '<button data-f="' + p.f + '"><span class="t"><b>' + p.name + '</b><i>第 ' + p.f + ' 帧 · ' + rel + '</i></span><span class="d">' + p.desc + '</span></button></li>';
  }).join('');
  el.phases.addEventListener('click', function(e){ var b = e.target.closest('button[data-f]'); if (b){ pause(); seek(+b.dataset.f); } });
})();
(function buildQA(){
  var ok = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  el.qa.innerHTML = D.qa.map(function(q){ return '<li>' + ok + '<span class="n">' + q[0] + '</span><span class="m">' + q[1] + '</span></li>'; }).join('');
  el.foot.textContent = D.foot;
})();

/* ===== 图表（canvas 2D，确定性绘制） ===== */
var chartCtx = el.chart.getContext('2d');
function drawChart(){
  var cv = el.chart, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  var g = chartCtx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  var padL = 34, padR = 8, padT = 8, padB = 18, W = w - padL - padR, H = h - padT - padB;
  var x = function(f){ return padL + (f - F0) / (FN - F0) * W; };
  var series, ymax, unit, colors;
  if (state.chart === 'speed') { series = [D.racket]; ymax = 45; unit = 'm/s'; colors = ['#ff6a3d']; }
  else { series = [D.kneeL, D.elbowR]; ymax = 150; unit = '°'; colors = ['#d9f03a', '#f3edce']; }
  var y = function(v){ return padT + H - Math.min(v, ymax) / ymax * H; };
  g.font = '12px "Noto Sans SC",sans-serif'; g.fillStyle = '#7f9a93'; g.strokeStyle = '#2c5557'; g.lineWidth = 1;
  var steps = state.chart === 'speed' ? [0, 20, 40] : [0, 50, 100, 150];
  steps.forEach(function(v){ g.beginPath(); g.moveTo(padL, y(v) + .5); g.lineTo(w - padR, y(v) + .5); g.stroke(); g.fillText(String(v), 4, y(v) + 4); });
  g.fillText(unit, 4, padT + 2 + (state.chart === 'speed' ? 10 : 10) - 10 + 0);
  // air zone
  g.fillStyle = 'rgba(255,106,61,.12)'; g.fillRect(x(TAKEOFF), padT, x(LAND) - x(TAKEOFF), H);
  series.forEach(function(s, k){
    g.beginPath(); g.strokeStyle = colors[k]; g.lineWidth = 2;
    for (var i = 0; i < N; i++){ var px = x(D.frames[i]), py = y(s[i]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  });
  // contact marker
  g.strokeStyle = '#ff6a3d'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(C) + .5, padT); g.lineTo(x(C) + .5, padT + H); g.stroke(); g.setLineDash([]);
  // playhead
  var fx = x(state.f); g.strokeStyle = '#f3edce'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx, padT); g.lineTo(fx, padT + H); g.stroke();
  var fi = Math.max(0, Math.min(N - 1, Math.round(state.f) - F0));
  series.forEach(function(s, k){ g.fillStyle = colors[k]; g.beginPath(); g.arc(fx, y(s[fi]), 4, 0, Math.PI * 2); g.fill(); });
  // x labels
  g.fillStyle = '#7f9a93'; g.fillText('抛球', x(D.T.release) - 12, h - 3); g.fillText('击球', x(C) - 12, h - 3); g.fillText('落地', x(LAND) - 4, h - 3);
  if (state.chart === 'joint') {
    g.fillStyle = '#d9f03a'; g.fillText('左膝', w - padR - 76, padT + 12); g.fillStyle = '#f3edce'; g.fillText('右肘', w - padR - 36, padT + 12);
  }
}
el.note.textContent = '峰值 ' + D.peakSpeed.toFixed(1) + ' m/s，正好落在击球帧';
document.getElementById('segChart').addEventListener('click', function(e){
  var b = e.target.closest('button[data-v]'); if (!b) return;
  state.chart = b.dataset.v; setPressed(this, b);
  el.note.textContent = state.chart === 'speed' ? '峰值 ' + D.peakSpeed.toFixed(1) + ' m/s，正好落在击球帧' : '奖杯位膝屈最深 ' + D.kneeMax + '°，击球时肘几乎伸直';
  drawChart();
});

/* ===== UI 同步 ===== */
function setPressed(group, btn){ group.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); }); }
function fmtRel(f){ var t = (f - C) / FPS; if (Math.abs(t) < 0.5 / FPS) return '击球瞬间'; return '击球' + (t < 0 ? '前 ' : '后 ') + Math.abs(t).toFixed(2) + ' 秒'; }
function syncUI(){
  var f = state.f, fi = Math.max(0, Math.min(N - 1, Math.round(f) - F0)), fr = D.frames[fi];
  var p = phaseAt(fr);
  el.phase.textContent = p.name; el.rel.textContent = fmtRel(fr);
  var airborne = D.shoeL[fi] > 0.012 && D.shoeR[fi] > 0.012;
  el.air.classList.toggle('on', airborne);
  var P = pct(f); el.fill.style.width = P + '%'; el.head.style.left = P + '%';
  el.track.setAttribute('aria-valuenow', String(fr));
  el.rFrame.innerHTML = fr + '<small>帧 / ' + ((fr - F0) / FPS).toFixed(2) + 's</small>';
  el.rSpeed.innerHTML = D.racket[fi].toFixed(1) + '<small>m/s</small>';
  el.rKnee.innerHTML = Math.round(D.kneeL[fi]) + '<small>°</small>';
  el.rElbow.innerHTML = Math.round(D.elbowR[fi]) + '<small>°</small>';
  el.rPel.innerHTML = D.pelvis[fi].toFixed(2) + '<small>m</small>';
  el.rFeet.textContent = airborne ? '离地' : (D.shoeL[fi] > 0.012 ? '右脚撑地' : (D.shoeR[fi] > 0.012 ? '左脚撑地' : '双脚着地'));
  var cur = PHASES.indexOf(p);
  el.phases.querySelectorAll('li').forEach(function(li, i){ li.classList.toggle('on', i === cur); });
  drawChart();
}

/* ===== 播放控制 ===== */
function seek(f){ state.f = Math.max(F0, Math.min(FN, f)); state.t = (state.f - F0) / FPS; applyFrame(); syncUI(); }
function play(){ if (state.f >= FN) seek(F0); state.playing = true; el.lblPlay.textContent = '暂停'; el.icoPlay.innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'; }
function pause(){ state.playing = false; el.lblPlay.textContent = '播放'; el.icoPlay.innerHTML = '<path d="M7 5v14l12-7z"/>'; }
el.play.addEventListener('click', function(){ state.playing ? pause() : play(); });
$('btnPrev').addEventListener('click', function(){ pause(); seek(Math.round(state.f) - 1); });
$('btnNext').addEventListener('click', function(){ pause(); seek(Math.round(state.f) + 1); });
document.getElementById('segSpeed').addEventListener('click', function(e){ var b = e.target.closest('button[data-v]'); if (!b) return; state.speed = +b.dataset.v; setPressed(this, b); });
document.getElementById('segCam').addEventListener('click', function(e){ var b = e.target.closest('button[data-v]'); if (!b) return; state.cam = b.dataset.v; setPressed(this, b); goCam(state.cam, false); });
(function scrub(){
  var dragging = false;
  function at(e){ var r = el.track.getBoundingClientRect(); var u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); seek(F0 + u * (FN - F0)); }
  el.track.addEventListener('pointerdown', function(e){ dragging = true; pause(); el.track.setPointerCapture(e.pointerId); at(e); });
  el.track.addEventListener('pointermove', function(e){ if (dragging) at(e); });
  el.track.addEventListener('pointerup', function(){ dragging = false; });
  el.track.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft'){ pause(); seek(Math.round(state.f) - (e.shiftKey ? 10 : 1)); e.preventDefault(); }
    if (e.key === 'ArrowRight'){ pause(); seek(Math.round(state.f) + (e.shiftKey ? 10 : 1)); e.preventDefault(); }
  });
})();
document.addEventListener('keydown', function(e){
  if (e.target === el.track) return;
  if (e.code === 'Space'){ e.preventDefault(); state.playing ? pause() : play(); }
  if (e.key === 'ArrowLeft'){ pause(); seek(Math.round(state.f) - 1); }
  if (e.key === 'ArrowRight'){ pause(); seek(Math.round(state.f) + 1); }
});

/* ===== 3D ===== */
var three = null;
function fail(msg){ el.loading.style.display = 'none'; el.fallback.style.display = 'flex'; if (msg) el.fbMsg.textContent = msg; el.hint.style.display = 'none'; document.body.dataset.ready = 'fallback'; }
function applyFrame(){ if (three) three.apply(state.t); }
function goCam(){ if (three) three.cam(state.cam); }

function b64ToBuf(s){ var bin = atob(s), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

function init3D(){
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return fail('3D 库没有加载成功（需要联网访问 jsDelivr），这里先显示发球关键姿态图。');
  var cvs = document.createElement('canvas');
  var ok = !!(cvs.getContext('webgl2') || cvs.getContext('webgl'));
  if (!ok) return fail();
  var renderer = new THREE.WebGLRenderer({ antialias: true, canvas: cvs, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.vp.insertBefore(cvs, el.vp.firstChild);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8d0);
  scene.fog = new THREE.Fog(0xc9d8d0, 26, 70);
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  var camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  // lights: key (sun, shadows), sky fill, rim
  var hemi = new THREE.HemisphereLight(0xe8f0ff, 0x3a6b5e, 0.55); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1dc, 2.1); sun.position.set(-5, 9, -4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 4; sc.bottom = -2; sc.near = 1; sc.far = 30; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  var rim = new THREE.DirectionalLight(0xdff2ff, 0.7); rim.position.set(3, 4, 8); scene.add(rim);

  // ---- court (game palette: Rally Club court.ts) ----
  var court = new THREE.Group(); scene.add(court);
  function plane(w, d, color, y, x, z){ var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.92, metalness: 0 })); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y, z || 0); m.receiveShadow = true; court.add(m); return m; }
  var BL = D.court.baselineZ, NETZ = D.court.netZ, FARZ = 2 * NETZ - BL;
  plane(40, 60, 0x397c69, -0.002, 0, NETZ);
  plane(10.97, 23.77, 0x266c81, 0.0, 0, NETZ);
  plane(8.23, 23.77, 0x33869a, 0.001, 0, NETZ);
  var lineM = new THREE.MeshStandardMaterial({ color: 0xf3edce, roughness: 0.8 });
  function line(x0, z0, x1, z1){ var w = 0.05, len = Math.hypot(x1 - x0, z1 - z0); var m = new THREE.Mesh(new THREE.PlaneGeometry(x0 === x1 ? w : len, x0 === x1 ? len : w), lineM); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2); m.receiveShadow = true; court.add(m); }
  var HS = 4.115, HD = 5.485, SL = 6.40;
  [BL, FARZ].forEach(function(z){ line(-HD, z, HD, z); });
  [-HD, -HS, HS, HD].forEach(function(x){ line(x, BL, x, FARZ); });
  [NETZ - SL, NETZ + SL].forEach(function(z){ line(-HS, z, HS, z); });
  line(0, NETZ - SL, 0, NETZ + SL);
  line(0, BL, 0, BL + 0.12); line(0, FARZ, 0, FARZ - 0.12);
  // target service box highlight (deuce -> diagonal box on far side, +x side when facing +z)
  var box = new THREE.Mesh(new THREE.PlaneGeometry(HS, SL), new THREE.MeshBasicMaterial({ color: 0xd9f03a, transparent: true, opacity: 0.16, depthWrite: false }));
  box.rotation.x = -Math.PI / 2; box.position.set(HS / 2, 0.004, NETZ + SL / 2); court.add(box);
  // net
  var netM = new THREE.MeshStandardMaterial({ color: 0x143e40, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  var net = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.914), netM); net.position.set(0, 0.457, NETZ); court.add(net);
  var tape = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0xede8d2, roughness: 0.6 })); tape.position.set(0, 0.93, NETZ); court.add(tape);
  [-6.4, 6.4].forEach(function(x){ var p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.07, 12), new THREE.MeshStandardMaterial({ color: 0x143e40, roughness: 0.5 })); p.position.set(x, 0.535, NETZ); p.castShadow = true; court.add(p); });

  // ---- ball trail + landing ----
  var trailN = 400, trailPos = new Float32Array(trailN * 3);
  var trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setDrawRange(0, 0);
  var trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xd9f03a, transparent: true, opacity: 0.85 }));
  scene.add(trail);
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 40), new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.0, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(D.flight.land[0], 0.006, D.flight.land[1]); scene.add(ring);

  var loader = new THREE.GLTFLoader();
  var raw = document.getElementById('kai-glb').textContent.trim();
  loader.parse(b64ToBuf(raw), '', function(gltf){
    var root = gltf.scene; scene.add(root);
    root.traverse(function(o){ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material && o.material.name === 'Kai_StringBed'){ o.material.alphaTest = 0.5; o.material.transparent = false; o.material.depthWrite = true; o.castShadow = false; } } });
    var mixer = new THREE.AnimationMixer(root);
    var clips = gltf.animations, actions = [];
    var clipDur = 0;
    clips.forEach(function(c){ var a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play(); actions.push(a); clipDur = Math.max(clipDur, c.duration); });
    var ball = root.getObjectByName('Kai_Ball');
    var dur = (FN - F0) / FPS;
    var tContact = (C - F0) / FPS;
    var cpos = new THREE.Vector3().fromArray(D.flight.contact);
    // precomputed post-contact flight (drag + gravity, solved to land in the service box)
    var path = D.flight.path; // [t, x, y, z] from contact; then bounce
    function ballAfter(t){
      var dt = t - tContact;
      if (dt <= 0) return null;
      var P = path, i = 0;
      while (i < P.length - 1 && P[i + 1][0] < dt) i++;
      var a = P[i], b = P[Math.min(i + 1, P.length - 1)], u = b[0] === a[0] ? 0 : (dt - a[0]) / (b[0] - a[0]);
      u = Math.max(0, Math.min(1, u));
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, i];
    }
    three = {
      apply: function(t){
        var tc = Math.max(0, Math.min(dur, t));
        // glTF keys sit at f / fps (frame 1 = 1/60 s), so clip time = t + F0 / fps
        mixer.setTime(Math.min(tc + F0 / FPS, clipDur - 1e-4));
        // ball: animated toss up to contact, then court flight
        var after = ballAfter(tc);
        if (after && ball){ ball.position.set(after[0], after[1], after[2]); ball.updateMatrixWorld(); }
        // trail
        var n = 0;
        if (after){
          trailPos[0] = cpos.x; trailPos[1] = cpos.y; trailPos[2] = cpos.z; n = 1;
          for (var k = 0; k <= after[3] && n < trailN - 1; k++){ trailPos[n * 3] = path[k][1]; trailPos[n * 3 + 1] = path[k][2]; trailPos[n * 3 + 2] = path[k][3]; n++; }
          trailPos[n * 3] = after[0]; trailPos[n * 3 + 1] = after[1]; trailPos[n * 3 + 2] = after[2]; n++;
        }
        trailGeo.setDrawRange(0, n); trailGeo.attributes.position.needsUpdate = true;
        var landed = (tc - tContact) >= D.flight.t;
        ring.material.opacity = landed ? 0.9 : 0.0;
      },
      cam: function(name, instant){ camGoal = CAMS[name]; if (instant){ camera.position.copy(camGoal.pos); controls.target.copy(camGoal.tgt); camera.fov = camGoal.fov; camera.updateProjectionMatrix(); } camT = instant ? 1 : 0; camFrom = { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov }; }
    };
    // ---- cameras (framed from subject size: body ~1.87 m + racket reach to 2.95 m) ----
    var CAMS = {
      side:  { pos: new THREE.Vector3(-5.6, 1.55, 0.55), tgt: new THREE.Vector3(0, 1.45, 0.45), fov: 36 },
      front: { pos: new THREE.Vector3(-3.4, 1.85, 5.2),  tgt: new THREE.Vector3(0, 1.40, 0.35), fov: 38 },
      back:  { pos: new THREE.Vector3(0.9, 2.1, -5.4),   tgt: new THREE.Vector3(0, 1.45, 0.6),  fov: 38 },
      court: { pos: new THREE.Vector3(-4.8, 4.6, -6.2),  tgt: new THREE.Vector3(0.6, 0.6, 8.5), fov: 40 }
    };
    var controls = new THREE.OrbitControls(camera, cvs);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
    controls.minDistance = 2.4; controls.maxDistance = 22; controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI * 0.49;
    var camGoal = CAMS[state.cam], camFrom = null, camT = 1;
    controls.addEventListener('start', function(){ camT = 1; });
    three.cam(state.cam, true);
    function resize(){ var w = el.vp.clientWidth, h = el.vp.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); drawChart(); }
    window.addEventListener('resize', resize); resize();
    applyFrame(); syncUI();
    renderer.render(scene, camera);
    el.loading.style.display = 'none';
    document.body.dataset.ready = '3d';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var last = performance.now();
    function loop(now){
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (document.hidden){ requestAnimationFrame(loop); return; }
      if (state.playing){
        state.t += dt * state.speed;
        var end = (FN - F0) / FPS;
        if (state.t >= end){ state.t = end; state.f = FN; applyFrame(); syncUI(); pause(); }
        else { state.f = F0 + state.t * FPS; applyFrame(); syncUI(); }
      }
      if (camT < 1 && camFrom){
        camT = Math.min(1, camT + dt / (reduce ? 0.01 : 0.7));
        var e = 1 - Math.pow(1 - camT, 3);
        camera.position.lerpVectors(camFrom.pos, camGoal.pos, e);
        controls.target.lerpVectors(camFrom.tgt, camGoal.tgt, e);
        camera.fov = camFrom.fov + (camGoal.fov - camFrom.fov) * e; camera.updateProjectionMatrix();
      }
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }, function(err){ console.error(err); fail('模型解析失败，这里先显示发球关键姿态图。'); });
}

syncUI();
// reflect deep-link state in the segmented controls
(function(){
  [['segSpeed', String(state.speed)], ['segCam', state.cam]].forEach(function(p){
    var g = document.getElementById(p[0]); var b = g.querySelector('button[data-v="' + p[1] + '"]'); if (b) setPressed(g, b);
  });
})();
try { init3D(); } catch (e) { console.error(e); fail(); }
})();
