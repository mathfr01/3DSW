import * as THREE from 'three';

class TerrainManager {
    constructor() {
        this.DISPLACEMENT = 37.5;
        this.OFFSET = -20;
        this.WATER_LEVEL = -0.1;

        // Data arrays loaded from masks/maps
        this.heightData = null;
        this.lakeBoundaryData = null;
        this.roadsData = null;
        this.beachData = null;
        this.buildingsData = null;
        this.treesData = null;

        // Canvas and context variables for texture decoding
        this.canvas = document.createElement('canvas');
        this.lakeCanvas = document.createElement('canvas');
        this.roadsCanvas = document.createElement('canvas');
        this.beachCanvas = document.createElement('canvas');
        this.buildingsCanvas = document.createElement('canvas');
        this.treesCanvas = document.createElement('canvas');

        // References to generated Three.js textures
        this.roadTexture = null;
        this.beachTexture = null;

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
        const texture = new THREE.CanvasTexture(this.roadsCanvas);
        texture.flipY = false;
        texture.needsUpdate = true;

        mesh.material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            map: texture,
            transparent: true,
            alphaTest: 0.8,
            side: THREE.DoubleSide
        });
        console.log('✅ Roads texture applied from TerrainManager');
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

    getGroundHeightAt(worldPos) {
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
