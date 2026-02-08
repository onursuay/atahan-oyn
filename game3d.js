// 3D Game Logic using Three.js and Cannon.js

let camera, scene, renderer;
let world;
let timeStep = 1 / 60;
let meshes = [], bodies = [];
let robotBody, robotMesh;
let is3DGameActive = false;
let animationId3D;
let projectiles = []; // Store active lasers
let particles = [];   // Store active particles
let buildingBlocks = []; // Store all building parts for collision checks
let cameraShake = { x: 0, y: 0, intensity: 0 }; // Camera shake state
let keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    e: false,
    r: false
};


function initializeCityLevel() {
    console.log("Initializing 3D City Level...");

    // 1. Cleanup Scene
    cleanup3DScene();

    // Stop 2D Game Loop if active
    if (window.cancelAnimationFrame && window.animationId) {
        window.cancelAnimationFrame(window.animationId);
    }

    // Hide 2D Canvas
    const canvas2D = document.querySelector('canvas');
    if (canvas2D) canvas2D.style.display = 'none';

    // Ensure UI container is visible (if needed for overlay)
    const uiContainer = document.getElementById('game-ui-container');
    if (uiContainer) uiContainer.style.display = 'block';

    is3DGameActive = true;

    // 2. Setup Three.js
    initThreeJS();

    // 3. Setup Cannon.js
    initCannonJS();

    // 4. Create Objects
    createGround();
    createBuildings();
    createRobot();

    // 5. Start Loop
    animate3D();
}

function cleanup3DScene() {
    is3DGameActive = false;
    if (animationId3D) window.cancelAnimationFrame(animationId3D);

    // Remove existing 3D canvas
    const oldCanvas = document.getElementById('three-canvas');
    if (oldCanvas) oldCanvas.remove();

    meshes = [];
    bodies = [];
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 10, 100);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 20); // Higher and further back
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.domElement.id = 'three-canvas';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1'; // Behind UI but above background?
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);
}

function initCannonJS() {
    world = new CANNON.World();
    world.gravity.set(0, -2, 0); // Low gravity (Anti-gravity feel)
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
}

function createGround() {
    // Three.js Ground (Road)
    const geometry = new THREE.PlaneGeometry(100, 200); // Long road
    const material = new THREE.MeshStandardMaterial({
        color: 0x333333,
        side: THREE.DoubleSide
    });
    const groundMesh = new THREE.Mesh(geometry, material);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Add Road Markings (Simple white stripes)
    const loader = new THREE.TextureLoader();
    // Since we don't have a texture file, let's use a canvas texture or simple geometries
    const stripeGeo = new THREE.PlaneGeometry(1, 4);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    for (let i = -90; i < 90; i += 10) {
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(0, 0.02, i); // Slightly above ground
        scene.add(stripe);
    }

    // Cannon.js Ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 }); // Static
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);
}

function createBuildings() {
    // Grid Layout Settings
    const gridSize = 5; // 5x5 grid
    const spacing = 15; // Distance between centers
    const roadWidth = 8; // Define a clear road in the middle (z-axis)

    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            // Skip center path for the robot (Road)
            if (x === 0) continue;

            const xPos = x * spacing;
            const zPos = z * spacing;

            createFracturableBuilding(xPos, zPos);
        }
    }
}

function createFracturableBuilding(x, z) {
    const floorHeight = 4;
    const numFloors = 3 + Math.floor(Math.random() * 4); // 3 to 6 floors
    const buildingWidth = 5;
    const buildingDepth = 5;

    // Building Group (for logic if needed, but we treat blocks individually now)
    const buildingColor = Math.random() > 0.5 ? 0x808080 : 0x505050;

    for (let i = 0; i < numFloors; i++) {
        const yPos = (i * floorHeight) + (floorHeight / 2);

        // Visual Mesh
        const geometry = new THREE.BoxGeometry(buildingWidth, floorHeight, buildingDepth);
        const material = new THREE.MeshStandardMaterial({
            color: buildingColor,
            roughness: 0.7,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, yPos, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add "Windows" texture simulation (simple scaling or extra geometry could go here)
        // For now, keeping it simple blocks

        scene.add(mesh);
        meshes.push(mesh);

        // Physics Body
        const shape = new CANNON.Box(new CANNON.Vec3(buildingWidth / 2, floorHeight / 2, buildingDepth / 2));

        // Start as Static (mass 0) -> "Fracture" will make it Dynamic
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
        body.position.set(x, yPos, z);
        world.addBody(body);

        bodies.push(body);

        // Link for updates and collision
        mesh.userData = {
            physicsBody: body,
            isBuildingBlock: true,
            health: 20 // Health per block
        };

        // Add to block list for raycasting/collision
        buildingBlocks.push({ mesh, body });
    }
}


function createRobot() {
    // Placeholder Robot (Cylinder or Box)
    const width = 1;
    const height = 2;
    const depth = 1;

    // Three.js
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0xFF0000 }); // Red Robot
    robotMesh = new THREE.Mesh(geometry, material);
    robotMesh.castShadow = true;
    scene.add(robotMesh);

    // Cannon.js
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    robotBody = new CANNON.Body({ mass: 5 }); // Dynamic
    robotBody.addShape(shape);
    robotBody.position.set(0, 5, 0); // Drop from sky
    robotBody.linearDamping = 0.5; // Drag
    robotBody.fixedRotation = true; // Prevents tipping and rotation
    // robotBody.updateMassProperties(); // Already done by fixedRotation usually
    world.addBody(robotBody);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate3D() {
    if (!is3DGameActive) return;

    animationId3D = requestAnimationFrame(animate3D);

    // Input Handling for Lasers and Movement (Basic)
    handleInput();

    // Update Projectiles
    updateProjectiles();

    // Update Particles
    updateParticles();

    // Step Physics
    world.step(timeStep);

    // Sync Robot
    if (robotBody && robotMesh) {
        robotMesh.position.copy(robotBody.position);
        // Force rotation to be zero (facing forward)
        robotBody.quaternion.set(0, 0, 0, 1);
        robotMesh.quaternion.copy(robotBody.quaternion);
    }

    // Sync other objects (buildings when they fall)
    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        if (mesh.userData.physicsBody) {
            // Only update if the body is dynamic (mass > 0) to save processing for static buildings
            if (mesh.userData.physicsBody.mass > 0) {
                mesh.position.copy(mesh.userData.physicsBody.position);
                mesh.quaternion.copy(mesh.userData.physicsBody.quaternion);
            }
        }
    }

    // Camera Follow & Shake
    if (robotMesh) {
        // Soft follow
        const targetX = robotMesh.position.x;
        const targetZ = robotMesh.position.z + 15;

        camera.position.x += (targetX - camera.position.x) * 0.1;
        camera.position.z += (targetZ - camera.position.z) * 0.1;
        camera.position.y = 10; // Keep height steady

        // Add Shake
        if (cameraShake.intensity > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShake.intensity;
            camera.position.y += (Math.random() - 0.5) * cameraShake.intensity;
            camera.position.z += (Math.random() - 0.5) * cameraShake.intensity;
            cameraShake.intensity *= 0.9; // Decay
            if (cameraShake.intensity < 0.1) cameraShake.intensity = 0;
        }

        camera.lookAt(robotMesh.position);
    }

    renderer.render(scene, camera);
}

// --- New Mechanics ---

function handleInput() {
    if (!robotBody) return;

    // Immobilization Check (E or R)
    if (keys.e || keys.r) {
        robotBody.velocity.set(0, robotBody.velocity.y, 0);
        // Keep vertical velocity (gravity) but stop horizontal movement
        return;
    }

    const moveSpeed = 15;

    // Reset velocities (optional, or rely on damping)
    // For "strafe" feel, we set velocity directly or apply impulses

    if (keys.w) robotBody.velocity.z = -moveSpeed;
    if (keys.s) robotBody.velocity.z = moveSpeed;

    // Strict Backward Limit: If S is NOT pressed, Z velocity cannot be positive (backward)
    // In our coordinate system, -Z is Forward, +Z is Backward.
    if (!keys.s && robotBody.velocity.z > 0) {
        robotBody.velocity.z = 0;
    }

    if (!keys.w && !keys.s) robotBody.velocity.z *= 0.9; // Extra damping when release

    if (keys.a) robotBody.velocity.x = -moveSpeed;
    if (keys.d) robotBody.velocity.x = moveSpeed;
    if (!keys.a && !keys.d) robotBody.velocity.x *= 0.9;
}

// Add Key Listeners for smooth movement
window.addEventListener('keydown', (e) => {
    if (!is3DGameActive) return;

    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }

    // E and R are disabled as per request (nothing triggers)
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
    }
});

function shootLaser(side) {
    if (!robotBody) return;

    // Recoil
    const recoilForce = 2; // Slight loose
    // robotBody.applyLocalImpulse(new CANNON.Vec3(0, 0, recoilForce), new CANNON.Vec3(0, 0, 0));
    // Simplified recoil:
    robotBody.velocity.z += 2; // Push back

    // Camera Shake
    cameraShake.intensity = 0.5;

    // Laser Origin
    // Assuming robot is approx 1 unit wide. Right is -x or +x depending on logic.
    // Let's say Right is +X, Left is -X relative to robot.
    const offsetSide = side === 'right' ? 1.2 : -1.2;
    const origin = new CANNON.Vec3(
        robotBody.position.x + offsetSide,
        robotBody.position.y,
        robotBody.position.z - 1 // Slightly in front
    );

    // Create Laser Visuals
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
    geometry.rotateX(-Math.PI / 2); // Point forward
    const material = new THREE.MeshBasicMaterial({ color: side === 'right' ? 0xFF0000 : 0x00FF00 }); // Red/Green lasers
    const laserMesh = new THREE.Mesh(geometry, material);
    laserMesh.position.copy(origin);
    scene.add(laserMesh);

    // Physics Projectile (Sensor/Kinematic or just fast dynamic)
    const shape = new CANNON.Sphere(0.2);
    const body = new CANNON.Body({ mass: 0.1 });
    body.addShape(shape);
    body.position.copy(origin);
    body.velocity.set(0, 0, -100); // Fast forward (assuming -Z is forward)
    body.linearDamping = 0;
    world.addBody(body);

    // Store for update
    projectiles.push({ mesh: laserMesh, body: body, life: 60 }); // 60 frames life

    // Collision Logic (Simple Raycast style or actual collision listener)
    body.addEventListener("collide", (e) => {
        // Handle collision with buildings
        // Check if e.body is a building block
        const targetMesh = meshes.find(m => m.userData.physicsBody === e.body);
        if (targetMesh && targetMesh.userData.isBuildingBlock) {
            damageBlock(targetMesh);
        }

        // Destroy laser on impact (next frame)
        // We handle this in updateProjectiles by setting life to 0
    });
}

function damageBlock(mesh) {
    const data = mesh.userData;
    data.health -= 10;

    // Flash color
    const originalColor = mesh.material.color.getHex();
    mesh.material.color.setHex(0xFFFFFF);
    setTimeout(() => {
        if (mesh) mesh.material.color.setHex(originalColor);
    }, 50);

    createParticles(mesh.position);

    if (data.health <= 0) {
        // "Fracture" / Collapse
        // Make dynamic
        if (data.physicsBody.type === CANNON.Body.STATIC || data.physicsBody.mass === 0) {
            data.physicsBody.mass = 50;
            data.physicsBody.type = CANNON.Body.DYNAMIC;
            data.physicsBody.updateMassProperties();
            data.physicsBody.wakeUp();

            // Add some random force to simulate structural failure
            data.physicsBody.applyLocalImpulse(
                new CANNON.Vec3((Math.random() - 0.5) * 10, Math.random() * 10, (Math.random() - 0.5) * 10),
                new CANNON.Vec3(0, 0, 0)
            );
        }

        // Darken color to show "destroyed" state
        mesh.material.color.setHex(0x333333);

        // More camera shake on collapse
        cameraShake.intensity = 1.0;
    }
}

function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life--;

        // Sync Mesh
        p.mesh.position.copy(p.body.position);
        p.mesh.quaternion.copy(p.body.quaternion);

        if (p.life <= 0) {
            // Remove
            scene.remove(p.mesh);
            world.removeBody(p.body);
            projectiles.splice(i, 1);
        }
    }
}

function createParticles(pos) {
    // Simple explosion dust
    const count = 5;
    for (let i = 0; i < count; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xAAAAAA });
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.copy(pos);
        mesh.position.x += (Math.random() - 0.5) * 2;
        mesh.position.y += (Math.random() - 0.5) * 2;

        scene.add(mesh);

        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );

        particles.push({ mesh, vel, life: 30 });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life--;
        p.mesh.position.add(p.vel);
        p.mesh.rotation.x += 0.1;
        p.mesh.scale.multiplyScalar(0.95); // Shrink

        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

