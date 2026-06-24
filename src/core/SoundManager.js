import * as THREE from 'three';
import { terrainManager } from './TerrainManager.js';

export class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.7;
        this.sfxVolume = 1.0;
        this.musicVolume = 0.5;

        // Sound caches
        this.loadedSounds = new Map();
        this.activeSounds = new Map();

        // Vehicle sound states
        this.utvEngineSound = false; // System active flag
        this.utvIdleSource = null;
        this.utvIdleGain = null;
        this.utvIdlePanner = null;
        this.utvRunningSource = null;
        this.utvRunningGain = null;
        this.utvRunningPanner = null;
        this.utvCurrentSpeed = 0;
        this.utvSoundState = 'idle'; // idle, accelerating, running, decelerating
        this.utvPreviousSpeed = 0;
        this.lastUTVPosition = new THREE.Vector3();

        this.jetskiEngineSound = false; // System active flag
        this.jetskiIdleSource = null;
        this.jetskiIdleGain = null;
        this.jetskiIdlePanner = null;
        this.jetskiRunningSource = null;
        this.jetskiRunningGain = null;
        this.jetskiRunningPanner = null;
        this.jetskiCurrentSpeed = 0;
        this.jetskiSoundState = 'idle'; // idle, accelerating, running, decelerating
        this.jetskiPreviousSpeed = 0;
        this.jetskiSplashSound = null;
        this.lastJetskiPosition = new THREE.Vector3();

        // Sound debouncing / cooldown timers (prevents rapid double triggers)
        this.lastUTVAccelerationTime = 0;
        this.lastUTVDecelerationTime = 0;
        this.lastJetskiAccelerationTime = 0;
        this.lastJetskiDecelerationTime = 0;

        // Footstep sound states
        this.footstepTimer = 0;
        this.footstepInterval = 0.6; // Time between footsteps
        this.lastFootstepTime = -Infinity;
        this.lastFootstepSource = null;
        this.lastTerrainType = 'grass';

        // Sound file paths (placeholder - user will need to provide actual sound files)
        this.soundPaths = {
            // UTV sounds
            utvIdle: 'sounds/utv_idle.mp3',
            utvEngine: 'sounds/utv_engine.mp3',
            utvAcceleration: 'sounds/utv_acceleration.mp3',
            utvDeceleration: 'sounds/utv_deceleration.mp3',

            // Jetski sounds
            jetskiIdle: 'sounds/jetski_idle.mp3',
            jetskiEngine: 'sounds/jetski_engine.mp3',
            //jetskiAcceleration: 'sounds/jetski_acceleration.mp3',
            //jetskiDeceleration: 'sounds/jetski_deceleration.mp3',
            jetskiSplash: 'sounds/jetski_splash.mp3',
            jetskiWake: 'sounds/jetski_wake.mp3',

            // Footstep sounds
            footstepGrass: 'sounds/footstep_grass.mp3',
            footstepRoad: 'sounds/footstep_road.mp3',
            footstepBeach: 'sounds/footstep_beach.mp3',
            swimming: 'sounds/swiming.mp3',

            //Eagle Cry
            eagleCry: 'sounds/eaglecry.mp3',
        };

        this.initialized = false;
        // Debug toggles (set to true in console to enable)
        this.debug = {
            terrain: false,
            footsteps: false
        };
    }

    async initialize() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create master gain node
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.audioContext.destination);

            // Create SFX gain node
            this.sfxGain = this.audioContext.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.masterGain);

            console.log('✅ SoundManager initialized');
            console.log('ℹ️ SoundManager console debug available: soundManager.enableDebug({ terrain: true, footsteps: true })');
            if (typeof window !== 'undefined') {
                window.enableSoundDebug = (options = {}) => this.enableDebug(options);
                window.disableSoundDebug = () => this.disableDebug();
                window.setSoundDebug = (flags = {}) => this.setDebugFlags(flags);
                window.soundManager = this;
            }
            this.initialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize SoundManager:', error);
        }
    }

    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    enableDebug(options = {}) {
        this.debug.terrain = options.terrain !== undefined ? options.terrain : true;
        this.debug.footsteps = options.footsteps !== undefined ? options.footsteps : true;
        console.log('🔧 SoundManager debug enabled', this.debug);
    }

    disableDebug() {
        this.debug.terrain = false;
        this.debug.footsteps = false;
        console.log('🔧 SoundManager debug disabled');
    }

    setDebugFlags(flags = {}) {
        if (flags.terrain !== undefined) this.debug.terrain = !!flags.terrain;
        if (flags.footsteps !== undefined) this.debug.footsteps = !!flags.footsteps;
        console.log('🔧 SoundManager debug flags set', this.debug);
    }

    stopLastFootstep() {
        if (!this.lastFootstepSource) return;
        try {
            const prev = this.lastFootstepSource;
            if (prev.gainNode && this.audioContext) {
                const t = this.audioContext.currentTime;
                prev.gainNode.gain.cancelScheduledValues(t);
                prev.gainNode.gain.setValueAtTime(prev.gainNode.gain.value, t);
                prev.gainNode.gain.linearRampToValueAtTime(0.0, t + 0.02);
                try { prev.source.stop(t + 0.03); } catch (e) { try { prev.source.stop(); } catch (e2) {} }
            } else {
                try { prev.source.stop(); } catch (e) {}
            }
        } catch (e) {
            // Ignore if the source is already stopped or unavailable
        }
        if (this.debug && this.debug.footsteps) console.log('[FootstepDebug] stopLastFootstep');
        this.lastFootstepSource = null;
    }

    async loadSound(soundName, path) {
        if (this.loadedSounds.has(soundName)) {
            return this.loadedSounds.get(soundName);
        }

        try {
            const response = await fetch(path);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.loadedSounds.set(soundName, audioBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`⚠️ Failed to load sound: ${soundName} from ${path}`);
            return null;
        }
    }

    playSound(soundName, volume = 1.0, loop = false, pitch = 1.0) {
        if (!this.initialized || !this.audioContext) {
            this.initialize().then(() => this.playSound(soundName, volume, loop, pitch));
            return null;
        }

        const soundBuffer = this.loadedSounds.get(soundName);
        if (!soundBuffer) {
            console.warn(`⚠️ Sound not loaded: ${soundName}`);
            return null;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = soundBuffer;
        source.loop = loop;
        // Apply requested pitch
        try {
            source.playbackRate.value = pitch;
        } catch (e) {
            // some browsers may not allow setting playbackRate before start; ignore
        }

        // Create gain node for this sound
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;

        // Connect to SFX gain
        source.connect(gainNode);
        gainNode.connect(this.sfxGain);

        source.start(0);

        // Store reference for looped sounds
        if (loop) {
            this.activeSounds.set(soundName, { source, gainNode });
        }

        return { source, gainNode };
    }

    stopSound(soundName) {
        const sound = this.activeSounds.get(soundName);
        if (sound) {
            sound.source.stop();
            this.activeSounds.delete(soundName);
        }
    }

    setSoundVolume(soundName, volume) {
        const sound = this.activeSounds.get(soundName);
        if (sound) {
            sound.gainNode.gain.value = volume;
        }
    }

    createSpatialPanner() {
        if (!this.audioContext) return null;
        const panner = this.audioContext.createPanner();
        try {
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 2;
            panner.maxDistance = 200;
            panner.rolloffFactor = 1.0;
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 0;
            panner.coneOuterGain = 0;
        } catch (e) {
            // Fallback for older browser implementations
        }
        return panner;
    }

    setPannerPosition(panner, position) {
        if (!panner || !position) return;
        try {
            if (panner.positionX) {
                panner.positionX.setValueAtTime(position.x, this.audioContext.currentTime);
                panner.positionY.setValueAtTime(position.y, this.audioContext.currentTime);
                panner.positionZ.setValueAtTime(position.z, this.audioContext.currentTime);
            } else if (typeof panner.setPosition === 'function') {
                panner.setPosition(position.x, position.y, position.z);
            }
        } catch (e) {
            // ignore if browser doesn't support positional APIs
        }
    }

    updateUTVPosition(position) {
        if (!position) return;
        this.lastUTVPosition = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
        this.setPannerPosition(this.utvIdlePanner, this.lastUTVPosition);
        this.setPannerPosition(this.utvRunningPanner, this.lastUTVPosition);
    }

    updateJetskiPosition(position) {
        if (!position) return;
        this.lastJetskiPosition = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
        this.setPannerPosition(this.jetskiIdlePanner, this.lastJetskiPosition);
        this.setPannerPosition(this.jetskiRunningPanner, this.lastJetskiPosition);
    }

    updateListenerFromCamera(camera) {
        if (!this.audioContext || !camera || !camera.position) return;

        const listener = this.audioContext.listener;
        const pos = camera.position;
        try {
            if (listener.positionX) {
                listener.positionX.setValueAtTime(pos.x, this.audioContext.currentTime);
                listener.positionY.setValueAtTime(pos.y, this.audioContext.currentTime);
                listener.positionZ.setValueAtTime(pos.z, this.audioContext.currentTime);
            } else if (typeof listener.setPosition === 'function') {
                listener.setPosition(pos.x, pos.y, pos.z);
            }

            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            const up = camera.up ? camera.up.clone() : new THREE.Vector3(0, 1, 0);
            if (listener.forwardX) {
                listener.forwardX.setValueAtTime(forward.x, this.audioContext.currentTime);
                listener.forwardY.setValueAtTime(forward.y, this.audioContext.currentTime);
                listener.forwardZ.setValueAtTime(forward.z, this.audioContext.currentTime);
                listener.upX.setValueAtTime(up.x, this.audioContext.currentTime);
                listener.upY.setValueAtTime(up.y, this.audioContext.currentTime);
                listener.upZ.setValueAtTime(up.z, this.audioContext.currentTime);
            } else if (typeof listener.setOrientation === 'function') {
                listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
            }
        } catch (e) {
            // Ignore browsers that do not support this listener API
        }
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }
    }

    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        if (this.sfxGain) {
            this.sfxGain.gain.value = this.sfxVolume;
        }
    }

    // ============================================
    // UTV SOUND SYSTEM
    // ============================================

    async loadUTVSounds() {
        await this.loadSound('utvIdle', this.soundPaths.utvIdle);
        await this.loadSound('utvEngine', this.soundPaths.utvEngine);
        await this.loadSound('utvAcceleration', this.soundPaths.utvAcceleration);
        await this.loadSound('utvDeceleration', this.soundPaths.utvDeceleration);
    }

    startUTVEngine() {
        if (this.utvEngineSound) return; // Already playing

        const idleSound = this.loadedSounds.get('utvIdle');
        const runningSound = this.loadedSounds.get('utvEngine');

        if (!idleSound) {
            console.warn('⚠️ UTV idle sound not loaded, loading and retrying');
            this.loadUTVSounds().then(() => this.startUTVEngine());
            return;
        }

        // 1. Setup Idle Sound Node & Gain
        this.utvIdleSource = this.audioContext.createBufferSource();
        this.utvIdleSource.buffer = idleSound;
        this.utvIdleSource.loop = true;

        this.utvIdleGain = this.audioContext.createGain();
        this.utvIdleGain.gain.value = 0.3; // Starts audible
        this.utvIdlePanner = this.createSpatialPanner();

        this.utvIdleSource.connect(this.utvIdleGain);
        this.utvIdleGain.connect(this.utvIdlePanner);
        this.utvIdlePanner.connect(this.sfxGain);

        const initialUTVPosition = this.lastUTVPosition || new THREE.Vector3();
        this.setPannerPosition(this.utvIdlePanner, initialUTVPosition);

        // 2. Setup Running Engine Sound Node & Gain (with fallback to idleSound if runningSound is missing)
        const engineBuffer = runningSound || idleSound;
        if (engineBuffer) {
            this.utvRunningSource = this.audioContext.createBufferSource();
            this.utvRunningSource.buffer = engineBuffer;
            this.utvRunningSource.loop = true;

            this.utvRunningGain = this.audioContext.createGain();
            this.utvRunningGain.gain.value = 0.0; // Starts silent
            this.utvRunningPanner = this.createSpatialPanner();

            this.utvRunningSource.connect(this.utvRunningGain);
            this.utvRunningGain.connect(this.utvRunningPanner);
            this.utvRunningPanner.connect(this.sfxGain);
            this.setPannerPosition(this.utvRunningPanner, initialUTVPosition);

            this.utvRunningSource.start(0);
        }

        // Start idle source
        this.utvIdleSource.start(0);

        this.utvEngineSound = true;
        this.utvCurrentSpeed = 0;

        console.log('🚗 UTV engine sounds started (Idle + Running)');
    }

    stopUTVEngine() {
        if (this.utvEngineSound) {
            const fadeTime = 0.5;
            const stopTime = this.audioContext.currentTime + fadeTime;

            if (this.utvIdleGain && this.utvIdleSource) {
                this.utvIdleGain.gain.linearRampToValueAtTime(0, stopTime);
                this.utvIdleSource.stop(stopTime);
            }
            if (this.utvRunningGain && this.utvRunningSource) {
                this.utvRunningGain.gain.linearRampToValueAtTime(0, stopTime);
                this.utvRunningSource.stop(stopTime);
            }

            if (this.utvIdlePanner) {
                try { this.utvIdlePanner.disconnect(); } catch (e) {}
            }
            if (this.utvRunningPanner) {
                try { this.utvRunningPanner.disconnect(); } catch (e) {}
            }

            this.utvIdleSource = null;
            this.utvIdleGain = null;
            this.utvIdlePanner = null;
            this.utvRunningSource = null;
            this.utvRunningGain = null;
            this.utvRunningPanner = null;
            this.utvEngineSound = false;
            console.log('🚗 UTV engine sound stopped');
        }
    }

    updateUTVEngineSound(speed, maxSpeed, isAccelerating, isDecelerating, isInputHeld) {
        if (!this.utvEngineSound) return;

        const speedRatio = Math.min(1.0, Math.abs(speed) / maxSpeed);
        const isMoving = Math.abs(speed) > 0.1;

        // Determine target sound state based on inputs and speed ratio
        let targetState = 'idle';
        if (!isMoving) {
            targetState = 'idle';
        } else if (isAccelerating) {
            // Cruising if we are at near-max speed
            if (speedRatio > 0.90) {
                targetState = 'running';
            } else {
                targetState = 'accelerating';
            }
        } else if (isDecelerating) {
            targetState = 'decelerating';
        } else if (isInputHeld) {
            targetState = 'running';
        } else {
            targetState = 'decelerating'; // Coasting without input is a deceleration state
        }

        // Play transition sounds with debouncing/cooldown to prevent double triggering
        if (targetState !== this.utvSoundState) {
            const now = performance.now();
            if (targetState === 'accelerating' && this.utvSoundState !== 'accelerating') {
                if (now - this.lastUTVAccelerationTime > 2500) {
                    if (this.lastUTVPosition) {
                        this.playPositionalOneShot('utvAcceleration', this.lastUTVPosition, 0.5);
                    } else {
                        this.playOneShot('utvAcceleration', 0.5);
                    }
                    this.lastUTVAccelerationTime = now;
                }
            } else if (targetState === 'decelerating' && this.utvSoundState !== 'decelerating') {
                if (now - this.lastUTVDecelerationTime > 2500) {
                    if (this.lastUTVPosition) {
                        this.playPositionalOneShot('utvDeceleration', this.lastUTVPosition, 0.4);
                    } else {
                        this.playOneShot('utvDeceleration', 0.4);
                    }
                    this.lastUTVDecelerationTime = now;
                }
            }
            this.utvSoundState = targetState;
        }

        // Calculate volumes for idle and running loops based on speed and state
        let targetIdleVolume = 0.3;
        let targetRunningVolume = 0.0;
        let targetPitch = 1.0;

        if (!isMoving) {
            targetIdleVolume = 0.3;
            targetRunningVolume = 0.0;
            targetPitch = 1.0;
        } else {
            // As speedRatio increases, fade out idle sound and fade in running engine sound
            // Complete crossfade by 30% of max speed
            const crossfadeFactor = Math.min(1.0, speedRatio / 0.3);
            targetIdleVolume = 0.3 * (1.0 - crossfadeFactor);

            // Base running volume based on state
            let baseRunningVolume = 0.35;
            if (targetState === 'accelerating') {
                baseRunningVolume = 0.4 + (speedRatio * 0.4); // Louder when accelerating
            } else if (targetState === 'running') {
                baseRunningVolume = 0.35 + (speedRatio * 0.35); // Engine running sound
            } else if (targetState === 'decelerating') {
                baseRunningVolume = 0.3 + (speedRatio * 0.25); // Medium when decelerating
            } else {
                baseRunningVolume = 0.25 + (speedRatio * 0.2); // Coasting
            }

            targetRunningVolume = baseRunningVolume * crossfadeFactor;

            // Adjust pitch/playbackRate of the running source to feel dynamic!
            // Pitch ranges from 0.85 to 1.45 based on speed ratio
            targetPitch = 0.85 + (speedRatio * 0.6);
        }

        // Smooth volume transitions over 0.1 seconds
        const currentTime = this.audioContext.currentTime;
        if (this.utvIdleGain) {
            this.utvIdleGain.gain.linearRampToValueAtTime(targetIdleVolume, currentTime + 0.1);
        }
        if (this.utvRunningGain) {
            this.utvRunningGain.gain.linearRampToValueAtTime(targetRunningVolume, currentTime + 0.1);
        }

        // Update spatial position
        if (this.lastUTVPosition) {
            this.setPannerPosition(this.utvIdlePanner, this.lastUTVPosition);
            this.setPannerPosition(this.utvRunningPanner, this.lastUTVPosition);
        }

        // Smooth pitch transitions
        if (this.utvRunningSource) {
            this.utvRunningSource.playbackRate.linearRampToValueAtTime(targetPitch, currentTime + 0.1);
        }

        this.utvPreviousSpeed = speed;
        this.utvCurrentSpeed = speed;
    }

    // ============================================
    // JETSKI SOUND SYSTEM
    // ============================================

    async loadJetskiSounds() {
        await this.loadSound('jetskiIdle', this.soundPaths.jetskiIdle);
        await this.loadSound('jetskiEngine', this.soundPaths.jetskiEngine);
        //await this.loadSound('jetskiAcceleration', this.soundPaths.jetskiAcceleration);
        //await this.loadSound('jetskiDeceleration', this.soundPaths.jetskiDeceleration);
        await this.loadSound('jetskiSplash', this.soundPaths.jetskiSplash);
        await this.loadSound('jetskiWake', this.soundPaths.jetskiWake);
    }

    startJetskiEngine() {
        if (this.jetskiEngineSound) return; // Already playing

        const idleSound = this.loadedSounds.get('jetskiIdle');
        const runningSound = this.loadedSounds.get('jetskiEngine');

        if (!idleSound) {
            console.warn('⚠️ Jetski idle sound not loaded, loading and retrying');
            this.loadJetskiSounds().then(() => this.startJetskiEngine());
            return;
        }

        // 1. Setup Idle Sound Node & Gain
        this.jetskiIdleSource = this.audioContext.createBufferSource();
        this.jetskiIdleSource.buffer = idleSound;
        this.jetskiIdleSource.loop = true;

        this.jetskiIdleGain = this.audioContext.createGain();
        this.jetskiIdleGain.gain.value = 0.25; // Starts audible
        this.jetskiIdlePanner = this.createSpatialPanner();

        this.jetskiIdleSource.connect(this.jetskiIdleGain);
        this.jetskiIdleGain.connect(this.jetskiIdlePanner);
        this.jetskiIdlePanner.connect(this.sfxGain);

        const initialJetskiPosition = this.lastJetskiPosition || new THREE.Vector3();
        this.setPannerPosition(this.jetskiIdlePanner, initialJetskiPosition);

        // 2. Setup Running Engine Sound Node & Gain (with fallback to idleSound if runningSound is missing)
        const engineBuffer = runningSound || idleSound;
        if (engineBuffer) {
            this.jetskiRunningSource = this.audioContext.createBufferSource();
            this.jetskiRunningSource.buffer = engineBuffer;
            this.jetskiRunningSource.loop = true;

            this.jetskiRunningGain = this.audioContext.createGain();
            this.jetskiRunningGain.gain.value = 0.0; // Starts silent
            this.jetskiRunningPanner = this.createSpatialPanner();

            this.jetskiRunningSource.connect(this.jetskiRunningGain);
            this.jetskiRunningGain.connect(this.jetskiRunningPanner);
            this.jetskiRunningPanner.connect(this.sfxGain);
            this.setPannerPosition(this.jetskiRunningPanner, initialJetskiPosition);

            this.jetskiRunningSource.start(0);
        }


        // Start idle source
        this.jetskiIdleSource.start(0);

        this.jetskiEngineSound = true;
        this.jetskiCurrentSpeed = 0;

        console.log('🌊 Jetski engine sounds started (Idle + Running)');
    }



    stopJetskiEngine() {
        if (this.jetskiEngineSound) {
            const fadeTime = 0.3;
            const stopTime = this.audioContext.currentTime + fadeTime;

            if (this.jetskiIdleGain && this.jetskiIdleSource) {
                this.jetskiIdleGain.gain.linearRampToValueAtTime(0, stopTime);
                this.jetskiIdleSource.stop(stopTime);
            }
            if (this.jetskiRunningGain && this.jetskiRunningSource) {
                this.jetskiRunningGain.gain.linearRampToValueAtTime(0, stopTime);
                this.jetskiRunningSource.stop(stopTime);
            }

            if (this.jetskiIdlePanner) {
                try { this.jetskiIdlePanner.disconnect(); } catch (e) {}
            }
            if (this.jetskiRunningPanner) {
                try { this.jetskiRunningPanner.disconnect(); } catch (e) {}
            }

            this.jetskiIdleSource = null;
            this.jetskiIdleGain = null;
            this.jetskiIdlePanner = null;
            this.jetskiRunningSource = null;
            this.jetskiRunningGain = null;
            this.jetskiRunningPanner = null;
            this.jetskiEngineSound = false;
            console.log('🌊 Jetski engine sound stopped');
        }
    }

    updateJetskiEngineSound(speed, maxSpeed, isAccelerating, isDecelerating, isInputHeld) {
        if (!this.jetskiEngineSound) return;

        const speedRatio = Math.min(1.0, Math.abs(speed) / maxSpeed);
        const isMoving = Math.abs(speed) > 0.1;

        // Determine target sound state based on inputs and speed ratio
        let targetState = 'idle';
        if (!isMoving) {
            targetState = 'idle';
        } else if (isAccelerating) {
            // Cruising if we are at near-max speed
            if (speedRatio > 0.90) {
                targetState = 'running';
            } else {
                targetState = 'accelerating';
            }
        } else if (isDecelerating) {
            targetState = 'decelerating';
        } else if (isInputHeld) {
            targetState = 'running';
        } else {
            targetState = 'decelerating'; // Coasting without input is a deceleration state
        }

        // Play transition sounds with debouncing/cooldown to prevent double triggering
        if (targetState !== this.jetskiSoundState) {
            const now = performance.now();
            if (targetState === 'accelerating' && this.jetskiSoundState !== 'accelerating') {
                if (now - this.lastJetskiAccelerationTime > 2500) {
                    if (this.lastJetskiPosition) {
                        this.playPositionalOneShot('jetskiAcceleration', this.lastJetskiPosition, 0.5);
                    } else {
                        this.playOneShot('jetskiAcceleration', 0.5);
                    }
                    this.lastJetskiAccelerationTime = now;
                }
            } else if (targetState === 'decelerating' && this.jetskiSoundState !== 'decelerating') {
                if (now - this.lastJetskiDecelerationTime > 2500) {
                    if (this.lastJetskiPosition) {
                        this.playPositionalOneShot('jetskiDeceleration', this.lastJetskiPosition, 0.4);
                    } else {
                        this.playOneShot('jetskiDeceleration', 0.4);
                    }
                    this.lastJetskiDecelerationTime = now;
                }
            }
            this.jetskiSoundState = targetState;
        }

        // Calculate volumes for idle and running loops based on speed and state
        let targetIdleVolume = 0.25;
        let targetRunningVolume = 0.0;
        let targetPitch = 1.0;

        if (!isMoving) {
            targetIdleVolume = 0.25;
            targetRunningVolume = 0.0;
            targetPitch = 1.0;
        } else {
            // As speedRatio increases, fade out idle sound and fade in running engine sound
            // Complete crossfade by 30% of max speed
            const crossfadeFactor = Math.min(1.0, speedRatio / 0.3);
            targetIdleVolume = 0.25 * (1.0 - crossfadeFactor);

            // Base running volume based on state
            let baseRunningVolume = 0.3;
            if (targetState === 'accelerating') {
                baseRunningVolume = 0.35 + (speedRatio * 0.45); // Louder when accelerating
            } else if (targetState === 'running') {
                baseRunningVolume = 0.3 + (speedRatio * 0.4); // Engine running sound
            } else if (targetState === 'decelerating') {
                baseRunningVolume = 0.3 + (speedRatio * 0.35); // Medium when decelerating
            } else {
                baseRunningVolume = 0.25 + (speedRatio * 0.25); // Coasting
            }

            targetRunningVolume = baseRunningVolume * crossfadeFactor;

            // Adjust pitch/playbackRate of the running source to feel dynamic!
            // Pitch ranges from 0.8 to 1.5 based on speed ratio
            targetPitch = 0.8 + (speedRatio * 0.7);
        }

        // Smooth volume transitions over 0.1 seconds
        const currentTime = this.audioContext.currentTime;
        if (this.jetskiIdleGain) {
            this.jetskiIdleGain.gain.linearRampToValueAtTime(targetIdleVolume, currentTime + 0.1);
        }
        if (this.jetskiRunningGain) {
            this.jetskiRunningGain.gain.linearRampToValueAtTime(targetRunningVolume, currentTime + 0.1);
        }

        if (this.lastJetskiPosition) {
            this.setPannerPosition(this.jetskiIdlePanner, this.lastJetskiPosition);
            this.setPannerPosition(this.jetskiRunningPanner, this.lastJetskiPosition);
        }

        // Smooth pitch transitions
        if (this.jetskiRunningSource) {
            this.jetskiRunningSource.playbackRate.linearRampToValueAtTime(targetPitch, currentTime + 0.1);
        }

        // Play splash sounds when moving at higher speeds
        if (Math.abs(speed) > 2.0 && Math.abs(speed) > this.jetskiCurrentSpeed + 0.5) {
            this.playJetskiSplash();
        }

        this.jetskiPreviousSpeed = speed;
        this.jetskiCurrentSpeed = speed;
    }

    playJetskiSplash() {
        if (this.lastJetskiPosition) {
            this.playPositionalOneShot('jetskiSplash', this.lastJetskiPosition, 0.3);
        } else {
            this.playOneShot('jetskiSplash', 0.3);
        }
    }

    playJetskiWake() {
        if (this.lastJetskiPosition) {
            this.playPositionalOneShot('jetskiWake', this.lastJetskiPosition, 0.2);
        } else {
            this.playOneShot('jetskiWake', 0.2);
        }
    }

    // ============================================
    // FOOTSTEP SOUND SYSTEM
    // ============================================

    async loadFootstepSounds() {
        await this.loadSound('footstepGrass', this.soundPaths.footstepGrass);
        await this.loadSound('footstepRoad', this.soundPaths.footstepRoad);
        await this.loadSound('footstepBeach', this.soundPaths.footstepBeach);
        await this.loadSound('swimming', this.soundPaths.swimming);
    }

    detectTerrainType(position) {
        if (!terrainManager) {
            console.warn('[SoundManager] terrainManager not available, defaulting to grass');
            return 'grass';
        }

        // Prefer overlay masks for roads and beach — sample a small neighborhood
        const terrainSize = 1000;
        const u = (position.x + terrainSize / 2) / terrainSize;
        const v = (position.z + terrainSize / 2) / terrainSize;
        
        if (this.debug && this.debug.terrain) console.log('[TerrainDebug] position', { x: position.x, z: position.z, u, v });

        // Check water FIRST (highest priority)
        try {
            const inLake = terrainManager.isInLake(position);
            const terrainHeight = terrainManager.getTerrainHeightAt(position);
            if (this.debug && this.debug.terrain) console.log('[TerrainDebug] lake check', { inLake, terrainHeight, waterLevel: terrainManager.WATER_LEVEL });
            if (inLake && terrainHeight < terrainManager.WATER_LEVEL + 0.3) {
                if (this.debug && this.debug.terrain) console.log('[TerrainDebug] detected water at', { x: position.x, z: position.z });
                return 'water';
            }
        } catch (e) {
            console.warn('[SoundManager] lake detection failed:', e);
        }

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            // Helper: sample a small kernel around uv to avoid single-pixel misses
            const sampleKernel = (data, canvas) => {
                const w = canvas.width;
                const h = canvas.height;
                const cx = Math.floor(u * (w - 1));
                const cy = Math.floor(v * (h - 1));
                let alphaSum = 0, brightSum = 0, count = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        const sx = Math.min(w - 1, Math.max(0, cx + ox));
                        const sy = Math.min(h - 1, Math.max(0, cy + oy));
                        const idx = (sy * w + sx) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const a = data[idx + 3];
                        alphaSum += a;
                        brightSum += (r + g + b) / 3;
                        count++;
                    }
                }
                return { alphaAvg: alphaSum / count, brightAvg: brightSum / count };
            };

            if (terrainManager.roadsData && terrainManager.roadsCanvas.width > 0) {
                const s = sampleKernel(terrainManager.roadsData, terrainManager.roadsCanvas);
                // Dark lines with alpha indicate roads
                if (this.debug && this.debug.terrain) console.log('[TerrainDebug] sample roads', { x: position.x, z: position.z, u, v, alphaAvg: s.alphaAvg, brightAvg: s.brightAvg });
                if (s.alphaAvg > 50 && s.brightAvg < 160) {
                    if (this.debug && this.debug.terrain) console.log('[TerrainDebug] detected road at', { x: position.x, z: position.z });
                    return 'road';
                }
            }

            if (terrainManager.beachData && terrainManager.beachCanvas.width > 0) {
                const s = sampleKernel(terrainManager.beachData, terrainManager.beachCanvas);
                // Beaches are usually bright (sand color) AND have alpha in overlay
                if (this.debug && this.debug.terrain) console.log('[TerrainDebug] sample beach', { x: position.x, z: position.z, u, v, alphaAvg: s.alphaAvg, brightAvg: s.brightAvg });
                if (s.alphaAvg > 50 && s.brightAvg > 190) {
                    if (this.debug && this.debug.terrain) console.log('[TerrainDebug] detected beach at', { x: position.x, z: position.z });
                    return 'beach';
                }
            }
        }

        if (this.debug && this.debug.terrain) console.log('[TerrainDebug] defaulting to grass');
        return 'grass';
    }

    getFootstepInterval(position, isRunning = false) {
        const terrainType = this.detectTerrainType(position);

        let baseInterval;
        switch (terrainType) {
            case 'road':
                baseInterval = 0.50; // Slower cadence on concrete
                break;
            case 'beach':
                baseInterval = 0.50; // Sand / beach is a bit heavier
                break;
            case 'water':
                baseInterval = 0.90; // Swimming has faster cadence
                break;
            default:
                baseInterval = 0.50; // Default walking cadence on grass
        }

        if (isRunning) {
            // Running increases cadence (smaller interval). Tweak multiplier to taste.
            return Math.max(0.12, baseInterval * 0.6);
        }

        return baseInterval;
    }

    stopAllFootstepSounds() {
        if (this.lastFootstepSource) {
            try {
                const prev = this.lastFootstepSource; // { source, gainNode }
                if (prev.gainNode && this.audioContext) {
                    const t = this.audioContext.currentTime;
                    prev.gainNode.gain.cancelScheduledValues(t);
                    prev.gainNode.gain.setValueAtTime(prev.gainNode.gain.value, t);
                    prev.gainNode.gain.linearRampToValueAtTime(0.0, t + 0.06);
                    try { prev.source.stop(t + 0.07); } catch (e) { try { prev.source.stop(); } catch (e2) {} }
                } else {
                    try { prev.source.stop(); } catch (e) {}
                }
            } catch (e) {
                // Ignore if the source is already stopped or unavailable
            }
            this.lastFootstepSource = null;
        }
    }

    playFootstep(position, isRunning = false) {
        const terrainType = this.detectTerrainType(position);

        // Running footsteps should use the same cadence as walking on the current terrain
        this.footstepInterval = this.getFootstepInterval(position, isRunning);

        const now = this.audioContext ? this.audioContext.currentTime : performance.now() / 1000;
        const minStepGap = 0.18; // Prevent accidental duplicate footstep playback
        if (now - this.lastFootstepTime < minStepGap) {
            if (this.debug && this.debug.footsteps) console.log('[FootstepDebug] suppressed by minStepGap', { now, last: this.lastFootstepTime, gap: now - this.lastFootstepTime });
            return;
        }
        this.lastFootstepTime = now;

        // Stop any previous footstep sound to avoid overlapping step tails (fade out)
        if (this.lastFootstepSource) {
            try {
                const prev = this.lastFootstepSource; // { source, gainNode }
                if (prev.gainNode && this.audioContext) {
                    const t = this.audioContext.currentTime;
                    prev.gainNode.gain.cancelScheduledValues(t);
                    prev.gainNode.gain.setValueAtTime(prev.gainNode.gain.value, t);
                    prev.gainNode.gain.linearRampToValueAtTime(0.0, t + 0.06);
                    try { prev.source.stop(t + 0.07); } catch (e) { try { prev.source.stop(); } catch (e2) {} }
                } else {
                    try { prev.source.stop(); } catch (e) {}
                }
            } catch (e) {
                // Ignore if the source is already stopped or unavailable
            }
            this.lastFootstepSource = null;
        }

        let soundName;
        let pitch;
        let volume;
        
        if (terrainType === 'water') {
            soundName = 'swimming';
            pitch = 1.0;
            volume = 0.5;
        } else {
            soundName = `footstep${terrainType.charAt(0).toUpperCase() + terrainType.slice(1)}`;
            // Slightly louder/faster when running
            pitch = isRunning ? 1.18 : 1.0;
            volume = isRunning ? 0.55 : 0.4;
        }
        if (this.debug && this.debug.footsteps) console.log('[FootstepDebug] playFootstep', { terrainType, isRunning, interval: this.footstepInterval, pitch, volume });
        const played = this.playOneShot(soundName, volume, pitch);
        if (played && played.source && played.gainNode) {
            this.lastFootstepSource = { source: played.source, gainNode: played.gainNode };
        } else if (played && played.source) {
            this.lastFootstepSource = { source: played.source, gainNode: null };
        }

        this.lastTerrainType = terrainType;
    }

    updateFootsteps(delta, isMoving, position, isRunning = false, isGrounded = true) {
        if (!isMoving || !isGrounded) {
            this.footstepTimer = 0;
            this.stopLastFootstep();
            return;
        }

        this.footstepTimer += delta;

        if (this.footstepTimer >= this.footstepInterval) {
            this.playFootstep(position, isRunning);
            this.footstepTimer = 0;
        }
    }

    // Eagly Cry
    playEagleCry(position) {
        // Load the sound if not already loaded
        if (!this.loadedSounds.has('eagleCry')) {
            this.loadSound('eagleCry', this.soundPaths.eagleCry).then(() => {
                if (position) this.playPositionalOneShot('eagleCry', position, 0.6);
                else this.playOneShot('eagleCry', 0.5);
            });
        } else {
            if (position) this.playPositionalOneShot('eagleCry', position, 0.6);
            else this.playOneShot('eagleCry', 0.5);
        }
    }


    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    playOneShot(soundName, volume = 1.0, pitch = 1.0) {
        return this.playSound(soundName, volume, false, pitch);
    }

    // Play a single-shot sound positioned in 3D space (THREE.Vector3 or {x,y,z})
    playPositionalOneShot(soundName, position, volume = 1.0, pitch = 1.0) {
        if (!this.initialized || !this.audioContext) {
            this.initialize().then(() => this.playPositionalOneShot(soundName, position, volume, pitch));
            return null;
        }

        let soundBuffer = this.loadedSounds.get(soundName);
        if (!soundBuffer) {
            console.warn(`⚠️ Positional sound not loaded: ${soundName}`);
            if (this.soundPaths[soundName]) {
                this.loadSound(soundName, this.soundPaths[soundName]).then(() => {
                    this.playPositionalOneShot(soundName, position, volume, pitch);
                });
            }
            return null;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = soundBuffer;
        source.loop = false;
        try { source.playbackRate.value = pitch; } catch (e) {}

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;

        const panner = this.audioContext.createPanner();
        try {
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 1000;
            panner.rolloffFactor = 1;
        } catch (e) {}

        // Set initial panner position from THREE.Vector3 or plain object
        const x = position.x !== undefined ? position.x : (position[0] || 0);
        const y = position.y !== undefined ? position.y : (position[1] || 0);
        const z = position.z !== undefined ? position.z : (position[2] || 0);
        try {
            if (panner.positionX) {
                panner.positionX.setValueAtTime(x, this.audioContext.currentTime);
                panner.positionY.setValueAtTime(y, this.audioContext.currentTime);
                panner.positionZ.setValueAtTime(z, this.audioContext.currentTime);
            } else if (typeof panner.setPosition === 'function') {
                panner.setPosition(x, y, z);
            }
        } catch (e) {}

        // Connect: source -> gain -> panner -> sfxGain
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.sfxGain);

        source.start(0);

        // Auto-cleanup after sound ends
        const duration = soundBuffer.duration || 2.0;
        setTimeout(() => {
            try { source.stop(); } catch (e) {}
            try { panner.disconnect(); } catch (e) {}
            try { gainNode.disconnect(); } catch (e) {}
        }, (duration + 0.2) * 1000);

        return { source, gainNode, panner };
    }

    cleanup() {
        // Stop all active sounds
        this.activeSounds.forEach((sound, name) => {
            sound.source.stop();
        });
        this.activeSounds.clear();

        // Stop vehicle sounds
        this.stopUTVEngine();
        this.stopJetskiEngine();

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
        }

        console.log('🔇 SoundManager cleaned up');
    }
}

export const soundManager = new SoundManager();
