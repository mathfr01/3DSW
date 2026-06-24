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

function cloneTreeModelWithTint(treeModel, foliageMaterial) {
    const tree = treeModel.clone(true);
    tree.traverse((child) => {
        if (child.isMesh && child.name === 'Foliage') {
            child.material = foliageMaterial;
        }
    });
    return tree;
}

export class EnvironmentManager {
    constructor(scene, terrainManager) {
        this.scene = scene;
        this.terrainManager = terrainManager;
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

        const roadMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // Black roads
            map: this.terrainManager.roadTexture,
            transparent: true,
            alphaTest: 0.8,
            side: THREE.DoubleSide
        });

        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
        roadMesh.rotation.x = Math.PI / 2; // Flip vertically

        window.roadMesh = roadMesh;
        this.scene.add(roadMesh);
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

        const treeGroup = new THREE.Group();

        const imgW = this.terrainManager.treesCanvas.width;
        const imgH = this.terrainManager.treesCanvas.height;
        const terrainSize = 1000;
        const maxTrees = 3000;
        const sampleRate = 12;
        let treeCount = 0;

        const { trunkGeometry, foliageGeometries, foliageLocalMatrices } = createTreePrototype();
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const foliageMaterials = Array.from({ length: 5 }, () => new THREE.MeshLambertMaterial({ color: getRandomTreeGreen() }));

        const trunkMeshNear = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, maxTrees);
        trunkMeshNear.castShadow = true;
        trunkMeshNear.receiveShadow = true;

        const trunkMeshFar = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, maxTrees);
        trunkMeshFar.castShadow = false;
        trunkMeshFar.receiveShadow = false;

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

        for (let y = 0; y < imgH; y += sampleRate) {
            for (let x = 0; x < imgW; x += sampleRate) {
                if (!isTreePixel(x, y)) continue;

                const worldX = ((x + 0.5) / imgW) * terrainSize - terrainSize / 2;
                const worldZ = ((y + 0.5) / imgH) * terrainSize - terrainSize / 2;
                const terrainY = this.terrainManager.getTerrainHeightAt({ x: worldX, z: worldZ });
                const scale = 0.7 + Math.random() * 0.6;
                const rotationY = Math.random() * Math.PI * 2;
                const paletteIndex = Math.floor(Math.random() * foliageMaterials.length);
                const isNear = Math.hypot(worldX, worldZ) <= shadowDistance;

                position.set(worldX, terrainY, worldZ);
                quaternion.setFromAxisAngle(upAxis, rotationY);
                scaleVector.set(scale, scale, scale);
                treeMatrix.compose(position, quaternion, scaleVector);

                if (isNear) {
                    trunkMeshNear.setMatrixAt(trunkNearCount, treeMatrix);
                    trunkNearCount += 1;
                } else {
                    trunkMeshFar.setMatrixAt(trunkFarCount, treeMatrix);
                    trunkFarCount += 1;
                }

                const targetFoliageMeshes = isNear ? foliageMeshesNear : foliageMeshesFar;
                const treeIndex = isNear ? nearCounts[paletteIndex] : farCounts[paletteIndex];
                for (let partIndex = 0; partIndex < foliageGeometries.length; partIndex++) {
                    leafMatrix.multiplyMatrices(treeMatrix, foliageLocalMatrices[partIndex]);
                    targetFoliageMeshes[paletteIndex][partIndex].setMatrixAt(treeIndex, leafMatrix);
                }
                if (isNear) nearCounts[paletteIndex] += 1;
                else farCounts[paletteIndex] += 1;

                treeCount++;
                if (treeCount >= maxTrees) break;
            }
            if (treeCount >= maxTrees) break;
        }

        const addTreeInstance = (worldX, worldZ, worldY) => {
            const scale = 0.8;
            const rotationY = Math.random() * Math.PI * 2;
            const paletteIndex = Math.floor(Math.random() * foliageMaterials.length);
            const isNear = Math.hypot(worldX, worldZ) <= shadowDistance;

            position.set(worldX, worldY, worldZ);
            quaternion.setFromAxisAngle(upAxis, rotationY);
            scaleVector.set(scale, scale, scale);
            treeMatrix.compose(position, quaternion, scaleVector);

            if (isNear) {
                trunkMeshNear.setMatrixAt(trunkNearCount, treeMatrix);
                trunkNearCount += 1;
            } else {
                trunkMeshFar.setMatrixAt(trunkFarCount, treeMatrix);
                trunkFarCount += 1;
            }

            const targetFoliageMeshes = isNear ? foliageMeshesNear : foliageMeshesFar;
            const treeIndex = isNear ? nearCounts[paletteIndex] : farCounts[paletteIndex];
            for (let partIndex = 0; partIndex < foliageGeometries.length; partIndex++) {
                leafMatrix.multiplyMatrices(treeMatrix, foliageLocalMatrices[partIndex]);
                targetFoliageMeshes[paletteIndex][partIndex].setMatrixAt(treeIndex, leafMatrix);
            }
            if (isNear) nearCounts[paletteIndex] += 1;
            else farCounts[paletteIndex] += 1;
            treeCount += 1;
        };

        addTreeInstance(199, -104, this.terrainManager.getTerrainHeightAt({ x: 199, z: -104 }));

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
}
