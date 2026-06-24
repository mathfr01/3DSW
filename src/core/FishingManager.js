import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { inputManager } from './InputManager.js';
class FishingManager {
    constructor() {
        this.state = 'idle'; // 'idle', 'aiming', 'casting', 'waiting', 'biting', 'reeling', 'caught', 'lost'
        this.config = {
            baseBiteChance: 0.08,            // Chance of a bite per roll (approx 8%)
            trollingBiteMultiplier: 2.2,    // 2.2x bite chance when actively moving the rod
            strikeWindow: 1800,             // 1.8 seconds to strike after bite
            lossChancePerSecond: 0.035,     // 3.5% chance to lose the fish per second while battling
            rollInterval: 3000,             // Check for a bite every 3 seconds
            maxCastDistance: 45.0,          // Maximum cast distance in world units
            fishSpecies: [
                { id: 'LargemouthBass', name: 'Largemouth Bass', file: 'LargemouthBass.glb', minLen: 12, maxLen: 30, minWt: 1.5, maxWt: 16.0 },
                { id: 'SmallmouthBass', name: 'Smallmouth Bass', file: 'SmallmouthBass.glb', minLen: 10, maxLen: 23, minWt: 1.0, maxWt: 8.5 },
                { id: 'Catfish', name: 'Catfish', file: 'Catfish.glb', minLen: 16, maxLen: 50, minWt: 2.0, maxWt: 45.0 },
                { id: 'Crappie', name: 'Crappie', file: 'Crappie.glb', minLen: 6, maxLen: 17, minWt: 0.4, maxWt: 4.5 }
            ]
        };
        // References
        this.scene = null;
        this.camera = null;
        this.water = null;
        this.getTerrainHeightAt = null;
        this.isInLake = null;
        // 3D Objects
        this.rodGroup = null;
        this.rodTip = null;
        this.bobber = null;
        this.worm = null;
        this.line = null;
        this.splashMesh = null;
        this.battleFishMesh = null;
        // Fish animation state
        this.fishBendPhase = 0;
        this.fishBendAmplitude = 0;
        this.fishSpineBones = [];
        // Sound Synthesis (Web Audio API)
        this.audioCtx = null;
        this.fishingQuoteAudio = null;
        this.fishingQuoteFiles = [
            'quotes/Fishing64-04152m 45s-2m 57sVGR.mp3',
            'quotes/Fishing63-0630E17m 47s-17m 59sVGR.mp3',
            'quotes/Fishing63-0630E16m 55s-17m 16sVGR.mp3',
            'quotes/Fishing61-0415B3m 37s-3m 50sVGR.mp3'
        ];
        // Game State Variables
        this.isTrolling = false;
        this.castStart = new THREE.Vector3();
        this.castEnd = new THREE.Vector3();
        this.castTimer = 0;
        this.castDuration = 1.1; // 1.1s flight time
        this.bobberFloatOffset = 0;
        this.bobberPulse = 0;
        this.rollTimer = 0;
        this.biteTimer = 0;
        this.battleDistance = 0;
        this.currentFish = null;
        this.rodTilt = new THREE.Vector2(0, 0); // tilt offsets (X: vertical, Y: horizontal)
        this.player = null;
        this.isReelPressed = false;
        this.isFishingMode = false;
        
        // Input variables
        this.keys = {};
        this.controls = null;
        this.isReelPressed = false;
        this.reelPressTimer = 0;
        // Reel sound state
        this.isReelSoundPlaying = false;
        // Trophies Database
        this.trophies = [];
        this.loadTrophies();
        // Proximity Callback
        this.onProximityChange = null;
        this.isNearShore = false;
        // Fish model cache
        this.fishModels = {};
        this.gltfLoader = new GLTFLoader();
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader.setDRACOLoader(this.dracoLoader);
    }
    loadTrophies() {
        try {
            const data = localStorage.getItem('stillwaters_fishing_trophies');
            this.trophies = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to load trophies from localStorage:", e);
            this.trophies = [];
        }
    }
    saveTrophies() {
        try {
            localStorage.setItem('stillwaters_fishing_trophies', JSON.stringify(this.trophies));
        } catch (e) {
            console.error("Failed to save trophies to localStorage:", e);
        }
    }
    init(scene, camera, water, getTerrainHeightAt, isInLake, controls) {
        this.scene = scene;
        this.camera = camera;
        this.water = water;
        this.getTerrainHeightAt = getTerrainHeightAt;
        this.isInLake = isInLake;
        this.controls = controls;
        this.waterLevel = water ? water.position.y : -0.1;
        // Set up local key listeners for fishing interactions
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space' && this.state === 'biting') {
                this.strike();
            }
            if (this.state === 'waiting' && e.code === 'KeyR') {
                // Ignore exiting fishing when line is casted, or let them do it
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        // Initialize Procedural Meshes
        this.createFishingRod();
        this.createBobber();
        this.createLine();
        this.createSplashMesh();
        
        console.log("🎣 FishingManager successfully initialized!");
    }
    // Procedurally Synthesize Sound Effects using Web Audio API
// Add a cache object to your class to store the preloaded/created audio elements
audioCache = {};

playSound(type, options = {}) {
    try {
        // Map types to your new MP3 assets
        const soundMap = {
            'splash': 'sounds/FishingBaitSplash.mp3',
            'cast': 'sounds/FishingCast.mp3',
            'reel': 'sounds/FishingReeling.mp3'
        };

        // If the type is one of our MP3 files, play it using standard HTML5 Audio
        if (soundMap[type]) {
            // Check cache or create a new Audio instance
            if (!this.audioCache[type]) {
                this.audioCache[type] = new Audio(soundMap[type]);
            }
            
            const audio = this.audioCache[type];
            
            // Configure looping if specified
            if (options.loop !== undefined) {
                audio.loop = options.loop;
            } else {
                audio.loop = false;
            }
            
            // For non-reel sounds, reset to start. For reel, only reset if not already playing
            if (type !== 'reel' || !options.loop) {
                audio.currentTime = 0;
            }
            
            audio.play().catch(e => console.warn(`Playback blocked for ${type}:`, e));
            return;
        }

        // --- Fallback for synthesized sounds (alert, catch) if you still need them ---
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        
        const ctx = this.audioCtx;
        const dest = ctx.destination;

        if (type === 'alert') {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(698.46, ctx.currentTime);
            osc2.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(dest);
            osc1.start();
            osc2.start();
            osc1.stop(ctx.currentTime + 0.45);
            osc2.stop(ctx.currentTime + 0.45);
        } else if (type === 'catch') {
            const notes = [261.63, 329.63, 392.00, 523.25];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 1000;
                gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.5);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(dest);
                osc.start(ctx.currentTime + idx * 0.1);
                osc.stop(ctx.currentTime + idx * 0.1 + 0.55);
            });
        }
    } catch (e) {
        console.warn("Audio playback or synthesis failed:", e);
    }
}

    playRandomFishingQuote() {
        if (!this.fishingQuoteFiles.length) return;

        try {
            if (this.fishingQuoteAudio) {
                this.fishingQuoteAudio.pause();
                this.fishingQuoteAudio.currentTime = 0;
            }

            const quotePath = this.fishingQuoteFiles[Math.floor(Math.random() * this.fishingQuoteFiles.length)];
            const audio = new Audio(quotePath);
            audio.preload = 'auto';
            audio.volume = 1.0;
            audio.play().catch((error) => console.warn('Playback blocked for fishing quote:', error));
            this.fishingQuoteAudio = audio;
        } catch (error) {
            console.warn('Failed to play fishing quote:', error);
        }
    }

    stopFishingQuote() {
        if (!this.fishingQuoteAudio) return;

        try {
            this.fishingQuoteAudio.pause();
            this.fishingQuoteAudio.currentTime = 0;
        } catch (error) {
            // Ignore cleanup errors if playback already ended.
        }

        this.fishingQuoteAudio = null;
    }

stopSound(type) {
    if (this.audioCache[type]) {
        const audio = this.audioCache[type];
        audio.pause();
        audio.currentTime = 0;
    }
}

    // Procedurally Build a detailed Fishing Rod mesh
    createFishingRod() {
        this.rodGroup = new THREE.Group();
        // 1. Grip / Handle (Cork Material)
        const gripGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.22, 8);
        const gripMat = new THREE.MeshStandardMaterial({
            color: 0xbd9a73, // Cork color
            roughness: 0.8,
            metalness: 0.1
        });
        const grip = new THREE.Mesh(gripGeo, gripMat);
        grip.position.set(0, 0, 0.1);
        grip.rotation.x = Math.PI / 2;
        grip.castShadow = true;
        this.rodGroup.add(grip);
        // 2. Reel Seat & Reel (Metallic dark grey)
        const seatGeo = new THREE.CylinderGeometry(0.014, 0.015, 0.08, 8);
        const metallicMat = new THREE.MeshStandardMaterial({
            color: 0x444448,
            roughness: 0.3,
            metalness: 0.8
        });
        const seat = new THREE.Mesh(seatGeo, metallicMat);
        seat.position.set(0, 0, -0.05);
        seat.rotation.x = Math.PI / 2;
        seat.castShadow = true;
        this.rodGroup.add(seat);
        // Spinning Reel housing (torus + cylinders)
        const reelHousingGeo = new THREE.SphereGeometry(0.024, 8, 8);
        const reelHousing = new THREE.Mesh(reelHousingGeo, metallicMat);
        reelHousing.position.set(0, -0.04, -0.05);
        this.rodGroup.add(reelHousing);
        const spoolGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
        const spoolMat = new THREE.MeshStandardMaterial({ color: 0x11ff11, roughness: 0.5 }); // green line on spool
        const spool = new THREE.Mesh(spoolGeo, spoolMat);
        spool.position.set(0, -0.04, -0.08);
        spool.rotation.x = Math.PI / 2;
        this.rodGroup.add(spool);
        const handleArmGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.04, 8);
        const handleArm = new THREE.Mesh(handleArmGeo, metallicMat);
        handleArm.position.set(0.028, -0.04, -0.05);
        handleArm.rotation.z = Math.PI / 4;
        this.rodGroup.add(handleArm);
        // 3. Rod Blank (Carbon Fiber carbon tapered cylinder)
        const blankGeo = new THREE.CylinderGeometry(0.002, 0.008, 2.5, 8);
        const blankMat = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a, // lighter gray for visibility
            roughness: 0.3,
            metalness: 0.7
        });
        const blank = new THREE.Mesh(blankGeo, blankMat);
        blank.position.set(0, 0, -1.25);
        blank.rotation.x = Math.PI / 2;
        blank.castShadow = true;
        this.rodGroup.add(blank);
        // 4. Line Guides (Metallic Ringlets)
        const ringGeo = new THREE.TorusGeometry(0.01, 0.002, 4, 8);
        const guidesCount = 5;
        for (let i = 0; i < guidesCount; i++) {
            const ratio = i / (guidesCount - 1);
            const zPos = -0.15 - (ratio * 1.3);
            const ringScale = 1.0 - (ratio * 0.65);
            
            const guideRing = new THREE.Mesh(ringGeo, metallicMat);
            guideRing.scale.set(ringScale, ringScale, ringScale);
            guideRing.position.set(0, ringScale * 0.014, zPos);
            guideRing.rotation.y = Math.PI / 2;
            this.rodGroup.add(guideRing);
        }
        // Rod Tip anchor
        this.rodTip = new THREE.Group();
        this.rodTip.position.set(0, 0.006, -2.5);
        this.rodGroup.add(this.rodTip);
        // Scale up the rod for better visibility
        this.rodGroup.scale.set(4.0, 4.0, 4.0);
    }
    // Procedurally Build a beautiful bobber (Red top, white bottom) & worm bait
    createBobber() {
        this.bobber = new THREE.Group();
        // Upper sphere (Red)
        const topGeo = new THREE.SphereGeometry(0.07, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.1 });
        const topHalf = new THREE.Mesh(topGeo, redMat);
        this.bobber.add(topHalf);
        // Lower sphere (White)
        const botGeo = new THREE.SphereGeometry(0.07, 12, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.1 });
        const bottomHalf = new THREE.Mesh(botGeo, whiteMat);
        this.bobber.add(bottomHalf);
        // Center stick (black rod)
        const stickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6);
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        const stick = new THREE.Mesh(stickGeo, blackMat);
        stick.rotation.x = Math.PI / 2;
        this.bobber.add(stick);
        // Pink Worm under bobber
        this.worm = new THREE.Group();
        const wormParts = 4;
        const segmentMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }); // soft pink
        for (let i = 0; i < wormParts; i++) {
            const segGeo = new THREE.SphereGeometry(0.024, 6, 6);
            const segment = new THREE.Mesh(segGeo, segmentMat);
            segment.position.set(
                Math.sin(i * 1.2) * 0.02,
                -0.08 - (i * 0.04),
                Math.cos(i * 1.2) * 0.02
            );
            this.worm.add(segment);
        }
        this.bobber.add(this.worm);
        this.bobber.visible = false;
        this.scene.add(this.bobber);
    }
    // Procedural splash ripple indicator
    createSplashMesh() {
        const ringGeo = new THREE.RingGeometry(0.05, 0.12, 16);
        const splashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });
        this.splashMesh = new THREE.Mesh(ringGeo, splashMat);
        this.splashMesh.rotation.x = -Math.PI / 2;
        this.splashMesh.position.y = this.waterLevel + 0.01;
        this.scene.add(this.splashMesh);
    }
    // Connects the rod tip to the bobber dynamically
    createLine() {
        const points = [];
        for (let i = 0; i < 20; i++) {
            points.push(new THREE.Vector3());
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xe0e7ff, // glowing white-blue line
            transparent: true,
            opacity: 0.65
        });
        this.line = new THREE.Line(lineGeo, lineMat);
        this.line.visible = false;
        this.scene.add(this.line);
    }
    // Spawns a visually pleasing splash at a location
    spawnSplash(position) {
        this.splashMesh.position.set(position.x, this.waterLevel + 0.015, position.z);
        this.splashMesh.scale.set(1, 1, 1);
        this.splashMesh.material.opacity = 0.8;
        this.playSound('splash');
    }
    // Returns the exact world coordinates of the tip of the rod
    getRodTipWorldPosition() {
        if (!this.rodTip) return new THREE.Vector3();
        const worldPos = new THREE.Vector3();
        this.rodTip.getWorldPosition(worldPos);
        return worldPos;
    }
    // Updates the line geometric vertices between the rod tip and bobber
    updateLineGeometry() {
        if (!this.line || !this.line.visible) return;
        const tipPos = this.getRodTipWorldPosition();
        let endPos;
        if (this.state === 'casting') {
            endPos = this.bobber.position.clone();
        } else if (this.state === 'waiting' || this.state === 'biting' || this.state === 'reeling') {
            endPos = this.bobber.position.clone();
        } else {
            this.line.visible = false;
            return;
        }
        // Generate a smooth catenary-like line sag curve using quadratic Bezier logic
        const midPoint = new THREE.Vector3().addVectors(tipPos, endPos).multiplyScalar(0.5);
        const dist = tipPos.distanceTo(endPos);
        
        // Sag amount increases with distance and sags lower when waiting, bends less when reeling
        let sag = dist * 0.09;
        if (this.state === 'reeling') {
            sag = dist * 0.02; // tense tight line
        }
        midPoint.y -= sag;
        const curve = new THREE.QuadraticBezierCurve3(tipPos, midPoint, endPos);
        const curvePoints = curve.getPoints(20);
        
        const positionAttr = this.line.geometry.attributes.position;
        for (let i = 0; i < curvePoints.length; i++) {
            positionAttr.setXYZ(i, curvePoints[i].x, curvePoints[i].y, curvePoints[i].z);
        }
        positionAttr.needsUpdate = true;
    }
    // Shoreline checker triggered in loop
    checkShorelineProximity(playerPos) {
        if (!this.isInLake || !this.getTerrainHeightAt) return;
        const isPlayerInWater = this.isInLake(playerPos);
        let nearWater = false;
        // If player is on land, check if water is close by in a surrounding radius
        if (!isPlayerInWater) {
            const checkRadius = 6.0;
            const checkDirections = 8;
            for (let i = 0; i < checkDirections; i++) {
                const angle = (i / checkDirections) * Math.PI * 2;
                const offsetPos = new THREE.Vector3(
                    playerPos.x + Math.cos(angle) * checkRadius,
                    playerPos.y,
                    playerPos.z + Math.sin(angle) * checkRadius
                );
                if (this.isInLake(offsetPos)) {
                    nearWater = true;
                    break;
                }
            }
        }
        // Also check if the player is standing on the dock specifically!
        // Dock coordinates around X: 15 to 40, Z: 35 to 80
        const isNearDock = Math.abs(playerPos.x - 22) < 20 && Math.abs(playerPos.z - 50) < 35;
        if (isNearDock) {
            nearWater = true;
        }
        const isNear = nearWater && !isPlayerInWater;
        if (isNear !== this.isNearShore) {
            this.isNearShore = isNear;
            if (this.onProximityChange) {
                this.onProximityChange(this.isNearShore);
            }
        }
    }
    startFishingGame() {
        if (this.state !== 'idle') return;
        if (!this.camera) {
            console.warn('FishingManager.startFishingGame called before init() has provided a camera.');
            return;
        }
        this.isFishingMode = true;
        this.currentFish = null;
        this.state = 'aiming';
        this.isReelPressed = false;
        this.rollTimer = 0;
        this.biteTimer = 0;
        // Add rod to scene instead of camera for better visibility
        this.scene.add(this.rodGroup);
        // Position will be updated in updateAimAndTrolling
        // Ensure bobber and line are hidden at start
        this.bobber.visible = false;
        this.line.visible = false;
        this.isTrolling = false;
        this.playRandomFishingQuote();
        console.log("🎣 Fishing mode active. Aiming cast!");
    }
    stopFishingGame() {
        if (this.state === 'idle') return;
        this.state = 'idle';
        this.isFishingMode = false;
        this.isReelPressed = false;
        this.stopFishingQuote();
        // Stop reel sound if it's playing
        if (this.isReelSoundPlaying) {
            this.stopSound('reel');
            this.isReelSoundPlaying = false;
        }
        this.scene.remove(this.rodGroup);
        this.bobber.visible = false;
        this.line.visible = false;
        this.splashMesh.material.opacity = 0;
        
        if (this.battleFishMesh) {
            this.scene.remove(this.battleFishMesh);
            this.battleFishMesh = null;
        }
        // Reset fish animation state
        this.fishBendPhase = 0;
        this.fishBendAmplitude = 0;
        this.fishSpineBones = [];
        console.log("🚶 Exited fishing. Returning to walking.");
    }
    enterFishingMode({ player, camera }) {
        this.player = player || this.player;
        this.camera = camera || this.camera;
        this.isFishingMode = true;
        this.startFishingGame();
    }
    exitFishingMode() {
        this.stopFishingGame();
    }
    startCasting() {
        if (this.state === 'aiming') {
            this.cast();
        }
    }
    onFishingMouseDown() {
        if (this.state === 'aiming') {
            this.startCasting();
            return;
        }
        if (this.state === 'biting') {
            this.strike();
            return;
        }
        if (this.state === 'waiting' || this.state === 'reeling') {
            this.isReelPressed = true;
        }
    }
    onFishingMouseUp() {
        this.isReelPressed = false;
        this.reelPressTimer = 0;
    }
    onStrikeButton() {
        if (this.state === 'biting') {
            this.strike();
        }
    }
    onReelButton(pressed) {
        this.isReelPressed = pressed;
        if (!pressed) {
            this.reelPressTimer = 0;
        }
    }
    getState() {
        return this.state;
    }
    getTension() {
        return window.fishingTension || 0;
    }
    getTrophies() {
        return this.trophies.slice();
    }
    getDistance() {
        return this.battleDistance || 0;
    }
    setBiteChance(value) {
        this.config.baseBiteChance = Math.max(0, Math.min(1, value));
    }
    setTrollingMultiplier(value) {
        this.config.trollingBiteMultiplier = Math.max(1, value);
    }
    cast() {
        if (this.state !== 'aiming') return;
        // Calculate aim impact point on the water mathematically
        const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        
        if (rayDir.y >= 0) {
            console.warn("Aim target must be pointed down towards the lake surface.");
            return;
        }
        // Distance formula to water plane y = WATER_LEVEL
        const t = (this.waterLevel - this.camera.position.y) / rayDir.y;
        let targetPos = this.camera.position.clone().addScaledVector(rayDir, t);
        // Clamp cast distance
        const distance = this.camera.position.distanceTo(targetPos);
        if (distance > this.config.maxCastDistance) {
            targetPos = this.camera.position.clone().addScaledVector(rayDir.normalize(), this.config.maxCastDistance);
            targetPos.y = this.waterLevel;
        }
        // S'assurer que le lancer atterrit bien dans l'eau
        if (!this.isInLake(targetPos)) {
            console.warn("Must cast into the water!");
            return;
        }
        this.playSound('cast');
        this.state = 'casting';
        this.castTimer = 0;
        this.castStart.copy(this.getRodTipWorldPosition());
        this.castEnd.copy(targetPos);
        this.bobber.position.copy(this.castStart);
        this.bobber.visible = true;
        this.line.visible = true;
    }
    // Battle / hooking strike command
    async strike() {
        if (this.state !== 'biting') return;
        // Hooked! Calculate fish specifications
        this.playSound('alert');
        this.state = 'reeling';
        
        // Randomly pick a fish species
        const spIdx = Math.floor(Math.random() * this.config.fishSpecies.length);
        const species = this.config.fishSpecies[spIdx];
        // Generate length and weight
        const length = THREE.MathUtils.randFloat(species.minLen, species.maxLen);
        // Weight maps curve to length ratio
        const sizeRatio = (length - species.minLen) / (species.maxLen - species.minLen);
        const weight = THREE.MathUtils.lerp(species.minWt, species.maxWt, sizeRatio * sizeRatio) * (0.9 + Math.random() * 0.2);
        // Categorize into Rarity badge grades
        let category = 'Bronze';
        if (sizeRatio >= 0.85) {
            category = 'Gold';
        } else if (sizeRatio >= 0.45) {
            category = 'Silver';
        }
        this.currentFish = {
            id: species.id,
            name: species.name,
            file: species.file,
            length: parseFloat(length.toFixed(1)),
            weight: parseFloat(weight.toFixed(1)),
            category: category,
            timestamp: new Date().toLocaleString()
        };
        this.battleDistance = this.bobber.position.distanceTo(this.camera.position);
        
        // Spawn the fish mesh (now async to load GLB models)
        await this.createBattleFishMesh();
        console.log(`🔥 Fish hooked! Species: ${species.name}, size: ${length.toFixed(1)} inches, fighting distance: ${this.battleDistance.toFixed(1)}m`);
    }
    async loadFishModel(filename) {
        if (this.fishModels[filename]) {
            return this.fishModels[filename];
        }
        
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(`3DModels/${filename}`, (gltf) => {
                const model = gltf.scene;

                // Enable shadows for the fish model
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Extract spine bones if the model has a skeleton
                this.fishSpineBones = [];
                model.traverse((node) => {
                    if (node.isBone && (node.name.toLowerCase().includes('spine') ||
                        node.name.toLowerCase().includes('backbone') ||
                        node.name.toLowerCase().includes('vertebra') ||
                        node.name.toLowerCase().includes('bone'))) {
                        this.fishSpineBones.push(node);
                    }
                });

                // If no spine bones found, try to find any bones
                if (this.fishSpineBones.length === 0) {
                    model.traverse((node) => {
                        if (node.isBone) {
                            this.fishSpineBones.push(node);
                        }
                    });
                }

                if (this.fishSpineBones.length > 0) {
                    console.log(`Found ${this.fishSpineBones.length} bones in ${filename}`);
                }

                this.fishModels[filename] = model;
                resolve(model);
            }, undefined, (error) => {
                console.error(`Failed to load fish model: ${filename}`, error);
                reject(error);
            });
        });
    }
    
    async createBattleFishMesh() {
        if (this.battleFishMesh) this.scene.remove(this.battleFishMesh);
        
        // Try to load the actual GLB fish model
        if (this.currentFish && this.currentFish.file) {
            try {
                const fishModel = await this.loadFishModel(this.currentFish.file);
                this.battleFishMesh = fishModel.clone();
                this.battleFishMesh.position.copy(this.bobber.position);
                this.battleFishMesh.position.y = this.waterLevel - 0.1;
                this.battleFishMesh.scale.set(0.5, 0.5, 0.5);
                // Rotate fish 180 degrees when caught
                this.battleFishMesh.rotation.z = Math.PI;
                this.scene.add(this.battleFishMesh);
                return;
            } catch (error) {
                console.warn(`Failed to load fish model ${this.currentFish.file}, falling back to procedural mesh`, error);
            }
        }
        
        // Fallback to procedural mesh if GLB loading fails
        const fishGroup = new THREE.Group();

        const bodyGeo = new THREE.ConeGeometry(0.12, 0.45, 6);
        const fishMat = new THREE.MeshStandardMaterial({
            color: 0x4f6f52, // greenish scale color
            roughness: 0.4,
            metalness: 0.5
        });
        const body = new THREE.Mesh(bodyGeo, fishMat);
        body.rotation.x = Math.PI / 2; // Point cone along Z-axis
        body.castShadow = true;
        body.receiveShadow = true;
        fishGroup.add(body);
        // Tail Fin
        const tailGeo = new THREE.ConeGeometry(0.06, 0.16, 4);
        const tail = new THREE.Mesh(tailGeo, fishMat);
        tail.position.set(0, 0, -0.25); // Position behind body along -Z
        tail.rotation.x = -Math.PI / 2; // Align along Z-axis
        tail.castShadow = true;
        tail.receiveShadow = true;
        fishGroup.add(tail);
        this.battleFishMesh = fishGroup;
        this.battleFishMesh.position.copy(this.bobber.position);
        this.battleFishMesh.position.y = this.waterLevel - 0.1;
        // Rotate fish 90 degrees clockwise when caught
        this.battleFishMesh.rotation.z = Math.PI / 2;
        this.scene.add(this.battleFishMesh);
    }
    loseFish() {
        this.state = 'lost';
        // Stop reel sound if it's playing
        if (this.isReelSoundPlaying) {
            this.stopSound('reel');
            this.isReelSoundPlaying = false;
        }
        this.playSound('cast'); // release tension noise
        this.bobber.visible = false;
        this.line.visible = false;
        
        if (this.battleFishMesh) {
            this.scene.remove(this.battleFishMesh);
            this.battleFishMesh = null;
        }
        // Trigger a premium notification UI popup in index.html
        const notify = document.getElementById('fishingNotification');
        if (notify) {
            notify.textContent = "💨 The fish got away! / Le poisson s'est échappé !";
            notify.classList.add('active');
            setTimeout(() => notify.classList.remove('active'), 2500);
        }
        setTimeout(() => {
            if (this.state === 'lost') {
                this.state = 'aiming';
            }
        }, 1500);
    }
    captureFishImage() {
        if (!this.battleFishMesh) return null;
        
        // Create a temporary scene for rendering the fish
        const tempScene = new THREE.Scene();
        tempScene.background = new THREE.Color(0x0b0f14);
        
        // Clone the fish mesh
        const fishClone = this.battleFishMesh.clone();
        
        // Position the fish nicely for the photo
        fishClone.position.set(0, 0, 0);
        fishClone.rotation.set(0, Math.PI / 4, 0);
        fishClone.scale.set(3, 3, 3);
        tempScene.add(fishClone);
        
        // Add lights for better visibility
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        tempScene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(5, 5, 5);
        tempScene.add(directionalLight);
        
        const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
        backLight.position.set(-5, 3, -5);
        tempScene.add(backLight);
        
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(0, -3, 5);
        tempScene.add(fillLight);
        
        // Create temporary camera
        const tempCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        tempCamera.position.set(0, 0, 4);
        tempCamera.lookAt(0, 0, 0);
        
        // Create temporary renderer
        const tempRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        tempRenderer.setSize(256, 256);
        tempRenderer.render(tempScene, tempCamera);
        
        // Get the image data
        const imageData = tempRenderer.domElement.toDataURL('image/png');
        
        // Clean up
        tempRenderer.dispose();
        tempScene.remove(fishClone);
        
        return imageData;
    }
    
    catchFish() {
        this.state = 'caught';
        // Stop reel sound if it's playing
        if (this.isReelSoundPlaying) {
            this.stopSound('reel');
            this.isReelSoundPlaying = false;
        }
        this.playSound('catch');
        
        // Capture fish image before removing mesh
        const fishImage = this.captureFishImage();
        if (fishImage) {
            this.currentFish.image = fishImage;
        }
        
        // Save to Trophies cupboard
        this.trophies.push(this.currentFish);
        this.saveTrophies();
        // Trigger Caught full-screen dashboard in index.html
        if (window.showFishCaughtScreen) {
            window.showFishCaughtScreen(this.currentFish);
        } else {
            console.log("Caught fish screen callback missing. Stats logged:", this.currentFish);
            this.state = 'aiming';
        }
        
        if (this.battleFishMesh) {
            this.scene.remove(this.battleFishMesh);
            this.battleFishMesh = null;
        }
        this.bobber.visible = false;
        this.line.visible = false;
    }
    update(delta) {
        if (this.state === 'idle') return;
        // 1st Person Camera dynamic movement and rotation update
        this.updateAimAndTrolling(delta);
        // Bobber float animations & splasher
        this.updateWaterAssets(delta);
        // Core minigame state actions
        switch (this.state) {
            case 'casting':
                this.updateCastingArc(delta);
                break;
            case 'waiting':
                this.updateWaitingCycle(delta);
                break;
            case 'biting':
                this.updateBitingCycle(delta);
                break;
            case 'reeling':
                this.updateBattleCycle(delta);
                break;
        }
        // Recalculate 3D lines
        this.updateLineGeometry();
        // Update battle distance continuously when bobber is visible
        if (this.bobber && this.bobber.visible && this.camera) {
            this.battleDistance = this.bobber.position.distanceTo(this.camera.position);
        }
    }
    updateAimAndTrolling(delta) {
        // Trolling detection: check if keys are pressed or joysticks shifted
        let movement = new THREE.Vector2(0, 0);
        if (this.keys['KeyW']) movement.y += 1.0;
        if (this.keys['KeyS']) movement.y -= 1.0;
        if (this.keys['KeyA']) movement.x -= 1.0;
        if (this.keys['KeyD']) movement.x += 1.0;
        // Mobile joystick integration for trolling
        if (inputManager && inputManager.controls) {
            if (Math.abs(inputManager.controls.joyMoveX) > 0.05) {
                movement.x += inputManager.controls.joyMoveX; // match reversed direction
            }
            if (Math.abs(inputManager.controls.joyMoveY) > 0.05) {
                movement.y -= inputManager.controls.joyMoveY; // Correct vertical polarity (up is positive movement)
            }
        }
        this.isTrolling = movement.lengthSq() > 0.001;
        // Lerp rod orientation tilt for realistic visual sway
        const targetTiltX = movement.y * 0.45; // Enhanced vertical angle shift
        const targetTiltY = -movement.x * 0.55; // Enhanced side-to-side shift
        this.rodTilt.x = THREE.MathUtils.lerp(this.rodTilt.x, targetTiltX, 0.1);
        this.rodTilt.y = THREE.MathUtils.lerp(this.rodTilt.y, targetTiltY, 0.1);
        
        // Position rod in front of camera (since it's now in scene, not camera child)
        if (this.camera && this.rodGroup) {
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            const right = new THREE.Vector3();
            right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            
            // Position rod in front and to the right of camera
            const offset = cameraDirection.clone().multiplyScalar(-1.5);
            offset.add(right.clone().multiplyScalar(0.5));
            offset.add(up.clone().multiplyScalar(-0.4));
            
            this.rodGroup.position.copy(this.camera.position).add(offset);
            
            // Rotate rod to match camera direction with some offset
            const rodRotation = this.camera.quaternion.clone();
            this.rodGroup.quaternion.copy(rodRotation);
            this.rodGroup.rotateY(-0.4 + this.rodTilt.y); // Apply side-to-side tilt
            this.rodGroup.rotateX(0.1 + this.rodTilt.x); // Apply vertical tilt
            this.rodGroup.rotateZ(0.1);
        }
        // Batten down battle vibration when reeling in a heavy fish!
        if (this.state === 'reeling') {
            const shake = Math.sin(performance.now() * 0.04) * 0.008 * (this.currentFish ? (this.currentFish.weight / 10) : 1);
            this.rodGroup.position.x += shake;
            this.rodGroup.position.y += shake;
        }
    }
    applyProceduralBending(mesh, phase, intensity, weightFactor) {
        // Apply procedural bending to mesh vertices for models without bones
        mesh.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const geometry = child.geometry;
                const position = geometry.attributes.position;
                
                if (position) {
                    // Store original positions if not already stored
                    if (!geometry.userData.originalPositions) {
                        geometry.userData.originalPositions = position.array.slice();
                    }
                    
                    const originalPositions = geometry.userData.originalPositions;
                    const vertexCount = position.count;
                    
                    for (let i = 0; i < vertexCount; i++) {
                        const x = originalPositions[i * 3];
                        const y = originalPositions[i * 3 + 1];
                        const z = originalPositions[i * 3 + 2];
                        
                        // Calculate bend based on position along the fish body (Z-axis)
                        const bodyRatio = (z + 0.3) / 0.6; // Normalize to 0-1 range
                        const bendAmount = Math.sin(phase + bodyRatio * Math.PI) * 0.15 * intensity * weightFactor;
                        
                        // Apply bending to X and Y positions
                        position.array[i * 3] = x + bendAmount * Math.sin(phase * 0.5);
                        position.array[i * 3 + 1] = y + bendAmount * Math.cos(phase * 0.5) * 0.5;
                    }
                    
                    position.needsUpdate = true;
                    geometry.computeVertexNormals();
                }
            }
        });
    }

    updateWaterAssets(delta) {
        // Simple ring splash fader
        if (this.splashMesh.material.opacity > 0.01) {
            this.splashMesh.material.opacity -= delta * 1.6;
            this.splashMesh.scale.x += delta * 2.5;
            this.splashMesh.scale.z += delta * 2.5;
        } else {
            this.splashMesh.material.opacity = 0;
        }
        // Float bobber on waves gently
        if (this.bobber.visible && (this.state === 'waiting' || this.state === 'biting' || this.state === 'reeling')) {
            this.bobberFloatOffset += delta * 2.2;
            let floatAmt = Math.sin(this.bobberFloatOffset) * 0.012;
            
            // Submerge heavily when a bite plunges under water
            if (this.state === 'biting') {
                this.bobberPulse += delta * 15.0;
                floatAmt = -0.06 + Math.sin(this.bobberPulse) * 0.018; // pulled under
            }
            this.bobber.position.y = this.waterLevel + floatAmt;
            
            // Sync battle fish position
            if (this.battleFishMesh) {
                this.battleFishMesh.position.copy(this.bobber.position);
                this.battleFishMesh.position.y = this.waterLevel - 0.08 + floatAmt * 2;
                
                // Add fighting movement: head shaking and body thrashing
                const now = performance.now() * 0.001; // Convert to seconds
                
                // Update bend phase for spine animation (slower for more deliberate movement)
                this.fishBendPhase += delta * 3;
                
                // Calculate fight intensity based on fish weight and reeling state
                const wantsReel = this.keys['Space'] || this.isReelPressed || (inputManager && inputManager.controls.jump);
                const weightFactor = this.currentFish ? Math.min(1.5, this.currentFish.weight / 10) : 1;
                const fightIntensity = wantsReel ? 1.2 : 0.8;
                
                // 3D Body Bending Animation (slower, more flexible bending)
                if (this.fishSpineBones.length > 0) {
                    // Animate spine bones for realistic body bending
                    this.fishSpineBones.forEach((bone, index) => {
                        const boneRatio = index / this.fishSpineBones.length;
                        const bendAmount = Math.sin(this.fishBendPhase + boneRatio * Math.PI) * 0.25 * fightIntensity * weightFactor;
                        
                        // Bend the spine in a wave pattern (slower, more flexible)
                        bone.rotation.x = bendAmount;
                        
                        // Add secondary bending for more organic movement
                        const secondaryBend = Math.sin(this.fishBendPhase * 0.8 + boneRatio * Math.PI * 0.5) * 0.12 * fightIntensity;
                        bone.rotation.z = secondaryBend;
                        
                        // Add slight twist for realistic thrashing
                        const twist = Math.sin(this.fishBendPhase * 0.6 + boneRatio * Math.PI * 0.3) * 0.08 * fightIntensity;
                        bone.rotation.y = twist;
                    });
                } else {
                    // Procedural mesh bending using vertex manipulation for models without bones
                    this.applyProceduralBending(this.battleFishMesh, this.fishBendPhase, fightIntensity, weightFactor);
                }
                
                // Slower, more deliberate rotation animations for flexible movement
                // Tail wagging (slower frequency for visible, deliberate movement)
                const tailWag = Math.sin(now * 2.5) * 0.4 + Math.sin(now * 4) * 0.15;
                
                // Head shaking (slower, more pronounced)
                const headShake = Math.sin(now * 1.8) * 0.3 + Math.sin(now * 3.2) * 0.12;
                
                // Body rotation (gentle rolling)
                const bodyRoll = Math.sin(now * 1.2) * 0.12 + Math.cos(now * 2.5) * 0.08;
                
                // Vertical body arching (fish bending up/down - slower)
                const bodyArch = Math.sin(now * 1.5) * 0.15 * weightFactor;

                // Calculate direction from fish to rod tip (line direction)
                const rodTipPos = this.getRodTipWorldPosition();
                const toRodTip = new THREE.Vector3().subVectors(rodTipPos, this.battleFishMesh.position);
                toRodTip.y = 0; // Keep rotation strictly horizontal
                toRodTip.normalize();
                
                // Calculate target horizontal angle (yaw) to face the rod tip
                let targetYaw = Math.atan2(toRodTip.x, toRodTip.z);
                
                // Smoothly interpolate current yaw towards target yaw
                let currentYaw = this.battleFishMesh.rotation.y;
                let diff = targetYaw - currentYaw;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                
                // When reeling, limit rotation speed (fish struggles to rotate when being pulled)
                const lerpSpeed = wantsReel ? 0.05 : 0.08; // Slower when reeling, moderate when not
                this.battleFishMesh.rotation.y = currentYaw + diff * lerpSpeed;
                
                // Add very subtle tail wag wiggle (minimal to keep head oriented toward rod tip)
                const wag = Math.sin(performance.now() * 0.008) * 0.05 + Math.sin(performance.now() * 0.012) * 0.02;
                this.battleFishMesh.rotation.y += wag;
                
                // Combine head shake with body arching for more realistic movement
                this.battleFishMesh.rotation.x = headShake + bodyArch;
                
                // Determine roll alignment based on model type
                const isGLB = !!(this.currentFish && this.currentFish.file && this.fishModels[this.currentFish.file]);
                if (isGLB) {
                    // GLB model is scaled 0.5 and rotated around Z by PI
                    this.battleFishMesh.rotation.z = Math.PI + bodyRoll;
                } else {
                    // Procedural Cone fallback is scaled normally and rotated by PI/2
                    this.battleFishMesh.rotation.z = Math.PI / 2 + bodyRoll;
                }
                
                // Add slight position offset for more dynamic movement (fish lunging - slower)
                const lungeX = Math.sin(now * 2) * 0.025 * fightIntensity * weightFactor;
                const lungeZ = Math.cos(now * 1.8) * 0.025 * fightIntensity * weightFactor;
                this.battleFishMesh.position.x += lungeX;
                this.battleFishMesh.position.z += lungeZ;
            }
        }
    }
    updateCastingArc(delta) {
        this.castTimer += delta;
        const progress = Math.min(1.0, this.castTimer / this.castDuration);
        // Parabolic arc peak height based on distance
        const dist = this.castStart.distanceTo(this.castEnd);
        const maxHeight = Math.max(1.5, dist * 0.22);
        const arcY = Math.sin(progress * Math.PI) * maxHeight;
        const currentPos = new THREE.Vector3().lerpVectors(this.castStart, this.castEnd, progress);
        currentPos.y += arcY;
        this.bobber.position.copy(currentPos);
        if (progress >= 1.0) {
            this.state = 'waiting';
            this.spawnSplash(this.castEnd);
            this.rollTimer = 0;
            console.log("Bait in water. Waiting for bite...");
        }
    }
    updateWaitingCycle(delta) {
        this.rollTimer += delta * 1000; // accumulate in ms
        // Process continuous mouse reeling to adjust cast spot closer to shoreline
        const wantsReel = this.keys['Space'] || this.isReelPressed || (inputManager && inputManager.controls.jump);
        
        if (wantsReel) {
            // Start reel sound if not already playing
            if (!this.isReelSoundPlaying) {
                this.playSound('reel', { loop: true });
                this.isReelSoundPlaying = true;
            }
            
            this.reelPressTimer += delta;
            
            // Long press = rapid continuous reel, short click = pull minor steps
            let pullSpeed = 4.5; // continuous reel pull speed
            if (this.reelPressTimer < 0.25) {
                pullSpeed = 2.0; // soft initial step
            }
            
            const shoreVector = this.camera.position.clone();
            shoreVector.y = this.waterLevel;
            const pullDir = new THREE.Vector3().subVectors(shoreVector, this.bobber.position).normalize();
            
            this.bobber.position.addScaledVector(pullDir, pullSpeed * delta);
            // If pulled too close, reel in completely back to aiming reticle
            if (this.bobber.position.distanceTo(shoreVector) < 4.0) {
                // Stop reel sound if it's playing
                if (this.isReelSoundPlaying) {
                    this.stopSound('reel');
                    this.isReelSoundPlaying = false;
                }
                this.bobber.visible = false;
                this.line.visible = false;
                this.state = 'aiming';
                this.playSound('cast');
                console.log("Line fully reeled back in.");
            }
            return; // delay bite roll during reel adjustments
        } else {
            // Stop reel sound if it's playing
            if (this.isReelSoundPlaying) {
                this.stopSound('reel');
                this.isReelSoundPlaying = false;
            }
            this.reelPressTimer = 0;
        }
        // Bite Roll Cycle
        if (this.rollTimer >= this.config.rollInterval) {
            this.rollTimer = 0;
            // Compute actual probability (boosted when actively trolling)
            let chance = this.config.baseBiteChance;
            if (this.isTrolling) {
                chance *= this.config.trollingBiteMultiplier;
            }
            if (Math.random() < chance) {
                // IT'S A BITE!
                this.state = 'biting';
                this.biteTimer = 0;
                this.bobberPulse = 0;
                this.spawnSplash(this.bobber.position);
                this.playSound('alert');
                
                // Vibrate device if supported
                if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                }
                console.log("🎣 BITE! STRIKE NOW!");
            }
        }
    }
    updateBitingCycle(delta) {
        this.biteTimer += delta * 1000;
        // Spawn visual bubbles splash around bobber
        if (Math.random() < 0.18) {
            this.spawnSplash(this.bobber.position);
        }
        // Continuous vibration during biting phase for touch devices
        if (navigator.vibrate && Math.random() < 0.3) {
            navigator.vibrate(50);
        }
        // If they missed the strike window, fish escapes!
        if (this.biteTimer >= this.config.strikeWindow) {
            this.loseFish();
        }
    }
    updateBattleCycle(delta) {
        // Battle: Reeling pulling physics
        const wantsReel = this.keys['Space'] || this.isReelPressed || (inputManager && inputManager.controls.jump);
        if (wantsReel) {
            // Start reel sound if not already playing
            if (!this.isReelSoundPlaying) {
                this.playSound('reel', { loop: true });
                this.isReelSoundPlaying = true;
            }
            // Reel pull speed gets slightly slower for massive heavyweight fish!
            const fishWeightFactor = this.currentFish ? Math.max(0.6, 1.0 - (this.currentFish.weight / 60)) : 1.0;
            const reelSpeed = 4.2 * fishWeightFactor; // meters reeled in per second
            this.battleDistance -= reelSpeed * delta;
            const shoreVector = this.camera.position.clone();
            shoreVector.y = this.waterLevel;
            const pullDir = new THREE.Vector3().subVectors(shoreVector, this.bobber.position).normalize();
            
            // Move bobber closer to shore
            this.bobber.position.addScaledVector(pullDir, reelSpeed * delta);
            // Dynamic tension oscillate fader (used for decorative meter UI)
            window.fishingTension = 0.45 + Math.sin(performance.now() * 0.015) * 0.35 + (wantsReel ? 0.15 : -0.15);
            window.fishingTension = THREE.MathUtils.clamp(window.fishingTension, 0.1, 0.95);
            // Hooked fader random loss checks
            if (Math.random() < this.config.lossChancePerSecond * delta) {
                this.loseFish();
                return;
            }
            // SUCCESS LANDING CATCH
            if (this.battleDistance <= 3.0) {
                this.catchFish();
            }
        } else {
            // Stop reel sound if it's playing
            if (this.isReelSoundPlaying) {
                this.stopSound('reel');
                this.isReelSoundPlaying = false;
            }
            // If they stop reeling, the active fish pulls the bobber back away!
            const pullBackSpeed = 2.0; // fish swims out
            const shoreVector = this.camera.position.clone();
            shoreVector.y = this.waterLevel;
            const pullDir = new THREE.Vector3().subVectors(this.bobber.position, shoreVector).normalize();
            
            this.bobber.position.addScaledVector(pullDir, pullBackSpeed * delta);
            this.battleDistance += pullBackSpeed * delta;
            window.fishingTension = 0.25 + Math.sin(performance.now() * 0.01) * 0.15;
            window.fishingTension = THREE.MathUtils.clamp(window.fishingTension, 0.1, 0.95);
        }
    }
}
export const fishingManager = new FishingManager();