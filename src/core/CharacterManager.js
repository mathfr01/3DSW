import * as THREE from 'https://unpkg.com/three@0.153.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.153.0/examples/jsm/loaders/GLTFLoader.js';
export class CharacterManager{
  constructor(scene, camera){ this.scene=scene; this.camera=camera; this.loader=new GLTFLoader(); this.player=null; }
  async loadCharacter(path){
    if(this.player) this.scene.remove(this.player);
    const gltf = await this._loadGLTF(path);
    this.player = gltf.scene;
    this.player.position.set(0,0,0);
    this.player.scale.setScalar(1.0);
    this.scene.add(this.player);
    // attach camera follow
    this.camera.position.set(this.player.position.x+0, this.player.position.y+6, this.player.position.z+12);
  }
  update(dt, input){
    if(!this.player) return;
    // simple WASD movement if InputManager provides velocity
    if(input){
      const v = input.getVelocity();
      if(v.lengthSq()>1e-4){
        this.player.position.addScaledVector(v, dt*6);
      }
    }
  }
  _loadGLTF(path){ return new Promise((res,rej)=>{ this.loader.load(path,res,undefined,rej); }); }
}
