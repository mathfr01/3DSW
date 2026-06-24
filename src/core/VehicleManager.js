import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainManager } from './TerrainManager.js';
import { inputManager } from './InputManager.js';
import { soundManager } from './SoundManager.js';

// Polygon math helpers for high-fidelity collision detection
function isPointInPolygon(p, vs) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x, yi = vs[i].y;
        const xj = vs[j].x, yj = vs[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getClosestPointOnSegment(p, a, b) {
    const ab = new THREE.Vector2().subVectors(b, a);
    const ap = new THREE.Vector2().subVectors(p, a);
    let t = ap.dot(ab) / ab.lengthSq();
    t = Math.max(0, Math.min(1, t));
    return new THREE.Vector2().copy(a).addScaledVector(ab, t);
}

function getClosestPointOnPolygon(p, vs) {
    let minD2 = Infinity;
    const closest = new THREE.Vector2();
    for (let i = 0; i < vs.length; i++) {
        const a = vs[i];
        const b = vs[(i + 1) % vs.length];
        const cp = getClosestPointOnSegment(p, a, b);
        const d2 = p.distanceToSquared(cp);
        if (d2 < minD2) {
            minD2 = d2;
            closest.copy(cp);
        }
    }
    return { point: closest, distance: Math.sqrt(minD2) };
}

export class VehicleManager {
    constructor() {
        // --- UTV Drivable States ---
        this.vehicle = null;
        this.speed = 0;                     // Speed in units/sec
        this.maxSpeed = 9.72;               // Maximum driving velocity (~35 km/h)
        this.acceleration = 4.0;            // Forward thrust rate (smoother and less jerky)
        this.friction = 0.975;              // Natural deceleration rate (air/drag)
        this.steerAngle = 0;                // Current wheels rotation steer
        this.maxSteerAngle = 0.52;          // Limit steer deflection (radians)
        this.heading = -Math.PI / 2;        // Heading direction in radians
        this.isDriving = false;             // State tracking
        this.cameraMode = 'third';          // Camera mode: 'first' or 'third'
        this.pitchAdjustment = -36.5 * Math.PI / 180; // Corrects the inherent baked nose-dive tilt perfectly (36.5 degrees)
        this.firstPersonOffset = new THREE.Vector3(0.23, 1.55, -0.15); // Driver's seat offset (Left seat maps to +X)
        
        // Spawn location close to the capsule player spawn (210, -100)
        this.spawnPos = new THREE.Vector3(187, 0, -82);
        this.proximityDistance = 3.5;       // Trigger radius to show the enter prompt
        this.promptElement = null;          // HTML HUD banner reference
    }

    /**
     * Creates and mounts the gorgeous glassmorphic UTV entry banner dynamically.
     */
    createPromptUI() {
        if (document.getElementById('vehiclePromptHUD')) return;

        this.promptElement = document.createElement('div');
        this.promptElement.id = 'vehiclePromptHUD';
        
        // Inline modern glassmorphic styling
        Object.assign(this.promptElement.style, {
            position: 'fixed',
            top: '30px',
            left: '50%',
            transform: 'translate(-50%, -20px)',
            background: 'rgba(15, 23, 42, 0.75)',
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

    /**
     * Fades the proximity HUD banner into view.
     */
    showPrompt() {
        if (!this.promptElement) this.createPromptUI();
        
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.promptElement.innerHTML = isTouch 
            ? "Tap <span style='color: #4ade80;'>ENTER UTV</span> to Drive" 
            : "Press <span style='color: #4ade80; background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px;'>E</span> to Drive Side-by-Side";

        this.promptElement.style.display = 'block';
        // Force reflow
        this.promptElement.offsetHeight;
        this.promptElement.style.opacity = '1';
        this.promptElement.style.transform = 'translate(-50%, 0)';
    }

    /**
     * Fades the proximity HUD banner out of view.
     */
    hidePrompt() {
        if (!this.promptElement) return;

        this.promptElement.style.opacity = '0';
        this.promptElement.style.transform = 'translate(-50%, -20px)';
        
        // Hide after transition finishes
        const onTransitionEnd = () => {
            if (this.promptElement.style.opacity === '0') {
                this.promptElement.style.display = 'none';
            }
            this.promptElement.removeEventListener('transitionend', onTransitionEnd);
        };
        this.promptElement.addEventListener('transitionend', onTransitionEnd);
    }

    /**
     * Loads the 3D UTV GLB, computing bounds dynamically to guarantee realistic proportions.
     */
    loadVehicle(scene) {
        const gltfLoader = new GLTFLoader();
        
        gltfLoader.load('3DModels/sidebyside_utv.glb', (gltf) => {
            const visualMesh = gltf.scene;

            // Create a parent group to serve as the clean physics and pivot container
            this.vehicle = new THREE.Group();

            // Compute dynamic bounding box to scale model exactly to standard UTV parameters (~3.0m length)
            const box = new THREE.Box3().setFromObject(visualMesh);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            const rawLength = size.z;
            const targetLength = 3.5; // UTV standard length in meters
            const computedScale = targetLength / rawLength;
            
            visualMesh.scale.set(computedScale, computedScale, computedScale);
            
            // Rotate the visual mesh by Math.PI around the Y-axis so that it faces forward (+Z) instead of backward (-Z).
            // This also resolves the inverted pitch alignment issue on slopes.
            visualMesh.rotation.y = Math.PI;
            
            // Apply pitch adjustment to correct the baked tilt angle in the GLTF model
            visualMesh.rotation.x = this.pitchAdjustment;

            // Force update world matrices so bounding box calculation is accurate
            visualMesh.updateMatrix();
            visualMesh.updateMatrixWorld(true);

            // Compute precise bounding box after scaling and rotation to guarantee flat wheel grounding
            const finalBox = new THREE.Box3().setFromObject(visualMesh);
            visualMesh.position.y = -finalBox.min.y;

            // Add the visual mesh to the container group
            this.vehicle.add(visualMesh);
            
            // Query terrain height at start coordinates
            const height = terrainManager.getTerrainHeightAt(this.spawnPos);
            this.vehicle.position.set(this.spawnPos.x, height, this.spawnPos.z);
            
            // Initial rotation matching target heading direction
            this.vehicle.rotation.y = this.heading - (20 * Math.PI / 180);

            // Enable gorgeous real-time shadows
            visualMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Boost ambient readability
                    if (child.material) {
                        child.material.roughness = 0.6;
                        child.material.metalness = 0.4;
                    }
                }
            });
            

            if (window.enhanceGLTFMaterials) window.enhanceGLTFMaterials(visualMesh);
            scene.add(this.vehicle);
            console.log(`✅ Side-by-Side UTV loaded. Dynamically scaled by ${computedScale.toFixed(4)} (raw length: ${rawLength.toFixed(2)})`);
            
            // Load UTV sounds
            soundManager.initialize().then(() => {
                soundManager.loadUTVSounds();
            });
            
            // Re-index global collision objects list to ensure this vehicle mesh is correctly filtered out
            if (typeof window.refreshCollisionObjects === 'function') {
                window.refreshCollisionObjects();
            }
        },
        (xhr) => {
            console.log(`Loading UTV Model: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
        },
        (error) => {
            console.error('❌ Error loading side-by-side UTV glb:', error);
        });

        // Instantiate the dynamic entry banner
        this.createPromptUI();
    }

    /**
     * Proximity validation sweep called in Character Mode frames.
     */
    checkProximity(capsulePos) {
        if (!this.vehicle || this.isDriving) {
            this.hidePrompt();
            const mobBtn = document.querySelector('.action-btn-vehicle');
            if (mobBtn) mobBtn.style.display = 'none';
            return;
        }

        const dist = this.vehicle.position.distanceTo(capsulePos);
        if (dist < this.proximityDistance) {
            this.showPrompt();
            
            // Expose a floating action button on touch-enabled screens
            const mobBtn = document.querySelector('.action-btn-vehicle');
            if (mobBtn) {
                mobBtn.style.display = 'block';
                mobBtn.textContent = 'ENTER UTV';
            }
        } else {
            this.hidePrompt();
            const mobBtn = document.querySelector('.action-btn-vehicle');
            if (mobBtn) mobBtn.style.display = 'none';
        }
    }

    /**
     * Stops the UTV engine sound
     */
    stopEngine() {
        soundManager.stopUTVEngine();
    }

    /**
     * Switches the player safely between Capsule and Vehicle control modes.
     */
    toggleVehicleEntry(capsulePlayer, switchGameModeCallback) {
        if (!this.vehicle) return;

        if (this.isDriving) {
            // --- EXIT VEHICLE ---
            this.isDriving = false;
            
            // Stop UTV engine sounds
            soundManager.stopUTVEngine();
            
            // Calculate a safe exit coordinate 2.2 meters to the left of UTV
            const leftOffset = new THREE.Vector3(1, 0, 0)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
                .normalize()
                .multiplyScalar(2.2);

            const exitPos = this.vehicle.position.clone().add(leftOffset);
            
            // Force landing validation
            const groundY = terrainManager.getGroundHeightAt(exitPos);
            exitPos.y = groundY + 0.6; // Offset matching capsule center offset
            
            capsulePlayer.position.copy(exitPos);
            capsulePlayer.visible = true;

            

            

            this.hidePrompt();
            switchGameModeCallback('capsule');
            console.log("🚗 Exited UTV safely, player coordinates reset to:", capsulePlayer.position);
        } else {
            // --- ENTER VEHICLE ---
            const dist = this.vehicle.position.distanceTo(capsulePlayer.position);
            if (dist < this.proximityDistance) {
                this.isDriving = true;
                this.hidePrompt();
                
                // Reset steering and throttle states to prevent spinouts on entry
                this.speed = 0;
                this.steerAngle = 0;

                // 🌟 THE FIX: Sync the driving logic's heading to the current parked rotation
                this.heading = this.vehicle.rotation.y;

                // Start UTV engine sounds
                soundManager.resumeAudioContext();
                soundManager.startUTVEngine();

                switchGameModeCallback('vehicle');
                console.log("🚗 Entered UTV, vehicle controls initialized at heading:", this.heading);
            }
        }
    }

    /**
     * Resolves realistic collisions with buildings, trees, and other solid scene meshes.
     */
    resolveVehicleCollisions() {
        if (!this.vehicle || !window.collisionObjects || !window.collisionObjects.length) return;

        const isDescendant = (child, parent) => {
            let node = child.parent;
            while (node !== null) {
                if (node === parent) return true;
                node = node.parent;
            }
            return false;
        };

        const vehiclePos = this.vehicle.position;
        // The vehicle is roughly 1.5m wide and 3.0m long.
        // A collision radius of ~1.2m represents a safe bounding cylinder for sliding.
        const minDist = 1.2;

        for (const object of window.collisionObjects) {
            // Avoid colliding with the vehicle itself
            if (!object || object === this.vehicle || object.parent === this.vehicle || isDescendant(object, this.vehicle)) continue;

            object.updateWorldMatrix(true, false);
            const box = new THREE.Box3().setFromObject(object);

            if (!isFinite(box.min.x) || box.isEmpty()) continue;

            // Vertical overlap check
            const vehicleFeet = vehiclePos.y - 0.5;
            const vehicleHead = vehiclePos.y + 1.8;
            if (vehicleHead < box.min.y || vehicleFeet > box.max.y) continue;

            // Horizontal check (fast-rejection AABB)
            if (vehiclePos.x < box.min.x - minDist || vehiclePos.x > box.max.x + minDist ||
                vehiclePos.z < box.min.z - minDist || vehiclePos.z > box.max.z + minDist) {
                continue;
            }

            let pushX = 0;
            let pushZ = 0;
            let colliding = false;

            if (object.userData && object.userData.polygon) {
                const p = new THREE.Vector2(vehiclePos.x, vehiclePos.z);
                const vs = object.userData.polygon;
                const inside = isPointInPolygon(p, vs);
                const closestResult = getClosestPointOnPolygon(p, vs);
                const closest = closestResult.point;
                const dist = closestResult.distance;

                if (inside) {
                    colliding = true;
                    const pushDir = new THREE.Vector2().subVectors(closest, p);
                    const d = pushDir.length();
                    if (d > 0.0001) {
                        pushDir.divideScalar(d);
                        pushX = pushDir.x * (d + minDist);
                        pushZ = pushDir.y * (d + minDist);
                    } else {
                        pushX = 0;
                        pushZ = minDist;
                    }
                } else if (dist < minDist) {
                    colliding = true;
                    const pushDir = new THREE.Vector2().subVectors(p, closest);
                    const d = pushDir.length();
                    if (d > 0.0001) {
                        pushDir.divideScalar(d);
                        pushX = pushDir.x * (minDist - d);
                        pushZ = pushDir.y * (minDist - d);
                    } else {
                        pushX = 0;
                        pushZ = minDist;
                    }
                }
            } else {
                // Horizontal closest point check for non-building colliders (like trunks)
                const closestX = THREE.MathUtils.clamp(vehiclePos.x, box.min.x, box.max.x);
                const closestZ = THREE.MathUtils.clamp(vehiclePos.z, box.min.z, box.max.z);

                const diffX = vehiclePos.x - closestX;
                const diffZ = vehiclePos.z - closestZ;
                const distSq = diffX * diffX + diffZ * diffZ;

                if (distSq < minDist * minDist) {
                    colliding = true;
                    const dist = Math.sqrt(distSq);
                    if (dist === 0) {
                        pushZ = minDist;
                    } else {
                        const overlap = minDist - dist;
                        pushX = (diffX / dist) * overlap;
                        pushZ = (diffZ / dist) * overlap;
                    }
                }
            }

            if (colliding) {
                // Smooth push-out slide mechanics
                const maxPush = 0.6;
                this.vehicle.position.x += THREE.MathUtils.clamp(pushX, -maxPush, maxPush);
                this.vehicle.position.z += THREE.MathUtils.clamp(pushZ, -maxPush, maxPush);

                // Stop or bounce slightly on collision impact
                if (Math.abs(this.speed) > 1.0) {
                    this.speed = -this.speed * 0.15;
                } else {
                    this.speed = 0;
                }
            }
        }
    }

    /**
     * Resolves realistic movement physics, engine deceleration, and surface normal alignment.
     */
    updateVehiclePhysics(delta) {
        if (!this.vehicle || !this.isDriving || !terrainManager.isTerrainLoaded) return;

        const keys = inputManager.keys;
        const ctrls = inputManager.controls;

        // ==========================================
        // THROTTLE AND ACCELERATION SOLVER
        // ==========================================
        const wantsForward = keys['KeyW'] || ctrls.forward || ctrls.autoMove || ctrls.autoRun;
        const wantsBackward = keys['KeyS'] || ctrls.backward;
        const hasJoystickThrottle = Math.abs(ctrls.joyMoveY) > 0.05;
        const joyThrottle = -ctrls.joyMoveY; // Inverted Joy Y

        if (wantsForward && !wantsBackward) {
            this.speed = Math.min(this.speed + this.acceleration * delta, this.maxSpeed);
        } else if (wantsBackward) {
            // Braking / Reverse speed limit
            this.speed = Math.max(this.speed - this.acceleration * 1.5 * delta, -this.maxSpeed * 0.4);
        } else if (hasJoystickThrottle) {
            // Joystick throttle mapping override
            if (joyThrottle > 0) {
                this.speed = Math.min(this.speed + this.acceleration * joyThrottle * delta, this.maxSpeed);
            } else {
                this.speed = Math.max(this.speed + this.acceleration * 1.5 * joyThrottle * delta, -this.maxSpeed * 0.4);
            }
        } else {
            // Natural engine compression drag / friction braking
            this.speed *= Math.pow(this.friction, delta * 60);
            if (Math.abs(this.speed) < 0.1) this.speed = 0;
        }

        // ==========================================
        // STEERING & ROTATIONAL SOLVER
        // ==========================================
        const wantsLeft = keys['KeyA'] || ctrls.left;
        const wantsRight = keys['KeyD'] || ctrls.right;
        const hasJoystickSteering = Math.abs(ctrls.joyMoveX) > 0.05;

        if (hasJoystickSteering) {
            // Joystick steering override
            const joySteer = -ctrls.joyMoveX; // Inverted for natural camera alignment
            const joySteerFactor = 1 - Math.pow(1 - 0.15, delta * 60);
            this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, joySteer * this.maxSteerAngle, joySteerFactor);
        } else {
            // Keyboard steering
            const targetSteerAngle = wantsLeft ? this.maxSteerAngle : (wantsRight ? -this.maxSteerAngle : 0);
            const steerSpeed = wantsLeft || wantsRight ? 0.15 : 0.25;
            const steerFactor = 1 - Math.pow(1 - steerSpeed, delta * 60);
            this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerAngle, steerFactor);
        }

        // Update heading proportional to vehicle speed (prevents steering when completely stationary)
        if (Math.abs(this.speed) > 0.15) {
            const steerFactor = this.speed > 0 ? 1.0 : -1.0;
            this.heading += this.steerAngle * (Math.abs(this.speed) / this.maxSpeed) * 2.2 * steerFactor * delta;
        }

        // ==========================================
        // COLLISION & MAP BOUNDARIES RESOLUTION
        // ==========================================
        const forwardDir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        
        // Calculate trial position
        const nextPos = this.vehicle.position.clone().addScaledVector(forwardDir, this.speed * delta);

        // Map boundary check
        const boundsLimit = 445;
        nextPos.x = THREE.MathUtils.clamp(nextPos.x, -boundsLimit, boundsLimit);
        nextPos.z = THREE.MathUtils.clamp(nextPos.z, -boundsLimit, boundsLimit);

        // Water checks: prevent UTV from entering deep lake sections
        const nextInLake = terrainManager.isInLake(nextPos);
        const terrainHeight = terrainManager.getTerrainHeightAt(nextPos);
        
        if (nextInLake || terrainHeight < terrainManager.WATER_LEVEL + 0.3) {
            // Water collision: Stop speed and reverse drift
            this.speed = -this.speed * 0.2;
            console.warn("⚠️ Vehicle hit water boundary, collision resolved");
        } else {
            // Safe land movement
            this.vehicle.position.copy(nextPos);
            this.resolveVehicleCollisions();
        }

        // ==========================================
        // TERRAIN SLOPE ALIGNMENT MATH (PITCH & ROLL)
        // ==========================================
        // Dynamic alignment: Calculate coordinates for four tires relative to UTV center
        const sampleOffset = 1.4; // Sample radius corresponding to wheel positions
        const vehicleRight = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));

        const pFront = this.vehicle.position.clone().addScaledVector(forwardDir, sampleOffset);
        const pBack = this.vehicle.position.clone().addScaledVector(forwardDir, -sampleOffset);
        const pLeft = this.vehicle.position.clone().addScaledVector(vehicleRight, -sampleOffset * 0.6);
        const pRight = this.vehicle.position.clone().addScaledVector(vehicleRight, sampleOffset * 0.6);

        pFront.y = terrainManager.getTerrainHeightAt(pFront);
        pBack.y = terrainManager.getTerrainHeightAt(pBack);
        pLeft.y = terrainManager.getTerrainHeightAt(pLeft);
        pRight.y = terrainManager.getTerrainHeightAt(pRight);

        // Compute slope vectors
        const vPitch = pFront.clone().sub(pBack).normalize(); // Forward pitch axis
        const vRoll = pRight.clone().sub(pLeft).normalize();  // Lateral roll axis

        // Compute the cross product to get the exact orthogonal terrain Normal vector
        const computedNormal = new THREE.Vector3().crossVectors(vPitch, vRoll).normalize();
        if (computedNormal.y < 0) computedNormal.negate(); // Always keep up normal facing upward

        // Project raw forward direction onto the computed terrain surface plane
        const forwardOnTerrain = forwardDir.clone()
            .sub(computedNormal.clone().multiplyScalar(forwardDir.dot(computedNormal)))
            .normalize();

        // Calculate orthogonal lateral direction matching slope
        const lateralOnTerrain = new THREE.Vector3().crossVectors(computedNormal, forwardOnTerrain).normalize();

        // Construct 3x3 orientation basis matrix and apply rotation smoothly via quaternions
        const basisMatrix = new THREE.Matrix4();
        basisMatrix.makeBasis(lateralOnTerrain, computedNormal, forwardOnTerrain);

        const targetOrientation = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);
        
        // Smoothly interpolate alignment (lerp suspension feel - frame-rate independent)
        const slerpFactor = 1 - Math.pow(1 - 0.15, delta * 60);
        this.vehicle.quaternion.slerp(targetOrientation, slerpFactor);

        // Apply smooth height dampening to UTV center (suspension feel - frame-rate independent)
        const targetGroundHeight = terrainManager.getGroundHeightAt(this.vehicle.position);
        const heightFactor = 1 - Math.pow(1 - 0.22, delta * 60);
        this.vehicle.position.y += (targetGroundHeight - this.vehicle.position.y) * heightFactor;

        // Update UTV engine sounds based on speed and acceleration state
        const isAccelerating = (wantsForward && !wantsBackward) || (hasJoystickThrottle && joyThrottle > 0);
        const isDecelerating = wantsBackward || (hasJoystickThrottle && joyThrottle < 0);
        const isInputHeld = wantsForward || wantsBackward || hasJoystickThrottle;

        soundManager.updateUTVPosition(this.vehicle.position);
        soundManager.updateUTVEngineSound(
            this.speed,
            this.maxSpeed,
            isAccelerating,
            isDecelerating,
            isInputHeld
        );
    }
}

export const vehicleManager = new VehicleManager();
