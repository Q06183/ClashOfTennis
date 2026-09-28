import {cameraDistance,type CameraDistance} from '../render/camera.js';
import {readPreference,writePreference} from './preferences.js';

export class CameraChoice {
 distance:CameraDistance=cameraDistance(readPreference('rally-camera-distance'));
 toggle(){
  this.distance=this.distance==='near'?'far':'near';
  return {distance:this.distance,saved:writePreference('rally-camera-distance',this.distance)};
 }
 button(){
  const near=this.distance==='near';
  return `<button class="camera-button" id="camera-distance" data-action="camera-distance" aria-label="当前${near?'近':'远'}视角，切换为${near?'远':'近'}视角">${near?'近景':'远景'} ⇄</button>`;
 }
}
