import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainManager } from './TerrainManager.js';
import { inputManager } from './InputManager.js';
import { soundManager } from './SoundManager.js';

export class JetSkiManager {
    constructor() {
        this.vehicle = null;
        this.speed = 0;
        this.maxSpeed = 9.72;               // Same as UTV
        this.acceleration = 4.0;
        this.friction = 0.985;              // Less friction on water than land
        this.steerAngle = 0;
        this.maxSteerAngle = 0.6;           // JetSki turns a bit sharper
        this.heading = Math.PI;             // Facing +Z

        this.isDriving = false;
        this.cameraMode = 'third';          // 'first' or 'third'

        // Free-look camera variables
        this.cameraYaw = this.heading;
        this.cameraPitch = 0;
        this.lastCameraMoveTime = 0;

        // First person offset relative to JetSki center
        this.firstPersonOffset = new THREE.Vector3(0, 1.5, -0.3); // Raised and slightly back for better visibility

        // Spawn location in the lake, nearest the capsule spawn (210, -100)
        // A known lake spot near there might be around x=150, z=-50
        this.spawnPos = new THREE.Vector3(5, 0, 50);
        this.proximityDistance = 4.0;
        this.promptElement = null;
    }

    createPromptUI() {
        if (document.getElementById('jetskiPromptHUD')) return;

        this.promptElement = document.createElement('div');
        this.promptElement.id = 'jetskiPromptHUD';

        Object.assign(this.promptElement.style, {
            position: 'fixed',
            top: '80px', // Slightly lower so it doesn't overlap UTV prompt
            left: '50%',
            transform: 'translate(-50%, -20px)',
            background: 'rgba(15, 120, 200, 0.75)', // Bluer background
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
            ? "Tap <span style='color: #4ade80;'>ENTER JETSKI</span> to Ride"
            : "Press <span style='color: #4ade80; background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px;'>E</span> to Ride JetSki";

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

    loadVehicle(scene) {
        const gltfLoader = new GLTFLoader();

        gltfLoader.load('3DModels/jetski.glb', (gltf) => {
            const visualMesh = gltf.scene;

            this.vehicle = new THREE.Group();

            const box = new THREE.Box3().setFromObject(visualMesh);
            const size = new THREE.Vector3();
            box.getSize(size);

            const rawLength = size.z;
            const targetLength = 1.5; // Reduced size: the model appears roughly twice too large
            const computedScale = targetLength / rawLength;

            visualMesh.scale.set(computedScale, computedScale, computedScale);

            // Rotate the model so its nose points forward along the vehicle's heading
            visualMesh.rotation.y = -Math.PI / 2;
            

            // Compute box again to center it
            visualMesh.updateMatrixWorld(true);
            const finalBox = new THREE.Box3().setFromObject(visualMesh);
            visualMesh.position.y = -finalBox.min.y;

            this.vehicle.add(visualMesh);

            // Spawn at float height
            this.vehicle.position.set(this.spawnPos.x, terrainManager.WATER_LEVEL, this.spawnPos.z);
            this.vehicle.rotation.y = this.heading;

            visualMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.roughness = 0.4; // Glossy wet look
                        child.material.metalness = 0.5;
                    }
                }
            });

            if (window.enhanceGLTFMaterials) window.enhanceGLTFMaterials(visualMesh);
            scene.add(this.vehicle);
            console.log(`✅ JetSki loaded. Dynamically scaled by ${computedScale.toFixed(4)}`);

            // Load Jetski sounds
            soundManager.initialize().then(() => {
                soundManager.loadJetskiSounds();
            });
        },
            (xhr) => {
                console.log(`Loading JetSki: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
            },
            (error) => {
                console.error('❌ Error loading JetSki:', error);
            });

        this.createPromptUI();
    }

    checkProximity(capsulePos) {
        if (!this.vehicle || this.isDriving) {
            this.hidePrompt();
            return false;
        }

        const dist = this.vehicle.position.distanceTo(capsulePos);
        if (dist < this.proximityDistance) {
            this.showPrompt();

            // Expose a floating action button on touch-enabled screens
            const mobBtn = document.querySelector('.action-btn-vehicle');
            if (mobBtn) {
                mobBtn.style.display = 'block';
                mobBtn.textContent = 'ENTER Jetski';
            }
            return true; // Used to tell index2.html which vehicle is closest
        } else {
            this.hidePrompt();
            return false;
        }
    }

    /**
     * Stops the Jetski engine sound
     */
    stopEngine() {
        soundManager.stopJetskiEngine();
    }

    toggleVehicleEntry(capsulePlayer, switchGameModeCallback, force = false) {
        if (!this.vehicle) return;

        if (this.isDriving) {
            // --- EXIT JETSKI ---
            this.isDriving = false;

            // Stop Jetski engine sounds
            soundManager.stopJetskiEngine();

            // Exit coordinate left of jetski
            const leftOffset = new THREE.Vector3(1, 0, 0)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
                .normalize()
                .multiplyScalar(2.0);

            const exitPos = this.vehicle.position.clone().add(leftOffset);

            // Snap to ground or water surface, whichever is higher
            const groundY = terrainManager.getGroundHeightAt(exitPos);
            exitPos.y = Math.max(groundY, terrainManager.WATER_LEVEL) + 0.6;

            if (capsulePlayer) {
                capsulePlayer.position.copy(exitPos);
                capsulePlayer.visible = true;
            }

            this.hidePrompt();
            switchGameModeCallback('capsule');
            console.log("🌊 Exited JetSki safely.");
        } else {
            // --- ENTER JETSKI ---
            const dist = capsulePlayer ? this.vehicle.position.distanceTo(capsulePlayer.position) : Infinity;
            if (force || dist < this.proximityDistance) {
                this.isDriving = true;
                this.hidePrompt();

                this.speed = 0;
                this.steerAngle = 0;
                this.cameraYaw = this.heading;
                this.cameraPitch = 0;

                if (capsulePlayer) capsulePlayer.visible = false;

                // Start Jetski engine sounds
                soundManager.resumeAudioContext();
                soundManager.startJetskiEngine();

                switchGameModeCallback('jetski');
                console.log("🌊 Entered JetSki.");
            }
        }
    }

    updatePhysics(delta) {
        if (!this.vehicle || !this.isDriving || !terrainManager.isTerrainLoaded) return;

        const keys = inputManager.keys;
        const ctrls = inputManager.controls;

        // THROTTLE
        const wantsForward = keys['KeyW'] || ctrls.forward || ctrls.autoMove || ctrls.autoRun;
        const wantsBackward = keys['KeyS'] || ctrls.backward;
        const hasJoystickThrottle = Math.abs(ctrls.joyMoveY) > 0.05;
        const joyThrottle = -ctrls.joyMoveY;

        if (wantsForward && !wantsBackward) {
            this.speed = Math.min(this.speed + this.acceleration * delta, this.maxSpeed);
        } else if (wantsBackward) {
            this.speed = Math.max(this.speed - this.acceleration * 1.5 * delta, -this.maxSpeed * 0.4);
        } else if (hasJoystickThrottle) {
            if (joyThrottle > 0) {
                this.speed = Math.min(this.speed + this.acceleration * joyThrottle * delta, this.maxSpeed);
            } else {
                this.speed = Math.max(this.speed + this.acceleration * 1.5 * joyThrottle * delta, -this.maxSpeed * 0.4);
            }
        } else {
            // Water friction is high when throttle is cut
            this.speed *= Math.pow(this.friction, delta * 60);
            if (Math.abs(this.speed) < 0.1) this.speed = 0;
        }

        // STEERING
        const wantsLeft = keys['KeyA'] || ctrls.left;
        const wantsRight = keys['KeyD'] || ctrls.right;
        const hasJoystickSteering = Math.abs(ctrls.joyMoveX) > 0.05;

        if (hasJoystickSteering) {
            const joySteer = -ctrls.joyMoveX;
            const joySteerFactor = 1 - Math.pow(1 - 0.15, delta * 60);
            this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, joySteer * this.maxSteerAngle, joySteerFactor);
        } else {
            const targetSteerAngle = wantsLeft ? this.maxSteerAngle : (wantsRight ? -this.maxSteerAngle : 0);
            const steerSpeed = wantsLeft || wantsRight ? 0.15 : 0.25;
            const steerFactor = 1 - Math.pow(1 - steerSpeed, delta * 60);
            this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerAngle, steerFactor);
        }

        // Apply heading change if moving
        if (Math.abs(this.speed) > 0.15) {
            const steerFactor = this.speed > 0 ? 1.0 : -1.0;
            const turnRate = this.steerAngle * (Math.abs(this.speed) / this.maxSpeed) * 3.0; // sharper turns than UTV
            this.heading += turnRate * steerFactor * delta;
        }

        // NEXT POSITION
        const forwardDir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        const nextPos = this.vehicle.position.clone().addScaledVector(forwardDir, this.speed * delta);

        const boundsLimit = 445;
        nextPos.x = THREE.MathUtils.clamp(nextPos.x, -boundsLimit, boundsLimit);
        nextPos.z = THREE.MathUtils.clamp(nextPos.z, -boundsLimit, boundsLimit);

        // Water checks: JetSki can ONLY go on water
        const inLake = terrainManager.isInLake(nextPos);
        const terrainHeight = terrainManager.getTerrainHeightAt(nextPos);
        const deepEnough = terrainHeight < terrainManager.WATER_LEVEL + 0.1;

        if (!inLake || !deepEnough) {
            // Hit the shore: bounce back slightly
            this.speed = -this.speed * 0.3;
        } else {
            // Safe water movement
            this.vehicle.position.copy(nextPos);
        }

        // Floatation and slight tilt based on steering/speed
        const targetGroundHeight = terrainManager.WATER_LEVEL;
        const heightFactor = 1 - Math.pow(1 - 0.2, delta * 60);
        this.vehicle.position.y += (targetGroundHeight - this.vehicle.position.y) * heightFactor;

        // Apply rotation with a bit of roll when turning
        const rollAngle = -this.steerAngle * (this.speed / this.maxSpeed) * 0.4;
        const pitchAngle = -(this.speed / this.maxSpeed) * 0.1; // Nose tilts upward slightly with speed

        const euler = new THREE.Euler(pitchAngle, this.heading, rollAngle, 'YXZ');
        this.vehicle.quaternion.setFromEuler(euler);

        // Camera joystick inputs
        if (Math.abs(ctrls.joyCamX) > 0.05 || Math.abs(ctrls.joyCamY) > 0.05) {
            this.cameraYaw -= ctrls.joyCamX * 0.05;
            this.cameraPitch += ctrls.joyCamY * 0.05;
            this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch, -Math.PI / 3, Math.PI / 3);
            this.lastCameraMoveTime = performance.now();
        }

        // Always keep camera aligned with heading (front of jetski)
        // Allow temporary deviation but always return to front
        this.cameraPitch = THREE.MathUtils.lerp(this.cameraPitch, 0, 3.0 * delta);
        
        let diff = (this.heading - this.cameraYaw) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        this.cameraYaw += diff * 3.0 * delta;

        // Update Jetski engine sounds based on speed and acceleration state
        const isAccelerating = (wantsForward && !wantsBackward) || (hasJoystickThrottle && joyThrottle > 0);
        const isDecelerating = wantsBackward || (hasJoystickThrottle && joyThrottle < 0);
        const isInputHeld = wantsForward || wantsBackward || hasJoystickThrottle;

        soundManager.updateJetskiPosition(this.vehicle.position);
        soundManager.updateJetskiEngineSound(
            this.speed,
            this.maxSpeed,
            isAccelerating,
            isDecelerating,
            isInputHeld
        );
    }
}

export const jetSkiManager = new JetSkiManager();
