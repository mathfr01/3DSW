import * as THREE from 'three';

// Helper geometric algorithms
function simplifyPolygon(points, minDistance = 1.5) {
    if (!points || points.length < 3) return points || [];
    const simplified = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = simplified[simplified.length - 1];
        const dx = points[i].x - prev.x;
        const dy = points[i].y - prev.y;
        if ((dx * dx + dy * dy) >= minDistance * minDistance) {
            simplified.push(points[i]);
        }
    }
    if (simplified.length > 2) {
        const first = simplified[0];
        const last = simplified[simplified.length - 1];
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        if ((dx * dx + dy * dy) < minDistance * minDistance) simplified.pop();
    }
    return simplified;
}

function orderBoundaryPoints(boundary) {
    if (!boundary || boundary.length < 3) return [];
    let cx = 0, cy = 0;
    for (const p of boundary) { cx += p.x; cy += p.y; }
    cx /= boundary.length;
    cy /= boundary.length;
    return boundary.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

function extractBoundaryPoints(regionPixels, pixelSet) {
    const boundary = [];
    for (const p of regionPixels) {
        const x = p.x;
        const y = p.y;
        const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        let isBoundary = false;
        for (const [nx, ny] of neighbors) {
            if (!pixelSet.has(`${nx},${ny}`)) {
                isBoundary = true;
                break;
            }
        }
        if (isBoundary) boundary.push({ x, y });
    }
    return boundary;
}

function createLeafTreeModel() {
    const treeGroup = new THREE.Group();

    // Tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown trunk
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2;
    trunk.name = 'Trunk';
    treeGroup.add(trunk);

    // Tree foliage
    const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Forest green

    const mainFoliageGeometry = new THREE.SphereGeometry(3, 8, 6);
    const mainFoliage = new THREE.Mesh(mainFoliageGeometry, foliageMaterial);
    mainFoliage.name = 'Foliage';
    mainFoliage.position.y = 5;
    treeGroup.add(mainFoliage);

    const foliage1Geometry = new THREE.SphereGeometry(2.5, 8, 6);
    const foliage1 = new THREE.Mesh(foliage1Geometry, foliageMaterial);
    foliage1.name = 'Foliage';
    foliage1.position.set(1.5, 6, 1);
    treeGroup.add(foliage1);

    const foliage2Geometry = new THREE.SphereGeometry(2.5, 8, 6);
    const foliage2 = new THREE.Mesh(foliage2Geometry, foliageMaterial);
    foliage2.name = 'Foliage';
    foliage2.position.set(-1.5, 6, -1);
    treeGroup.add(foliage2);

    const foliage3Geometry = new THREE.SphereGeometry(2, 8, 6);
    const foliage3 = new THREE.Mesh(foliage3Geometry, foliageMaterial);
    foliage3.name = 'Foliage';
    foliage3.position.set(0, 7.5, 1.5);
    treeGroup.add(foliage3);

    return treeGroup;
}

function createTreePrototype() {
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
    const foliageGeometries = [
        new THREE.SphereGeometry(3, 8, 6),
        new THREE.SphereGeometry(2.5, 8, 6),
        new THREE.SphereGeometry(2.5, 8, 6),
        new THREE.SphereGeometry(2, 8, 6)
    ];
    const foliageLocalMatrices = [
        new THREE.Matrix4().makeTranslation(0, 5, 0),
        new THREE.Matrix4().makeTranslation(1.5, 6, 1),
        new THREE.Matrix4().makeTranslation(-1.5, 6, -1),
        new THREE.Matrix4().makeTranslation(0, 7.5, 1.5)
    ];
    return { trunkGeometry, foliageGeometries, foliageLocalMatrices };
}

function getRandomTreeGreen() {
    const color = new THREE.Color();
    const hue = 0.25 + (Math.random() - 0.5) * 0.08; // subtle green variation
    const saturation = 0.55 + Math.random() * 0.25;
    const lightness = 0.34 + Math.random() * 0.16;
    color.setHSL(hue, saturation, lightness);
    return color;
}

function createTreeFoliageTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f3f3f3';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Low contrast clusters keep the green palette visible while breaking up
    // the smooth, plastic look of the low-poly canopy.
    for (let i = 0; i < 900; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 1 + Math.random() * 4;
        const shade = 218 + Math.floor(Math.random() * 37);
        context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${0.12 + Math.random() * 0.24})`;
        context.beginPath();
        context.ellipse(x, y, radius * 1.5, radius * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
        context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.4, 1.4);
    return texture;
}

function createTreeBarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#795638';
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 90; i++) {
        const x = Math.random() * canvas.width;
        const shade = Math.random() > 0.5 ? 'rgba(220, 185, 135, 0.16)' : 'rgba(38, 25, 16, 0.2)';
        context.strokeStyle = shade;
        context.lineWidth = 1 + Math.random() * 3;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x - 5 + Math.random() * 10, 80, x - 5 + Math.random() * 10, 170, x - 4 + Math.random() * 8, canvas.height);
        context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function cloneTreeModelWithTint(treeModel, foliageMaterial) {
    const tree = treeModel.clone(true);
    tree.traverse((child) => {
        if (child.isMesh && child.name === 'Foliage') {
            child.material = foliageMaterial;
        }
    });
    return tree;
}

// Reusable math objects for tree wind animation loop to avoid garbage collection
const _windPos = new THREE.Vector3();
const _windEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _windQuaternion = new THREE.Quaternion();
const _windScale = new THREE.Vector3();
const _windTreeMatrix = new THREE.Matrix4();
const _windLeafMatrix = new THREE.Matrix4();
const _windFoliageRotated = new THREE.Matrix4();
const _windFoliageEuler = new THREE.Euler(0, 0, 0, 'XYZ');

export class EnvironmentManager {
    constructor(scene, terrainManager) {
        this.scene = scene;
        this.terrainManager = terrainManager;
        this.treeDataList = [];
        this.trunkMeshNear = null;
        this.trunkMeshFar = null;
        this.foliageMeshesNear = null;
        this.foliageMeshesFar = null;
        this.foliageGeometries = null;
        this.foliageLocalMatrices = null;
        this.foliageMaterials = null;
        this.lastTreeWindUpdate = -Infinity;
    }

    createRoadOverlay() {
        console.log('🔧 Creating road overlay mesh following terrain...');

        if (!this.terrainManager.isTerrainLoaded || !this.terrainManager.heightData) {
            console.log('⏳ Terrain not loaded yet, retrying...');
            setTimeout(() => this.createRoadOverlay(), 100);
            return;
        }

        const roadGeometry = new THREE.PlaneGeometry(1000, 1000, 256, 256);
        const pos = roadGeometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getY(i);
            const terrainHeight = this.terrainManager.getTerrainHeightAt({ x: x, z: z });
            pos.setZ(i, -terrainHeight - 0.1);
        }
        pos.needsUpdate = true;

        // Roads stay hidden until their alpha mask arrives. TerrainManager
        // then applies the tiled asphalt material without changing the shape.
        const roadMaterial = new THREE.MeshBasicMaterial({ visible: false });

        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
        roadMesh.rotation.x = Math.PI / 2; // Flip vertically

        window.roadMesh = roadMesh;
        this.scene.add(roadMesh);
        if (this.terrainManager.roadTexture) {
            this.terrainManager.applyRoadTexture(roadMesh);
        }
        console.log('✅ Road overlay mesh added to scene');
    }

    createBeachOverlay() {
        console.log('🔧 Creating beach overlay mesh following terrain...');

        if (!this.terrainManager.isTerrainLoaded || !this.terrainManager.heightData) {
            console.log('⏳ Terrain not loaded yet, retrying...');
            setTimeout(() => this.createBeachOverlay(), 100);
            return;
        }

        if (!this.terrainManager.beachTexture) {
            console.log('⏳ Beach texture not loaded yet, retrying...');
            setTimeout(() => this.createBeachOverlay(), 100);
            return;
        }

        const beachGeometry = new THREE.PlaneGeometry(1000, 1000, 256, 256);
        const pos = beachGeometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getY(i);
            const terrainHeight = this.terrainManager.getTerrainHeightAt({ x: x, z: z });
            pos.setZ(i, -terrainHeight - 0.1);
        }
        pos.needsUpdate = true;

        const beachMaterial = new THREE.MeshBasicMaterial({
            color: 0xE6CC9E, // Sand beach color
            alphaMap: this.terrainManager.beachTexture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });

        const beachMesh = new THREE.Mesh(beachGeometry, beachMaterial);
        beachMesh.rotation.x = Math.PI / 2;
        beachMesh.position.set(0, 0, 0);

        window.beachMesh = beachMesh;
        this.scene.add(beachMesh);
        console.log('✅ Beach overlay mesh added to scene');
    }

    createBuildingOverlay(onBuildingsCreated) {
        console.log('🔧 Generating extruded building footprints from mask...');

        if (!this.terrainManager.isTerrainLoaded || !this.terrainManager.heightData || !this.terrainManager.buildingsData) {
            console.log('⏳ Terrain or building mask not ready yet, retrying...');
            setTimeout(() => this.createBuildingOverlay(onBuildingsCreated), 100);
            return;
        }

        if (window.buildingGroup) {
            this.scene.remove(window.buildingGroup);
        }

        const buildingGroup = new THREE.Group();

        const imgW = this.terrainManager.buildingsCanvas.width;
        const imgH = this.terrainManager.buildingsCanvas.height;
        const visited = new Uint8Array(imgW * imgH);
        const terrainSize = 1000;
        const maxBuildings = 3000;
        let buildingCount = 0;

        const buildingColors = [
            0xff6b6b, 0xA0522D, 0xffd700, 0xff69b4, 0xff4500, 0x778899,
            0x00ced1, 0x20b2aa, 0x4682b4, 0x778899, 0x8b4513, 0xa0522d,
            0xbc8f8f, 0xd2691e, 0x8fbc8f, 0x708090, 0x696969, 0x778899,
            0x2f4f4f, 0x8b4513, 0x9370db, 0x32cd32, 0xff1493, 0xdeb887,
            0xff6347
        ];

        const isBuildingPixel = (x, y) => {
            const i = (y * imgW + x) * 4;
            const a = this.terrainManager.buildingsData[i + 3];
            const brightness = (this.terrainManager.buildingsData[i] + this.terrainManager.buildingsData[i + 1] + this.terrainManager.buildingsData[i + 2]) / 3;
            return a > 20 && brightness < 180;
        };

        for (let y = 0; y < imgH; y++) {
            for (let x = 0; x < imgW; x++) {
                const start = y * imgW + x;
                if (visited[start] || !isBuildingPixel(x, y)) continue;

                const stack = [[x, y]];
                const regionPixels = [];
                const pixelSet = new Set();
                visited[start] = 1;

                let minX = x, maxX = x, minY = y, maxY = y;

                while (stack.length) {
                    const [cx, cy] = stack.pop();
                    regionPixels.push({ x: cx, y: cy });
                    pixelSet.add(`${cx},${cy}`);

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    const neighbors = [
                        [cx + 1, cy],
                        [cx - 1, cy],
                        [cx, cy + 1],
                        [cx, cy - 1]
                    ];

                    for (const [nx, ny] of neighbors) {
                        if (nx < 0 || ny < 0 || nx >= imgW || ny >= imgH) continue;
                        const n = ny * imgW + nx;
                        if (!visited[n] && isBuildingPixel(nx, ny)) {
                            visited[n] = 1;
                            stack.push([nx, ny]);
                        }
                    }
                }

                if (regionPixels.length < 4) continue;

                const boundary = extractBoundaryPoints(regionPixels, pixelSet);
                if (boundary.length < 3) continue;

                let ordered = orderBoundaryPoints(boundary);
                ordered = simplifyPolygon(ordered, 2.0);
                if (ordered.length < 3) continue;

                const shapePoints = ordered.map((p) => {
                    const wx = ((p.x + 0.5) / imgW) * terrainSize - terrainSize / 2;
                    const wz = (1 - ((p.y + 0.5) / imgH)) * terrainSize - terrainSize / 2;
                    return new THREE.Vector2(wx, wz);
                });

                const centerX = (((minX + maxX + 1) * 0.5) / imgW) * terrainSize - terrainSize / 2;
                const centerZ = (1 - (((minY + maxY + 1) * 0.5) / imgH)) * terrainSize - terrainSize / 2;

                const terrainY = this.terrainManager.getTerrainHeightAtForBuildings({ x: centerX, z: centerZ });

                const levels = Math.max(1, Math.min(10, Math.round(Math.sqrt(regionPixels.length) / 3)));
                const visualHeight = levels * 1.36 * 0.75;
                const foundationDepth = 15;
                const totalHeight = visualHeight + foundationDepth;

                const shape = new THREE.Shape(shapePoints);
                const geometry = new THREE.ExtrudeGeometry(shape, {
                    depth: totalHeight,
                    bevelEnabled: false,
                    steps: 1,
                    curveSegments: 1
                });

                geometry.rotateX(-Math.PI / 2);
                geometry.translate(0, terrainY - foundationDepth, 0);

                const seed1 = Math.abs(Math.floor(centerX * 7.13 + centerZ * 11.27));
                const seed2 = Math.abs(Math.floor(centerX * 19.81 - centerZ * 5.43));
                const seed3 = Math.abs(Math.floor(regionPixels.length * 0.17));
                const combinedSeed = (seed1 + seed2 + seed3) % 1000;
                const colorIndex = combinedSeed % buildingColors.length;
                const buildingColor = buildingColors[colorIndex];

                const buildingMaterial = new THREE.MeshStandardMaterial({
                    color: buildingColor,
                    roughness: 0.9,
                    metalness: 0.05
                });

                const mesh = new THREE.Mesh(geometry, buildingMaterial);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Store the 2D polygon footprint and center for high-fidelity collision solvers
                mesh.userData.polygon = shapePoints.map(p => new THREE.Vector2(p.x, -p.y));
                mesh.userData.center = new THREE.Vector2(centerX, -centerZ);

                buildingGroup.add(mesh);

                buildingCount++;
                if (buildingCount >= maxBuildings) break;
            }

            if (buildingCount >= maxBuildings) break;
        }

        this.scene.add(buildingGroup);
        window.buildingGroup = buildingGroup;

        if (onBuildingsCreated) {
            onBuildingsCreated();
        }

        console.log(`✅ Generated ${buildingCount} extruded building footprints from mask`);
    }

    createTreeOverlay(onTreesCreated) {
        console.log('🔧 Generating trees from mask...');

        if (!this.terrainManager.isTerrainLoaded || !this.terrainManager.heightData || !this.terrainManager.treesData) {
            console.log('⏳ Terrain or tree mask not ready yet, retrying...');
            setTimeout(() => this.createTreeOverlay(onTreesCreated), 100);
            return;
        }

        if (window.treeGroup) {
            this.scene.remove(window.treeGroup);
        }

        this.treeDataList = [];

        const treeGroup = new THREE.Group();

        const imgW = this.terrainManager.treesCanvas.width;
        const imgH = this.terrainManager.treesCanvas.height;
        const terrainSize = 1000;
        const maxTrees = 1500;
        let treeCount = 0;

        const { trunkGeometry, foliageGeometries, foliageLocalMatrices } = createTreePrototype();
        this.foliageGeometries = foliageGeometries;
        this.foliageLocalMatrices = foliageLocalMatrices;

        const barkTexture = createTreeBarkTexture();
        const foliageTexture = createTreeFoliageTexture();
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, map: barkTexture });
        const foliageMaterials = Array.from({ length: 5 }, () => new THREE.MeshLambertMaterial({
            color: getRandomTreeGreen(),
            map: foliageTexture
        }));
        this.foliageMaterials = foliageMaterials;

        const trunkMeshNear = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, maxTrees);
        trunkMeshNear.castShadow = true;
        trunkMeshNear.receiveShadow = true;

        const trunkMeshFar = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, maxTrees);
        trunkMeshFar.castShadow = false;
        trunkMeshFar.receiveShadow = false;

        this.trunkMeshNear = trunkMeshNear;
        this.trunkMeshFar = trunkMeshFar;

        const foliageMeshesNear = foliageMaterials.map((material) =>
            foliageGeometries.map((geometry) => {
                const mesh = new THREE.InstancedMesh(geometry, material, maxTrees);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                return mesh;
            })
        );

        const foliageMeshesFar = foliageMaterials.map((material) =>
            foliageGeometries.map((geometry) => {
                const mesh = new THREE.InstancedMesh(geometry, material, maxTrees);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                return mesh;
            })
        );

        this.foliageMeshesNear = foliageMeshesNear;
        this.foliageMeshesFar = foliageMeshesFar;

        const nearCounts = new Array(foliageMaterials.length).fill(0);
        const farCounts = new Array(foliageMaterials.length).fill(0);
        let trunkNearCount = 0;
        let trunkFarCount = 0;
        const shadowDistance = 300;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scaleVector = new THREE.Vector3();
        const treeMatrix = new THREE.Matrix4();
        const leafMatrix = new THREE.Matrix4();
        const upAxis = new THREE.Vector3(0, 1, 0);

        const isTreePixel = (x, y) => {
            const i = (y * imgW + x) * 4;
            const a = this.terrainManager.treesData[i + 3];
            const brightness = (this.terrainManager.treesData[i] + this.terrainManager.treesData[i + 1] + this.terrainManager.treesData[i + 2]) / 3;

            if (a < 10) return false;
            return brightness > 200;
        };

        // Collect all valid tree pixels, then shuffle & sample to avoid row/grid placement
        const validPixels = [];
        for (let y = 0; y < imgH; y++) {
            for (let x = 0; x < imgW; x++) {
                if (isTreePixel(x, y)) validPixels.push({ x, y });
            }
        }

        // Shuffle Fisher-Yates
        for (let i = validPixels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = validPixels[i];
            validPixels[i] = validPixels[j];
            validPixels[j] = tmp;
        }

        if (!window.treeColliders) window.treeColliders = [];

        const maxToPlace = Math.min(maxTrees, validPixels.length);
        for (let idx = 0; idx < maxToPlace; idx++) {
            const px = validPixels[idx].x;
            const py = validPixels[idx].y;

            // Add small random jitter to scatter trees within the pixel area
            const jitterX = (Math.random() - 0.5) * (terrainSize / imgW);
            const jitterZ = (Math.random() - 0.5) * (terrainSize / imgH);

            const worldX = ((px + 0.5) / imgW) * terrainSize - terrainSize / 2 + jitterX;
            const worldZ = ((py + 0.5) / imgH) * terrainSize - terrainSize / 2 + jitterZ;
            const terrainY = this.terrainManager.getTerrainHeightAt({ x: worldX, z: worldZ });

            // Increase tree sizes by ~75% on average for taller trees
            const baseScale = 0.7 + Math.random() * 0.6; // previous range
            const scale = baseScale * 1.75;

            const rotationY = Math.random() * Math.PI * 2;
            const paletteIndex = Math.floor(Math.random() * foliageMaterials.length);
            const isNear = Math.hypot(worldX, worldZ) <= shadowDistance;

            position.set(worldX, terrainY, worldZ);
            quaternion.setFromAxisAngle(upAxis, rotationY);
            scaleVector.set(scale, scale, scale);
            treeMatrix.compose(position, quaternion, scaleVector);
            
            // Register for collision: the trunk is roughly a cylinder.
            // Cylinder base radius in prototype is 0.5, so collision radius is 0.5 * scale.
            window.treeColliders.push({ x: worldX, z: worldZ, radius: 0.5 * scale });

            const trunkIndex = isNear ? trunkNearCount : trunkFarCount;
            const treeIndex = isNear ? nearCounts[paletteIndex] : farCounts[paletteIndex];

            this.treeDataList.push({
                worldX,
                terrainY,
                worldZ,
                scale,
                rotationY,
                paletteIndex,
                isNear,
                trunkIndex,
                treeIndex,
                phase: worldX * 0.03 + worldZ * 0.03
            });

            if (isNear) {
                trunkMeshNear.setMatrixAt(trunkNearCount, treeMatrix);
                trunkNearCount += 1;
            } else {
                trunkMeshFar.setMatrixAt(trunkFarCount, treeMatrix);
                trunkFarCount += 1;
            }

            const targetFoliageMeshes = isNear ? foliageMeshesNear : foliageMeshesFar;
            for (let partIndex = 0; partIndex < foliageGeometries.length; partIndex++) {
                leafMatrix.multiplyMatrices(treeMatrix, foliageLocalMatrices[partIndex]);
                targetFoliageMeshes[paletteIndex][partIndex].setMatrixAt(treeIndex, leafMatrix);
            }
            if (isNear) nearCounts[paletteIndex] += 1;
            else farCounts[paletteIndex] += 1;

            treeCount++;
        }

        trunkMeshNear.count = trunkNearCount;
        trunkMeshFar.count = trunkFarCount;
        trunkMeshNear.instanceMatrix.needsUpdate = true;
        trunkMeshFar.instanceMatrix.needsUpdate = true;

        for (let materialIndex = 0; materialIndex < foliageMaterials.length; materialIndex++) {
            const nearCount = nearCounts[materialIndex];
            const farCount = farCounts[materialIndex];
            foliageMeshesNear[materialIndex].forEach((mesh) => {
                mesh.count = nearCount;
                mesh.instanceMatrix.needsUpdate = true;
            });
            foliageMeshesFar[materialIndex].forEach((mesh) => {
                mesh.count = farCount;
                mesh.instanceMatrix.needsUpdate = true;
            });
        }

        treeGroup.add(trunkMeshNear, trunkMeshFar);
        foliageMeshesNear.forEach((meshes) => meshes.forEach((mesh) => treeGroup.add(mesh)));
        foliageMeshesFar.forEach((meshes) => meshes.forEach((mesh) => treeGroup.add(mesh)));

        this.scene.add(treeGroup);
        window.treeGroup = treeGroup;

        if (onTreesCreated) {
            onTreesCreated();
        }

        console.log(`✅ Generated ${treeCount} trees from mask`);
    }

    updateTrees(time) {
        if (!this.treeDataList || this.treeDataList.length === 0) return;
        // Wind motion is subtle; update it at 20 Hz instead of every render
        // frame to reduce CPU work on lower-powered devices.
        if (time - this.lastTreeWindUpdate < 0.05) return;
        this.lastTreeWindUpdate = time;

        const count = this.treeDataList.length;
        for (let i = 0; i < count; i++) {
            const tree = this.treeDataList[i];
            // Distant trees are static already and do not need per-frame matrices.
            if (!tree.isNear) continue;
            const phase = tree.phase;

            // Multi-frequency gentle wind simulation
            const windX = Math.sin(time * 1.2 + phase) * 0.020 + Math.sin(time * 2.3 + phase * 1.7) * 0.008;
            const windZ = Math.cos(time * 0.95 + phase * 0.8) * 0.018 + Math.sin(time * 1.8 + phase * 2.1) * 0.007;

            _windPos.set(tree.worldX, tree.terrainY, tree.worldZ);
            _windEuler.set(windX, tree.rotationY, windZ, 'YXZ');
            _windQuaternion.setFromEuler(_windEuler);
            _windScale.set(tree.scale, tree.scale, tree.scale);
            _windTreeMatrix.compose(_windPos, _windQuaternion, _windScale);

            if (tree.isNear) {
                this.trunkMeshNear.setMatrixAt(tree.trunkIndex, _windTreeMatrix);
            } else {
                this.trunkMeshFar.setMatrixAt(tree.trunkIndex, _windTreeMatrix);
            }

            const targetFoliageMeshes = tree.isNear ? this.foliageMeshesNear : this.foliageMeshesFar;
            
            for (let partIndex = 0; partIndex < this.foliageLocalMatrices.length; partIndex++) {
                const flutterX = Math.sin(time * 2.7 + phase * 3.0 + partIndex * 1.4) * 0.004;
                const flutterZ = Math.cos(time * 2.1 + phase * 2.2 + partIndex * 1.1) * 0.004;
                _windFoliageEuler.set(flutterX, 0, flutterZ);
                _windFoliageRotated.makeRotationFromEuler(_windFoliageEuler);
                _windFoliageRotated.premultiply(this.foliageLocalMatrices[partIndex]);

                _windLeafMatrix.multiplyMatrices(_windTreeMatrix, _windFoliageRotated);
                targetFoliageMeshes[tree.paletteIndex][partIndex].setMatrixAt(tree.treeIndex, _windLeafMatrix);
            }
        }

        if (this.trunkMeshNear) this.trunkMeshNear.instanceMatrix.needsUpdate = true;
        if (this.trunkMeshFar) this.trunkMeshFar.instanceMatrix.needsUpdate = true;

        if (this.foliageMaterials && this.foliageGeometries) {
            for (let matIdx = 0; matIdx < this.foliageMaterials.length; matIdx++) {
                for (let partIdx = 0; partIdx < this.foliageGeometries.length; partIdx++) {
                    if (this.foliageMeshesNear && this.foliageMeshesNear[matIdx] && this.foliageMeshesNear[matIdx][partIdx]) {
                        this.foliageMeshesNear[matIdx][partIdx].instanceMatrix.needsUpdate = true;
                    }
                    if (this.foliageMeshesFar && this.foliageMeshesFar[matIdx] && this.foliageMeshesFar[matIdx][partIdx]) {
                        this.foliageMeshesFar[matIdx][partIdx].instanceMatrix.needsUpdate = true;
                    }
                }
            }
        }
    }
}

