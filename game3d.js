// 3D Game Logic using Three.js and Cannon.js

let camera, scene, renderer;
let world;
let timeStep = 1 / 60;
let meshes = [], bodies = [];
let robotBody, robotMesh;
let is3DGameActive = false;
let animationId3D;

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
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Grey buildings

    for (let i = 0; i < 40; i++) {
        // Random dimensions
        const width = 2 + Math.random() * 3;
        const height = 10 + Math.random() * 20; // Taller
        const depth = 2 + Math.random() * 3;

        // Position: Along the road (z-axis), displaced on x-axis
        const side = Math.random() > 0.5 ? 1 : -1;
        const xPos = side * (8 + Math.random() * 10); // 8-18 units from center
        const zPos = (Math.random() - 0.5) * 160; // Spread along road
        const yPos = height / 2; // Resting on ground

        // Three.js Mesh
        const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
        mesh.scale.set(width, height, depth);
        mesh.position.set(xPos, yPos, zPos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshes.push(mesh); // Store for potential updates

        // Cannon.js Body
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
        const body = new CANNON.Body({ mass: 0 }); // Static initiially
        body.addShape(shape);
        body.position.set(xPos, yPos, zPos);
        world.addBody(body);

        // Link mesh and body
        mesh.userData = { physicsBody: body };
        bodies.push(body);
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

    // Step Physics
    world.step(timeStep);

    // Sync Robot
    robotMesh.position.copy(robotBody.position);
    robotMesh.quaternion.copy(robotBody.quaternion);

    // Camera Follow (Smooth)
    camera.position.x += (robotMesh.position.x - camera.position.x) * 0.1;
    // Keep camera high and behind on Z
    camera.position.z = robotMesh.position.z + 15;
    camera.lookAt(robotMesh.position);

    renderer.render(scene, camera);
}
