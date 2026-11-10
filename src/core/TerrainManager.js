import * as THREE from 'three';

class TerrainManager {
    constructor() {
        this.DISPLACEMENT = 37.5;
        this.OFFSET = -20;
        this.WATER_LEVEL = -0.1;
        this.CONCRETE_SLAB_HEIGHT = 0.0762; // 3 inches in the terrain's meter-like world units

        // Data arrays loaded from masks/maps
        this.heightData = null;
        this.lakeBoundaryData = null;
        this.roadsData = null;
        this.beachData = null;
        this.buildingsData = null;
        this.treesData = null;
        this.concreteData = null;
        this.parkingLinesData = null;

        // Canvas and context variables for texture decoding
        this.canvas = document.createElement('canvas');
        this.lakeCanvas = document.createElement('canvas');
        this.roadsCanvas = document.createElement('canvas');
        this.beachCanvas = document.createElement('canvas');
        this.buildingsCanvas = document.createElement('canvas');
        this.treesCanvas = document.createElement('canvas');
        this.concreteCanvas = document.createElement('canvas');
        this.parkingLinesCanvas = document.createElement('canvas');

        // References to generated Three.js textures
        this.roadTexture = null;
        this.roadMaskTexture = null;
        this.asphaltTexture = null;
        this.beachTexture = null;
        this.parkingLinesTexture = null;

        this.isTerrainLoaded = false;
    }

    setupHeightMapCollision(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupHeightMapCollision(texture);
            return;
        }

        this.canvas.width = img.width;
        this.canvas.height = img.height;
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.heightData = ctx.getImageData(0, 0, img.width, img.height).data;
        
        // Deepen lake areas by lowering height values in lake boundary
        if (this.lakeBoundaryData) {
            const lakeDepthFactor = 0.6; // Reduce lake bed height by 40%
            for (let i = 0; i < this.heightData.length; i += 4) {
                const lakeIdx = i;
                const r = this.lakeBoundaryData[lakeIdx];
                const g = this.lakeBoundaryData[lakeIdx + 1];
                const b = this.lakeBoundaryData[lakeIdx + 2];
                const brightness = (r + g + b) / 3;
                
                // If in lake area (white/bright in lake boundary), lower the height
                if (brightness > 128) {
                    this.heightData[i] = Math.floor(this.heightData[i] * lakeDepthFactor);
                    this.heightData[i + 1] = Math.floor(this.heightData[i + 1] * lakeDepthFactor);
                    this.heightData[i + 2] = Math.floor(this.heightData[i + 2] * lakeDepthFactor);
                }
            }
            console.log("✅ Lake depth applied to height map");
        }
        
        this.isTerrainLoaded = true;

        console.log("Height Data Sample:", this.heightData[0], this.heightData[1], this.heightData[2]);
        console.log(`Height map loaded: ${img.width}x${img.height}, total pixels: ${this.heightData.length / 4}`);
        if (this.heightData[0] === 0 && this.heightData[this.heightData.length - 1] === 0) {
            console.warn("⚠️ Height data is all zeros. Check for CORS issues or blank image.");
        }
    }

    setupLakeBoundary(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupLakeBoundary(texture);
            return;
        }

        this.lakeCanvas.width = img.width;
        this.lakeCanvas.height = img.height;
        const ctx = this.lakeCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.lakeBoundaryData = ctx.getImageData(0, 0, img.width, img.height).data;

        console.log(`Lake boundary loaded: ${img.width}x${img.height}, total pixels: ${this.lakeBoundaryData.length / 4}`);
    }

    setupRoads(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupRoads(texture);
            return;
        }

        this.roadsCanvas.width = img.width;
        this.roadsCanvas.height = img.height;
        const ctx = this.roadsCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.roadsData = ctx.getImageData(0, 0, img.width, img.height).data;

        this.roadTexture = new THREE.CanvasTexture(this.roadsCanvas);
        this.roadTexture.flipY = false;

        // Apply roads texture if mesh already exists globally
        if (window.roadMesh) {
            this.applyRoadTexture(window.roadMesh);
        }
        console.log(`Roads loaded: ${img.width}x${img.height}, total pixels: ${this.roadsData.length / 4}`);
    }

    applyRoadTexture(mesh) {
        if (!this.roadsData || !this.roadsCanvas.width) return;

        if (!this.asphaltTexture) {
            const asphaltCanvas = document.createElement('canvas');
            asphaltCanvas.width = 512;
            asphaltCanvas.height = 512;
            const asphaltContext = asphaltCanvas.getContext('2d');
            const asphaltPixels = asphaltContext.createImageData(512, 512);
            for (let i = 0; i < asphaltPixels.data.length; i += 4) {
                const grain = (Math.random() - 0.5) * 24;
                const fleck = Math.random() < 0.055 ? (Math.random() < 0.5 ? -24 : 22) : 0;
                const value = Math.max(38, Math.min(132, 83 + grain + fleck));
                asphaltPixels.data[i] = value;
                asphaltPixels.data[i + 1] = value;
                asphaltPixels.data[i + 2] = value + (Math.random() < 0.2 ? 1 : 0);
                asphaltPixels.data[i + 3] = 255;
            }
            asphaltContext.putImageData(asphaltPixels, 0, 0);
            this.asphaltTexture = new THREE.CanvasTexture(asphaltCanvas);
            this.asphaltTexture.colorSpace = THREE.SRGBColorSpace;
            this.asphaltTexture.wrapS = THREE.RepeatWrapping;
            this.asphaltTexture.wrapT = THREE.RepeatWrapping;
            this.asphaltTexture.repeat.set(180, 180);
            this.asphaltTexture.anisotropy = 8;

            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = this.roadsCanvas.width;
            maskCanvas.height = this.roadsCanvas.height;
            const maskContext = maskCanvas.getContext('2d');
            const maskPixels = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
            for (let i = 0; i < this.roadsData.length; i += 4) {
                const roadCoverage = this.roadsData[i + 3];
                maskPixels.data[i] = 255;
                maskPixels.data[i + 1] = roadCoverage;
                maskPixels.data[i + 2] = 255;
                maskPixels.data[i + 3] = 255;
            }
            maskContext.putImageData(maskPixels, 0, 0);
            this.roadMaskTexture = new THREE.CanvasTexture(maskCanvas);
            this.roadMaskTexture.flipY = false;
            this.roadMaskTexture.needsUpdate = true;
        }

        mesh.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this.asphaltTexture,
            alphaMap: this.roadMaskTexture,
            transparent: true,
            alphaTest: 0.35,
            side: THREE.DoubleSide,
            roughness: 0.94,
            metalness: 0.02,
            bumpMap: this.asphaltTexture,
            bumpScale: 0.018
        });
        mesh.material.needsUpdate = true;
        console.log('✅ Roads texture applied from TerrainManager');
    }

    setupParkingLines(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupParkingLines(texture);
            return;
        }

        this.parkingLinesCanvas.width = img.width;
        this.parkingLinesCanvas.height = img.height;
        const context = this.parkingLinesCanvas.getContext('2d', { willReadFrequently: true });
        context.clearRect(0, 0, img.width, img.height);
        context.drawImage(img, 0, 0);
        this.parkingLinesData = context.getImageData(0, 0, img.width, img.height).data;

        const paintMask = context.createImageData(img.width, img.height);
        for (let i = 0; i < this.parkingLinesData.length; i += 4) {
            const brightness = Math.round(
                (this.parkingLinesData[i] + this.parkingLinesData[i + 1] + this.parkingLinesData[i + 2]) / 3 *
                this.parkingLinesData[i + 3] / 255
            );
            paintMask.data[i] = brightness;
            paintMask.data[i + 1] = brightness;
            paintMask.data[i + 2] = brightness;
            paintMask.data[i + 3] = 255;
        }
        context.putImageData(paintMask, 0, 0);
        this.parkingLinesTexture = new THREE.CanvasTexture(this.parkingLinesCanvas);
        this.parkingLinesTexture.flipY = false;
        this.parkingLinesTexture.needsUpdate = true;

        if (window.roadMesh) {
            this.applyParkingLinesTexture(window.roadMesh);
        }
        console.log(`Parking-line mask loaded: ${img.width}x${img.height}`);
    }

    applyParkingLinesTexture(roadMesh) {
        if (!this.parkingLinesTexture || !roadMesh.parent) return;

        if (window.parkingLinesMesh) {
            if (window.parkingLinesMesh.parent) {
                window.parkingLinesMesh.parent.remove(window.parkingLinesMesh);
            }
            window.parkingLinesMesh.geometry.dispose();
            window.parkingLinesMesh.material.dispose();
        }

        const geometry = roadMesh.geometry.clone();
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, positions.getZ(i) - 0.02);
        }
        positions.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            alphaMap: this.parkingLinesTexture,
            transparent: true,
            alphaTest: 0.25,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const parkingLinesMesh = new THREE.Mesh(geometry, material);
        parkingLinesMesh.name = 'ParkingLines';
        parkingLinesMesh.userData.noCollision = true;
        parkingLinesMesh.position.copy(roadMesh.position);
        parkingLinesMesh.rotation.copy(roadMesh.rotation);
        parkingLinesMesh.scale.copy(roadMesh.scale);
        parkingLinesMesh.renderOrder = roadMesh.renderOrder + 1;
        parkingLinesMesh.castShadow = false;
        parkingLinesMesh.receiveShadow = false;
        roadMesh.parent.add(parkingLinesMesh);
        window.parkingLinesMesh = parkingLinesMesh;
    }

    setupBeach(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupBeach(texture);
            return;
        }

        this.beachCanvas.width = img.width;
        this.beachCanvas.height = img.height;
        const ctx = this.beachCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.beachData = ctx.getImageData(0, 0, img.width, img.height).data;

        this.beachTexture = new THREE.CanvasTexture(this.beachCanvas);
        this.beachTexture.flipY = false;

        // Apply beach texture if mesh already exists globally
        if (window.beachMesh) {
            this.applyBeachTexture(window.beachMesh);
        }
        console.log(`Beach loaded: ${img.width}x${img.height}, total pixels: ${this.beachData.length / 4}`);
    }

    applyBeachTexture(mesh) {
        const texture = new THREE.CanvasTexture(this.beachCanvas);
        texture.flipY = false;
        texture.needsUpdate = true;

        mesh.material = new THREE.MeshBasicMaterial({
            color: 0xE6CC9E,
            map: texture,
            transparent: true,
            alphaTest: 0.8,
            side: THREE.DoubleSide
        });
        console.log('✅ Beach texture applied from TerrainManager');
    }

    setupBuildings(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupBuildings(texture);
            return;
        }

        this.buildingsCanvas.width = img.width;
        this.buildingsCanvas.height = img.height;
        const ctx = this.buildingsCanvas.getContext('2d');
        ctx.clearRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);
        this.buildingsData = ctx.getImageData(0, 0, img.width, img.height).data;
        console.log(`Buildings mask loaded: ${img.width}x${img.height}, total pixels: ${this.buildingsData.length / 4}`);
    }

    setupTrees(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupTrees(texture);
            return;
        }

        this.treesCanvas.width = img.width;
        this.treesCanvas.height = img.height;
        const ctx = this.treesCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        this.treesData = ctx.getImageData(0, 0, img.width, img.height).data;
        console.log(`Trees mask loaded: ${img.width}x${img.height}, total pixels: ${this.treesData.length / 4}`);
    }

    setupConcrete(texture) {
        const img = texture.image;
        if (!img || img.width === 0) {
            img.onload = () => this.setupConcrete(texture);
            return;
        }

        this.concreteCanvas.width = img.width;
        this.concreteCanvas.height = img.height;
        const ctx = this.concreteCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);
        this.concreteData = ctx.getImageData(0, 0, img.width, img.height).data;
        // The mask uses white RGB for concrete and black for everything else.
        // Convert brightness to alpha so geometry and ground checks share one mask.
        for (let i = 0; i < this.concreteData.length; i += 4) {
            const brightness = (this.concreteData[i] + this.concreteData[i + 1] + this.concreteData[i + 2]) / 3;
            this.concreteData[i + 3] = Math.round(this.concreteData[i + 3] * brightness / 255);
        }
        console.log(`Concrete mask loaded: ${img.width}x${img.height}`);
    }

    getRawTerrainValue(worldPos) {
        if (!this.heightData) {
            return 0.3;
        }

        const terrainSize = 1000;
        const u = (worldPos.x + terrainSize / 2) / terrainSize;
        const v = (worldPos.z + terrainSize / 2) / terrainSize;

        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return 0.3;
        }

        const x = Math.floor(u * (this.canvas.width - 1));
        const y = Math.floor(v * (this.canvas.height - 1));
        const pixelIndex = (y * this.canvas.width + x) * 4;

        return this.heightData[pixelIndex] / 255;
    }

    getTerrainHeightAt(worldPos) {
        if (!this.heightData || this.canvas.width === 0 || this.canvas.height === 0) {
            return this.WATER_LEVEL;
        }

        const terrainSize = 1000;
        const u = (worldPos.x + terrainSize / 2) / terrainSize;
        const v = (worldPos.z + terrainSize / 2) / terrainSize;

        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return this.WATER_LEVEL;
        }

        const px = Math.floor(u * (this.canvas.width - 1));
        const py = Math.floor(v * (this.canvas.height - 1));
        const pixelIndex = (py * this.canvas.width + px) * 4;

        const h = this.heightData[pixelIndex] / 255;
        return (h * this.DISPLACEMENT) + this.OFFSET;
    }

    getGroundHeightAt(worldPos, includeConcrete = true) {
        let height = this.getTerrainHeightAt(worldPos);

        const terrainSize = 1000;
        const u = (worldPos.x + terrainSize / 2) / terrainSize;
        const v = (worldPos.z + terrainSize / 2) / terrainSize;

        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            let isOnOverlay = false;

            // Check roads
            if (this.roadsData && this.roadsCanvas.width > 0) {
                const x = Math.floor(u * (this.roadsCanvas.width - 1));
                const y = Math.floor(v * (this.roadsCanvas.height - 1));
                const idx = (y * this.roadsCanvas.width + x) * 4;
                const a = this.roadsData[idx + 3];
                const brightness = (this.roadsData[idx] + this.roadsData[idx + 1] + this.roadsData[idx + 2]) / 3;
                if (a > 50 && brightness < 180) {
                    isOnOverlay = true;
                }
            }

            // Check beach
            if (!isOnOverlay && this.beachData && this.beachCanvas.width > 0) {
                const x = Math.floor(u * (this.beachCanvas.width - 1));
                const y = Math.floor(v * (this.beachCanvas.height - 1));
                const idx = (y * this.beachCanvas.width + x) * 4;
                const a = this.beachData[idx + 3];
                if (a > 50) {
                    isOnOverlay = true;
                }
            }

            if (includeConcrete && this.concreteData && this.concreteCanvas.width > 0) {
                const x = Math.floor(u * (this.concreteCanvas.width - 1));
                const y = Math.floor(v * (this.concreteCanvas.height - 1));
                const idx = (y * this.concreteCanvas.width + x) * 4;
                if (this.concreteData[idx + 3] > 160) {
                    return height + (isOnOverlay ? 0.1 : 0) + this.CONCRETE_SLAB_HEIGHT;
                }
            }

            if (isOnOverlay) {
                return height + 0.1;
            }
        }

        return height;
    }

    getTerrainHeightAtForBuildings(worldPos) {
        if (!this.heightData) return -999;

        const terrainSize = 1000;
        const u = (worldPos.x + terrainSize / 2) / terrainSize;
        const v = (worldPos.z + terrainSize / 2) / terrainSize;

        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return -999;
        }

        const x = Math.floor(u * (this.canvas.width - 1));
        const y = Math.floor((1 - v) * (this.canvas.height - 1)); // Invert Y for buildings coordinate system
        const pixelIndex = (y * this.canvas.width + x) * 4;

        const r = this.heightData[pixelIndex] / 255;
        return (r * this.DISPLACEMENT) + this.OFFSET;
    }

    isInLake(worldPos) {
        if (!this.lakeBoundaryData) return true;

        const terrainSize = 1000;
        const u = (worldPos.x + terrainSize / 2) / terrainSize;
        const v = (worldPos.z + terrainSize / 2) / terrainSize;

        if (u < 0 || u > 1 || v < 0 || v > 1) return false;

        const x = Math.floor(u * (this.lakeCanvas.width - 1));
        const y = Math.floor(v * (this.lakeCanvas.height - 1));
        const pixelIndex = (y * this.lakeCanvas.width + x) * 4;

        const r = this.lakeBoundaryData[pixelIndex];
        const g = this.lakeBoundaryData[pixelIndex + 1];
        const b = this.lakeBoundaryData[pixelIndex + 2];
        const brightness = (r + g + b) / 3;

        return brightness > 128; // White areas are water
    }
}

export const terrainManager = new TerrainManager();
