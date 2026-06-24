import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { terrainManager } from './TerrainManager.js';

export class RowingManager {
    constructor() {
        // --- Boat Simulation States ---
        this.boat = null;
        this.boatVelocity = new THREE.Vector3(0, 0, 2.5); // Heading speed (meters per second)
        this.boatHeading = 0;                           // Current rotation angle in radians
        this.targetHeading = 0;                         // Desired angle to smoothly interpolate toward
        this.isEscaping = false;                        // Tracks whether the boat is currently in a forced turnaround
        this.escapeTurnDirection = 1;                   // 1 means turn Left, -1 means turn Right
        this.boatAngularVelocity = 0;
        this.controls = null;                           // Reference to OrbitControls

        // --- Circuit Track System ---
        this.trackPoints = [
            new THREE.Vector3(-150, 0, -180), //1  ok
            new THREE.Vector3(-90,  0, -50), //2  ok
            new THREE.Vector3(-20,  0, -20), //3  ok
            new THREE.Vector3(10,   0, 60), //4  Dock
            new THREE.Vector3(100,  0, 110), //5   done
            new THREE.Vector3(220,  0, 100), //6  done
            new THREE.Vector3(240,  0, 135), //7  done
            new THREE.Vector3(200,  0, 160), //8  done
            new THREE.Vector3(100,  0, 155), //9  done
            new THREE.Vector3(0,   0, 130), //10  ok
            new THREE.Vector3(-30,  0, 160), //11   Ok
            new THREE.Vector3(-35,  0, 100), //12  
            new THREE.Vector3(-55,  0, 60), //13  Chapel
            new THREE.Vector3(-150, 0, -50), //14
            new THREE.Vector3(-190, 0, -140), //15
            new THREE.Vector3(-180, 0, -175) //16
        ];
        this.currentPointIndex = 3;                     // Start at dock (point #4)
        this.waypointReachDistance = 15;                // Distance to consider a waypoint reached

        // --- Debug Visualization ---
        this.debugTrackLine = null;                     // Red line visualization of the circuit
        this.bluetoothDevice = null;
        this.bluetoothCharacteristic = null;
        this.heartRateCharacteristic = null;
        this.isBluetoothConnected = false;
        this.realTimeRowerSpeed = null;                 // Speed from rowing machine (m/s)
        this.speedCalibrationFactor = 6.0;              // Adjust this to match the actual boating speed
        this.currentHeartRate = null;                   // Heart rate from Bluetooth device (bpm)
        this.totalDistance = 0;                         // Total distance traveled in meters
        this.sessionStartTime = null;                   // Track session start time
        this.manualDebugSpeed = null;                   // null = normal automatic speed

        // --- HUD Canvas References ---
        this.speedDisplay = null;
        this.speedDisplayContext = null;
        this.heartRateDisplay = null;
        this.heartRateDisplayContext = null;
        this.distanceDisplay = null;
        this.distanceDisplayContext = null;
        this.connectButton = null;
        this.hrConnectButton = null;          // Separate button for dedicated HR strap

        // --- Physics Constants ---
        this.DETECT_DISTANCE = 25;                      // How far ahead the boat looks for land
        this.BOAT_FLOAT_HEIGHT = 0;                     // How much boat should float above water surface
        this.BEACH_SAFETY_MARGIN = 0.52;                // Keep boat in water deeper than this value
        this.angularDamping = 0.85;                     // Friction coefficient
        this.maxAngularVelocity = 3.0;                  // Limit turning speed
        this.CIRCUIT_SPEED = 1.5;                       // Target speed along circuit (m/s)
        this.STEERING_STRENGTH = 2.0;                   // How aggressively boat turns toward waypoint

        // Boat wake audio
        this.boatWakeTimer = 0;                         // Tracks wake sound playback timing
        this.boatWakeInterval = 0.55;                   // Seconds between wake sound bursts while moving
    }

    /**
     * Initializes the Speed, Heart Rate, and Distance HUD overlay panels.
     */
    initHUD() {
        if (document.getElementById('speedPanelHUD')) return;

        const speedPanel = document.createElement('div');
        speedPanel.id = 'speedPanelHUD';
        speedPanel.style.position = 'fixed';
        speedPanel.style.bottom = '20px';
        speedPanel.style.left = '20px';
        speedPanel.style.zIndex = '1000';
        speedPanel.style.width = '310px';
        speedPanel.style.height = '180px';
        speedPanel.style.pointerEvents = 'none';

        this.speedDisplay = document.createElement('canvas');
        this.speedDisplay.width = 310;
        this.speedDisplay.height = 60;
        this.speedDisplay.style.display = 'block';
        this.speedDisplay.style.borderRadius = '10px';

        // Heart rate display wrapper (canvas + HR button on same line)
        const heartRateWrapper = document.createElement('div');
        heartRateWrapper.style.display = 'flex';
        heartRateWrapper.style.alignItems = 'center';
        heartRateWrapper.style.gap = '8px';
        heartRateWrapper.style.marginTop = '10px';

        this.heartRateDisplay = document.createElement('canvas');
        this.heartRateDisplay.width = 220;
        this.heartRateDisplay.height = 50;
        this.heartRateDisplay.style.display = 'block';
        this.heartRateDisplay.style.borderRadius = '10px';
        heartRateWrapper.appendChild(this.heartRateDisplay);

        // Separate HR button — gives iOS its own fresh user-gesture for requestDevice()
        this.hrConnectButton = document.createElement('button');
        this.hrConnectButton.style.padding = '6px 10px';
        this.hrConnectButton.style.fontSize = '12px';
        this.hrConnectButton.style.background = '#c0392b';
        this.hrConnectButton.style.color = '#fff';
        this.hrConnectButton.style.border = 'none';
        this.hrConnectButton.style.borderRadius = '6px';
        this.hrConnectButton.style.cursor = 'pointer';
        this.hrConnectButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
        this.hrConnectButton.style.pointerEvents = 'auto';
        this.hrConnectButton.textContent = '❤️ HR';
        this.hrConnectButton.title = 'Connect a separate heart-rate strap';

        // Each tap of this button is its own user gesture — safe on iOS/iPadOS
        this.hrConnectButton.addEventListener('click', async () => {
            // Show a connecting state immediately so the user gets feedback
            this.hrConnectButton.textContent = '⏳ HR…';
            this.hrConnectButton.style.background = '#7f8c8d';
            this.hrConnectButton.disabled = true;
            try {
                await this.connectToHeartRateDevice();
            } catch (err) {
                // Show a brief error label, then revert
                // Most common cause on iOS: the HR device is paired with iOS system Bluetooth
                // (Settings → Bluetooth). Web Bluetooth cannot access OS-owned connections.
                // Fix: open iOS Settings → Bluetooth → tap (i) next to your HR strap → "Forget This Device".
                // Then tap this button again — Bluefy will be able to connect.
                const isNetworkErr = err && (err.name === 'NetworkError' || (err.message && err.message.includes('Connection')));
                this.hrConnectButton.textContent = isNetworkErr ? '🔒 HR?' : '❌ HR';
                this.hrConnectButton.style.background = '#922b21';
                this.hrConnectButton.title = isNetworkErr
                    ? 'Connection failed. If this HR device is paired in iOS Settings → Bluetooth, forget it there first, then try again.'
                    : 'Connect a separate heart-rate strap';
                setTimeout(() => {
                    this.hrConnectButton.title = 'Connect a separate heart-rate strap';
                    this.updateHrButtonLabel();
                }, 4000);
                console.warn('HR button: connection failed —', err.message || err);
                if (isNetworkErr) {
                    console.warn('💡 Tip: If your HR strap appears in iOS Settings → Bluetooth, tap (i) and "Forget This Device", then try again.');
                }
                return;
            } finally {
                this.hrConnectButton.disabled = false;
            }
            this.updateHrButtonLabel();
        });

        heartRateWrapper.appendChild(this.hrConnectButton);

        this.distanceDisplay = document.createElement('canvas');
        this.distanceDisplay.width = 310;
        this.distanceDisplay.height = 50;
        this.distanceDisplay.style.display = 'block';
        this.distanceDisplay.style.borderRadius = '10px';
        this.distanceDisplay.style.marginTop = '10px';

        this.connectButton = document.createElement('button');
        this.connectButton.style.position = 'absolute';
        this.connectButton.style.top = '8px';
        this.connectButton.style.right = '8px';
        this.connectButton.style.padding = '6px 10px';
        this.connectButton.style.fontSize = '12px';
        this.connectButton.style.background = '#0b74d1';
        this.connectButton.style.color = '#fff';
        this.connectButton.style.border = 'none';
        this.connectButton.style.borderRadius = '6px';
        this.connectButton.style.cursor = 'pointer';
        this.connectButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
        this.connectButton.style.pointerEvents = 'auto';
        this.connectButton.textContent = 'Connect';

        this.connectButton.addEventListener('click', async () => {
            if (this.isBluetoothConnected) {
                await this.disconnectRowingMachine();
            } else {
                await this.connectToRowingMachine();
            }
            this.updateConnectionButtonLabel();
        });

        speedPanel.appendChild(this.speedDisplay);
        speedPanel.appendChild(heartRateWrapper);
        speedPanel.appendChild(this.distanceDisplay);
        speedPanel.appendChild(this.connectButton);
        document.body.appendChild(speedPanel);

        this.speedDisplayContext = this.speedDisplay.getContext('2d');
        this.heartRateDisplayContext = this.heartRateDisplay.getContext('2d');
        this.distanceDisplayContext = this.distanceDisplay.getContext('2d');

        this.updateSpeedDisplay();
    }

    /**
     * Updates the text label on the Bluetooth Connection Button.
     */
    updateConnectionButtonLabel() {
        if (!this.connectButton) return;
        this.connectButton.textContent = this.isBluetoothConnected ? 'Disconnect' : 'Connect';
    }

    /**
     * Updates the label on the dedicated HR monitor button.
     */
    updateHrButtonLabel() {
        if (!this.hrConnectButton) return;
        this.hrConnectButton.textContent = this.heartRateCharacteristic ? '❤️ HR ✓' : '❤️ HR';
        this.hrConnectButton.style.background = this.heartRateCharacteristic ? '#27ae60' : '#c0392b';
    }

    /**
     * Re-renders the contents of the Speed, Heart Rate, and Distance HUD canvases.
     */
    updateSpeedDisplay() {
        if (!this.speedDisplayContext) return;

        // Clear all displays
        this.speedDisplayContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.speedDisplayContext.fillRect(0, 0, this.speedDisplay.width, this.speedDisplay.height);

        this.heartRateDisplayContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.heartRateDisplayContext.fillRect(0, 0, this.heartRateDisplay.width, this.heartRateDisplay.height);

        this.distanceDisplayContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.distanceDisplayContext.fillRect(0, 0, this.distanceDisplay.width, this.distanceDisplay.height);

        // Update speed display
        const currentSpeed = this.realTimeRowerSpeed || 0;
        const calibratedSpeed = currentSpeed * this.speedCalibrationFactor;

        // Calculate 500m split time (in MM:SS format)
        let splitDisplay = "00:00";
        if (calibratedSpeed > 0) {
            const splitSeconds = 500 / calibratedSpeed; // Time to travel 500m
            const minutes = Math.floor(splitSeconds / 60);
            const seconds = Math.floor(splitSeconds % 60);
            splitDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        this.speedDisplayContext.fillStyle = '#ffffff';
        this.speedDisplayContext.font = 'bold 24px Arial';
        this.speedDisplayContext.fillText(`500m split: ${splitDisplay}`, 10, 35);

        if (this.manualDebugSpeed !== null) {
            this.speedDisplayContext.fillStyle = '#ffff00';
            this.speedDisplayContext.font = '14px Arial';
            this.speedDisplayContext.fillText(`Debug: ${this.manualDebugSpeed.toFixed(2)} m/s`, 10, 50);
        }

        // Update heart rate display
        if (this.currentHeartRate !== null) {
            this.heartRateDisplayContext.fillStyle = '#ffffff';
            this.heartRateDisplayContext.font = 'bold 20px Arial';
            this.heartRateDisplayContext.fillText(`Heart Rate: ${this.currentHeartRate} bpm`, 10, 30);
        } else {
            this.heartRateDisplayContext.fillStyle = '#888888';
            this.heartRateDisplayContext.font = '16px Arial';
            this.heartRateDisplayContext.fillText('Heart Rate: No device', 10, 30);
        }

        // Update distance display
        const distanceKm = this.totalDistance / 1000;
        this.distanceDisplayContext.fillStyle = '#ffffff';
        this.distanceDisplayContext.font = 'bold 20px Arial';
        this.distanceDisplayContext.fillText(`Distance: ${this.totalDistance.toFixed(0)} m (${distanceKm.toFixed(2)} km)`, 10, 30);
    }

    /**
     * Requests and connects to a BLE Fitness Machine (Rower).
     *
     * iOS/iPadOS compatibility note: navigator.bluetooth.requestDevice() MUST be
     * called directly from a user-gesture handler. Calling it a second time from
     * inside an async GATT chain is blocked by iOS. Therefore:
     *   - We issue exactly ONE requestDevice() call here.
     *   - After connecting we try to read heart_rate from the SAME device
     *     (many combo rowers expose it). No second popup is needed.
     *   - A dedicated '❤️ HR' button lets the user connect a separate HR strap
     *     with its own fresh user gesture.
     */
    async connectToRowingMachine() {
        try {
            // Single requestDevice() — safe on every platform including iOS/Bluefy.
            // heart_rate is listed in optionalServices so it is accessible when the
            // device also exposes it (e.g. a combo rower+HR monitor).
            this.bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['fitness_machine'] },
                    { services: ['heart_rate'] }
                ],
                optionalServices: ['fitness_machine', 'heart_rate', 'generic_access']
            });

            console.log('Connecting to:', this.bluetoothDevice.name);

            // Connect to GATT server
            const server = await this.bluetoothDevice.gatt.connect();
            console.log('GATT Server connected');

            // --- Try Fitness Machine rower_data characteristic ---
            try {
                const service = await server.getPrimaryService('fitness_machine');
                this.bluetoothCharacteristic = await service.getCharacteristic('rower_data');
                console.log('✅ Fitness Machine / rower_data characteristic found');
            } catch (e) {
                // Fallback: walk all services looking for known rower UUIDs
                console.log('Fitness Machine service not found, trying generic approach');
                try {
                    const services = await server.getPrimaryServices();
                    for (let service of services) {
                        try {
                            const characteristics = await service.getCharacteristics();
                            for (let char of characteristics) {
                                if (char.uuid.includes('2ad1') || char.uuid.includes('2a9d')) {
                                    this.bluetoothCharacteristic = char;
                                    break;
                                }
                            }
                            if (this.bluetoothCharacteristic) break;
                        } catch (_) { /* skip service */ }
                    }
                } catch (e2) {
                    console.log('Could not enumerate services:', e2.message || e2);
                }
            }

            // --- Try heart rate from the SAME already-connected device ---
            // This requires NO second requestDevice() call — iOS-safe.
            try {
                const hrService = await server.getPrimaryService('heart_rate');
                this.heartRateCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
                await this.heartRateCharacteristic.startNotifications();
                this.heartRateCharacteristic.addEventListener(
                    'characteristicvaluechanged',
                    (event) => this.onHeartRateDataReceived(event)
                );
                console.log('✅ Heart rate service found on the rowing device');
                this.updateHrButtonLabel();
            } catch (e) {
                // Device doesn't expose heart rate — that's fine.
                // The user can tap the ❤️ HR button to connect a separate strap.
                console.log('Heart rate not available on this device (use ❤️ HR button for a separate strap):', e.message || e);
                this.currentHeartRate = null;
            }

            if (this.bluetoothCharacteristic) {
                await this.bluetoothCharacteristic.startNotifications();
                this.bluetoothCharacteristic.addEventListener(
                    'characteristicvaluechanged',
                    (event) => this.onRowingDataReceived(event)
                );
                this.isBluetoothConnected = true;
                this.sessionStartTime = Date.now();
                this.updateConnectionButtonLabel();
                console.log('✅ Bluetooth Connected - Listening for rowing data');
            } else {
                throw new Error('Could not find rowing machine characteristic');
            }

        } catch (error) {
            console.error('Bluetooth Connection Error:', error);
            this.isBluetoothConnected = false;
            this.currentHeartRate = null;
            this.updateConnectionButtonLabel();
        }
    }

    /**
     * Parses the full FTMS Rower Data characteristic (0x2AD1) per the Bluetooth spec.
     *
     * Returns an object with any of:
     *   strokeRate, strokeCount, avgStrokeRate, totalDistance,
     *   instantPace, speed (m/s derived from pace), avgPace,
     *   instantPower, avgPower, resistanceLevel,
     *   totalEnergy, energyPerHour, energyPerMinute,
     *   heartRate, metabolicEquivalent, elapsedTime, remainingTime
     *
     * The FDF Apollo Pro includes heartRate (bit 9) when its built-in
     * receiver has a paired HR strap.
     */
    parseRowingDataFTMS(data) {
        if (data.length < 2) return {};
        const flags = data[0] | (data[1] << 8);
        let off = 2;
        const r = {};

        // Bit 0 = More Data: when 0, Stroke Rate + Stroke Count are present
        if ((flags & 0x0001) === 0) {
            if (off + 4 <= data.length) {
                r.strokeRate  = (data[off] | (data[off+1] << 8)) * 0.5;  off += 2;
                r.strokeCount =  data[off] | (data[off+1] << 8);         off += 2;
            }
        }
        // Bit 1: Average Stroke Rate (uint8, 0.5 /min)
        if ((flags & 0x0002) && off < data.length)  { r.avgStrokeRate = data[off++] * 0.5; }
        // Bit 2: Total Distance (uint24, m)
        if ((flags & 0x0004) && off + 3 <= data.length) {
            r.totalDistance = data[off] | (data[off+1] << 8) | (data[off+2] << 16); off += 3;
        }
        // Bit 3: Instantaneous Pace (uint16, 1/10 s per 500m) -> convert to m/s
        if ((flags & 0x0008) && off + 2 <= data.length) {
            const paceRaw = data[off] | (data[off+1] << 8); off += 2;
            r.instantPace = paceRaw / 10;   // seconds per 500 m
            if (r.instantPace > 0) r.speed = 500 / r.instantPace;  // m/s
        }
        // Bit 4: Average Pace
        if ((flags & 0x0010) && off + 2 <= data.length) {
            r.avgPace = (data[off] | (data[off+1] << 8)) / 10; off += 2;
        }
        // Bit 5: Instantaneous Power (int16, W)
        if ((flags & 0x0020) && off + 2 <= data.length) {
            let p = data[off] | (data[off+1] << 8); if (p >= 32768) p -= 65536;
            r.instantPower = p; off += 2;
        }
        // Bit 6: Average Power (int16, W)
        if ((flags & 0x0040) && off + 2 <= data.length) {
            let p = data[off] | (data[off+1] << 8); if (p >= 32768) p -= 65536;
            r.avgPower = p; off += 2;
        }
        // Bit 7: Resistance Level (int16)
        if ((flags & 0x0080) && off + 2 <= data.length) {
            let l = data[off] | (data[off+1] << 8); if (l >= 32768) l -= 65536;
            r.resistanceLevel = l; off += 2;
        }
        // Bit 8: Expended Energy (total uint16 kcal, /hour uint16, /min uint8)
        if ((flags & 0x0100) && off + 5 <= data.length) {
            r.totalEnergy      = data[off] | (data[off+1] << 8); off += 2;
            r.energyPerHour    = data[off] | (data[off+1] << 8); off += 2;
            r.energyPerMinute  = data[off++];
        }
        // Bit 9: Heart Rate (uint8, bpm)  ←← This is the one we want!
        if ((flags & 0x0200) && off < data.length) { r.heartRate = data[off++]; }
        // Bit 10: Metabolic Equivalent (uint8, 0.1)
        if ((flags & 0x0400) && off < data.length) { r.metabolicEquivalent = data[off++] * 0.1; }
        // Bit 11: Elapsed Time (uint16, s)
        if ((flags & 0x0800) && off + 2 <= data.length) {
            r.elapsedTime = data[off] | (data[off+1] << 8); off += 2;
        }
        // Bit 12: Remaining Time (uint16, s)
        if ((flags & 0x1000) && off + 2 <= data.length) {
            r.remainingTime = data[off] | (data[off+1] << 8); off += 2;
        }
        return r;
    }

    /**
     * Parses rowing machine speed from bytes using heuristic candidates.
     * Used as a fallback when FTMS pace field is not present.
     */
    parseRowerSpeedFromBytes(data) {
        const speedRawBE = (data[1] << 8) | data[2];
        const speedRawLE = (data[2] << 8) | data[1];

        const candidates = [
            { value: speedRawBE / 256, label: '1/256 m/s (BE)' },
            { value: speedRawLE / 256, label: '1/256 m/s (LE)' },
            { value: speedRawBE / 10,  label: '1/10 m/s (BE)'  },
            { value: speedRawLE / 10,  label: '1/10 m/s (LE)'  },
            { value: speedRawBE / 100, label: '1/100 m/s (BE)' },
            { value: speedRawLE / 100, label: '1/100 m/s (LE)' },
            { value: (speedRawBE / 100) / 3.6, label: '1/100 km/h (BE)' },
            { value: (speedRawLE / 100) / 3.6, label: '1/100 km/h (LE)' }
        ];

        const plausible = candidates.filter(c => c.value >= 0.5 && c.value <= 8.5);
        return plausible.length > 0 ? plausible[0] : candidates[0];
    }

    /**
     * Bluetooth notification listener for rowing data.
     *
     * Priority order:
     *   1. FTMS spec parse — extracts pace→speed AND heart rate from the same packet.
     *      Many rowers (including FDF Apollo Pro) embed HR from a paired strap here.
     *   2. Heuristic byte scan — fallback for non-FTMS or proprietary formats.
     */
    onRowingDataReceived(event) {
        const value = event.target.value;

        try {
            const data = new Uint8Array(value.buffer);
            console.log('📨 Rower data, bytes:', data.length,
                        'raw:', Array.from(data.slice(0, Math.min(12, data.length))));

            if (data.length < 2) {
                console.warn('⚠️ Packet too short:', data.length);
                return;
            }

            // --- 1. FTMS spec parse ---
            const ftms = this.parseRowingDataFTMS(data);

            // Speed: prefer pace-derived value (most accurate for rowers)
            if (ftms.speed !== undefined) {
                this.realTimeRowerSpeed = ftms.speed;
                console.log(`📊 FTMS Speed: ${ftms.speed.toFixed(2)} m/s (pace: ${ftms.instantPace?.toFixed(1)}s/500m)`);
            }

            // Heart Rate: extracted directly from the rower data packet
            if (ftms.heartRate !== undefined && ftms.heartRate > 0) {
                this.currentHeartRate = ftms.heartRate;
                console.log(`❤️ HR (from rower data): ${ftms.heartRate} bpm`);
            }

            // Log any bonus fields for diagnostics
            if (ftms.strokeRate !== undefined)
                console.log(`📊 Stroke Rate: ${ftms.strokeRate} /min, Count: ${ftms.strokeCount}`);
            if (ftms.instantPower !== undefined)
                console.log(`⚡ Power: ${ftms.instantPower} W`);
            if (ftms.elapsedTime !== undefined)
                console.log(`⏱️ Elapsed: ${ftms.elapsedTime}s`);

            // --- 2. Heuristic fallback (only if FTMS gave no speed) ---
            if (this.realTimeRowerSpeed === null && data.length >= 3) {
                const candidate = this.parseRowerSpeedFromBytes(data);
                this.realTimeRowerSpeed = candidate.value;
                console.log(`📊 Speed (heuristic fallback): ${this.realTimeRowerSpeed.toFixed(2)} m/s (${candidate.label})`);
            }

        } catch (error) {
            console.error('❌ Error parsing rowing data:', error);
        }
    }

    /**
     * Connects to a dedicated BLE Heart Rate strap.
     *
     * This method is ONLY called from the ❤️ HR button click handler so that
     * the requestDevice() call is always a direct user gesture — required by
     * iOS/iPadOS (Bluefy) and enforced by all Web Bluetooth implementations.
     *
     * Do NOT call this from inside an async GATT chain (that is what broke iOS).
     *
     * BLE connections are inherently flaky on first attempt. Once the user has
     * selected the device via requestDevice() we store it on this.hrDevice and
     * retry only the gatt.connect() step (no second picker popup).
     */
    async connectToHeartRateDevice() {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1200;

        // requestDevice() — must stay here, called directly from a user-gesture handler.
        this.hrDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ['heart_rate'] }
            ],
            optionalServices: ['generic_access', 'heart_rate']
        });

        console.log('HR device selected:', this.hrDevice.name);

        // Retry loop for gatt.connect() — safe because the device is already chosen.
        let lastError;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`HR gatt.connect() attempt ${attempt}/${MAX_RETRIES}…`);
                const hrServer = await this.hrDevice.gatt.connect();
                console.log('Heart rate GATT Server connected');

                const hrService = await hrServer.getPrimaryService('heart_rate');
                this.heartRateCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');

                await this.heartRateCharacteristic.startNotifications();
                this.heartRateCharacteristic.addEventListener(
                    'characteristicvaluechanged',
                    (event) => this.onHeartRateDataReceived(event)
                );
                console.log('✅ Heart rate device connected');
                return; // success — exit the retry loop

            } catch (err) {
                lastError = err;
                const isNetworkError = err.name === 'NetworkError' || (err.message && err.message.includes('Connection'));
                if (isNetworkError && attempt < MAX_RETRIES) {
                    console.warn(`HR connection attempt ${attempt} failed (${err.message}), retrying in ${RETRY_DELAY_MS}ms…`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                } else {
                    // Either not a retryable error, or we've exhausted retries
                    break;
                }
            }
        }

        // All attempts failed — propagate so the button handler can show feedback
        console.error('Heart rate connection failed after all retries:', lastError);
        this.heartRateCharacteristic = null;
        throw lastError;
    }

    /**
     * Bluetooth notification listener for heart rate data.
     */
    onHeartRateDataReceived(event) {
        const value = event.target.value;

        try {
            const data = new Uint8Array(value.buffer);

            // Parse heart rate from standard Bluetooth Heart Rate Service format
            if (data.length >= 2) {
                const flags = data[0];
                let heartRate = data[1];

                // Check if heart rate is in 16-bit format (bit 0 of flags)
                if ((flags & 0x01) === 0 && data.length >= 3) {
                    heartRate = (data[2] << 8) | data[1];
                }

                this.currentHeartRate = heartRate;
                console.log(`❤️ Heart Rate: ${heartRate} bpm`);
            }
        } catch (error) {
            console.error('Error parsing heart rate data:', error);
        }
    }

    /**
     * Disconnects the active Bluetooth connection (rower + any on-device HR).
     * The dedicated HR strap (connected via the ❤️ HR button) has its own
     * GATT connection managed by hrDevice and is not affected here.
     */
    async disconnectRowingMachine() {
        if (this.bluetoothDevice && this.bluetoothDevice.gatt.connected) {
            await this.bluetoothDevice.gatt.disconnect();
        }
        this.isBluetoothConnected = false;
        this.realTimeRowerSpeed = null;
        // Clear HR characteristic so the HR button resets its label
        if (this.heartRateCharacteristic) {
            // Only clear if it came from the same device (no separate hrDevice)
            if (!this.hrDevice) {
                this.heartRateCharacteristic = null;
                this.currentHeartRate = null;
            }
        }
        this.updateConnectionButtonLabel();
        this.updateHrButtonLabel();
        console.log('❌ Bluetooth Disconnected');
    }

    /**
     * Loads the 3D canoe GLB model and sets the target reference for controls.
     */
    loadRowingCanoe(scene, controls, getRawTerrainValue, WATER_LEVEL) {
        this.controls = controls;

        const gltfLoader = new GLTFLoader();
        gltfLoader.load('old_rowboat.glb', (gltf) => {
            this.boat = gltf.scene;

            // Enable shadows for the boat
            this.boat.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Scale the boat appropriately
            this.boat.scale.set(0.01, 0.01, 0.01);

            // Position the boat at the dock (point #4, index 3)
            const dockPoint = this.trackPoints[3];
            const terrainHeight = terrainManager.getTerrainHeightAt({ x: dockPoint.x, z: dockPoint.z });
            this.boat.position.set(dockPoint.x, terrainHeight + this.BOAT_FLOAT_HEIGHT, dockPoint.z);

            scene.add(this.boat);

            // Point OrbitControls at the boat once it is loaded
            if (this.controls) {
                this.controls.target.copy(this.boat.position);
                this.controls.update();
            }

            console.log('✅ Rowing canoe loaded successfully');

            const currentRawHeight = getRawTerrainValue(this.boat.position);
            console.log("Startup Height Value:", currentRawHeight);
        },
        (xhr) => {
            console.log(`Loading Rowing Canoe: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
        },
        (error) => {
            console.error('❌ Error loading rowing canoe:', error);
        });
    }

    /**
     * Creates a red debug line that visualizes the circuit track.
     * Call this from the main scene setup to enable the visualization.
     */
    createDebugTrackVisualization(scene) {
        // Create geometry from track points
        const geometry = new THREE.BufferGeometry();
        const positions = [];

        // Add all track points, closing the loop by adding the first point at the end
        for (let i = 0; i < this.trackPoints.length; i++) {
            const point = this.trackPoints[i];
            positions.push(point.x, point.y + 0.5, point.z); // Slight height offset to show above water
        }
        // Close the loop
        const firstPoint = this.trackPoints[0];
        positions.push(firstPoint.x, firstPoint.y + 0.5, firstPoint.z);

        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

        // Create red line material
        const material = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 3,
            transparent: true,
            opacity: 0.8
        });

        // Create and add line to scene
        this.debugTrackLine = new THREE.Line(geometry, material);
        scene.add(this.debugTrackLine);

        console.log('🔴 Debug track visualization created - red line shows circuit path');
    }

    /**
     * Removes the debug track visualization.
     */
    removeDebugTrackVisualization(scene) {
        if (this.debugTrackLine) {
            scene.remove(this.debugTrackLine);
            this.debugTrackLine.geometry.dispose();
            this.debugTrackLine.material.dispose();
            this.debugTrackLine = null;
            console.log('🗑️ Debug track visualization removed');
        }
    }

    /**
     * [DEPRECATED] Old track system - no longer used.
     * Boat now follows circuit waypoints instead.
     */
    setupBoatTrack(texture) {
        console.log('ℹ️ Old boat track system deprecated - using waypoint circuit navigation instead');
    }

    /**
     * [DEPRECATED] Old track system - no longer used.
     * Boat now follows circuit waypoints instead.
     */
    initializeBoatPositionOnTrack() {
        console.log('ℹ️ Old boat track system deprecated - boat already positioned at first waypoint');
    }

    /**
     * Moves the boat along the predefined circuit, following waypoints.
     */
    updateBoatPhysics(delta) {
        if (!this.boat || !terrainManager.isTerrainLoaded) return;

        // Get current and next waypoint
        const currentPoint = this.trackPoints[this.currentPointIndex];
        const nextPoint = this.trackPoints[(this.currentPointIndex + 1) % this.trackPoints.length];

        // Calculate direction to current waypoint
        const directionToWaypoint = currentPoint.clone().sub(this.boat.position);
        const distanceToWaypoint = directionToWaypoint.length();

        // Check if waypoint reached - advance to next
        if (distanceToWaypoint < this.waypointReachDistance) {
            this.currentPointIndex = (this.currentPointIndex + 1) % this.trackPoints.length;
            console.log(`✅ Waypoint reached! Moving to point ${this.currentPointIndex}`);
        }

        // Target heading toward current waypoint
        const normalizedDirection = directionToWaypoint.normalize();
        this.targetHeading = Math.atan2(normalizedDirection.x, normalizedDirection.z);

        // ==========================================
        // SMOOTH HEADING INTERPOLATION
        // ==========================================
        let headingDiff = this.targetHeading - this.boatHeading;
        
        // Normalize heading difference to [-PI, PI]
        while (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
        while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;

        // Calculate steering based on heading difference
        const steeringForce = THREE.MathUtils.clamp(headingDiff * this.STEERING_STRENGTH, -1, 1);

        // ==========================================
        // ROTATION
        // ==========================================
        this.boatAngularVelocity += steeringForce * delta;
        this.boatAngularVelocity = THREE.MathUtils.clamp(this.boatAngularVelocity, -this.maxAngularVelocity, this.maxAngularVelocity);
        this.boatAngularVelocity *= this.angularDamping;

        this.boatHeading += this.boatAngularVelocity * delta;

        // ==========================================
        // MOVEMENT
        // ==========================================
        const forward = new THREE.Vector3(
            Math.sin(this.boatHeading),
            0,
            Math.cos(this.boatHeading)
        );

        // Only move if rower is connected, use rower's speed
        let boatSpeed = 0;
        if (this.isBluetoothConnected && this.realTimeRowerSpeed !== null) {
            const calibratedSpeed = this.realTimeRowerSpeed * this.speedCalibrationFactor;
            // Only apply speed if above minimum threshold (prevents creeping when rower is idle)
            if (calibratedSpeed > 0.1) {
                boatSpeed = calibratedSpeed;
            }
        }

        const moveAmount = boatSpeed * delta;
        this.boat.position.addScaledVector(forward, moveAmount);

        // Play low-volume wake sound while the boat is moving
        if (moveAmount > 0.03) {  // Only play wake sound if boat is moving at a reasonable speed
            this.boatWakeTimer += delta;
            if (this.boatWakeTimer >= this.boatWakeInterval) {
                this.boatWakeTimer = 0;
                if (typeof soundManager !== 'undefined' && soundManager && soundManager.playPositionalOneShot) {
                    const speedRatio = THREE.MathUtils.clamp(boatSpeed / 2.0, 0, 1); // Normalize against typical rowing speed
                    const wakeVolume = 0.03 + (0.16 * speedRatio);
                    soundManager.playPositionalOneShot('jetskiWake', this.boat.position, wakeVolume);
                }
            }
        } else {
            this.boatWakeTimer = 0;
        }

        // ==========================================
        // HEIGHT & ROTATION
        // ==========================================
        const targetBoatHeight = terrainManager.WATER_LEVEL + this.BOAT_FLOAT_HEIGHT;
        this.boat.position.y += (targetBoatHeight - this.boat.position.y) * 0.05;
        this.boat.rotation.y = this.boatHeading;

        // ==========================================
        // DISTANCE TRACKING
        // ==========================================
        if (this.realTimeRowerSpeed !== null && this.sessionStartTime !== null) {
            const calibratedSpeed = this.realTimeRowerSpeed * this.speedCalibrationFactor;
            const distanceDelta = calibratedSpeed * delta;
            this.totalDistance += distanceDelta;
        }

        // Debug logging
        if (Math.random() < 0.01) {
            console.log(`🚤 Circuit - Point: ${this.currentPointIndex}, Distance: ${distanceToWaypoint.toFixed(1)}m, Heading: ${(this.boatHeading * 180 / Math.PI).toFixed(1)}°`);
        }
    }
}

export const rowingManager = new RowingManager();
