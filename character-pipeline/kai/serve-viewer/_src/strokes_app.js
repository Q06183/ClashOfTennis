(function(){
'use strict';
/* data inlined at build time: window.__KAI_DATA__ */
var DATA = window.__KAI_DATA__;
var STROKES = ['Serve','Forehand','Backhand'];
var ZH = {Serve:'平击一发', Forehand:'正手', Backhand:'双手反手'};
var SUB = {Serve:'右手持拍 · 平分区发球 · 2.50 秒，全程基于真人动作捕捉重定向。',
           Forehand:'右手正手 · 单手击球 · 2.20 秒，身体与手臂来自真人动捕，拍头滞后与球路按生物力学补齐。',
           Backhand:'双手反拍 · 非持拍手上握 · 2.20 秒，双手全程同步，数据来自同一选手的真人动捕。'};
var FPS = 60;

var state = { stroke:'Serve', f:1, playing:false, speed:0.5, cam:'front', chart:'speed', t:0, hashStroke:null };
(function(){
  var h = (location.hash||'').replace(/^#/,''); if (!h) return;
  h.split('&').forEach(function(kv){
    var p = kv.split('='), k = p[0], v = decodeURIComponent(p[1]||'');
    if (k === 'stroke' && STROKES.indexOf(v) >= 0){ state.stroke = v; state.hashStroke = v; }
    if (k === 'cam' && /^(side|front|back|court)$/.test(v)) state.cam = v;
    if (k === 'speed' && /^(1|0\.5|0\.25)$/.test(v)) state.speed = +v;
  });
})();

var $ = function(id){ return document.getElementById(id); };
var el = { vp:$('viewport'), loading:$('loading'), fallback:$('fallback'),
  phase:$('bPhase'), rel:$('bRel'), air:$('bAir'), track:$('track'), fill:$('fill'), head:$('head'),
  tickLabels:$('tickLabels'), chart:$('chart'), note:$('chartNote'),
  play:$('btnPlay'), lblPlay:$('lblPlay'), icoPlay:$('icoPlay'),
  phases:$('phases'), qa:$('qa'), qaSum:$('qaSum'), foot:$('foot'),
  rFrame:$('rFrame'), rSpeed:$('rSpeed'), rExtra:$('rExtra'), rExtraK:$('rExtraK'), rFeet:$('rFeet'),
  title:$('strokeTitle'), sub:$('strokeSub'), phaseTitle:$('phaseTitle'), hint:$('hint') };

function D(){ return DATA.strokes[state.stroke]; }
function F0(){ return D().frames[0]; } function FN(){ return D().frames[D().frames.length-1]; }
function C(){ return D().T.contact; }
function pct(f){ return ((f - F0()) / (FN() - F0())) * 100; }
function phaseList(){
  var pd = D().phaseDesc;
  return D().phases.map(function(pp){ return { key:pp[0], f:D().T[pp[0]], name:pp[1], desc:pd[pp[0]], contact: pp[0]==='contact' }; });
}
function phaseAt(f){ var ps = phaseList(), p = ps[0]; ps.forEach(function(q){ if (f >= q.f) p = q; }); return p; }

/* ---------- static DOM per stroke ---------- */
function rebuildStatic(){
  var d = D();
  el.title.innerHTML = 'Kai 的<span>' + ZH[state.stroke] + '</span>';
  el.sub.textContent = SUB[state.stroke];
  el.phaseTitle.textContent = ZH[state.stroke] + ' ' + phaseList().length + ' 个阶段';
  // ticks
  var html = '', lab = '';
  phaseList().forEach(function(p){
    html += '<div class="tick' + (p.contact ? ' c':'') + '" style="left:' + pct(p.f).toFixed(2) + '%"></div>';
    var show = state.stroke === 'Serve'
      ? (p.name==='准备'||p.name==='抛球'||p.name==='奖杯位'||p.name==='击球'||p.name==='落地')
      : (p.name==='准备分腿垫步'||p.name==='转体引拍'||p.name==='击球'||p.name==='收拍');
    if (show) lab += '<span' + (p.contact?' class="c"':'') + ' style="left:' + Math.min(96,Math.max(3,pct(p.f))).toFixed(2) + '%">' + p.name.replace('准备分腿垫步','准备').replace('转体引拍','引拍') + '</span>';
  });
  el.head.insertAdjacentHTML; // noop guard
  el.track.querySelectorAll('.tick').forEach(function(n){ n.remove(); });
  el.head.insertAdjacentHTML('beforebegin', html);
  el.tickLabels.innerHTML = lab;
  // phases list
  el.phases.innerHTML = phaseList().map(function(p, i){
    var t = (p.f - C()) / FPS;
    var rel = p.contact ? '0.00 s' : (t > 0 ? '+' : '−') + Math.abs(t).toFixed(2) + ' s';
    return '<li data-i="' + i + '" class="' + (p.contact?'c':'') + '"><span class="rail"><span class="dot"></span></span>' +
      '<button data-f="' + p.f + '"><span class="t"><b>' + p.name + '</b><i>第 ' + p.f + ' 帧 · ' + rel + '</i></span><span class="d">' + p.desc + '</span></button></li>';
  }).join('');
  // QA
  var ok = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  el.qa.innerHTML = d.qa.map(function(q){ return '<li>' + ok + '<span class="n">' + q[0] + '</span><span class="m">' + q[1] + '</span></li>'; }).join('');
  el.qaSum.innerHTML = '<b>' + d.qa.length + ' / ' + d.qa.length + '</b> 项通过，按每一帧的骨骼和网格数据计算';
  el.foot.textContent = d.foot;
  el.rExtraK.textContent = state.stroke === 'Serve' ? '左膝屈曲' : '右肘屈曲';
  el.note.textContent = '峰值 ' + d.peakSpeed.toFixed(1) + ' m/s，落在击球帧';
  el.track.setAttribute('aria-valuemin', F0()); el.track.setAttribute('aria-valuemax', FN());
  // air badge only for serve
  el.air.textContent = state.stroke === 'Serve' ? '双脚离地' : '';
}

/* ---------- chart ---------- */
var chartCtx = el.chart.getContext('2d');
function drawChart(){
  var cv = el.chart, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  if (cv.width !== Math.round(w*dpr)){ cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); }
  var g = chartCtx; g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  var padL=34, padR=8, padT=8, padB=18, Wd=w-padL-padR, Hd=h-padT-padB;
  var d = D(); var N = d.frames.length;
  var xx = function(f){ return padL + (f - F0())/(FN()-F0())*Wd; };
  var series = [d.racket], ymax = 45;
  var yy = function(v){ return padT + Hd - Math.min(v,ymax)/ymax*Hd; };
  g.font = '12px "Noto Sans SC",sans-serif'; g.fillStyle = '#7f9a93'; g.strokeStyle = '#2c5557'; g.lineWidth = 1;
  [0,20,40].forEach(function(v){ g.beginPath(); g.moveTo(padL,yy(v)+.5); g.lineTo(w-padR,yy(v)+.5); g.stroke(); g.fillText(String(v),4,yy(v)+4); });
  g.fillText('m/s', 4, padT+2);
  if (state.stroke === 'Serve'){
    g.fillStyle = 'rgba(255,106,61,.12)';
    g.fillRect(xx(d.air[0]), padT, xx(d.air[1])-xx(d.air[0]), Hd);
  }
  series.forEach(function(s){
    g.beginPath(); g.strokeStyle = '#ff6a3d'; g.lineWidth = 2;
    for (var i=0;i<N;i++){ var px = xx(d.frames[i]), py = yy(s[i]); if (i) g.lineTo(px,py); else g.moveTo(px,py); }
    g.stroke();
  });
  g.strokeStyle = '#ff6a3d'; g.setLineDash([3,3]); g.beginPath(); g.moveTo(xx(C())+.5,padT); g.lineTo(xx(C())+.5,padT+Hd); g.stroke(); g.setLineDash([]);
  var fx = xx(state.f);
  g.strokeStyle = '#f3edce'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx,padT); g.lineTo(fx,padT+Hd); g.stroke();
  var fi = Math.max(0, Math.min(N-1, Math.round(state.f)-F0()));
  g.fillStyle = '#ff6a3d'; g.beginPath(); g.arc(fx, yy(d.racket[fi]), 4, 0, Math.PI*2); g.fill();
  g.fillStyle = '#7f9a93';
  var labels = state.stroke==='Serve' ? [['抛球',d.T.toss],['击球',C()],['落地',d.T.land]] : [['引拍',d.T.takeback],['击球',C()],['收拍',d.T.finish]];
  labels.forEach(function(l){ g.fillText(l[0], xx(l[1])-12, h-3); });
}

/* ---------- UI sync ---------- */
function fmtRel(f){ var t=(f-C())/FPS; if (Math.abs(t) < 0.5/FPS) return '击球瞬间'; return '击球'+(t<0?'前 ':'后 ')+Math.abs(t).toFixed(2)+' 秒'; }
function syncUI(){
  var d = D(), fi = Math.max(0, Math.min(d.frames.length-1, Math.round(state.f)-F0()));
  var p = phaseAt(state.f);
  el.phase.textContent = p.name; el.rel.textContent = fmtRel(state.f);
  if (state.stroke === 'Serve'){
    var airborne = d.shoeL[fi] > 0.012 && d.shoeR[fi] > 0.012;
    el.air.classList.toggle('on', airborne);
    el.rFeet.textContent = airborne ? '离地' : (d.shoeL[fi] > 0.012 ? '右脚撑地' : (d.shoeR[fi] > 0.012 ? '左脚撑地' : '双脚着地'));
    el.rExtra.innerHTML = Math.round(d.kneeL[fi]) + '<small>°</small>';
  } else {
    el.air.classList.remove('on');
    el.rFeet.textContent = '双脚着地';
    el.rExtra.innerHTML = Math.round(d.elbowR[fi]) + '<small>°</small>';
  }
  var P = pct(state.f); el.fill.style.width = P + '%'; el.head.style.left = P + '%';
  el.track.setAttribute('aria-valuenow', String(d.frames[fi]));
  el.rFrame.innerHTML = d.frames[fi] + '<small>帧 / ' + ((d.frames[fi]-F0())/FPS).toFixed(2) + 's</small>';
  el.rSpeed.innerHTML = d.racket[fi].toFixed(1) + '<small>m/s</small>';
  var cur = phaseList().indexOf(p);
  el.phases.querySelectorAll('li').forEach(function(li,i){ li.classList.toggle('on', i===cur); });
  drawChart();
}

function setPressed(group, btn){ group.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x===btn?'true':'false'); }); }
function seek(f){ state.f = Math.max(F0(), Math.min(FN(), f)); state.t = (state.f-F0())/FPS; applyFrame(); syncUI(); }
function play(){ if (state.f >= FN()) seek(F0()); state.playing = true; el.lblPlay.textContent='暂停'; el.icoPlay.innerHTML='<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'; }
function pause(){ state.playing = false; el.lblPlay.textContent='播放'; el.icoPlay.innerHTML='<path d="M7 5v14l12-7z"/>'; }
el.play.addEventListener('click', function(){ state.playing ? pause() : play(); });
$('btnPrev').addEventListener('click', function(){ pause(); seek(Math.round(state.f)-1); });
$('btnNext').addEventListener('click', function(){ pause(); seek(Math.round(state.f)+1); });
$('segSpeed').addEventListener('click', function(e){ var b = e.target.closest('button[data-v]'); if(!b) return; state.speed = +b.dataset.v; setPressed(this,b); });
$('segCam').addEventListener('click', function(e){ var b = e.target.closest('button[data-v]'); if(!b) return; state.cam = b.dataset.v; setPressed(this,b); if (three) three.cam(state.cam,false); });
(function scrub(){
  var dragging = false;
  function at(e){ var r = el.track.getBoundingClientRect(); var u = Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); seek(F0()+u*(FN()-F0())); }
  el.track.addEventListener('pointerdown', function(e){ dragging=true; pause(); el.track.setPointerCapture(e.pointerId); at(e); });
  el.track.addEventListener('pointermove', function(e){ if (dragging) at(e); });
  el.track.addEventListener('pointerup', function(){ dragging=false; });
})();
el.phases.addEventListener('click', function(e){ var b = e.target.closest('button[data-f]'); if (b){ pause(); seek(+b.dataset.f); } });
document.addEventListener('keydown', function(e){
  if (e.code === 'Space'){ e.preventDefault(); state.playing ? pause() : play(); }
  if (e.key === 'ArrowLeft'){ pause(); seek(Math.round(state.f)-1); }
  if (e.key === 'ArrowRight'){ pause(); seek(Math.round(state.f)+1); }
});

/* ---------- 3D ---------- */
var three = null;
function applyFrame(){ if (three) three.apply(state.stroke, state.t); }
function b64ToBuf(s){ var bin=atob(s), n=bin.length, u=new Uint8Array(n); for (var i=0;i<n;i++) u[i]=bin.charCodeAt(i); return u.buffer; }
function fail(){ if (!el.loading) return; el.loading.style.display='none'; el.fallback.style.display='flex'; if (el.hint) el.hint.style.display='none'; document.body.dataset.ready='fallback'; }

function init3D(){
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return fail();
  var cvs = document.createElement('canvas');
  if (!(cvs.getContext('webgl2') || cvs.getContext('webgl'))) return fail();
  var renderer = new THREE.WebGLRenderer({ antialias:true, canvas:cvs, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, window.innerWidth<700?1.5:2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.vp.insertBefore(cvs, el.vp.firstChild);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8d0);
  scene.fog = new THREE.Fog(0xc9d8d0, 26, 70);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  var camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  var hemi = new THREE.HemisphereLight(0xe8f0ff, 0x3a6b5e, 0.55); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1dc, 2.1); sun.position.set(-5,9,-4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
  var sc2 = sun.shadow.camera; sc2.left=-3; sc2.right=3; sc2.top=4; sc2.bottom=-2; sc2.near=1; sc2.far=30;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  var rim = new THREE.DirectionalLight(0xdff2ff, 0.7); rim.position.set(3,4,8); scene.add(rim);

  // court
  var court = new THREE.Group(); scene.add(court);
  function plane(w,dd,color,y,x,z){ var m=new THREE.Mesh(new THREE.PlaneGeometry(w,dd),new THREE.MeshStandardMaterial({color:color,roughness:0.92})); m.rotation.x=-Math.PI/2; m.position.set(x||0,y,z||0); m.receiveShadow=true; court.add(m); }
  var BL = DATA.court.baselineZ, NETZ = DATA.court.netZ, FARZ = 2*NETZ - BL;
  plane(40,60,0x397c69,-0.002,0,NETZ); plane(10.97,23.77,0x266c81,0,0,NETZ); plane(8.23,23.77,0x33869a,0.001,0,NETZ);
  var lineM = new THREE.MeshStandardMaterial({color:0xf3edce,roughness:0.8});
  function line(x0,z0,x1,z1){ var w=0.05, len=Math.hypot(x1-x0,z1-z0); var m=new THREE.Mesh(new THREE.PlaneGeometry(x0===x1?w:len,x0===x1?len:w),lineM); m.rotation.x=-Math.PI/2; m.position.set((x0+x1)/2,0.003,(z0+z1)/2); court.add(m); }
  var HS=4.115, HD=5.485, SL2=6.40;
  [BL,FARZ].forEach(function(z){ line(-HD,z,HD,z); });
  [-HD,-HS,HS,HD].forEach(function(x){ line(x,BL,x,FARZ); });
  [NETZ-SL2,NETZ+SL2].forEach(function(z){ line(-HS,z,HS,z); line(0,z,0,z); });
  var net = new THREE.Mesh(new THREE.PlaneGeometry(12.8,0.914), new THREE.MeshStandardMaterial({color:0x143e40,roughness:0.9,transparent:true,opacity:0.55,side:THREE.DoubleSide}));
  net.position.set(0,0.457,NETZ); court.add(net);
  var tape = new THREE.Mesh(new THREE.BoxGeometry(12.8,0.06,0.04), new THREE.MeshStandardMaterial({color:0xede8d2,roughness:0.6})); tape.position.set(0,0.93,NETZ); court.add(tape);

  var loader = new THREE.GLTFLoader();
  loader.parse(b64ToBuf(document.getElementById('kai-glb').textContent.trim()), '', function(gltf){
    var root = gltf.scene; scene.add(root);
    root.traverse(function(o){ if (o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false; if (o.material && o.material.name==='Kai_StringBed'){ o.material.alphaTest=0.5; o.material.transparent=false; o.material.depthWrite=true; o.castShadow=false; } } });
    var ball = root.getObjectByName('Kai_Ball');
    var mixer = new THREE.AnimationMixer(root);
    var actions = {};
    gltf.animations.forEach(function(clip){ actions[clip.name] = mixer.clipAction(clip); });
    var ballTrailGeo = new THREE.BufferGeometry();
    var TRAIL_N = 260, trailPos = new Float32Array(TRAIL_N*3);
    ballTrailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); ballTrailGeo.setDrawRange(0,0);
    var trail = new THREE.Line(ballTrailGeo, new THREE.LineBasicMaterial({color:0xd9f03a,transparent:true,opacity:0.85}));
    scene.add(trail);
    var serveRing = new THREE.Mesh(new THREE.RingGeometry(0.16,0.24,40), new THREE.MeshBasicMaterial({color:0xff6a3d,transparent:true,opacity:0,depthWrite:false}));
    serveRing.rotation.x = -Math.PI/2; scene.add(serveRing);

    function clipOf(name){
      return gltf.animations.filter(function(c){ return c.name === name; })[0];
    }
    var currentStroke = null;
    function playStroke(name){
      if (currentStroke === name) return;
      STROKES.forEach(function(s){
        actions[s].stop(); actions[s+'_Ball'].stop();
      });
      currentStroke = name;
      actions[name].reset().setLoop(THREE.LoopOnce).clampWhenFinished = true;
      actions[name+'_Ball'].reset().setLoop(THREE.LoopOnce).clampWhenFinished = true;
      actions[name].play(); actions[name+'_Ball'].play();
    }
    function ballWorld(){ return new THREE.Vector3().setFromMatrixPosition(ball.matrixWorld); }
    var servePath = DATA.strokes.Serve.serveFlight;
    function serveAfter(tc){
      var d = DATA.strokes.Serve, P = servePath.path, tContact = (C_OF_SERVE()-F0S())/FPS;
      var dt = tc - tContact; if (dt <= 0) return null;
      var i = 0; while (i < P.length-1 && P[i+1][0] < dt) i++;
      var a=P[i], b=P[Math.min(i+1,P.length-1)], u = b[0]===a[0]?0:Math.max(0,Math.min(1,(dt-a[0])/(b[0]-a[0])));
      return [a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u, a[3]+(b[3]-a[3])*u, i];
    }
    function C_OF_SERVE(){ return DATA.strokes.Serve.T.contact; }
    function F0S(){ return DATA.strokes.Serve.frames[0]; }

    three = {
      apply: function(name, t){
        var d = DATA.strokes[name];
        playStroke(name);
        var dur = (d.frames[d.frames.length-1] - d.frames[0])/FPS;
        var tc = Math.max(0, Math.min(dur, t));
        // glTF clips are authored at frame f => time f/60 with frame 1 at 1/60; mixer clips start at 0
        mixer.setTime(Math.min(dur + d.frames[0]/FPS - 1/60/2, tc + d.frames[0]/FPS - 1e-6));
        // ball: groundstrokes use the baked ball clip; serve keeps the solved flight after contact
        if (name !== 'Serve'){
          // ball clip already applied by mixer; trail only
          var bp = ballWorld(); var n = 0;
          trailPos[n*3]=bp.x; trailPos[n*3+1]=bp.y; trailPos[n*3+2]=bp.z; n++;
          ballTrailGeo.setDrawRange(0,0); // hide pre-contact trail clutter
          serveRing.material.opacity = 0;
        } else {
          var after = serveAfter(tc);
          if (after){
            ball.position.set(after[0], after[1], after[2]); ball.updateMatrixWorld();
            var cp = new THREE.Vector3().fromArray(servePath.contact || d.contact);
            var n = 0; trailPos[0]=d.contact[0]; trailPos[1]=d.contact[1]; trailPos[2]=d.contact[2]; n=1;
            for (var k=0;k<=after[3] && n<TRAIL_N-1;k++){ trailPos[n*3]=servePath.path[k][1]; trailPos[n*3+1]=servePath.path[k][2]; trailPos[n*3+2]=servePath.path[k][3]; n++; }
            trailPos[n*3]=after[0]; trailPos[n*3+1]=after[1]; trailPos[n*3+2]=after[2]; n++;
            ballTrailGeo.setDrawRange(0,n);
            var landed = (tc - (C_OF_SERVE()-F0S())/FPS) >= servePath.t;
            serveRing.position.set(servePath.land[0], 0.006, servePath.land[1]);
            serveRing.material.opacity = landed ? 0.9 : 0;
          } else {
            ballTrailGeo.setDrawRange(0,0); serveRing.material.opacity = 0;
          }
        }
        ballTrailGeo.attributes.position.needsUpdate = true;
      },
      cam: function(name, instant){ camGoal = CAMS[name]; if (instant){ camera.position.copy(camGoal.pos); controls.target.copy(camGoal.tgt); camera.fov=camGoal.fov; camera.updateProjectionMatrix(); } camT = instant?1:0; camFrom={pos:camera.position.clone(),tgt:controls.target.clone(),fov:camera.fov}; }
    };
    var CAMS = {
      side:  { pos:new THREE.Vector3(-5.6,1.55,0.55), tgt:new THREE.Vector3(0,1.45,0.45), fov:36 },
      front: { pos:new THREE.Vector3(-3.4,1.85,5.2),  tgt:new THREE.Vector3(0,1.40,0.35), fov:38 },
      back:  { pos:new THREE.Vector3(0.9,2.1,-5.4),   tgt:new THREE.Vector3(0,1.45,0.6),  fov:38 },
      court: { pos:new THREE.Vector3(-4.8,4.6,-6.2),  tgt:new THREE.Vector3(0.6,0.6,8.5),  fov:40 }
    };
    var controls = new THREE.OrbitControls(camera, cvs);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
    controls.minDistance = 2.4; controls.maxDistance = 22; controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI*0.49;
    var camGoal = CAMS[state.cam], camFrom = null, camT = 1;
    controls.addEventListener('start', function(){ camT = 1; });
    three.cam(state.cam, true);
    function resize(){ var w=el.vp.clientWidth,h=el.vp.clientHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); drawChart(); }
    window.addEventListener('resize', resize); resize();

    // tab switching
    $('strokeTabs').addEventListener('click', function(e){
      var b = e.target.closest('button[data-stroke]'); if (!b) return;
      state.stroke = b.dataset.stroke; state.f = C(); state.t = (C()-F0())/FPS; pause();
      this.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); });
      rebuildStatic(); applyFrame(); syncUI();
    });

    applyFrame(); rebuildStatic(); syncUI();
    renderer.render(scene, camera);
    el.loading.style.display = 'none';
    document.body.dataset.ready = '3d';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var last = performance.now();
    function loop(now){
      var dt = Math.min(0.1,(now-last)/1000); last = now;
      if (document.hidden){ requestAnimationFrame(loop); return; }
      if (state.playing){
        state.t += dt*state.speed;
        var end = (FN()-F0())/FPS;
        if (state.t >= end){ state.t = end; state.f = FN(); applyFrame(); syncUI(); pause(); }
        else { state.f = F0()+state.t*FPS; applyFrame(); syncUI(); }
      }
      if (camT < 1 && camFrom){
        camT = Math.min(1, camT + dt/(reduce?0.01:0.7));
        var e2 = 1 - Math.pow(1-camT,3);
        camera.position.lerpVectors(camFrom.pos,camGoal.pos,e2);
        controls.target.lerpVectors(camFrom.tgt,camGoal.tgt,e2);
        camera.fov = camFrom.fov + (camGoal.fov-camFrom.fov)*e2; camera.updateProjectionMatrix();
      }
      controls.update(); renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }, function(){ fail(); });
}

// init at the deep-linked frame (or contact of the default stroke)
(function(){
  var f = null;
  (location.hash||'').replace(/^#/,'').split('&').forEach(function(kv){
    var p = kv.split('='); if (p[0] === 'f' && isFinite(+p[1])) f = +p[1];
  });
  state.f = (f == null) ? C() : Math.max(F0(), Math.min(FN(), f));
  state.t = (state.f - F0())/FPS;
})();
rebuildStatic(); syncUI();
(function(){
  [['segSpeed',String(state.speed)],['segCam',state.cam],['strokeTabs',state.stroke]].forEach(function(p){
    var g = $(p[0]); var b = g.querySelector('button[data-v="'+p[1]+'"]') || g.querySelector('button[data-stroke="'+p[1]+'"]');
    if (b) setPressed(g,b);
  });
})();
try { init3D(); } catch(e){ console.error(e); fail(); }
})();
