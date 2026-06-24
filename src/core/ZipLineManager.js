import * as THREE from 'three';
import { terrainManager } from './TerrainManager.js';
import { inputManager } from './InputManager.js';

export class ZipLineManager {
    constructor() {
        this.isZiplining = false;
        this.progress = 0; // 0 to 1
        this.speed = 0; // Current speed along curve
        
        // Settings
        this.proximityDistance = 15.0; // Tower is big, need a larger proximity trigger distance
        this.gravity = 9.81; // m/s^2 down
        this.friction = 0.5; // Drag on the cable

        // Zipline properties
        this.curve = null;
        this.startPos = new THREE.Vector3(-120, 0, -320);
        this.endPos = new THREE.Vector3(-235, 0, -110);
        this.towerTopOffset = 16; // Approx top of tower. Will be added to terrain height.
        this.postHeight = 2.0;

        // Visuals
        this.cableMesh = null;
        this.postMesh = null;
        this.strapsMesh = null; // Black straps attached to camera

        this.promptElement = null;
        this.isInitialized = false;
    }

    createPromptUI() {
        if (document.getElementById('ziplinePromptHUD')) return;

        this.promptElement = document.createElement('div');
        this.promptElement.id = 'ziplinePromptHUD';

        Object.assign(this.promptElement.style, {
            position: 'fixed',
            top: '80px', 
            left: '50%',
            transform: 'translate(-50%, -20px)',
            background: 'rgba(255, 140, 0, 0.75)', // Orange background
            backdropFilter: 'blur(10px)',
            webkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: '12px',
            fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            zIndex: '1001',
            pointerEvents: 'none',
            transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            opacity: '0',
            display: 'none'
        });

        document.body.appendChild(this.promptElement);
    }

    showPrompt() {
        if (!this.promptElement) this.createPromptUI();

        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.promptElement.innerHTML = isTouch
            ? "Tap <span style='color: #4ade80;'>ENTER ZIPLINE</span> to Ride"
            : "Press <span style='color: #4ade80; background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px;'>E</span> to Start ZipLine";

        this.promptElement.style.display = 'block';
        this.promptElement.offsetHeight; // Force reflow
        this.promptElement.style.opacity = '1';
        this.promptElement.style.transform = 'translate(-50%, 0)';
    }

    hidePrompt() {
        if (!this.promptElement) return;

        this.promptElement.style.opacity = '0';
        this.promptElement.style.transform = 'translate(-50%, -20px)';

        const onTransitionEnd = () => {
            if (this.promptElement.style.opacity === '0') {
                this.promptElement.style.display = 'none';
            }
            this.promptElement.removeEventListener('transitionend', onTransitionEnd);
        };
        this.promptElement.addEventListener('transitionend', onTransitionEnd);
    }

    initZipline(scene) {
        if (!terrainManager.isTerrainLoaded) return;
        if (this.isInitialized) return;

        // Calculate Y positions based on terrain
        const startTerrainY = terrainManager.getTerrainHeightAt({ x: this.startPos.x, z: this.startPos.z });
        this.startPos.y = startTerrainY + this.towerTopOffset;

        const endTerrainY = terrainManager.getTerrainHeightAt({ x: this.endPos.x, z: this.endPos.z });
        this.endPos.y = endTerrainY + this.postHeight;

        // Create the cable (curve)
        // Midpoint with a sag (lower y)
        const midPoint = new THREE.Vector3().addVectors(this.startPos, this.endPos).multiplyScalar(0.5);
        midPoint.y -= 15; // amount of sag

        this.curve = new THREE.QuadraticBezierCurve3(
            this.startPos,
            midPoint,
            this.endPos
        );

        // Render the cable
        const tubeGeometry = new THREE.TubeGeometry(this.curve, 64, 0.025, 8, false);
        const tubeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x888888, 
            metalness: 0.8, 
            roughness: 0.2 
        });
        this.cableMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
        this.cableMesh.userData.noCollision = true;
        this.cableMesh.castShadow = true;
        scene.add(this.cableMesh);

        // Render the end post (wood)
        const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, this.postHeight, 16);
        const postMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x654321, // Wood brown
            roughness: 0.9,
            metalness: 0.1
        });
        this.postMesh = new THREE.Mesh(postGeometry, postMaterial);
        this.postMesh.position.copy(this.endPos);
        this.postMesh.position.y -= this.postHeight / 2; // Center it
        this.postMesh.castShadow = true;
        this.postMesh.receiveShadow = true;
        scene.add(this.postMesh);

        // Create straps (attached to player camera later)
        const strapsGroup = new THREE.Group();
        const strapGeom = new THREE.CylinderGeometry(0.01, 0.01, 1, 8);
        const strapMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        
        const strap1 = new THREE.Mesh(strapGeom, strapMat);
        strap1.position.set(-0.2, 0.5, -0.2);
        strap1.rotation.z = Math.PI / 8;
        strapsGroup.add(strap1);
        
        const strap2 = new THREE.Mesh(strapGeom, strapMat);
        strap2.position.set(0.2, 0.5, -0.2);
        strap2.rotation.z = -Math.PI / 8;
        strapsGroup.add(strap2);

        this.strapsMesh = strapsGroup;
        this.strapsMesh.visible = false;
        // Don't add to scene yet, will add to capsulePlayer or camera
        
        this.createPromptUI();
        this.isInitialized = true;
        console.log("✅ ZipLine loaded.");
    }

    checkProximity(capsulePos) {
        if (!this.isInitialized || this.isZiplining) {
            this.hidePrompt();
            return false;
        }

        // Check 2D distance to tower base
        const towerBase = new THREE.Vector3(this.startPos.x, capsulePos.y, this.startPos.z);
        const dist = towerBase.distanceTo(capsulePos);

        if (dist < this.proximityDistance) {
            this.showPrompt();

            const mobBtn = document.querySelector('.action-btn-vehicle');
            if (mobBtn) {
                mobBtn.style.display = 'block';
                mobBtn.textContent = 'ENTER Zipline';
            }
            return true;
        } else {
            this.hidePrompt();
            return false;
        }
    }

    toggleZipLine(capsulePlayer, switchGameModeCallback, force = false, setCameraModeCallback, capsuleCameraObj) {
        if (!this.isInitialized) return;

        if (this.isZiplining) {
            // Unused manually, but good to have. Usually they exit by reaching the end.
            this.exitZipline(capsulePlayer, switchGameModeCallback);
        } else {
            // Enter zipline
            const towerBase = new THREE.Vector3(this.startPos.x, capsulePlayer ? capsulePlayer.position.y : 0, this.startPos.z);
            const dist = capsulePlayer ? towerBase.distanceTo(capsulePlayer.position) : Infinity;
            
            if (force || dist < this.proximityDistance) {
                this.isZiplining = true;
                this.progress = 0;
                this.speed = 0;
                this.hidePrompt();

                if (capsulePlayer) {
                    capsulePlayer.visible = true;
                    // Move to start of zipline
                    capsulePlayer.position.copy(this.curve.getPointAt(0));
                    capsulePlayer.position.y -= 1.0; // Hang below cable
                    
                    // Add straps to player
                    this.strapsMesh.visible = true;
                    capsulePlayer.add(this.strapsMesh);
                }

                if (setCameraModeCallback) {
                    setCameraModeCallback('first');
                }

                if (capsuleCameraObj) {
                    capsuleCameraObj.yaw = 0; // Center camera horizontally
                    capsuleCameraObj.pitch = 0; // Center camera vertically
                }

                switchGameModeCallback('zipline');
                console.log("🚠 Entered ZipLine.");
            }
        }
    }

    exitZipline(capsulePlayer, switchGameModeCallback) {
        if (!this.isZiplining) return;
        this.isZiplining = false;
        if (capsulePlayer) {
            capsulePlayer.remove(this.strapsMesh);
            this.strapsMesh.visible = false;
            
            // Put on ground at the end
            const exitPos = this.endPos.clone();
            const groundY = terrainManager.getTerrainHeightAt(exitPos);
            exitPos.y = groundY + 1.0;
            capsulePlayer.position.copy(exitPos);
        }
        
        if (switchGameModeCallback) {
            switchGameModeCallback('capsule');
        }
        console.log("🚠 Exited ZipLine.");
    }

    updatePhysics(delta, capsulePlayer, switchGameModeCallback) {
        if (!this.isInitialized && terrainManager.isTerrainLoaded) {
            // Initialize here if scene was missing
            // But we actually need scene. We'll ensure initZipline is called from index.html
        }

        if (!this.isZiplining || !this.curve || !capsulePlayer) return;

        // Speed curve: fast in the middle, slower at the ends
        const baseSpeed = 5.0;
        const maxBonusSpeed = 10.0;
        this.speed = baseSpeed + maxBonusSpeed * Math.sin(this.progress * Math.PI);

        // Convert speed (m/s) to progress delta. 
        // We need curve length to get accurate speed.
        const curveLength = this.curve.getLength();
        const progressDelta = (this.speed * delta) / curveLength;
        
        this.progress += progressDelta;

        if (this.progress >= 1.0) {
            this.progress = 1.0;
            this.exitZipline(capsulePlayer, switchGameModeCallback);
            return;
        }

        // Update position
        const currentPos = this.curve.getPointAt(this.progress);
        capsulePlayer.position.copy(currentPos);
        capsulePlayer.position.y -= 0.5; // Hang below cable
    }
}

export const zipLineManager = new ZipLineManager();
