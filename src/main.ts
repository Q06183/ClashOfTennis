import './ui/style.css';
import { initPhysics } from './simulation/physics.js';
import { App } from './ui/app.js';
try {
  await initPhysics();new App();
}catch(error){
  console.error('Court startup failed',error);
  const boot=document.querySelector('#boot')!;
  boot.innerHTML='<strong>球场还没准备好</strong><p>请使用支持 WebGL 的现代浏览器，或刷新重试。</p><button id="reload-court" style="padding:14px 28px;margin:20px auto;border:0;border-radius:8px;background:#173e40;color:#f3f0e2">重新加载</button>';
  document.querySelector('#reload-court')!.addEventListener('click',()=>location.reload());
}
