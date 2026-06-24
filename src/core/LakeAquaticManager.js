import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * LakeAquaticManager
 * Manages autonomous fish that swim beneath the lake surface and occasionally
 * leap out of the water in a natural jumping arc.
 */
export class LakeAquaticManager {
    constructor() {
        this.scene = null;
        this.terrainManager = null;
        this.waterLevel = -0.1;
        this.fish = []; // array of fish state objects
        this.fishModels = {}; // cached GLB scenes keyed by filename
        this.gltfLoader = null;
        this.isInitialized = false;
        this.clock = new THREE.Clock();

        // Splash particles pool
        this.splashParticles = [];
    }

    /** Call once after scene & terrainManager are ready */
    init(scene, terrainManager, waterLevel = -0.1) {
        this.scene = scene;
        this.terrainManager = terrainManager;
        this.waterLevel = waterLevel;

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setDRACOLoader(dracoLoader);

        this._buildSplashPool();
        this._spawnAllFish();

        this.isInitialized = true;
        console.log('🐟 LakeAquaticManager initialized');
    }

    // ─── Splash Particle Pool ─────────────────────────────────────────────────

    _buildSplashPool() {
        for (let i = 0; i < 12; i++) {
            const geo = new THREE.RingGeometry(0.05, 0.3, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x88ccee,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.visible = false;
            this.scene.add(mesh);
            this.splashParticles.push({ mesh, active: false, life: 0, maxLife: 0.8 });
        }
    }

    _triggerSplash(pos) {
        const p = this.splashParticles.find(p => !p.active);
        if (!p) return;
        p.mesh.position.set(pos.x, this.waterLevel + 0.05, pos.z);
        p.mesh.scale.set(1, 1, 1);
        p.mesh.material.opacity = 0.7;
        p.mesh.visible = true;
        p.active = true;
        p.life = 0;
    }

    _updateSplashes(delta) {
        for (const p of this.splashParticles) {
            if (!p.active) continue;
            p.life += delta;
            const t = p.life / p.maxLife;
            p.mesh.scale.setScalar(1 + t * 2.5);
            p.mesh.material.opacity = 0.7 * (1 - t);
            if (p.life >= p.maxLife) {
                p.active = false;
                p.mesh.visible = false;
            }
        }
    }

    // ─── Fish Spawning ────────────────────────────────────────────────────────

    /** Fish species definitions (match the GLB filenames in 3DModels/) */
    get _species() {
        return [
            { file: 'LargemouthBass.glb', scale: 0.18, swimDepth: 1.4 },
            { file: 'SmallmouthBass.glb', scale: 0.16, swimDepth: 1.2 },
            { file: 'Catfish.glb',        scale: 0.22, swimDepth: 2.0 },
            { file: 'Crappie.glb',        scale: 0.12, swimDepth: 1.0 }
        ];
    }

    _spawnAllFish() {
        // Spawn 4-6 fish per species
        for (const species of this._species) {
            const count = 4 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                this._spawnFish(species);
            }
        }
    }

    _spawnFish(species) {
        // Pick a random point in the lake
        const pos = this._randomLakePosition();

        // State object – model 3D mesh will be attached when loaded
        const state = {
            mesh: null,
            species,
            pos: pos.clone(),
            dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
            speed: 1.0 + Math.random() * 1.2,
            turnTimer: 2 + Math.random() * 4,
            turnTime: 0,
            swimPhase: Math.random() * Math.PI * 2, // bobbing phase
            depth: species.swimDepth + Math.random() * 0.8,
            // Jump state
            jumping: false,
            jumpTimer: this._nextJumpDelay(),
            jumpPhase: 0,
            jumpDuration: 1.2,
            jumpOrigin: new THREE.Vector3(),
            jumpPeak: 2.5 + Math.random() * 1.5,
            jumpDir: new THREE.Vector3()
        };

        this._loadFishModel(species.file, (model) => {
            const mesh = model.clone();
            mesh.scale.setScalar(species.scale);
            mesh.position.copy(state.pos);
            mesh.position.y = this.waterLevel - state.depth;
            this.scene.add(mesh);
            state.mesh = mesh;
        });

        this.fish.push(state);
    }

    _loadFishModel(file, callback) {
        if (this.fishModels[file]) {
            callback(this.fishModels[file]);
            return;
        }
        this.gltfLoader.load(`3DModels/${file}`, (gltf) => {
            // Apply realistic material tweaks
            gltf.scene.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.roughness = 0.5;
                    child.material.metalness = 0.3;
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });
            this.fishModels[file] = gltf.scene;
            callback(gltf.scene);
        }, undefined, (err) => {
            console.warn(`Failed to load fish model ${file}:`, err);
        });
    }

    // ─── Random Lake Position ─────────────────────────────────────────────────

    _randomLakePosition() {
        // Try random positions until we find one inside the lake boundary
        for (let attempt = 0; attempt < 200; attempt++) {
            const x = (Math.random() - 0.5) * 600;
            const z = (Math.random() - 0.5) * 600;
            const candidate = new THREE.Vector3(x, 0, z);
            if (this.terrainManager && this.terrainManager.isInLake(candidate)) {
                return candidate;
            }
        }
        // Fallback: center of map area that is typically the lake
        return new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            0,
            (Math.random() - 0.5) * 100
        );
    }

    _nextJumpDelay() {
        // Fish jump every 15-45 seconds (randomized per fish)
        return 15 + Math.random() * 30;
    }

    // ─── Main Update Loop ─────────────────────────────────────────────────────

    update(delta) {
        if (!this.isInitialized) return;
        this._updateSplashes(delta);

        for (const f of this.fish) {
            if (!f.mesh) continue;

            if (f.jumping) {
                this._updateJump(f, delta);
            } else {
                this._updateSwim(f, delta);

                // Count down to next jump
                f.jumpTimer -= delta;
                if (f.jumpTimer <= 0) {
                    // Only jump if the fish is inside the lake
                    if (this.terrainManager && this.terrainManager.isInLake(f.pos)) {
                        this._startJump(f);
                    } else {
                        f.jumpTimer = this._nextJumpDelay();
                    }
                }
            }
        }
    }

    // ─── Swimming Behaviour ───────────────────────────────────────────────────

    _updateSwim(f, delta) {
        f.swimPhase += delta * 1.8;
        f.turnTime += delta;

        // Periodically pick a new direction
        if (f.turnTime >= f.turnTimer) {
            f.turnTime = 0;
            f.turnTimer = 2 + Math.random() * 4;

            // Steer somewhat randomly – bias toward staying in the lake
            const newAngle = Math.atan2(f.dir.z, f.dir.x) + (Math.random() - 0.5) * Math.PI;
            f.dir.set(Math.cos(newAngle), 0, Math.sin(newAngle)).normalize();
        }

        // Move forward
        const dx = f.dir.x * f.speed * delta;
        const dz = f.dir.z * f.speed * delta;
        const nx = f.pos.x + dx;
        const nz = f.pos.z + dz;
        const candidate = new THREE.Vector3(nx, 0, nz);

        if (this.terrainManager && this.terrainManager.isInLake(candidate)) {
            f.pos.x = nx;
            f.pos.z = nz;
        } else {
            // Bounce: reverse + random turn
            f.dir.negate();
            f.dir.x += (Math.random() - 0.5) * 0.5;
            f.dir.z += (Math.random() - 0.5) * 0.5;
            f.dir.y = 0;
            f.dir.normalize();
        }

        // Y position: below water surface with subtle bobbing
        const bob = Math.sin(f.swimPhase) * 0.06;
        const targetY = this.waterLevel - f.depth + bob;

        f.mesh.position.set(f.pos.x, targetY, f.pos.z);

        // Face direction of travel (fish heads face +X in most GLB exports)
        const angle = Math.atan2(f.dir.z, f.dir.x);
        f.mesh.rotation.y = -angle + Math.PI * 0.5;

        // Subtle body roll/pitch while swimming
        f.mesh.rotation.z = Math.sin(f.swimPhase * 0.5) * 0.08;
    }

    // ─── Jump Behaviour ───────────────────────────────────────────────────────

    _startJump(f) {
        f.jumping = true;
        f.jumpPhase = 0;
        f.jumpOrigin.copy(f.pos);
        f.jumpOrigin.y = this.waterLevel;

        // Jump direction: forward + slight randomness
        f.jumpDir.set(
            f.dir.x + (Math.random() - 0.5) * 0.6,
            0,
            f.dir.z + (Math.random() - 0.5) * 0.6
        ).normalize();

        // Trigger splash on exit
        this._triggerSplash(f.jumpOrigin);
    }

    _updateJump(f, delta) {
        f.jumpPhase += delta / f.jumpDuration;

        if (f.jumpPhase >= 1.0) {
            // Landing splash
            this._triggerSplash(new THREE.Vector3(
                f.jumpOrigin.x + f.jumpDir.x * 2,
                this.waterLevel,
                f.jumpOrigin.z + f.jumpDir.z * 2
            ));

            // Return to swimming
            f.jumping = false;
            f.jumpTimer = this._nextJumpDelay();
            f.mesh.rotation.z = 0;
            return;
        }

        const t = f.jumpPhase;
        // Horizontal travel
        const horizRange = 3.5;
        const x = f.jumpOrigin.x + f.jumpDir.x * horizRange * t;
        const z = f.jumpOrigin.z + f.jumpDir.z * horizRange * t;
        // Parabolic arc: y = base + height * 4t(1-t)
        const y = this.waterLevel + f.jumpPeak * 4 * t * (1 - t);

        f.mesh.position.set(x, y, z);
        f.pos.set(x, 0, z);

        // Pitch fish: face up on ascent, down on descent
        const pitchAngle = (0.5 - t) * Math.PI * 0.8;
        f.mesh.rotation.x = -pitchAngle;

        // Face jump direction
        const angle = Math.atan2(f.jumpDir.z, f.jumpDir.x);
        f.mesh.rotation.y = -angle + Math.PI * 0.5;

        // Roll/flip naturally
        f.mesh.rotation.z = Math.sin(t * Math.PI) * 0.4;
    }
}

export const lakeAquaticManager = new LakeAquaticManager();
