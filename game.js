// ============================================
// CITY SMASH - Game Logic
// ============================================

// Canvas setup with devicePixelRatio support
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Debug overlay state
let showDebug = false;

// Set canvas size to match window with proper pixel ratio
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Set display size (CSS pixels) - use viewport dimensions directly
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    // Set internal size (actual pixels) - use Math.floor for crisp rendering
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    // Reset transform and scale context to handle device pixel ratio
    // This allows us to use CSS pixel coordinates for all drawing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Regenerate city and background on resize
    if (buildings.length > 0) {
        initBackground();
        generateCity();
    }
}

// Initialize canvas on load
function initCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 100);
    });
}

// Toggle debug overlay with 'D' key
document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
        showDebug = !showDebug;
    }
});

// ============================================
// Game State
// ============================================

let buildings = [];
let particles = [];
let explosions = [];
let bombs = [];
let lasers = [];
let tornados = [];
let stickyBombs = [];
let robotHandLasers = [];
let meteors = [];
let fireEmitters = [];
let fireParticles = [];
let buildingDebris = []; // Small falling debris from damaged buildings
let microDebris = []; // Micro-debris (chips/panels from stage transitions)
let dustParticles = []; // Dust cloud particles
let voxelBits = []; // Square chunks from UFO tractor voxelization
let bridgeDebris = []; // Bridge material chunks
let robotMissiles = []; // Robot guided missiles
let waterWaves = null; // Water wave simulation (City 2)
let screenShake = { x: 0, y: 0, intensity: 0 };
let isDestroying = false;
let currentWeapon = 'meteor';
let robot = null;
let screenFlash = { active: false, intensity: 0 };
let currentCityId = 1; // 1, 2, or 3
let staticStructures = []; // Bridge, billboards, etc.
let sunsetBackgroundCache = null; // Cached sunset background
let cloudLayersCache = { far: null, mid: null, near: null }; // Cached cloud layers
let pointerPosition = { x: 0, y: 0 }; // Pointer position for robot laser aim
let pointerActive = false; // Whether pointer is active
let mouseButtonHeld = false; // Whether mouse button is held down (for continuous laser)
let ufo = null; // UFO object
let ufoHandLasers = []; // UFO laser beams
let ufoControls = {
    left: false,
    right: false,
    up: false,
    down: false,
    laser: false,
    tractor: false,
    invisibility: false // Toggle state for O key
};
let ufoDrawerOpen = false; // UFO library drawer state
let ufoVariant = null; // Current UFO variant: null (not selected), 'scout', 'destroyer', 'harvester'
let ufoVariantSelected = false; // Whether user has explicitly selected a variant

// Performance limits
const MAX_PARTICLES = 1500;
const MAX_BOMBS = 50;
const MAX_TORNADOS = 3;
const MAX_STICKY_BOMBS_ACTIVE = 200; // Performance threshold for active rendering
const MAX_METEORS = 5;
const MAX_FIRE_PARTICLES = 400;
const MAX_BUILDING_DEBRIS = 400; // Cap for small falling debris
const MAX_MICRO_DEBRIS = 200; // Cap for micro-debris (chips/panels)
const MAX_DUST_PARTICLES = 150; // Cap for dust cloud particles
const MAX_VOXEL_BITS = 800; // Cap for voxel square chunks from UFO tractor
const MAX_VOXEL_SPAWNS_PER_SECOND = 120; // Rate limit for voxel spawns
const MAX_BRIDGE_DEBRIS = 300; // Cap for bridge debris chunks
const MAX_MISSILE_PARTICLES = 50; // Cap for missile trail particles
const MAX_WATER_POINTS = 140; // Cap for water wave points

// Robot control state
let robotControls = {
    left: false,
    right: false,
    jump: false,
    jumpHeld: false,
    punch: false,
    laser: false,
    missile: false, // O key for missile launch
    leftArmFire: false, // T key
    rightArmFire: false // R key
};

// ============================================
// Web Audio Music System
// ============================================

let audioContext = null;
let musicEnabled = false;
let musicStarted = false;
let musicOscillators = [];

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Web Audio API not supported');
    }
}

function startMusic() {
    if (!audioContext || musicStarted || !musicEnabled) return;

    try {
        musicStarted = true;

        // Bass line (low frequency)
        const bassOsc = audioContext.createOscillator();
        const bassGain = audioContext.createGain();
        bassOsc.type = 'square';
        bassOsc.frequency.value = 110; // A2
        bassGain.gain.value = 0.15;
        bassOsc.connect(bassGain);
        bassGain.connect(audioContext.destination);

        // Lead arpeggio
        const leadOsc = audioContext.createOscillator();
        const leadGain = audioContext.createGain();
        leadOsc.type = 'sawtooth';
        leadOsc.frequency.value = 440; // A4
        leadGain.gain.value = 0.1;
        leadOsc.connect(leadGain);
        leadGain.connect(audioContext.destination);

        // Percussion (noise)
        const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }

        const noiseSource = audioContext.createBufferSource();
        const noiseGain = audioContext.createGain();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        noiseGain.gain.value = 0.05;
        noiseSource.connect(noiseGain);
        noiseGain.connect(audioContext.destination);

        bassOsc.start();
        leadOsc.start();
        noiseSource.start();

        musicOscillators = [bassOsc, leadOsc, noiseSource];

        // Simple pattern: change frequencies periodically
        let patternStep = 0;
        const patternInterval = setInterval(() => {
            if (!musicEnabled) {
                clearInterval(patternInterval);
                return;
            }

            patternStep++;
            const notes = [110, 130, 147, 165]; // A2, C3, D3, E3
            bassOsc.frequency.value = notes[patternStep % notes.length];

            const leadNotes = [440, 523, 587, 659]; // A4, C5, D5, E5
            leadOsc.frequency.value = leadNotes[patternStep % leadNotes.length];
        }, 300);

    } catch (e) {
        console.log('Music start failed:', e);
        musicStarted = false;
    }
}

function stopMusic() {
    musicOscillators.forEach(osc => {
        try {
            osc.stop();
        } catch (e) { }
    });
    musicOscillators = [];
    musicStarted = false;
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    const musicBtn = document.getElementById('musicBtn');
    musicBtn.textContent = musicEnabled ? 'Music: On' : 'Music: Off';

    if (musicEnabled && !musicStarted) {
        // Start music on first user interaction
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        startMusic();
    } else if (!musicEnabled) {
        stopMusic();
    }
}

// Initialize audio on first user interaction
let audioInitialized = false;
function initAudioOnInteraction() {
    if (audioInitialized) return;
    audioInitialized = true;
    initAudio();

    // Enable music button
    document.getElementById('musicBtn').addEventListener('click', () => {
        if (!musicStarted && !musicEnabled) {
            toggleMusic();
        } else {
            toggleMusic();
        }
    });
}

// ============================================
// Level Manager (Manages Game Flow and Spawning)
// ============================================

const LevelManager = {
    spawnPoint: { x: 0, y: 0 }, // Will be set on init
    isInitialized: false,

    init: function () {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Set spawn point to center of screen, on ground
        this.spawnPoint = {
            x: width / 2,
            y: groundY - 50 // Slightly above ground
        };

        this.isInitialized = true;
        console.log("LevelManager Initialized. Spawn Point:", this.spawnPoint);
    },

    spawnRobotAtStart: function () {
        if (!this.isInitialized) this.init();

        // Clear existing robot
        robot = null;

        // Create new robot at spawn point
        robot = new Robot(this.spawnPoint.x, this.spawnPoint.y);

        // Ensure robot mode is active
        currentWeapon = 'robot';

        // Update UI
        const weaponButtons = document.querySelectorAll('.weapon-btn');
        weaponButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.weapon === 'robot') {
                btn.classList.add('active');
            }
        });

        const robotControlsUI = document.getElementById('robotControls');
        if (robotControlsUI) robotControlsUI.style.display = 'flex';

        console.log("Robot spawned at Level Start Point");
    }
};

// ============================================
// Weapon Selection UI
// ============================================

function initWeaponUI() {
    const weaponButtons = document.querySelectorAll('.weapon-btn');
    const hintText = document.getElementById('hintText');
    const robotControlsUI = document.getElementById('robotControls');
    const detonateBtn = document.getElementById('detonateBtn');

    weaponButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const weapon = btn.dataset.weapon;
            currentWeapon = weapon;

            // Update active state
            weaponButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update hint text
            if (weapon === 'robot') {
                hintText.textContent = 'Move with controls, R/T for Arm Lasers';
                robotControlsUI.style.display = 'flex';
                detonateBtn.style.display = 'none';
                // Reset laser firing when switching to robot mode
                if (robot) {
                    robot.laserFiring = false;
                }
                mouseButtonHeld = false;
            } else if (weapon === 'sticky') {
                // Stop laser firing when switching away from robot mode
                if (robot) {
                    robot.laserFiring = false;
                }
                mouseButtonHeld = false;
                hintText.textContent = 'Tap to place bomb, then detonate';
                robotControlsUI.style.display = 'none';
                updateDetonateButton();
            } else {
                hintText.textContent = 'Tap anywhere to strike';
                robotControlsUI.style.display = 'none';
                detonateBtn.style.display = 'none';
            }

            // Spawn robot if switching to robot mode (ALWAYS spawn)
            if (weapon === 'robot') {
                // Use LevelManager to spawn
                LevelManager.spawnRobotAtStart();
            }

            // Handle UFO mode: open drawer to select variant
            if (weapon === 'ufo') {
                // Open UFO drawer to select variant (don't spawn immediately)
                openUFODrawer();
                // Only spawn UFO if variant was explicitly selected, otherwise wait for selection
                if (ufoVariantSelected && ufoVariant) {
                    if (!ufo) {
                        spawnUFO();
                    }
                }
            } else {
                // Close drawer when switching away from UFO
                closeUFODrawer();
            }

            // Update UI visibility
            const robotControlsUI = document.getElementById('robotControls');
            const ufoControlsUI = document.getElementById('ufoControls');
            if (weapon === 'robot') {
                robotControlsUI.style.display = 'flex';
                ufoControlsUI.style.display = 'none';
            } else if (weapon === 'ufo') {
                robotControlsUI.style.display = 'none';
                ufoControlsUI.style.display = 'flex';
            } else {
                robotControlsUI.style.display = 'none';
                ufoControlsUI.style.display = 'none';
            }

            // Reset laser/tractor/invisibility states when switching away
            if (weapon !== 'ufo') {
                ufoControls.laser = false;
                ufoControls.tractor = false;
                ufoControls.invisibility = false;
                if (ufo) {
                    ufo.laserActive = false;
                    ufo.tractorActive = false;
                    ufo.invisible = false;
                }
            }

            // Update hint text
            if (weapon === 'ufo') {
                hintText.textContent = 'UFO: Hold E=Laser, Hold F=Tractor, O=Stealth';
                updateStealthIndicator();
            } else {
                const stealthIndicator = document.getElementById('ufoStealthIndicator');
                if (stealthIndicator) {
                    stealthIndicator.style.display = 'none';
                }
            }
        });
    });

    // Detonate button handler
    detonateBtn.addEventListener('click', () => {
        detonateAllStickyBombs();
    });

    // UFO drawer variant selection
    initUFODrawer();
}

function initUFODrawer() {
    const drawer = document.getElementById('ufoDrawer');
    const variantCards = drawer.querySelectorAll('.variant-card');

    variantCards.forEach(card => {
        card.addEventListener('click', () => {
            const variant = card.dataset.variant;
            selectUFOVariant(variant);
            closeUFODrawer();
        });
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
        if (ufoDrawerOpen && drawer && !drawer.contains(e.target)) {
            const ufoBtn = document.getElementById('weaponUfo');
            if (ufoBtn && !ufoBtn.contains(e.target)) {
                closeUFODrawer();
            }
        }
    });
}

function openUFODrawer() {
    const drawer = document.getElementById('ufoDrawer');
    if (drawer) {
        drawer.style.display = 'block';
        ufoDrawerOpen = true;

        // Highlight selected variant
        const variantCards = drawer.querySelectorAll('.variant-card');
        variantCards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.variant === ufoVariant) {
                card.classList.add('selected');
            }
        });
    }
}

function closeUFODrawer() {
    const drawer = document.getElementById('ufoDrawer');
    if (drawer) {
        drawer.style.display = 'none';
        ufoDrawerOpen = false;
    }
}

function selectUFOVariant(variant) {
    ufoVariant = variant;
    ufoVariantSelected = true; // Mark that user has selected a variant

    // Spawn or update UFO with new variant
    if (!ufo) {
        spawnUFO();
    } else {
        ufo.variant = variant;
        ufo.updateVariantStats();
    }

    // Ensure UFO mode is active
    currentWeapon = 'ufo';
    const weaponButtons = document.querySelectorAll('.weapon-btn');
    weaponButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.weapon === 'ufo') {
            btn.classList.add('active');
        }
    });

    // Update UI
    const robotControlsUI = document.getElementById('robotControls');
    const ufoControlsUI = document.getElementById('ufoControls');
    if (robotControlsUI) robotControlsUI.style.display = 'none';
    if (ufoControlsUI) ufoControlsUI.style.display = 'flex';

    const hintText = document.getElementById('hintText');
    if (hintText) {
        hintText.textContent = 'UFO: Hold E=Laser, Hold F=Tractor, O=Stealth';
    }

    // Close drawer after selection
    closeUFODrawer();
}

function updateDetonateButton() {
    const detonateBtn = document.getElementById('detonateBtn');
    const count = stickyBombs.length;

    if (count > 0 && currentWeapon === 'sticky') {
        detonateBtn.style.display = 'block';
        detonateBtn.textContent = `Detonate (${count})`;
        detonateBtn.disabled = false;
    } else {
        detonateBtn.style.display = 'none';
        detonateBtn.disabled = true;
    }
}

function updateStealthIndicator() {
    const stealthIndicator = document.getElementById('ufoStealthIndicator');
    if (!stealthIndicator) return;

    if (currentWeapon === 'ufo' && ufo && ufo.invisible) {
        stealthIndicator.style.display = 'block';
    } else {
        stealthIndicator.style.display = 'none';
    }
}

// ============================================
// Building Class (NYC Glass Skyscraper)
// ============================================

class Building {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.maxHealth = 300 + Math.random() * 200; // 300-500 base health
        this.health = this.maxHealth;
        this.materialResistance = 0.7 + Math.random() * 0.6; // 0.7-1.3
        this.state = 'alive'; // 'alive' | 'collapsing' | 'collapsed'
        this.destroyed = false; // Legacy flag (set when collapsed)
        this.collapsing = false; // Legacy flag
        this.collapseProgress = 0;
        this.collapseStartTime = null; // Timestamp when collapse started
        this.collapseDuration = 900 + Math.random() * 700; // 900-1600ms
        this.lastDebrisSpawn = 0; // Last time debris was spawned during collapse
        this.debrisSpawnInterval = 100 + Math.random() * 80; // 100-180ms between bursts
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeDecay = 0.9;
        this.collapseTilt = 0; // Tilt angle during collapse
        this.collapseSink = 0; // Vertical compression during collapse
        this.damageStage = 0; // 0=100-76%, 1=75-51%, 2=50-21%, 3=20-1%
        this.previousDamageStage = 0; // Track stage changes
        this.crackCache = null; // Cached crack overlay canvas per damage stage
        this.impactScars = []; // Array of impact scar objects {x, y, radius, opacity}
        this.impactScarCache = null; // Cached impact scar overlay
        this.lastHitTime = 0; // For wobble/dust effects
        this.buildingId = Math.floor(Math.random() * 1000000); // Unique ID for deterministic effects

        // Voxel cutout grid for UFO tractor pixelation
        this.voxelCutouts = new Set(); // Set of strings like "x,y" representing removed voxel positions
        this.voxelGridSize = 10; // Size of each voxel square
        this.lastVoxelSpawnTime = 0; // Rate limiting for voxel spawns

        // Building style/material type
        const styleRoll = Math.random();
        if (styleRoll < 0.4) {
            this.buildingStyle = 'glass'; // 40% glass towers
        } else if (styleRoll < 0.7) {
            this.buildingStyle = 'brick'; // 30% brick/stone
        } else {
            this.buildingStyle = 'concrete'; // 30% concrete office
        }

        // Glass colors (cool blues/teals) - only for glass buildings
        const glassColors = [
            { top: '#4a7a9a', mid: '#3a6a8a', bottom: '#2a5a7a' }, // Blue-gray
            { top: '#5a8a9a', mid: '#4a7a8a', bottom: '#3a6a7a' }, // Teal-blue
            { top: '#4a8a9a', mid: '#3a7a8a', bottom: '#2a6a7a' }, // Cyan-blue
            { top: '#5a7a9a', mid: '#4a6a8a', bottom: '#3a5a7a' }  // Steel-blue
        ];
        this.glassColor = glassColors[Math.floor(Math.random() * glassColors.length)];

        // Brick colors (warm gray/brown)
        const brickColors = [
            { base: '#7a6a5a', dark: '#6a5a4a', light: '#8a7a6a' }, // Brown-gray
            { base: '#6a5a4a', dark: '#5a4a3a', light: '#7a6a5a' }, // Dark brown
            { base: '#8a7a6a', dark: '#7a6a5a', light: '#9a8a7a' }  // Light brown
        ];
        this.brickColor = brickColors[Math.floor(Math.random() * brickColors.length)];

        // Concrete colors (neutral gray)
        const concreteColors = [
            { base: '#6a6a6a', dark: '#5a5a5a', light: '#7a7a7a' }, // Medium gray
            { base: '#5a5a5a', dark: '#4a4a4a', light: '#6a6a6a' }, // Dark gray
            { base: '#7a7a7a', dark: '#6a6a6a', light: '#8a8a8a' }  // Light gray
        ];
        this.concreteColor = concreteColors[Math.floor(Math.random() * concreteColors.length)];

        // Architectural features
        this.hasSetback = Math.random() > 0.7;
        this.setbackHeight = this.hasSetback ? Math.random() * 0.15 + 0.1 : 0; // 10-25% of height
        this.hasAntenna = Math.random() < 0.3; // 30% have antennas
        this.antennaHeight = this.hasAntenna ? Math.random() * 25 + 15 : 0;
        this.hasRooftopBox = Math.random() > 0.5;
        this.rooftopBoxSize = Math.random() * 15 + 10;

        // Window grid configuration (subtle lines)
        this.windowCols = Math.max(3, Math.floor(this.width / 8));
        this.windowRows = Math.max(5, Math.floor(this.height / 12));

        // Reflection bands (only for glass buildings)
        this.reflectionBands = [];
        if (this.buildingStyle === 'glass') {
            const bandCount = Math.floor(Math.random() * 3) + 2; // 2-4 bands
            for (let i = 0; i < bandCount; i++) {
                this.reflectionBands.push({
                    x: Math.random() * this.width,
                    angle: (Math.random() - 0.5) * Math.PI / 6, // Slight diagonal
                    width: Math.random() * 20 + 15,
                    opacity: Math.random() * 0.3 + 0.2
                });
            }
        }

        // Pre-render building to offscreen canvas
        this.renderCache = null;
        this.cacheDirty = true;
        this.buildRenderCache();
    }

    buildRenderCache() {
        const cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = this.width;
        cacheCanvas.height = this.height;
        const cacheCtx = cacheCanvas.getContext('2d');

        if (this.buildingStyle === 'glass') {
            // Glass tower rendering
            const gradient = cacheCtx.createLinearGradient(0, 0, 0, this.height);
            gradient.addColorStop(0, this.glassColor.top);
            gradient.addColorStop(0.5, this.glassColor.mid);
            gradient.addColorStop(1, this.glassColor.bottom);

            cacheCtx.fillStyle = gradient;
            cacheCtx.fillRect(0, 0, this.width, this.height);

            // Side depth gradient - REMOVED: no gray overlays
            // Only subtle white highlight on left edge for depth (no darkening)
            const sideGradient = cacheCtx.createLinearGradient(0, 0, this.width * 0.3, 0);
            sideGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
            sideGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cacheCtx.fillStyle = sideGradient;
            cacheCtx.fillRect(0, 0, this.width * 0.3, this.height);

            // Draw setback (tiered top)
            if (this.hasSetback) {
                const setbackY = this.height * this.setbackHeight;
                const setbackWidth = this.width * 0.7;
                const setbackX = (this.width - setbackWidth) / 2;
                cacheCtx.fillStyle = this.glassColor.top;
                cacheCtx.fillRect(setbackX, 0, setbackWidth, setbackY);
            }

            // Window grid (subtle lines)
            cacheCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            cacheCtx.lineWidth = 0.5;
            const colSpacing = this.width / this.windowCols;
            for (let i = 1; i < this.windowCols; i++) {
                const x = i * colSpacing;
                cacheCtx.beginPath();
                cacheCtx.moveTo(x, 0);
                cacheCtx.lineTo(x, this.height);
                cacheCtx.stroke();
            }
            const rowSpacing = this.height / this.windowRows;
            for (let i = 1; i < this.windowRows; i++) {
                const y = i * rowSpacing;
                cacheCtx.beginPath();
                cacheCtx.moveTo(0, y);
                cacheCtx.lineTo(this.width, y);
                cacheCtx.stroke();
            }

            // Reflection bands (only for glass)
            this.reflectionBands.forEach(band => {
                cacheCtx.save();
                cacheCtx.translate(band.x, 0);
                cacheCtx.rotate(band.angle);
                const reflectionGradient = cacheCtx.createLinearGradient(-band.width / 2, 0, band.width / 2, 0);
                reflectionGradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
                reflectionGradient.addColorStop(0.5, `rgba(255, 255, 255, ${band.opacity})`);
                reflectionGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
                cacheCtx.fillStyle = reflectionGradient;
                cacheCtx.fillRect(-band.width / 2, 0, band.width, this.height);
                cacheCtx.restore();
            });
        } else if (this.buildingStyle === 'brick') {
            // Brick/stone building rendering
            const gradient = cacheCtx.createLinearGradient(0, 0, 0, this.height);
            gradient.addColorStop(0, this.brickColor.light);
            gradient.addColorStop(0.5, this.brickColor.base);
            gradient.addColorStop(1, this.brickColor.dark);

            cacheCtx.fillStyle = gradient;
            cacheCtx.fillRect(0, 0, this.width, this.height);

            // Side depth - REMOVED: no gray overlays
            // Only subtle white highlight on left edge for depth (no darkening)
            const sideGradient = cacheCtx.createLinearGradient(0, 0, this.width * 0.3, 0);
            sideGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
            sideGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cacheCtx.fillStyle = sideGradient;
            cacheCtx.fillRect(0, 0, this.width * 0.3, this.height);

            // Brick texture (subtle horizontal lines)
            cacheCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            cacheCtx.lineWidth = 1;
            const brickRowHeight = 8;
            for (let y = 0; y < this.height; y += brickRowHeight) {
                cacheCtx.beginPath();
                cacheCtx.moveTo(0, y);
                cacheCtx.lineTo(this.width, y);
                cacheCtx.stroke();
            }

            // Simple windows (rectangles)
            const winCols = Math.max(2, Math.floor(this.width / 20));
            const winRows = Math.max(3, Math.floor(this.height / 25));
            const winSpacingX = this.width / (winCols + 1);
            const winSpacingY = this.height / (winRows + 1);

            for (let row = 0; row < winRows; row++) {
                for (let col = 0; col < winCols; col++) {
                    const winX = winSpacingX * (col + 1) - 4;
                    const winY = winSpacingY * (row + 1) - 5;
                    const winW = 6;
                    const winH = 8;

                    // Window frame
                    cacheCtx.fillStyle = '#2a2a2a';
                    cacheCtx.fillRect(winX, winY, winW, winH);

                    // Window light
                    cacheCtx.fillStyle = 'rgba(255, 255, 200, 0.4)';
                    cacheCtx.fillRect(winX + 1, winY + 1, winW - 2, winH - 2);
                }
            }
        } else {
            // Concrete office building
            const gradient = cacheCtx.createLinearGradient(0, 0, 0, this.height);
            gradient.addColorStop(0, this.concreteColor.light);
            gradient.addColorStop(0.5, this.concreteColor.base);
            gradient.addColorStop(1, this.concreteColor.dark);

            cacheCtx.fillStyle = gradient;
            cacheCtx.fillRect(0, 0, this.width, this.height);

            // Side depth - REMOVED: no gray overlays
            // Only subtle white highlight on left edge for depth (no darkening)
            const sideGradient = cacheCtx.createLinearGradient(0, 0, this.width * 0.3, 0);
            sideGradient.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
            sideGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            cacheCtx.fillStyle = sideGradient;
            cacheCtx.fillRect(0, 0, this.width * 0.3, this.height);

            // Grid windows (concrete office style)
            cacheCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            cacheCtx.lineWidth = 1;
            const gridCols = Math.max(3, Math.floor(this.width / 12));
            const gridRows = Math.max(5, Math.floor(this.height / 15));

            // Vertical lines
            const colSpacing = this.width / gridCols;
            for (let i = 1; i < gridCols; i++) {
                const x = i * colSpacing;
                cacheCtx.beginPath();
                cacheCtx.moveTo(x, 0);
                cacheCtx.lineTo(x, this.height);
                cacheCtx.stroke();
            }

            // Horizontal lines
            const rowSpacing = this.height / gridRows;
            for (let i = 1; i < gridRows; i++) {
                const y = i * rowSpacing;
                cacheCtx.beginPath();
                cacheCtx.moveTo(0, y);
                cacheCtx.lineTo(this.width, y);
                cacheCtx.stroke();
            }

            // Window panes (alternating brightness)
            for (let row = 0; row < gridRows; row++) {
                for (let col = 0; col < gridCols; col++) {
                    const paneX = col * colSpacing + 1;
                    const paneY = row * rowSpacing + 1;
                    const paneW = colSpacing - 2;
                    const paneH = rowSpacing - 2;

                    const brightness = (row + col) % 2 === 0 ? 0.3 : 0.5;
                    cacheCtx.fillStyle = `rgba(200, 200, 255, ${brightness})`;
                    cacheCtx.fillRect(paneX, paneY, paneW, paneH);
                }
            }
        }

        // Draw rooftop mechanical box
        if (this.hasRooftopBox) {
            const boxX = (this.width - this.rooftopBoxSize) / 2;
            const boxY = -this.rooftopBoxSize;
            cacheCtx.fillStyle = '#2a2a2a';
            cacheCtx.fillRect(boxX, boxY, this.rooftopBoxSize, this.rooftopBoxSize);
            cacheCtx.strokeStyle = '#1a1a1a';
            cacheCtx.lineWidth = 1;
            cacheCtx.strokeRect(boxX, boxY, this.rooftopBoxSize, this.rooftopBoxSize);
        }

        // Draw antenna (on some buildings)
        if (this.hasAntenna) {
            const antennaY = -this.antennaHeight;
            cacheCtx.strokeStyle = '#4a4a4a';
            cacheCtx.lineWidth = 2;
            cacheCtx.beginPath();
            cacheCtx.moveTo(this.width / 2, 0);
            cacheCtx.lineTo(this.width / 2, antennaY);
            cacheCtx.stroke();

            // Antenna tip with small light
            cacheCtx.fillStyle = '#6a6a6a';
            cacheCtx.beginPath();
            cacheCtx.arc(this.width / 2, antennaY, 2, 0, Math.PI * 2);
            cacheCtx.fill();

            // Small blinking light
            cacheCtx.fillStyle = '#ffff00';
            cacheCtx.beginPath();
            cacheCtx.arc(this.width / 2, antennaY - 3, 1.5, 0, Math.PI * 2);
            cacheCtx.fill();
        }

        this.renderCache = cacheCanvas;
        this.cacheDirty = false;
    }

    adjustBrightness(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + percent));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
        return `rgb(${r},${g},${b})`;
    }

    // Get center point
    getCenterX() {
        return this.x + this.width / 2;
    }

    getCenterY() {
        return this.y + this.height / 2;
    }

    // Check if point is inside building
    contains(x, y) {
        return x >= this.x && x <= this.x + this.width &&
            y >= this.y && y <= this.y + this.height;
    }

    // Check if rectangle intersects building
    intersects(rectX, rectY, rectW, rectH) {
        return rectX < this.x + this.width &&
            rectX + rectW > this.x &&
            rectY < this.y + this.height &&
            rectY + rectH > this.y;
    }

    // Take damage from explosion (with resistance and non-linear falloff)
    takeDamage(damage, distance = 0, maxDistance = 150) {
        if (this.destroyed) return;

        // Apply material resistance
        const adjustedDamage = damage * this.materialResistance;

        // Non-linear falloff (cubed for aggressive reduction)
        let finalDamage = adjustedDamage;
        if (distance > 0 && maxDistance > 0) {
            const normalizedDist = Math.min(1, distance / maxDistance);
            const falloff = Math.pow(1 - normalizedDist, 3);
            finalDamage = adjustedDamage * falloff;
        }

        this.health -= finalDamage;

        // Update damage stage (0=100-76%, 1=75-51%, 2=50-21%, 3=20-1%)
        const healthPercent = this.health / this.maxHealth;
        this.previousDamageStage = this.damageStage;

        if (healthPercent <= 0) {
            this.damageStage = 3; // Will collapse
        } else if (healthPercent <= 0.20) {
            this.damageStage = 3; // 20-1%
        } else if (healthPercent <= 0.50) {
            this.damageStage = 2; // 50-21%
        } else if (healthPercent <= 0.75) {
            this.damageStage = 1; // 75-51%
        } else {
            this.damageStage = 0; // 100-76%
        }

        // Check if damage stage increased (crossed threshold)
        if (this.damageStage > this.previousDamageStage && this.damageStage > 0) {
            // Spawn micro-debris burst when crossing into new damage stage
            this.spawnMicroDebrisBurst();
            // Spawn dust cloud at base for heavy damage
            if (this.damageStage >= 2) {
                this.spawnDustCloud();
            }
            // Invalidate caches to regenerate with new stage
            this.crackCache = null;
            this.impactScarCache = null;
        }

        // Add impact scar at hit location
        if (distance > 0 && distance < maxDistance) {
            // Calculate impact point (approximate)
            const impactX = this.x + this.width / 2 + (Math.random() - 0.5) * this.width * 0.3;
            const impactY = this.y + this.height * 0.3 + (Math.random() - 0.5) * this.height * 0.4;
            this.addImpactScar(impactX - this.x, impactY - this.y, Math.min(15, maxDistance * 0.1));
        }

        // Add wobble and dust on hit
        const currentTime = Date.now();
        if (currentTime - this.lastHitTime > 100) { // Rate limit
            this.applyShake(2 + this.damageStage * 1.5);
            this.spawnDustPuff(distance > 0 ? distance : this.width / 2);
            this.lastHitTime = currentTime;
        }

        if (this.health <= 0) {
            this.health = 0;
            // Start staged collapse if not already collapsing
            if (this.state === 'alive') {
                this.startCollapse();
            }
        }
    }

    addImpactScar(localX, localY, radius) {
        // Add impact scar (relative to building position)
        this.impactScars.push({
            x: localX,
            y: localY,
            radius: radius,
            opacity: 0.6
        });
        // Invalidate impact scar cache
        this.impactScarCache = null;
    }

    spawnMicroDebrisBurst() {
        // Spawn micro-debris (chips/panels) when damage stage increases
        const debrisCount = 4 + this.damageStage * 3; // 4, 7, 10, 13 pieces

        for (let i = 0; i < debrisCount; i++) {
            if (microDebris.length >= MAX_MICRO_DEBRIS) break;

            // Random spawn position on building
            const spawnX = this.x + Math.random() * this.width;
            const spawnY = this.y + Math.random() * this.height * 0.6; // Upper/mid section

            // Very small debris size (micro)
            const debrisW = Math.random() * 2 + 1;
            const debrisH = Math.random() * 2 + 1;

            // Initial velocity (slight outward + downward)
            const angle = (Math.random() - 0.5) * Math.PI * 0.4;
            const speed = 0.5 + Math.random() * 1.5;
            const velocityX = Math.sin(angle) * speed;
            const velocityY = Math.cos(angle) * speed + 0.5;

            // Choose color based on building style
            let debrisColor;
            if (this.buildingStyle === 'glass') {
                debrisColor = Math.random() < 0.5 ? this.glassColor.mid : '#2a3a4a';
            } else if (this.buildingStyle === 'brick') {
                debrisColor = Math.random() < 0.5 ? this.brickColor.base : '#4a3a2a';
            } else {
                debrisColor = Math.random() < 0.5 ? this.concreteColor.base : '#3a3a3a';
            }

            // Add 3D properties
            const initialZ = (Math.random() - 0.5) * 80;
            const initialVz = (Math.random() - 0.5) * 0.3;

            microDebris.push(new MicroDebris(
                spawnX, spawnY,
                debrisW, debrisH,
                debrisColor,
                velocityX, velocityY,
                initialZ,
                initialVz
            ));
        }
    }

    spawnDustCloud() {
        // Spawn dust cloud at building base
        const baseX = this.x + this.width / 2;
        const baseY = this.y + this.height;
        const dustCount = 8 + this.damageStage * 4; // 8, 12, 16 particles

        for (let i = 0; i < dustCount; i++) {
            if (dustParticles.length >= MAX_DUST_PARTICLES) break;

            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 15;
            const spawnX = baseX + Math.cos(angle) * distance;
            const spawnY = baseY + Math.sin(angle) * distance;

            dustParticles.push(new DustParticle(
                spawnX, spawnY,
                Math.random() * 3 + 2, // size
                Math.cos(angle) * (0.3 + Math.random() * 0.5), // vx
                -Math.abs(Math.sin(angle)) * (0.5 + Math.random() * 1) - 0.3 // vy (upward)
            ));
        }
    }

    spawnDustPuff(impactDistance) {
        // Spawn small dust particles at impact point
        const impactX = this.x + this.width / 2 + (Math.random() - 0.5) * impactDistance;
        const impactY = this.y + Math.random() * this.height * 0.6; // Upper/mid section

        const dustCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < dustCount; i++) {
            if (buildingDebris.length >= MAX_BUILDING_DEBRIS) break;

            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1;
            const dustW = Math.random() * 2 + 1;
            const dustH = dustW;

            // Add 3D properties for dust
            const initialZ = (Math.random() - 0.5) * 50;
            const initialVz = (Math.random() - 0.5) * 0.2;

            // Use material color for dust, not gray
            let dustColor;
            if (this.buildingStyle === 'glass') {
                dustColor = `rgba(${parseInt(this.glassColor.mid.substr(1, 2), 16)}, ${parseInt(this.glassColor.mid.substr(3, 2), 16)}, ${parseInt(this.glassColor.mid.substr(5, 2), 16)}, 0.5)`;
            } else if (this.buildingStyle === 'brick') {
                dustColor = `rgba(${parseInt(this.brickColor.base.substr(1, 2), 16)}, ${parseInt(this.brickColor.base.substr(3, 2), 16)}, ${parseInt(this.brickColor.base.substr(5, 2), 16)}, 0.5)`;
            } else {
                dustColor = `rgba(${parseInt(this.concreteColor.base.substr(1, 2), 16)}, ${parseInt(this.concreteColor.base.substr(3, 2), 16)}, ${parseInt(this.concreteColor.base.substr(5, 2), 16)}, 0.5)`;
            }

            buildingDebris.push(new BuildingDebris(
                impactX, impactY,
                dustW, dustH,
                dustColor,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 0.5,
                initialZ,
                initialVz
            ));
        }
    }

    buildImpactScarCache() {
        // Build cached impact scar overlay
        if (this.impactScars.length === 0) {
            this.impactScarCache = null;
            return;
        }

        const cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = this.width;
        cacheCanvas.height = this.height;
        const cacheCtx = cacheCanvas.getContext('2d');

        this.impactScars.forEach(scar => {
            // REMOVED: No darkened patch overlay - only crack lines
            // Get material color for crack lines
            let baseR, baseG, baseB;
            if (this.buildingStyle === 'glass') {
                const colorStr = this.glassColor.mid;
                baseR = parseInt(colorStr.substr(1, 2), 16);
                baseG = parseInt(colorStr.substr(3, 2), 16);
                baseB = parseInt(colorStr.substr(5, 2), 16);
            } else if (this.buildingStyle === 'brick') {
                const colorStr = this.brickColor.base;
                baseR = parseInt(colorStr.substr(1, 2), 16);
                baseG = parseInt(colorStr.substr(3, 2), 16);
                baseB = parseInt(colorStr.substr(5, 2), 16);
            } else {
                const colorStr = this.concreteColor.base;
                baseR = parseInt(colorStr.substr(1, 2), 16);
                baseG = parseInt(colorStr.substr(3, 2), 16);
                baseB = parseInt(colorStr.substr(5, 2), 16);
            }

            // Radial crack lines only - use material color, not gray
            cacheCtx.strokeStyle = `rgba(${Math.floor(baseR * 0.7)}, ${Math.floor(baseG * 0.7)}, ${Math.floor(baseB * 0.7)}, 0.5)`;
            cacheCtx.lineWidth = 1;
            const crackCount = 4 + Math.floor(Math.random() * 3);
            for (let i = 0; i < crackCount; i++) {
                const angle = (Math.PI * 2 * i) / crackCount + Math.random() * 0.3;
                const length = scar.radius * (0.6 + Math.random() * 0.4);
                cacheCtx.beginPath();
                cacheCtx.moveTo(scar.x, scar.y);
                cacheCtx.lineTo(scar.x + Math.cos(angle) * length, scar.y + Math.sin(angle) * length);
                cacheCtx.stroke();
            }
        });

        this.impactScarCache = cacheCanvas;
    }

    buildCrackCache() {
        // Build cached crack overlay for current damage stage (progressive and very visible)
        if (this.damageStage === 0) {
            this.crackCache = null;
            return;
        }

        const cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = this.width;
        cacheCanvas.height = this.height;
        const cacheCtx = cacheCanvas.getContext('2d');

        if (this.buildingStyle === 'glass') {
            // Glass: spiderweb cracks + missing panels (progressive)
            // Stage 1: small hairline cracks
            // Stage 2: more cracks, thicker, more branching
            // Stage 3: severe cracks + missing panels

            const baseOpacity = 0.4 + this.damageStage * 0.2;
            const lineWidth = 0.5 + this.damageStage * 0.5;

            // NO gray tint - use glass color with slight darkening
            const glassR = parseInt(this.glassColor.mid.substr(1, 2), 16);
            const glassG = parseInt(this.glassColor.mid.substr(3, 2), 16);
            const glassB = parseInt(this.glassColor.mid.substr(5, 2), 16);
            cacheCtx.strokeStyle = `rgba(${Math.floor(glassR * 0.85)}, ${Math.floor(glassG * 0.85)}, ${Math.floor(glassB * 0.85)}, ${baseOpacity})`;
            cacheCtx.lineWidth = lineWidth;

            // Crack count increases with stage
            const crackCount = this.damageStage; // 1, 2, 3 cracks
            for (let i = 0; i < crackCount; i++) {
                const impactX = Math.random() * this.width;
                const impactY = Math.random() * this.height;

                // Branch count increases with stage
                const branchCount = 3 + this.damageStage * 2; // 5, 7, 9 branches
                for (let j = 0; j < branchCount; j++) {
                    const angle = (Math.PI * 2 * j) / branchCount + Math.random() * 0.6;
                    const length = Math.random() * Math.min(this.width, this.height) * (0.2 + this.damageStage * 0.15) + 20;
                    const endX = impactX + Math.cos(angle) * length;
                    const endY = impactY + Math.sin(angle) * length;

                    cacheCtx.beginPath();
                    cacheCtx.moveTo(impactX, impactY);
                    cacheCtx.lineTo(endX, endY);
                    cacheCtx.stroke();

                    // Sub-branches for stage 2+
                    if (this.damageStage >= 2) {
                        const subBranches = this.damageStage === 2 ? 1 : 2; // 1 for stage 2, 2 for stage 3
                        for (let k = 0; k < subBranches; k++) {
                            const subAngle = angle + (Math.random() - 0.5) * 1.0;
                            const subLength = length * (0.4 + Math.random() * 0.3);
                            cacheCtx.beginPath();
                            cacheCtx.moveTo(impactX, impactY);
                            cacheCtx.lineTo(impactX + Math.cos(subAngle) * subLength, impactY + Math.sin(subAngle) * subLength);
                            cacheCtx.stroke();
                        }
                    }
                }
            }

            // Missing glass panels (stage 3) + subtle diagonal reflection breaks
            if (this.damageStage >= 3) {
                const panelCount = 2 + Math.floor(Math.random() * 3); // 2-4 panels
                for (let i = 0; i < panelCount; i++) {
                    const panelX = Math.random() * this.width;
                    const panelY = Math.random() * this.height;
                    const panelW = Math.random() * 10 + 5;
                    const panelH = Math.random() * 15 + 8;
                    // NO gray - use slightly darkened glass color
                    cacheCtx.fillStyle = `rgba(${Math.floor(glassR * 0.4)}, ${Math.floor(glassG * 0.45)}, ${Math.floor(glassB * 0.5)}, 0.6)`;
                    cacheCtx.fillRect(panelX, panelY, panelW, panelH);
                }

                // Subtle diagonal reflection breaks - use glass color
                cacheCtx.strokeStyle = `rgba(${Math.floor(glassR * 0.6)}, ${Math.floor(glassG * 0.6)}, ${Math.floor(glassB * 0.6)}, 0.3)`;
                cacheCtx.lineWidth = 1;
                for (let i = 0; i < 2; i++) {
                    const startX = Math.random() * this.width;
                    const startY = Math.random() * this.height;
                    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3;
                    const length = Math.random() * 30 + 20;
                    cacheCtx.beginPath();
                    cacheCtx.moveTo(startX, startY);
                    cacheCtx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
                    cacheCtx.stroke();
                }
            }
        } else {
            // Brick/concrete: jagged diagonal/vertical cracks + chipped corners (progressive)
            // Stage 1: small hairline cracks
            // Stage 2: more cracks, thicker
            // Stage 3: severe cracks + chipped corners

            const baseOpacity = 0.4 + this.damageStage * 0.12; // Reduced opacity
            const lineWidth = 1 + this.damageStage; // 2, 3, 4px

            // NO gray tint - use material color with slight darkening
            let materialR, materialG, materialB;
            if (this.buildingStyle === 'brick') {
                materialR = parseInt(this.brickColor.base.substr(1, 2), 16);
                materialG = parseInt(this.brickColor.base.substr(3, 2), 16);
                materialB = parseInt(this.brickColor.base.substr(5, 2), 16);
            } else {
                materialR = parseInt(this.concreteColor.base.substr(1, 2), 16);
                materialG = parseInt(this.concreteColor.base.substr(3, 2), 16);
                materialB = parseInt(this.concreteColor.base.substr(5, 2), 16);
            }
            cacheCtx.strokeStyle = `rgba(${Math.floor(materialR * 0.75)}, ${Math.floor(materialG * 0.75)}, ${Math.floor(materialB * 0.75)}, ${baseOpacity})`;
            cacheCtx.lineWidth = lineWidth;

            // Crack count increases with stage
            const crackCount = this.damageStage * 2 + 1; // 3, 5, 7 cracks
            for (let i = 0; i < crackCount; i++) {
                const startX = Math.random() * this.width;
                const startY = Math.random() * this.height * 0.3;
                const endY = this.height;

                cacheCtx.beginPath();
                cacheCtx.moveTo(startX, startY);
                // Jagged path with more steps for higher stages
                const steps = 3 + this.damageStage * 2; // 5, 7, 9 steps
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const y = startY + (endY - startY) * t;
                    const x = startX + (Math.random() - 0.5) * (4 + this.damageStage * 3);
                    cacheCtx.lineTo(x, y);
                }
                cacheCtx.stroke();
            }

            // Chipped corners (stage 2+) + dust puffs visualization
            if (this.damageStage >= 2) {
                // NO gray - use material color with slight darkening
                cacheCtx.fillStyle = `rgba(${Math.floor(materialR * 0.6)}, ${Math.floor(materialG * 0.6)}, ${Math.floor(materialB * 0.6)}, ${0.4 + (this.damageStage - 2) * 0.15})`;
                const chipCount = this.damageStage; // 2 or 3 chips
                for (let i = 0; i < chipCount; i++) {
                    const edge = Math.floor(Math.random() * 4);
                    let chipX, chipY, chipW, chipH;
                    if (edge === 0) {
                        chipX = Math.random() * this.width;
                        chipY = 0;
                        chipW = Math.random() * 8 + 4;
                        chipH = Math.random() * 5 + 3;
                    } else if (edge === 1) {
                        chipX = this.width - Math.random() * 5 - 2;
                        chipY = Math.random() * this.height;
                        chipW = Math.random() * 5 + 3;
                        chipH = Math.random() * 8 + 4;
                    } else if (edge === 2) {
                        chipX = Math.random() * this.width;
                        chipY = this.height - Math.random() * 5 - 2;
                        chipW = Math.random() * 8 + 4;
                        chipH = Math.random() * 5 + 3;
                    } else {
                        chipX = 0;
                        chipY = Math.random() * this.height;
                        chipW = Math.random() * 5 + 3;
                        chipH = Math.random() * 8 + 4;
                    }
                    cacheCtx.fillRect(chipX, chipY, chipW, chipH);
                }

                // Dust puff indicators (small circles at base) - use material color, not gray
                if (this.damageStage >= 2) {
                    cacheCtx.fillStyle = `rgba(${Math.floor(materialR * 0.7)}, ${Math.floor(materialG * 0.7)}, ${Math.floor(materialB * 0.7)}, 0.3)`;
                    const puffCount = this.damageStage;
                    for (let i = 0; i < puffCount; i++) {
                        const puffX = Math.random() * this.width;
                        const puffY = this.height - 5;
                        cacheCtx.beginPath();
                        cacheCtx.arc(puffX, puffY, 3 + Math.random() * 2, 0, Math.PI * 2);
                        cacheCtx.fill();
                    }
                }
            }
        }

        this.crackCache = cacheCanvas;
    }

    startCollapse() {
        // Start staged collapse animation
        if (this.state !== 'alive') return;

        this.state = 'collapsing';
        this.collapseStartTime = Date.now();
        this.lastDebrisSpawn = Date.now();
        this.collapseTilt = (Math.random() - 0.5) * 0.1; // Initial tilt direction
        this.collapseSink = 0;

        // Detach any sticky bombs attached to this building
        stickyBombs.forEach(bomb => {
            if (bomb.attachedBuildingRef === this) {
                bomb.attachedTo = null;
                bomb.attachedBuildingRef = null;
                bomb.velocityY = 0;
            }
        });
    }

    updateCollapse() {
        // Update collapse animation and spawn progressive debris
        if (this.state !== 'collapsing') return;

        const now = Date.now();
        const elapsed = now - this.collapseStartTime;
        const progress = Math.min(1, elapsed / this.collapseDuration);

        // Visual deformation: tilt and sink
        this.collapseTilt += (Math.random() - 0.5) * 0.02 * progress; // Increasing wobble
        this.collapseTilt = Math.max(-0.3, Math.min(0.3, this.collapseTilt)); // Clamp tilt
        this.collapseSink = progress * this.height * 0.15; // Sink up to 15% of height

        // Intensify cracks (invalidate cache to regenerate)
        if (this.damageStage < 3) {
            this.damageStage = 3;
            this.crackCache = null;
        }

        // Progressive debris spawning (every 100-180ms from lower half)
        if (now - this.lastDebrisSpawn >= this.debrisSpawnInterval) {
            this.spawnCollapseDebrisBurst(progress);
            this.lastDebrisSpawn = now;
        }

        // Apply shake during collapse
        this.shakeX = (Math.random() - 0.5) * 3 * (1 - progress);
        this.shakeY = (Math.random() - 0.5) * 3 * (1 - progress);

        // End collapse
        if (progress >= 1) {
            this.state = 'collapsed';
            this.destroyed = true;
            this.collapsing = false;
            // Final debris burst
            this.spawnFinalCollapseDebris();
        }
    }

    spawnCollapseDebrisBurst(progress) {
        // Spawn debris from lower half (like floors giving way)
        // Fewer pieces but larger on average
        const lowerHalfStart = this.y + this.height * 0.5;
        const lowerHalfEnd = this.y + this.height;
        const burstCount = 2 + Math.floor(progress * 4); // 2-6 pieces per burst (reduced from 3-8)

        for (let i = 0; i < burstCount; i++) {
            if (particles.length >= MAX_PARTICLES) break;

            const px = this.x + Math.random() * this.width;
            const py = lowerHalfStart + Math.random() * (lowerHalfEnd - lowerHalfStart);

            // Spawn material-aware debris
            if (this.buildingStyle === 'glass') {
                this.spawnGlassShard(px, py, progress);
            } else {
                this.spawnBrickConcreteDebris(px, py, progress);
            }
        }
    }

    spawnGlassShard(x, y, collapseProgress) {
        // Spawn glass shard (larger pieces: mix of shards and big panels)
        const shardType = Math.random();
        let shardW, shardH;

        if (shardType < 0.4) {
            // 40%: Large glass panels (bigger rectangles)
            const isVertical = Math.random() > 0.5;
            shardW = isVertical ? Math.random() * 3 + 2 : Math.random() * 12 + 8;
            shardH = isVertical ? Math.random() * 12 + 8 : Math.random() * 3 + 2;
        } else {
            // 60%: Medium shards (still visible but not tiny)
            const isVertical = Math.random() > 0.5;
            shardW = isVertical ? Math.random() * 2 + 1 : Math.random() * 8 + 4;
            shardH = isVertical ? Math.random() * 8 + 4 : Math.random() * 2 + 1;
        }

        // High initial velocity, light weight, lots of rotation
        const angle = (Math.random() - 0.5) * Math.PI;
        const speed = 4 + Math.random() * 4 + collapseProgress * 3;
        const velocityX = Math.cos(angle) * speed;
        const velocityY = Math.sin(angle) * speed - 1;

        // Glass shard colors: cyan/blue/white highlights
        const colorRoll = Math.random();
        let shardColor;
        if (colorRoll < 0.3) {
            shardColor = '#88ccff'; // Cyan
        } else if (colorRoll < 0.6) {
            shardColor = '#4a90e2'; // Blue
        } else if (colorRoll < 0.8) {
            shardColor = '#aaccff'; // Light blue
        } else {
            shardColor = '#ffffff'; // White highlight
        }

        const initialZ = (Math.random() - 0.5) * 150;
        const initialVz = (Math.random() - 0.5) * 0.8;

        particles.push(new GlassShard(
            x, y,
            shardW, shardH,
            shardColor,
            velocityX, velocityY,
            initialZ,
            initialVz
        ));
    }

    spawnBrickConcreteDebris(x, y, collapseProgress) {
        // Spawn larger chunky debris for brick/concrete (dominant larger chunks)
        const sizeType = Math.random();
        let chunkW, chunkH;

        if (sizeType < 0.3) {
            // 30%: Large chunks
            chunkW = Math.random() * 8 + 10;
            chunkH = Math.random() * 8 + 10;
        } else if (sizeType < 0.7) {
            // 40%: Medium-large chunks
            chunkW = Math.random() * 6 + 7;
            chunkH = Math.random() * 6 + 7;
        } else {
            // 30%: Medium chunks (still bigger than before)
            chunkW = Math.random() * 5 + 6;
            chunkH = Math.random() * 5 + 6;
        }

        const angle = (Math.random() - 0.5) * Math.PI * 0.6;
        const speed = 3 + Math.random() * 3 + collapseProgress * 2;
        const velocityX = Math.cos(angle) * speed;
        const velocityY = Math.sin(angle) * speed - 0.5;

        let chunkColor;
        if (this.buildingStyle === 'brick') {
            chunkColor = Math.random() < 0.5 ? this.brickColor.base : this.brickColor.dark;
        } else {
            chunkColor = Math.random() < 0.5 ? this.concreteColor.base : this.concreteColor.dark;
        }

        const initialZ = (Math.random() - 0.5) * 120;
        const initialVz = (Math.random() - 0.5) * 0.6;

        particles.push(new Particle(
            x, y,
            chunkW, chunkH,
            chunkColor,
            velocityX, velocityY,
            initialZ,
            initialVz
        ));

        // Spawn dust puff occasionally
        if (Math.random() < 0.3) {
            const dustX = x + (Math.random() - 0.5) * 10;
            const dustY = y + (Math.random() - 0.5) * 10;
            for (let i = 0; i < 3; i++) {
                if (dustParticles.length >= MAX_DUST_PARTICLES) break;
                const angle = Math.random() * Math.PI * 2;
                dustParticles.push(new DustParticle(
                    dustX, dustY,
                    Math.random() * 3 + 2,
                    Math.cos(angle) * (0.3 + Math.random() * 0.5),
                    Math.sin(angle) * (0.3 + Math.random() * 0.5) - 0.3
                ));
            }
        }
    }

    spawnFinalCollapseDebris() {
        // Final debris burst when collapse completes
        // Fewer pieces overall but larger size on average
        const buildingArea = this.width * this.height;
        const basePieceCount = 30; // Reduced from 40
        const maxPieceCount = 60; // Reduced from 80
        const pieceCount = Math.min(maxPieceCount, basePieceCount + Math.floor(buildingArea / 800)); // Adjusted divisor

        const availableSlots = MAX_PARTICLES - particles.length;
        const actualPieceCount = Math.min(pieceCount, Math.floor(availableSlots * 0.7));

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // Material-aware final debris
        if (this.buildingStyle === 'glass') {
            // Glass: mix of large panels and shards (more large panels)
            const shardCount = Math.floor(actualPieceCount * 0.5); // Reduced from 0.7
            const chunkCount = actualPieceCount - shardCount;

            for (let i = 0; i < shardCount; i++) {
                if (particles.length >= MAX_PARTICLES) break;
                const px = this.x + Math.random() * this.width;
                const py = this.y + Math.random() * this.height;
                this.spawnGlassShard(px, py, 1.0);
            }

            for (let i = 0; i < chunkCount; i++) {
                if (particles.length >= MAX_PARTICLES) break;
                const px = this.x + Math.random() * this.width;
                const py = this.y + Math.random() * this.height;
                const angle = Math.atan2(py - centerY, px - centerX) + (Math.random() - 0.5) * 0.5;
                const impulse = 3 + Math.random() * 4;
                const velocityX = Math.cos(angle) * impulse;
                const velocityY = Math.sin(angle) * impulse - 1;

                // Larger chunks for glass
                const sizeType = Math.random();
                let chunkW, chunkH;
                if (sizeType < 0.4) {
                    chunkW = Math.random() * 6 + 8; // Large
                    chunkH = Math.random() * 6 + 8;
                } else {
                    chunkW = Math.random() * 5 + 6; // Medium-large
                    chunkH = Math.random() * 5 + 6;
                }
                const chunkColor = Math.random() < 0.5 ? this.glassColor.mid : this.glassColor.bottom;

                const initialZ = (Math.random() - 0.5) * 100;
                const initialVz = (Math.random() - 0.5) * 0.5;

                particles.push(new Particle(
                    px, py, chunkW, chunkH, chunkColor,
                    velocityX, velocityY, initialZ, initialVz
                ));
            }
        } else {
            // Brick/concrete: larger chunky debris (dominant)
            for (let i = 0; i < actualPieceCount; i++) {
                if (particles.length >= MAX_PARTICLES) break;
                const px = this.x + Math.random() * this.width;
                const py = this.y + Math.random() * this.height;
                this.spawnBrickConcreteDebris(px, py, 1.0);
            }
        }

        // Create fire emitters
        const fireCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < fireCount; i++) {
            const fx = this.x + Math.random() * this.width;
            const fy = this.y + Math.random() * this.height * 0.5;
            fireEmitters.push(new FireEmitter(fx, fy));
        }
    }

    // Legacy destroy method (now handled by startCollapse/updateCollapse)
    destroy() {
        // This is now called only for final cleanup
        if (this.state === 'collapsed') return;
        this.startCollapse();
    }

    // Apply shake effect
    applyShake(intensity) {
        this.shakeX = (Math.random() - 0.5) * intensity;
        this.shakeY = (Math.random() - 0.5) * intensity;
    }

    // Update shake decay and spawn occasional debris for level 2+
    update() {
        // Update collapse animation if collapsing
        if (this.state === 'collapsing') {
            this.updateCollapse();
            return; // Skip normal update during collapse
        }

        this.shakeX *= this.shakeDecay;
        this.shakeY *= this.shakeDecay;

        // Spawn occasional falling debris for damage level 2+ (partial break-off)
        if (this.damageStage >= 2 && Math.random() < 0.02) { // 2% chance per frame
            if (buildingDebris.length < MAX_BUILDING_DEBRIS) {
                const spawnX = this.x + Math.random() * this.width;
                const spawnY = this.y + Math.random() * this.height * 0.5; // Upper half

                const debrisW = Math.random() * 4 + 3;
                const debrisH = Math.random() * 4 + 3;

                let debrisColor;
                if (this.buildingStyle === 'glass') {
                    debrisColor = Math.random() < 0.5 ? this.glassColor.mid : '#2a3a4a';
                } else if (this.buildingStyle === 'brick') {
                    debrisColor = Math.random() < 0.5 ? this.brickColor.base : '#4a3a2a';
                } else {
                    debrisColor = Math.random() < 0.5 ? this.concreteColor.base : '#3a3a3a';
                }

                // Add 3D properties for occasional debris
                const initialZ = (Math.random() - 0.5) * 100;
                const initialVz = (Math.random() - 0.5) * 0.4;

                buildingDebris.push(new BuildingDebris(
                    spawnX, spawnY,
                    debrisW, debrisH,
                    debrisColor,
                    (Math.random() - 0.5) * 1,
                    1 + Math.random() * 2,
                    initialZ,
                    initialVz
                ));
            }
        }
    }

    // Render building with realistic appearance
    render() {
        if (this.state === 'collapsed') return; // Don't render collapsed buildings

        let drawX = this.x + this.shakeX + screenShake.x;
        let drawY = this.y + this.shakeY + screenShake.y;

        // Apply collapse deformation
        if (this.state === 'collapsing') {
            ctx.save();
            const centerX = drawX + this.width / 2;
            const centerY = drawY + this.height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(this.collapseTilt);
            ctx.translate(-centerX, -centerY);
            drawY += this.collapseSink; // Apply vertical compression
        }

        // Draw pre-rendered building with voxel cutouts
        if (this.renderCache && !this.cacheDirty) {
            // If there are voxel cutouts, we need to draw with cutouts
            if (this.voxelCutouts.size > 0) {
                // Draw building, then erase cutout regions
                ctx.save();
                ctx.drawImage(this.renderCache, drawX, drawY);

                // Erase voxel cutouts (draw transparent rectangles)
                ctx.globalCompositeOperation = 'destination-out';
                this.voxelCutouts.forEach(key => {
                    const [gridX, gridY] = key.split(',').map(Number);
                    const cutoutX = drawX + gridX * this.voxelGridSize;
                    const cutoutY = drawY + gridY * this.voxelGridSize;
                    ctx.fillRect(cutoutX, cutoutY, this.voxelGridSize, this.voxelGridSize);
                });
                ctx.restore();
            } else {
                ctx.drawImage(this.renderCache, drawX, drawY);
            }
        } else {
            // Fallback if cache not ready
            ctx.fillStyle = this.baseColor;
            ctx.fillRect(drawX, drawY, this.width, this.height);

            // Draw cutouts if any
            if (this.voxelCutouts.size > 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                this.voxelCutouts.forEach(key => {
                    const [gridX, gridY] = key.split(',').map(Number);
                    const cutoutX = drawX + gridX * this.voxelGridSize;
                    const cutoutY = drawY + gridY * this.voxelGridSize;
                    ctx.fillRect(cutoutX, cutoutY, this.voxelGridSize, this.voxelGridSize);
                });
                ctx.restore();
            }
        }

        // Draw cached impact scars (under cracks)
        if (this.impactScars.length > 0) {
            if (!this.impactScarCache) {
                this.buildImpactScarCache();
            }
            if (this.impactScarCache) {
                ctx.drawImage(this.impactScarCache, drawX, drawY);
            }
        }

        // Draw cached crack overlay (progressive stages)
        if (this.damageStage > 0) {
            if (!this.crackCache) {
                this.buildCrackCache();
            }
            if (this.crackCache) {
                ctx.drawImage(this.crackCache, drawX, drawY);
            }
        }

        // Legacy crack rendering (kept for compatibility, but now uses cache)
        if (false && this.damageStage > 0) {
            if (this.buildingStyle === 'glass') {
                // Glass: spiderweb cracks + missing panels
                // NO gray - use material color (legacy code, but keep consistent)
                const materialR = parseInt(this.glassColor.mid.substr(1, 2), 16);
                const materialG = parseInt(this.glassColor.mid.substr(3, 2), 16);
                const materialB = parseInt(this.glassColor.mid.substr(5, 2), 16);
                ctx.strokeStyle = `rgba(${Math.floor(materialR * 0.6)}, ${Math.floor(materialG * 0.6)}, ${Math.floor(materialB * 0.6)}, ${0.4 + this.crackLevel * 0.2})`;
                ctx.lineWidth = 1;

                const crackCount = this.crackLevel + 1;
                for (let i = 0; i < crackCount; i++) {
                    const impactX = drawX + Math.random() * this.width;
                    const impactY = drawY + Math.random() * this.height;

                    const branchCount = 3 + this.crackLevel;
                    for (let j = 0; j < branchCount; j++) {
                        const angle = (Math.PI * 2 * j) / branchCount + Math.random() * 0.5;
                        const length = Math.random() * Math.min(this.width, this.height) * 0.4 + 20;
                        const endX = impactX + Math.cos(angle) * length;
                        const endY = impactY + Math.sin(angle) * length;

                        ctx.beginPath();
                        ctx.moveTo(impactX, impactY);
                        ctx.lineTo(endX, endY);
                        ctx.stroke();

                        if (this.crackLevel >= 2) {
                            const subAngle = angle + (Math.random() - 0.5) * 0.8;
                            const subLength = length * 0.5;
                            ctx.beginPath();
                            ctx.moveTo(impactX, impactY);
                            ctx.lineTo(impactX + Math.cos(subAngle) * subLength, impactY + Math.sin(subAngle) * subLength);
                            ctx.stroke();
                        }
                    }
                }

                // Missing glass panels
                if (this.crackLevel >= 2) {
                    const panelCount = Math.floor(this.crackLevel * 1.5);
                    for (let i = 0; i < panelCount; i++) {
                        const panelX = drawX + Math.random() * this.width;
                        const panelY = drawY + Math.random() * this.height;
                        const panelW = Math.random() * 8 + 4;
                        const panelH = Math.random() * 12 + 6;
                        ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
                        ctx.fillRect(panelX, panelY, panelW, panelH);
                    }
                }
            } else {
                // Brick/concrete: vertical cracks + chipped edges
                ctx.strokeStyle = `rgba(0, 0, 0, ${0.5 + this.crackLevel * 0.2})`;
                ctx.lineWidth = 2;

                const crackCount = this.crackLevel * 2 + 1;
                for (let i = 0; i < crackCount; i++) {
                    const startX = drawX + Math.random() * this.width;
                    const startY = drawY + Math.random() * this.height * 0.3;
                    const endY = drawY + this.height;

                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    // Slight zigzag
                    const midY = startY + (endY - startY) * 0.5;
                    ctx.lineTo(startX + (Math.random() - 0.5) * 5, midY);
                    ctx.lineTo(startX + (Math.random() - 0.5) * 5, endY);
                    ctx.stroke();
                }

                // Chipped edges
                if (this.crackLevel >= 2) {
                    ctx.fillStyle = `rgba(0, 0, 0, 0.6)`;
                    const chipCount = this.crackLevel;
                    for (let i = 0; i < chipCount; i++) {
                        const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
                        let chipX, chipY, chipW, chipH;
                        if (edge === 0) {
                            chipX = drawX + Math.random() * this.width;
                            chipY = drawY;
                            chipW = Math.random() * 6 + 3;
                            chipH = Math.random() * 4 + 2;
                        } else if (edge === 1) {
                            chipX = drawX + this.width - Math.random() * 4 - 2;
                            chipY = drawY + Math.random() * this.height;
                            chipW = Math.random() * 4 + 2;
                            chipH = Math.random() * 6 + 3;
                        } else if (edge === 2) {
                            chipX = drawX + Math.random() * this.width;
                            chipY = drawY + this.height - Math.random() * 4 - 2;
                            chipW = Math.random() * 6 + 3;
                            chipH = Math.random() * 4 + 2;
                        } else {
                            chipX = drawX;
                            chipY = drawY + Math.random() * this.height;
                            chipW = Math.random() * 4 + 2;
                            chipH = Math.random() * 6 + 3;
                        }
                        ctx.fillRect(chipX, chipY, chipW, chipH);
                    }
                }
            }
        }

        // Restore transform if collapsing
        if (this.state === 'collapsing') {
            ctx.restore();
        }

        // Draw health bar (only if alive)
        if (this.state === 'alive') {
            const healthPercent = this.health / this.maxHealth;
            const barWidth = this.width * 0.8;
            const barHeight = 4;
            const barX = drawX + (this.width - barWidth) / 2;
            const barY = drawY - 10;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Health
            ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        }
    }
}

// ============================================
// Glass Shard Class (with sparkle effect)
// ============================================

class GlassShard {
    constructor(x, y, width, height, color, velocityX, velocityY, z = null, vz = null) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.gravity = 0.5; // Lighter than chunks
        this.friction = 0.88;
        this.bounciness = 0.3;
        this.rotation = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.5; // Lots of rotation
        this.onGround = false;
        this.mass = (width * height) / 150; // Lighter weight

        // 3D properties
        this.z = z !== null ? z : Math.random() * 200 - 100;
        this.vz = vz !== null ? vz : (Math.random() - 0.5) * 0.5;
        this.zDamping = 0.95;

        // Sparkle effect
        this.sparklePhase = Math.random() * Math.PI * 2;
        this.sparkleRate = 0.15 + Math.random() * 0.1;
        this.hasSparkle = Math.random() < 0.4; // 40% of shards have sparkles

        // Persistent debris
        this.sleeping = false;
        this.settledTime = null;
        this.doNotDraw = false;
    }

    update() {
        // Get current canvas dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        const currentGroundY = height * 0.85;

        // Check bridge collision (City 2)
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(this.x + this.width / 2, this.y + this.height)) {
                        if (this.y + this.height >= structure.y && this.y + this.height <= structure.y + structure.height) {
                            this.y = structure.y - this.height;
                            this.velocityY *= -this.bounciness;
                            this.velocityX *= 0.7;
                            this.angularVelocity *= 0.6;

                            if (Math.abs(this.velocityY) < 0.5) {
                                this.onGround = true;
                                this.velocityY = 0;
                            }
                            return;
                        }
                    }
                }
            }
        }

        if (this.onGround) {
            this.velocityX *= this.friction;
            this.angularVelocity *= this.friction;
            this.vz *= 0.95;

            if (Math.abs(this.velocityX) < 0.1) {
                this.velocityX = 0;
            }
            if (Math.abs(this.angularVelocity) < 0.01) {
                this.angularVelocity = 0;
            }
            if (Math.abs(this.vz) < 0.05) {
                this.vz = 0;
            }

            if (this.settledTime === null && Math.abs(this.velocityX) < 0.1 && Math.abs(this.angularVelocity) < 0.01) {
                this.settledTime = Date.now();
            }

            if (this.sleeping) {
                return;
            }
            return;
        }

        // Update sparkle phase
        if (this.hasSparkle) {
            this.sparklePhase += this.sparkleRate;
        }

        // Apply gravity
        this.velocityY += this.gravity;

        // Update 3D depth
        this.vz *= this.zDamping;
        this.z += this.vz;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.angularVelocity;

        // Check ground collision
        if (this.y + this.height >= currentGroundY) {
            let onBridge = false;
            if (currentCityId === 2) {
                for (let structure of staticStructures) {
                    if (structure instanceof Bridge) {
                        const particleCenterX = this.x + this.width / 2;
                        if (particleCenterX >= structure.x && particleCenterX <= structure.x + structure.width) {
                            if (this.y + this.height >= structure.y && this.y + this.height <= structure.y + structure.height + 5) {
                                this.y = structure.y - this.height;
                                onBridge = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (!onBridge) {
                this.y = currentGroundY - this.height;
            }

            this.velocityY *= -this.bounciness;
            this.velocityX *= 0.7;
            this.vz *= 0.8;
            this.angularVelocity *= 0.6;

            if (Math.abs(this.velocityY) < 0.5) {
                this.onGround = true;
                this.velocityY = 0;
                this.vz *= 0.9;
            }
        }

        // Boundary check
        if (this.x < -200 || this.x > width + 200 || this.y > height + 200) {
            this.sleeping = true;
            this.onGround = true;
        }
    }

    render() {
        if (this.doNotDraw) return;

        const perspectiveScale = Math.max(0.6, Math.min(1.6, 1 + this.z * 0.002));
        const shadowSize = Math.max(1, Math.min(6, 5 - this.z * 0.02));
        const shadowAlpha = Math.max(0.1, Math.min(0.3, 0.25 - this.z * 0.001));
        const depthBrightness = Math.max(-20, Math.min(15, -this.z * 0.12));
        const adjustedColor = this.adjustBrightness(this.color, depthBrightness);

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // Draw shadow
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;
        let shadowY = groundY;
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(centerX, centerY)) {
                        shadowY = structure.y;
                        break;
                    }
                }
            }
        }

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(centerX + screenShake.x, shadowY + 1, shadowSize * perspectiveScale, shadowSize * perspectiveScale * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw shard with perspective
        ctx.save();
        ctx.translate(centerX + screenShake.x, centerY + screenShake.y);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        // Draw shard
        ctx.fillStyle = adjustedColor;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Sparkle effect (bright specular flash)
        if (this.hasSparkle && !this.onGround) {
            const sparkleIntensity = Math.sin(this.sparklePhase) * 0.5 + 0.5;
            if (sparkleIntensity > 0.6) {
                ctx.fillStyle = `rgba(255, 255, 255, ${sparkleIntensity * 0.8})`;
                ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
            }
        }

        // Edge highlight
        ctx.strokeStyle = this.adjustBrightness(adjustedColor, 25);
        ctx.lineWidth = 0.5 / perspectiveScale;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.restore();
    }

    adjustBrightness(color, percent) {
        if (color.startsWith('rgb')) {
            const matches = color.match(/\d+/g);
            if (matches) {
                const r = Math.max(0, Math.min(255, parseInt(matches[0]) + percent));
                const g = Math.max(0, Math.min(255, parseInt(matches[1]) + percent));
                const b = Math.max(0, Math.min(255, parseInt(matches[2]) + percent));
                return `rgb(${r},${g},${b})`;
            }
        } else if (color.startsWith('#')) {
            const num = parseInt(color.replace("#", ""), 16);
            const r = Math.max(0, Math.min(255, (num >> 16) + percent));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
            const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
            return `rgb(${r},${g},${b})`;
        }
        return color;
    }
}

// ============================================
// Particle Class (Chunky Building Chunks)
// ============================================

// ============================================
// Micro Debris Class (very small chips/panels)
// ============================================

class MicroDebris {
    constructor(x, y, width, height, color, velocityX, velocityY, z = null, vz = null) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.angularVelocity = (Math.random() - 0.5) * 0.15;
        this.rotation = 0;
        this.gravity = 0.3;
        this.lifetime = 2000 + Math.random() * 2000; // 2-4 seconds
        this.spawnTime = Date.now();
        this.bounciness = 0.2;
        this.friction = 0.96;
        this.onGround = false;

        // 3D properties
        this.z = z !== null ? z : Math.random() * 80 - 40;
        this.vz = vz !== null ? vz : (Math.random() - 0.5) * 0.25;
        this.zDamping = 0.97;
    }

    update() {
        // Check lifetime
        if (Date.now() - this.spawnTime > this.lifetime) {
            return false; // Mark for removal
        }

        // Apply gravity
        if (!this.onGround) {
            this.velocityY += this.gravity;
        }

        // Update 3D depth
        this.vz *= this.zDamping;
        this.z += this.vz;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.angularVelocity;

        // Ground collision
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        if (this.y + this.height / 2 >= groundY) {
            this.y = groundY - this.height / 2;
            this.velocityY *= -this.bounciness;
            this.velocityX *= this.friction;
            this.angularVelocity *= 0.8;
            this.vz *= 0.8;
            this.onGround = true;
        }

        // Damping when on ground
        if (this.onGround) {
            this.velocityX *= this.friction;
            this.angularVelocity *= 0.95;
            this.vz *= 0.95;
        }

        // Boundary check
        if (this.x < -50 || this.x > width + 50 || this.y > height + 50) {
            return false;
        }

        return true;
    }

    render() {
        const perspectiveScale = Math.max(0.7, Math.min(1.3, 1 + this.z * 0.002));
        const alpha = Math.max(0.1, 1 - (Date.now() - this.spawnTime) / this.lifetime);

        const centerX = this.x;
        const centerY = this.y;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(centerX + screenShake.x, centerY + screenShake.y);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.restore();
    }
}

// ============================================
// VoxelBit Class (square chunks from UFO tractor pixelation)
// ============================================

class VoxelBit {
    constructor(x, y, size, color, velocityX, velocityY, buildingRef) {
        this.x = x;
        this.y = y;
        this.size = size; // Square size (6-14px)
        this.width = size;
        this.height = size;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.gravity = 0.4;
        this.friction = 0.88;
        this.bounciness = 0.3;
        this.rotation = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.3;
        this.onGround = false;
        this.buildingRef = buildingRef; // Reference to source building

        // 3D properties
        this.z = Math.random() * 100 - 50;
        this.vz = (Math.random() - 0.5) * 0.4;
        this.zDamping = 0.95;

        // Persistent debris
        this.sleeping = false;
        this.settledTime = null;
        this.doNotDraw = false;
    }

    update() {
        if (this.sleeping) {
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        const currentGroundY = height * 0.85;

        // Check bridge collision (City 2)
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(this.x + this.size / 2, this.y + this.size)) {
                        if (this.y + this.size >= structure.y && this.y + this.size <= structure.y + structure.height) {
                            this.y = structure.y - this.size;
                            this.velocityY *= -this.bounciness;
                            this.velocityX *= 0.7;
                            this.angularVelocity *= 0.6;

                            if (Math.abs(this.velocityY) < 0.5) {
                                this.onGround = true;
                                this.velocityY = 0;
                            }
                            return;
                        }
                    }
                }
            }
        }

        if (this.onGround) {
            this.velocityX *= this.friction;
            this.angularVelocity *= this.friction;
            this.vz *= 0.95;

            if (Math.abs(this.velocityX) < 0.1) {
                this.velocityX = 0;
            }
            if (Math.abs(this.angularVelocity) < 0.01) {
                this.angularVelocity = 0;
            }
            if (Math.abs(this.vz) < 0.05) {
                this.vz = 0;
            }

            if (this.settledTime === null && Math.abs(this.velocityX) < 0.1 && Math.abs(this.angularVelocity) < 0.01) {
                this.settledTime = Date.now();
            }
            return;
        }

        // Apply gravity
        this.velocityY += this.gravity;

        // Update 3D depth
        this.vz *= this.zDamping;
        this.z += this.vz;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.angularVelocity;

        // Check ground collision
        if (this.y + this.size >= currentGroundY) {
            let onBridge = false;
            if (currentCityId === 2) {
                for (let structure of staticStructures) {
                    if (structure instanceof Bridge) {
                        const particleCenterX = this.x + this.size / 2;
                        if (particleCenterX >= structure.x && particleCenterX <= structure.x + structure.width) {
                            if (this.y + this.size >= structure.y && this.y + this.size <= structure.y + structure.height + 5) {
                                this.y = structure.y - this.size;
                                onBridge = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (!onBridge) {
                this.y = currentGroundY - this.size;
            }

            this.velocityY *= -this.bounciness;
            this.velocityX *= 0.7;
            this.vz *= 0.8;
            this.angularVelocity *= 0.6;

            if (Math.abs(this.velocityY) < 0.5) {
                this.onGround = true;
                this.velocityY = 0;
                this.vz *= 0.9;
            }
        }

        // Boundary check
        if (this.x < -200 || this.x > width + 200 || this.y > height + 200) {
            this.sleeping = true;
            this.onGround = true;
        }
    }

    render() {
        if (this.doNotDraw) return;

        const perspectiveScale = Math.max(0.6, Math.min(1.6, 1 + this.z * 0.002));
        const shadowSize = Math.max(1, Math.min(4, 3 - this.z * 0.015));
        const shadowAlpha = Math.max(0.1, Math.min(0.25, 0.2 - this.z * 0.001));
        const depthBrightness = Math.max(-15, Math.min(10, -this.z * 0.1));

        const centerX = this.x + this.size / 2;
        const centerY = this.y + this.size / 2;

        // Draw shadow
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;
        let shadowY = groundY;
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(centerX, centerY)) {
                        shadowY = structure.y;
                        break;
                    }
                }
            }
        }

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX + screenShake.x, shadowY + 1, shadowSize * perspectiveScale, shadowSize * perspectiveScale * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw square chunk with perspective
        ctx.save();
        ctx.translate(centerX + screenShake.x, centerY + screenShake.y);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        // Adjust color brightness based on depth
        const colorMatch = this.color.match(/\d+/g);
        if (colorMatch && colorMatch.length >= 3) {
            const r = Math.max(0, Math.min(255, parseInt(colorMatch[0]) + depthBrightness));
            const g = Math.max(0, Math.min(255, parseInt(colorMatch[1]) + depthBrightness));
            const b = Math.max(0, Math.min(255, parseInt(colorMatch[2]) + depthBrightness));
            const alpha = colorMatch.length > 3 ? colorMatch[3] : '1';
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else {
            ctx.fillStyle = this.color;
        }

        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);

        // Edge highlight
        ctx.strokeStyle = this.adjustBrightness(this.color, 20);
        ctx.lineWidth = 0.5 / perspectiveScale;
        ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);

        ctx.restore();
    }

    adjustBrightness(color, percent) {
        if (color.startsWith('rgba')) {
            const matches = color.match(/\d+/g);
            if (matches && matches.length >= 3) {
                const r = Math.max(0, Math.min(255, parseInt(matches[0]) + percent));
                const g = Math.max(0, Math.min(255, parseInt(matches[1]) + percent));
                const b = Math.max(0, Math.min(255, parseInt(matches[2]) + percent));
                return `rgba(${r},${g},${b},${matches[3] || '1'})`;
            }
        } else if (color.startsWith('#')) {
            const num = parseInt(color.replace("#", ""), 16);
            const r = Math.max(0, Math.min(255, (num >> 16) + percent));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
            const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
            return `rgb(${r},${g},${b})`;
        }
        return color;
    }
}

// ============================================
// Dust Particle Class (expands and fades)
// ============================================

class DustParticle {
    constructor(x, y, size, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.lifetime = 1500 + Math.random() * 1000; // 1.5-2.5 seconds
        this.spawnTime = Date.now();
        this.expansionRate = 0.5 + Math.random() * 0.5;
    }

    update() {
        // Check lifetime
        if (Date.now() - this.spawnTime > this.lifetime) {
            return false;
        }

        // Expand and drift
        this.size += this.expansionRate;
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityX *= 0.98; // Damping
        this.velocityY *= 0.98;

        // Boundary check
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (this.x < -100 || this.x > width + 100 || this.y < -100 || this.y > height + 100) {
            return false;
        }

        return true;
    }

    render() {
        const age = Date.now() - this.spawnTime;
        const alpha = Math.max(0, 1 - age / this.lifetime) * 0.4;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
        ctx.beginPath();
        ctx.arc(this.x + screenShake.x, this.y + screenShake.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ============================================
// Building Debris Class (small falling pieces)
// ============================================

class BuildingDebris {
    constructor(x, y, width, height, color, velocityX, velocityY, z = null, vz = null) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.angularVelocity = (Math.random() - 0.5) * 0.2;
        this.rotation = 0;
        this.gravity = 0.4;
        this.lifetime = 2000 + Math.random() * 2000; // 2-4 seconds
        this.spawnTime = Date.now();
        this.bounciness = 0.3;
        this.friction = 0.95;
        this.onGround = false;

        // 3D properties (pseudo-3D)
        this.z = z !== null ? z : Math.random() * 150 - 75; // Depth: -75 to 75
        this.vz = vz !== null ? vz : (Math.random() - 0.5) * 0.3; // Depth velocity
        this.zDamping = 0.96; // Damping for z velocity
    }

    update() {
        // Apply gravity
        if (!this.onGround) {
            this.velocityY += this.gravity;
        }

        // Update 3D depth (gentle drift with damping)
        this.vz *= this.zDamping;
        this.z += this.vz;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Update rotation
        this.rotation += this.angularVelocity;

        // Ground collision
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Check bridge collision (City 2)
        let hitGround = false;
        if (currentCityId === 2) {
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    if (structure.contains(this.x, this.y + this.height / 2)) {
                        const bridgeTopY = structure.y;
                        if (this.y + this.height / 2 >= bridgeTopY && this.velocityY > 0) {
                            this.y = bridgeTopY - this.height / 2;
                            this.velocityY *= -this.bounciness;
                            this.velocityX *= this.friction;
                            this.angularVelocity *= 0.8;
                            this.onGround = true;
                            hitGround = true;
                        }
                    }
                }
            });
        }

        if (!hitGround && this.y + this.height / 2 >= groundY) {
            this.y = groundY - this.height / 2;
            this.velocityY *= -this.bounciness;
            this.velocityX *= this.friction;
            this.angularVelocity *= 0.8;
            this.vz *= 0.8; // Damp z velocity on ground impact
            this.onGround = true;
        }

        // Damping when on ground
        if (this.onGround) {
            this.velocityX *= this.friction;
            this.angularVelocity *= 0.9;
            this.vz *= 0.95; // Damp z velocity when on ground
            if (Math.abs(this.vz) < 0.05) {
                this.vz = 0;
            }
        }

        // Boundary check
        if (this.x < -50 || this.x > width + 50 || this.y > height + 50) {
            return false; // Mark for removal
        }

        // Lifetime check
        const elapsed = Date.now() - this.spawnTime;
        if (elapsed >= this.lifetime) {
            return false; // Mark for removal
        }

        return true; // Keep alive
    }

    render() {
        // Calculate perspective scale based on Z depth
        const perspectiveScale = Math.max(0.6, Math.min(1.6, 1 + this.z * 0.002));

        // Calculate shadow properties based on Z
        const shadowSize = Math.max(1, Math.min(4, 3 - this.z * 0.015));
        const shadowAlpha = Math.max(0.05, Math.min(0.3, 0.2 - this.z * 0.001));

        // Depth-based brightness adjustment
        const depthBrightness = Math.max(-20, Math.min(15, -this.z * 0.12));
        const adjustedColor = this.adjustBrightness(this.color, depthBrightness);

        const centerX = this.x;
        const centerY = this.y;
        const scaledWidth = this.width * perspectiveScale;
        const scaledHeight = this.height * perspectiveScale;

        // Draw shadow on ground
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        let shadowY = groundY;
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(centerX, centerY)) {
                        shadowY = structure.y;
                        break;
                    }
                }
            }
        }

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(centerX + screenShake.x, shadowY + 1, shadowSize * perspectiveScale, shadowSize * perspectiveScale * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw debris with perspective scaling
        const drawX = centerX + screenShake.x;
        const drawY = centerY + screenShake.y;

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        ctx.fillStyle = adjustedColor;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.restore();
    }

    adjustBrightness(color, percent) {
        if (color.startsWith('rgba')) {
            const matches = color.match(/[\d.]+/g);
            if (matches && matches.length >= 3) {
                const r = Math.max(0, Math.min(255, parseFloat(matches[0]) + percent));
                const g = Math.max(0, Math.min(255, parseFloat(matches[1]) + percent));
                const b = Math.max(0, Math.min(255, parseFloat(matches[2]) + percent));
                const a = matches.length > 3 ? matches[3] : '1';
                return `rgba(${r},${g},${b},${a})`;
            }
        } else if (color.startsWith('rgb')) {
            const matches = color.match(/\d+/g);
            if (matches && matches.length >= 3) {
                const r = Math.max(0, Math.min(255, parseInt(matches[0]) + percent));
                const g = Math.max(0, Math.min(255, parseInt(matches[1]) + percent));
                const b = Math.max(0, Math.min(255, parseInt(matches[2]) + percent));
                return `rgb(${r},${g},${b})`;
            }
        } else if (color.startsWith('#')) {
            const num = parseInt(color.replace("#", ""), 16);
            const r = Math.max(0, Math.min(255, (num >> 16) + percent));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
            const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
            return `rgb(${r},${g},${b})`;
        }
        return color;
    }
}

// ============================================
// Particle Class (main fragments)
// ============================================

class Particle {
    constructor(x, y, width, height, color, velocityX, velocityY, z = null, vz = null) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.gravity = 0.6; // Slightly stronger gravity
        this.friction = 0.85; // Medium friction (was 0.98, now more realistic)
        this.bounciness = 0.25; // Low bounciness
        this.rotation = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.3; // Rotation speed
        this.onGround = false;
        this.mass = (width * height) / 100; // Heavier chunks have more mass

        // 3D properties (pseudo-3D)
        this.z = z !== null ? z : Math.random() * 200 - 100; // Depth: -100 to 100
        this.vz = vz !== null ? vz : (Math.random() - 0.5) * 0.5; // Depth velocity
        this.zDamping = 0.95; // Damping for z velocity

        // Persistent debris: sleeping state for performance
        this.sleeping = false; // When true, skip physics updates but still render
        this.settledTime = null; // Timestamp when particle settled on ground
        this.doNotDraw = false; // Flag to skip rendering for oldest sleeping particles
    }

    update() {
        // Get current canvas dimensions in CSS pixels
        const width = window.innerWidth;
        const height = window.innerHeight;
        const currentGroundY = height * 0.85;

        // Check bridge collision (City 2) - check segments
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    const particleCenterX = this.x + this.width / 2;
                    // Check each intact segment
                    for (let segment of structure.segments) {
                        if (segment.state === 'broken') continue;
                        if (particleCenterX >= segment.x && particleCenterX <= segment.x + segment.w) {
                            const segmentY = segment.y + structure.swayOffset;
                            if (this.y + this.height >= segmentY && this.y + this.height <= segmentY + segment.h + 5) {
                                this.y = segmentY - this.height;
                                this.velocityY *= -this.bounciness;
                                this.velocityX *= 0.7;
                                this.angularVelocity *= 0.6;

                                if (Math.abs(this.velocityY) < 0.5) {
                                    this.onGround = true;
                                    this.velocityY = 0;
                                }
                                return;
                            }
                        }
                    }
                }
            }
        }

        if (this.onGround) {
            // Apply friction when on ground (slower decay)
            this.velocityX *= this.friction;
            this.angularVelocity *= this.friction;
            this.vz *= 0.95; // Damp z velocity when on ground

            // Stop very slow movement
            if (Math.abs(this.velocityX) < 0.1) {
                this.velocityX = 0;
            }
            if (Math.abs(this.angularVelocity) < 0.01) {
                this.angularVelocity = 0;
            }
            if (Math.abs(this.vz) < 0.05) {
                this.vz = 0;
            }

            // Mark as settled for sleeping logic
            if (this.settledTime === null && Math.abs(this.velocityX) < 0.1 && Math.abs(this.angularVelocity) < 0.01) {
                this.settledTime = Date.now();
            }

            // Skip physics updates if sleeping (but still render)
            if (this.sleeping) {
                return;
            }

            return;
        }

        // Apply gravity
        this.velocityY += this.gravity;

        // Update 3D depth (gentle drift with damping)
        this.vz *= this.zDamping;
        this.z += this.vz;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.angularVelocity;

        // Check ground collision (only if not on bridge)
        if (this.y + this.height >= currentGroundY) {
            // Check if particle would land on bridge first (City 2)
            let onBridge = false;
            if (currentCityId === 2) {
                for (let structure of staticStructures) {
                    if (structure instanceof Bridge) {
                        const particleCenterX = this.x + this.width / 2;
                        if (particleCenterX >= structure.x && particleCenterX <= structure.x + structure.width) {
                            if (this.y + this.height >= structure.y && this.y + this.height <= structure.y + structure.height + 5) {
                                this.y = structure.y - this.height;
                                onBridge = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (!onBridge) {
                this.y = currentGroundY - this.height;
            }

            // Bounce with bounciness factor
            this.velocityY *= -this.bounciness;
            this.velocityX *= 0.7; // Horizontal damping on impact

            // Damp z velocity on ground impact
            this.vz *= 0.8;

            // Angular velocity damping on impact
            this.angularVelocity *= 0.6;

            // Settle if bounce is too small
            if (Math.abs(this.velocityY) < 0.5) {
                this.onGround = true;
                this.velocityY = 0;
                this.vz *= 0.9; // Additional z damping when settled
            }
        }

        // Boundary check (don't remove, just mark as sleeping if far off screen)
        if (this.x < -200 || this.x > width + 200 ||
            this.y > height + 200) {
            this.sleeping = true; // Mark as sleeping instead of removing
            this.onGround = true;
        }
    }

    render() {
        // Calculate perspective scale based on Z depth
        // scale = 1 + (z * 0.002), clamped to [0.6, 1.6]
        const perspectiveScale = Math.max(0.6, Math.min(1.6, 1 + this.z * 0.002));

        // Calculate shadow properties based on Z (farther = smaller/lighter)
        const shadowSize = Math.max(2, Math.min(8, 6 - this.z * 0.02));
        const shadowAlpha = Math.max(0.1, Math.min(0.4, 0.3 - this.z * 0.001));

        // Depth-based brightness adjustment (farther = darker, nearer = brighter)
        const depthBrightness = Math.max(-30, Math.min(20, -this.z * 0.15));
        const adjustedColor = this.adjustBrightness(this.color, depthBrightness);

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const scaledWidth = this.width * perspectiveScale;
        const scaledHeight = this.height * perspectiveScale;

        // Draw shadow on ground (ellipse, size/alpha based on Z)
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Check if on bridge (City 2)
        let shadowY = groundY;
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(centerX, centerY)) {
                        shadowY = structure.y;
                        break;
                    }
                }
            }
        }

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(centerX + screenShake.x, shadowY + 2, shadowSize * perspectiveScale, shadowSize * perspectiveScale * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw fragment with perspective scaling
        ctx.save();
        ctx.translate(centerX + screenShake.x, centerY + screenShake.y);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        // Draw chunk with depth-adjusted color
        ctx.fillStyle = adjustedColor;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Edge highlight (brighter for nearer fragments)
        ctx.strokeStyle = this.adjustBrightness(adjustedColor, 20);
        ctx.lineWidth = 1 / perspectiveScale; // Scale line width inversely
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.restore();
    }

    adjustBrightness(color, percent) {
        if (color.startsWith('rgb')) {
            const matches = color.match(/\d+/g);
            if (matches) {
                const r = Math.max(0, Math.min(255, parseInt(matches[0]) + percent));
                const g = Math.max(0, Math.min(255, parseInt(matches[1]) + percent));
                const b = Math.max(0, Math.min(255, parseInt(matches[2]) + percent));
                return `rgb(${r},${g},${b})`;
            }
        }
        return color;
    }
}

// ============================================
// Explosion Class
// ============================================

class Explosion {
    constructor(x, y, radius, flashIntensity = 0, isLarge = false) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = radius;
        this.speed = 15;
        this.active = true;
        this.flashIntensity = flashIntensity;
        this.isLarge = isLarge; // Flag for large explosions (sticky bombs)
    }

    update() {
        // Large explosions expand faster to cover area quickly
        const speedMultiplier = this.isLarge ? 3 : 1;
        this.radius += this.speed * speedMultiplier;
        if (this.radius >= this.maxRadius) {
            this.active = false;
        }

        // Add water ripple if explosion is near water (City 2)
        // Check when explosion starts (small radius) to avoid multiple ripples
        if (currentCityId === 2 && waterWaves && this.radius < 50) {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const groundY = height * 0.85;
            const waterY = groundY + 20;
            const riverWidth = width * 0.4;
            const riverStartX = width * 0.3;

            // Check if explosion is near water
            if (this.y >= waterY - 50 && this.y <= waterY + 50 &&
                this.x >= riverStartX - 50 && this.x <= riverStartX + riverWidth + 50) {
                // Scale impulse by explosion size (larger explosions = bigger ripples)
                const baseImpulse = 2 + Math.random() * 2;
                const sizeMultiplier = Math.min(3, this.maxRadius / 50); // Cap at 3x for very large explosions
                const velocityImpulse = baseImpulse * sizeMultiplier;
                waterWaves.addDisturbance(this.x, velocityImpulse);
            }
        }
    }

    render() {
        if (!this.active) return;

        if (this.isLarge) {
            // Optimized rendering for large explosions - use simplified rings
            const ringCount = 4;
            const ringSpacing = this.maxRadius / ringCount;

            for (let i = ringCount; i >= 1; i--) {
                const ringRadius = this.radius * (i / ringCount);
                const alpha = Math.max(0, 1 - (ringRadius / this.maxRadius)) * 0.6;

                ctx.strokeStyle = `rgba(255, ${200 - i * 30}, ${100 - i * 20}, ${alpha})`;
                ctx.lineWidth = Math.max(2, ringRadius / 30);
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Inner core
            const coreRadius = Math.min(this.radius * 0.15, 50);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.9 - this.radius / this.maxRadius)})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, coreRadius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Standard explosion rendering for smaller explosions
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.radius
            );
            gradient.addColorStop(0, 'rgba(255, 200, 0, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();

            // Inner core
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ============================================
// Nuclear Bomb Class
// ============================================

class NuclearBomb {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.velocityY = 2;
        this.gravity = 0.8;
        this.radius = 8;
        this.exploded = false;
    }

    update() {
        if (this.exploded) return;

        this.velocityY += this.gravity;
        this.y += this.velocityY;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Check ground collision
        if (this.y + this.radius >= groundY) {
            this.explode(groundY);
            return;
        }

        // Check building collision
        for (let building of buildings) {
            if (building.state === 'collapsed') continue;

            if (building.contains(this.x, this.y + this.radius)) {
                this.explode(this.y);
                return;
            }
        }
    }

    explode(y) {
        if (this.exploded) return;
        this.exploded = true;

        const explosionRadius = 180;
        const damageRadius = 200;

        // Create explosion
        explosions.push(new Explosion(this.x, y, explosionRadius, 0.3));

        // Screen shake
        screenShake.intensity = Math.max(screenShake.intensity, 20);

        // Screen flash
        screenFlash.active = true;
        screenFlash.intensity = 0.3;

        // Damage buildings
        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - this.x, 2) + Math.pow(centerY - y, 2)
            );

            if (distance < damageRadius) {
                const normalizedDist = distance / damageRadius;
                const falloff = Math.pow(1 - normalizedDist, 3);
                const baseDamage = 120;
                const damage = baseDamage * falloff;
                building.takeDamage(damage, distance, damageRadius);

                const shakeIntensity = falloff * 15;
                building.applyShake(shakeIntensity);

                // Create fire if building is heavily damaged
                if (building.health / building.maxHealth < 0.3 && Math.random() < 0.4) {
                    const fx = centerX + (Math.random() - 0.5) * building.width * 0.5;
                    const fy = building.y + Math.random() * building.height * 0.6;
                    fireEmitters.push(new FireEmitter(fx, fy));
                }
            }
        });

        // Damage bridge segments (City 2)
        if (currentCityId === 2) {
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    structure.takeDamage(30, this.x, y, damageRadius);
                }
            });
        }

        // Create fire emitters at explosion center
        const fireCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < fireCount; i++) {
            const angle = (Math.PI * 2 * i) / fireCount;
            const offset = 30 + Math.random() * 40;
            const fx = this.x + Math.cos(angle) * offset;
            const fy = y + Math.sin(angle) * offset;
            fireEmitters.push(new FireEmitter(fx, fy));
        }
    }

    render() {
        if (this.exploded) return;

        // Draw bomb
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw glow
        ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ============================================
// Laser Class
// ============================================

class Laser {
    constructor(x) {
        this.x = x;
        this.startTime = Date.now();
        this.duration = 300; // milliseconds
        this.active = true;
        this.impactPoints = [];
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration) {
            this.active = false;
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Check building intersections and apply damage
        const beamWidth = 15;
        const step = 5;

        for (let y = 0; y < groundY; y += step) {
            for (let building of buildings) {
                if (building.state === 'collapsed') continue;

                if (building.intersects(this.x - beamWidth / 2, y, beamWidth, step)) {
                    // Apply continuous damage
                    building.takeDamage(2);

                    // Create impact point for visual effect (warm sparks, no gray overlay)
                    const impactY = Math.max(building.y, y);
                    if (!this.impactPoints.some(p => Math.abs(p.y - impactY) < 10)) {
                        this.impactPoints.push({ x: this.x, y: impactY, time: elapsed });
                    }
                }
            }

            // Damage bridge segments (City 2)
            if (currentCityId === 2) {
                staticStructures.forEach(structure => {
                    if (structure instanceof Bridge) {
                        for (let segment of structure.segments) {
                            if (segment.state === 'broken') continue;
                            if (segment.contains(this.x, y)) {
                                segment.takeDamage(2);
                            }
                        }
                    }
                });
            }
        }

        // Create warm impact effects at impact points periodically (orange/yellow sparks, heat rings)
        if (elapsed % 50 < 16) { // Every ~50ms
            this.impactPoints.forEach(point => {
                if (Math.random() < 0.3) {
                    // Small warm explosion (orange/yellow)
                    explosions.push(new Explosion(point.x, point.y, 30, 0));
                }
            });
        }
    }

    render() {
        if (!this.active) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        // Draw laser beam
        const beamWidth = 15;
        const gradient = ctx.createLinearGradient(this.x - beamWidth / 2, 0, this.x + beamWidth / 2, 0);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
        gradient.addColorStop(0.5, 'rgba(255, 100, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0.3)');

        ctx.fillStyle = gradient;
        ctx.fillRect(this.x - beamWidth / 2, 0, beamWidth, groundY);

        // Draw core
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(this.x - 3, 0, 6, groundY);

        // Draw warm impact effects (orange/yellow sparks + heat rings, NO gray overlay)
        this.impactPoints.forEach(point => {
            const age = elapsed - point.time;
            if (age < 200) { // Show for 200ms
                const alpha = Math.max(0, 1 - age / 200);

                // Heat ring (orange, expands and fades)
                const ringRadius = age * 0.3;
                const ringAlpha = alpha * 0.4;
                ctx.strokeStyle = `rgba(255, 150, 50, ${ringAlpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
                ctx.stroke();

                // Warm sparks (orange/yellow)
                ctx.fillStyle = `rgba(255, 180, 60, ${alpha})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
                ctx.fill();

                // Tiny ember particles
                for (let i = 0; i < 3; i++) {
                    const angle = (Math.PI * 2 * i) / 3 + age * 0.01;
                    const dist = age * 0.2;
                    const emberX = point.x + Math.cos(angle) * dist;
                    const emberY = point.y + Math.sin(angle) * dist;
                    ctx.fillStyle = `rgba(255, 120, 40, ${alpha * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(emberX, emberY, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });
    }
}

// ============================================
// Sticky Bomb Class
// ============================================

class StickyBomb {
    constructor(x, y, buildingIndex = null, offsetX = 0, offsetY = 0, buildingRef = null) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.attachedTo = buildingIndex; // Index in buildings array, or null if on ground
        this.attachedBuildingRef = buildingRef; // Reference to building object
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.isArmed = true;
        this.placedAt = Date.now();
        this.velocityY = 0;
        this.gravity = 0.5;
        this.onGround = false;
        this.groundY = null;
        this.active = true; // For performance: inactive bombs don't update/render until detonation
    }

    update() {
        // Skip update if inactive (performance optimization)
        if (!this.active) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // If attached to a building
        if (this.attachedBuildingRef) {
            const building = this.attachedBuildingRef;

            // Check if building still exists and is not destroyed
            if (buildings.includes(building) && building.state !== 'collapsed') {
                // Follow building position
                this.x = building.x + this.offsetX;
                this.y = building.y + this.offsetY;
                this.onGround = false;
            } else {
                // Building destroyed or removed - detach and fall
                this.attachedTo = null;
                this.attachedBuildingRef = null;
                this.velocityY = 0;
            }
        } else if (this.attachedTo !== null && this.attachedTo < buildings.length) {
            // Fallback: use index if reference not set
            const building = buildings[this.attachedTo];
            if (building && building.state !== 'collapsed') {
                this.attachedBuildingRef = building; // Set reference
                this.x = building.x + this.offsetX;
                this.y = building.y + this.offsetY;
                this.onGround = false;
            } else {
                this.attachedTo = null;
                this.velocityY = 0;
            }
        }

        // If not attached (or detached), apply gravity
        if (this.attachedTo === null) {
            this.velocityY += this.gravity;
            this.y += this.velocityY;

            // Check ground collision
            if (this.y + this.radius >= groundY) {
                this.y = groundY - this.radius;
                this.velocityY = 0;
                this.onGround = true;
                this.groundY = groundY;
            }
        }

        // Boundary check
        if (this.x < -50 || this.x > width + 50 || this.y > height + 50) {
            this.isArmed = false; // Mark for removal
        }
    }

    render() {
        if (!this.isArmed || !this.active) return;

        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        // Blinking red light (every ~500ms)
        const elapsed = Date.now() - this.placedAt;
        const blinkPhase = Math.floor(elapsed / 500) % 2;
        const lightVisible = blinkPhase === 0;

        // Draw bomb body (dark circle)
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw blinking red light
        if (lightVisible) {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Glow
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.radius * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Border
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    explode() {
        if (!this.isArmed) return;

        // Calculate dynamic explosion radius based on canvas size
        const width = window.innerWidth;
        const height = window.innerHeight;
        const explosionRadius = Math.max(width, height) * 0.6;
        const damageRadius = explosionRadius;

        // Create large explosion visual
        explosions.push(new Explosion(this.x, this.y, explosionRadius, 0, true));

        // Screen shake (capped to prevent excessive shake with multiple bombs)
        screenShake.intensity = Math.min(screenShake.intensity + 8, 30);

        // Damage buildings with cubed falloff (strong close, very soft far)
        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - this.x, 2) + Math.pow(centerY - this.y, 2)
            );

            if (distance < damageRadius) {
                // Cubed falloff: (1 - normalizedDistance)^3
                const normalizedDistance = distance / damageRadius;
                const falloffFactor = Math.pow(1 - normalizedDistance, 3);

                // Base damage: 100 at center, drops to ~0.1% at edge
                // Close buildings get strong damage, distant ones get chipped
                const baseDamage = 100;
                const damage = falloffFactor * baseDamage;

                // Cap damage per building to prevent instant destruction from multiple bombs
                const maxDamagePerBomb = 80;
                const cappedDamage = Math.min(damage, maxDamagePerBomb);

                building.takeDamage(cappedDamage, distance, damageRadius);

                // Building shake (also with falloff)
                const shakeIntensity = falloffFactor * 12;
                building.applyShake(shakeIntensity);
            }
        });

        // Mark as exploded
        this.isArmed = false;
    }
}

function detonateAllStickyBombs() {
    // Track damage per building to cap total damage from multiple bombs
    const buildingDamageMap = new Map();
    const buildingShakeMap = new Map();

    const width = window.innerWidth;
    const height = window.innerHeight;
    // Medium explosion radius (smaller than NUKE, comparable/slightly smaller than METEOR)
    const explosionRadius = Math.min(width, height) * 0.25; // 25% of smaller dimension
    const damageRadius = explosionRadius;

    // First pass: calculate all damage from all bombs (including inactive ones)
    stickyBombs.forEach(bomb => {
        if (!bomb.isArmed) return;
        // Reactivate inactive bombs for detonation
        bomb.active = true;

        buildings.forEach((building, index) => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - bomb.x, 2) + Math.pow(centerY - bomb.y, 2)
            );

            if (distance < damageRadius) {
                // Cubed falloff: (1 - normalizedDistance)^3
                const normalizedDistance = distance / damageRadius;
                const falloffFactor = Math.pow(1 - normalizedDistance, 3);

                // Base damage: moderate (not overpowered)
                const baseDamage = 60; // Reduced from 100
                const damage = falloffFactor * baseDamage;
                const maxDamagePerBomb = 50; // Cap per bomb
                const cappedDamage = Math.min(damage, maxDamagePerBomb);

                // Accumulate damage
                if (!buildingDamageMap.has(index)) {
                    buildingDamageMap.set(index, 0);
                }
                buildingDamageMap.set(index, buildingDamageMap.get(index) + cappedDamage);

                // Accumulate shake
                const shakeIntensity = falloffFactor * 8;
                if (!buildingShakeMap.has(index)) {
                    buildingShakeMap.set(index, 0);
                }
                buildingShakeMap.set(index, Math.max(buildingShakeMap.get(index), shakeIntensity));
            }
        });
    });

    // Second pass: create explosion visuals
    stickyBombs.forEach(bomb => {
        if (!bomb.isArmed) return;
        explosions.push(new Explosion(bomb.x, bomb.y, explosionRadius, 0, true));
        bomb.isArmed = false;
    });

    // Third pass: apply accumulated damage (capped per building to prevent instant wipe)
    buildingDamageMap.forEach((totalDamage, buildingIndex) => {
        const building = buildings[buildingIndex];
        if (building && building.state !== 'collapsed') {
            // Cap total damage per building (allows multiple bombs to destroy, but not instantly)
            const maxTotalDamage = 85; // Leave some HP unless many bombs
            const finalDamage = Math.min(totalDamage, maxTotalDamage);
            building.takeDamage(finalDamage);

            // Apply shake
            const shakeIntensity = buildingShakeMap.get(buildingIndex) || 0;
            building.applyShake(Math.min(shakeIntensity, 12));
        }
    });

    // Damage bridge segments (City 2)
    if (currentCityId === 2) {
        stickyBombs.forEach(bomb => {
            if (!bomb.isArmed) return;
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    structure.takeDamage(60, bomb.x, bomb.y, damageRadius);
                }
            });
        });
    }

    // Cap total screen shake from multiple detonations
    const bombCount = stickyBombs.filter(b => b.isArmed).length;
    const shakePerBomb = 6;
    const maxTotalShake = 30;
    screenShake.intensity = Math.min(screenShake.intensity + (bombCount * shakePerBomb), maxTotalShake);

    // Remove all sticky bombs
    stickyBombs = [];
    updateDetonateButton();
}

function placeStickyBomb(x, y) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    // Performance policy: if we exceed threshold, mark oldest bombs as inactive
    const activeBombs = stickyBombs.filter(b => b.active).length;
    if (activeBombs >= MAX_STICKY_BOMBS_ACTIVE) {
        // Find oldest active bombs and mark them inactive
        const sortedBombs = [...stickyBombs].sort((a, b) => a.placedAt - b.placedAt);
        let inactiveCount = 0;
        for (let bomb of sortedBombs) {
            if (bomb.active && inactiveCount < activeBombs - MAX_STICKY_BOMBS_ACTIVE + 1) {
                bomb.active = false;
                inactiveCount++;
            }
        }
    }

    // Check if click is on a building
    let attachedToBuilding = null;
    let attachedBuildingRef = null;
    let offsetX = 0;
    let offsetY = 0;

    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];
        if (building.state === 'collapsed') continue;

        if (building.contains(x, y)) {
            attachedToBuilding = i;
            attachedBuildingRef = building;
            offsetX = x - building.x;
            offsetY = y - building.y;
            break;
        }
    }

    // If not on building, stick to ground
    if (attachedToBuilding === null) {
        const finalY = Math.min(y, groundY);
        stickyBombs.push(new StickyBomb(x, finalY, null, 0, 0, null));
    } else {
        stickyBombs.push(new StickyBomb(x, y, attachedToBuilding, offsetX, offsetY, attachedBuildingRef));
    }

    updateDetonateButton();
}

// ============================================
// Tornado Class
// ============================================

class Tornado {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.startY = y;
        this.startTime = Date.now();
        this.duration = Math.random() * 2000 + 3000; // 3-5 seconds
        this.active = true;
        this.rotation = 0;
        this.radius = 30;
        this.maxRadius = 80;
        this.windForce = 0.5;
        this.damageRadius = 100;
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration) {
            this.active = false;
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Swirl animation
        this.rotation += 0.3;
        this.radius = 30 + (this.maxRadius - 30) * Math.min(1, elapsed / 1000);

        // Slight left/right movement
        this.x += Math.sin(elapsed / 500) * 2;
        this.x = Math.max(50, Math.min(width - 50, this.x));

        // Keep on ground
        this.y = groundY;

        // Damage buildings
        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - this.x, 2) + Math.pow(centerY - this.y, 2)
            );

            if (distance < this.damageRadius) {
                const normalizedDist = distance / this.damageRadius;
                const falloff = Math.pow(1 - normalizedDist, 2);
                const damage = falloff * 3; // Continuous damage
                building.takeDamage(damage, distance, this.damageRadius);

                const shakeIntensity = falloff * 5;
                building.applyShake(shakeIntensity);
            }
        });

        // Push particles with wind
        particles.forEach(particle => {
            const dx = particle.x - this.x;
            const dy = particle.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.damageRadius && distance > 0) {
                const force = (1 - distance / this.damageRadius) * this.windForce;
                particle.velocityX += (dx / distance) * force;
                particle.velocityY += (dy / distance) * force * 0.5;
            }
        });

        // Damage bridge segments (City 2)
        if (currentCityId === 2) {
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    for (let segment of structure.segments) {
                        if (segment.state === 'broken') continue;
                        const segCenterX = segment.x + segment.w / 2;
                        const segCenterY = segment.y + segment.h / 2;
                        const distance = Math.sqrt(
                            Math.pow(segCenterX - this.x, 2) + Math.pow(segCenterY - this.y, 2)
                        );
                        if (distance < this.damageRadius) {
                            const normalizedDist = distance / this.damageRadius;
                            const falloff = Math.pow(1 - normalizedDist, 2);
                            const damage = falloff * 3; // Continuous damage per frame
                            segment.takeDamage(damage);
                        }
                    }
                }
            });
        }

        // Play tornado sound effect periodically
        if (elapsed % 200 < 16 && audioContext && musicEnabled) {
            playTornadoSound();
        }
    }

    render() {
        if (!this.active) return;

        // Draw tornado swirl
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Outer swirl
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        // NO gray - use warm orange/yellow for tornado
        gradient.addColorStop(0, 'rgba(200, 150, 100, 0.8)');
        gradient.addColorStop(0.5, 'rgba(180, 120, 80, 0.4)');
        gradient.addColorStop(1, 'rgba(160, 100, 60, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Swirl lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * (0.3 + i * 0.2), i * Math.PI / 3, i * Math.PI / 3 + Math.PI);
            ctx.stroke();
        }

        ctx.restore();
    }
}

function playTornadoSound() {
    if (!audioContext || audioContext.state !== 'running') return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 80 + Math.random() * 40;

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
        // Ignore sound errors
    }
}

// ============================================
// Sunset Background System
// ============================================

function buildSunsetBackground() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = width;
    cacheCanvas.height = groundY;
    const cacheCtx = cacheCanvas.getContext('2d');

    // Sky gradient: deep blue upper → warm orange/pink near horizon
    const skyGradient = cacheCtx.createLinearGradient(0, 0, 0, groundY);
    skyGradient.addColorStop(0, '#1a3a5a'); // Deep blue
    skyGradient.addColorStop(0.3, '#2a4a6a'); // Medium blue
    skyGradient.addColorStop(0.6, '#4a5a7a'); // Lighter blue
    skyGradient.addColorStop(0.85, '#ff8c5a'); // Warm orange
    skyGradient.addColorStop(1, '#ff6b4a'); // Bright orange-pink
    cacheCtx.fillStyle = skyGradient;
    cacheCtx.fillRect(0, 0, width, groundY);

    // Sun (soft disk near horizon with bloom)
    const sunY = groundY * 0.9;
    const sunX = width * 0.5;
    const sunRadius = Math.min(width, groundY) * 0.15;

    // Sun outer glow (bloom effect)
    const sunGradient = cacheCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 2);
    sunGradient.addColorStop(0, 'rgba(255, 200, 100, 0.8)');
    sunGradient.addColorStop(0.5, 'rgba(255, 150, 80, 0.4)');
    sunGradient.addColorStop(1, 'rgba(255, 100, 60, 0)');
    cacheCtx.fillStyle = sunGradient;
    cacheCtx.beginPath();
    cacheCtx.arc(sunX, sunY, sunRadius * 2, 0, Math.PI * 2);
    cacheCtx.fill();

    // Sun core
    const sunCoreGradient = cacheCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
    sunCoreGradient.addColorStop(0, '#ffcc88');
    sunCoreGradient.addColorStop(1, '#ff8844');
    cacheCtx.fillStyle = sunCoreGradient;
    cacheCtx.beginPath();
    cacheCtx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    cacheCtx.fill();

    // Atmospheric haze near horizon
    const hazeGradient = cacheCtx.createLinearGradient(0, groundY * 0.7, 0, groundY);
    hazeGradient.addColorStop(0, 'rgba(255, 200, 150, 0)');
    hazeGradient.addColorStop(1, 'rgba(255, 180, 120, 0.3)');
    cacheCtx.fillStyle = hazeGradient;
    cacheCtx.fillRect(0, groundY * 0.7, width, groundY * 0.3);

    sunsetBackgroundCache = cacheCanvas;
}

function buildCloudLayer(layerName, count, baseY, speed, sizeRange, opacity) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = width * 1.5; // Wider for parallax
    cacheCanvas.height = groundY;
    const cacheCtx = cacheCanvas.getContext('2d');

    const clouds = [];
    for (let i = 0; i < count; i++) {
        clouds.push({
            x: (Math.random() * width * 1.5),
            y: baseY + Math.random() * (groundY * 0.3),
            size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0])
        });
    }

    // Draw clouds as soft blobs (fake blur via multiple alpha strokes)
    clouds.forEach(cloud => {
        const blobCount = 5;
        for (let i = 0; i < blobCount; i++) {
            const offsetX = (Math.random() - 0.5) * cloud.size * 0.3;
            const offsetY = (Math.random() - 0.5) * cloud.size * 0.3;
            const blobSize = cloud.size * (0.6 + Math.random() * 0.4);
            const alpha = opacity * (0.3 + Math.random() * 0.3);

            cacheCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            cacheCtx.beginPath();
            cacheCtx.arc(cloud.x + offsetX, cloud.y + offsetY, blobSize, 0, Math.PI * 2);
            cacheCtx.fill();
        }
    });

    cloudLayersCache[layerName] = {
        canvas: cacheCanvas,
        speed: speed,
        x: 0
    };
}

function initBackground() {
    buildSunsetBackground();

    const height = window.innerHeight;
    const groundY = height * 0.85;

    // Far clouds (slow, high, small)
    buildCloudLayer('far', 8, groundY * 0.2, 0.05, [30, 50], 0.3);

    // Mid clouds (medium speed, medium height, medium size)
    buildCloudLayer('mid', 10, groundY * 0.4, 0.1, [40, 70], 0.4);

    // Near clouds (faster, lower, larger)
    buildCloudLayer('near', 12, groundY * 0.6, 0.15, [50, 90], 0.5);
}

function renderBackground() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    // Draw cached sunset background
    if (sunsetBackgroundCache) {
        ctx.drawImage(sunsetBackgroundCache, 0, 0);
    }

    // Draw cloud layers with parallax
    Object.keys(cloudLayersCache).forEach(layerName => {
        const layer = cloudLayersCache[layerName];
        if (layer && layer.canvas) {
            // Update parallax position
            layer.x += layer.speed;
            if (layer.x > width * 0.5) {
                layer.x = 0;
            }

            // Draw cloud layer (tile for seamless loop)
            ctx.drawImage(layer.canvas, layer.x, 0);
            ctx.drawImage(layer.canvas, layer.x - layer.canvas.width, 0);
        }
    });
}

// ============================================
// Canvas roundRect polyfill (for older browsers)
// ============================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}

// ============================================
// Robot Class (Armored Flying Hero)
// ============================================

class Robot {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 35;
        this.height = 45;
        this.velocityX = 0;
        this.velocityY = 0;
        this.gravity = 0.6;
        this.speed = 4;
        this.jumpPower = -12;
        this.thrustPower = -0.3; // Reduced from -0.8 for gentler hover
        this.maxUpwardSpeed = -4; // Cap upward velocity
        this.onGround = false;
        this.facingRight = true;
        this.punchCooldown = 0;
        this.punchActive = false;
        this.punchDuration = 0;
        this.laserCooldown = 0;
        this.fuel = 100;
        this.maxFuel = 100;
        this.fuelDrainRate = 0.25; // Reduced from 0.5 for longer flight
        this.fuelRegenRate = 0.3;
        this.thrusterParticles = [];
        this.airTime = 0; // Track time since leaving ground for lift delay
        this.liftDelay = 125; // 125ms delay before thrust engages
        this.laserEnergy = 100; // Energy for continuous laser
        this.maxLaserEnergy = 100;
        this.laserEnergyDrainRate = 8; // Energy drained per frame while firing
        this.laserEnergyRegenRate = 2; // Energy regenerated per frame when not firing
        this.laserFiring = false; // Whether laser is currently firing
        this.lastLaserFireTime = 0; // Last time laser was fired (for rate limiting)
        this.laserFireRate = 66; // Milliseconds between shots (15 shots/sec)
        this.missileCooldown = 0; // Cooldown for missile launch (frames)
        this.missileCooldownTime = 120; // 2 seconds at 60fps
        this.missilePoseTime = 0; // Animation time for missile launch pose
        this.missilePoseDuration = 15; // ~250ms at 60fps

        // Arm laser properties
        this.leftArmCooldown = 0;
        this.rightArmCooldown = 0;
        this.armFireRate = 12; // Frames (~200ms)
    }

    fireArmLaser(side) {
        // Determine fire position based on arm side
        // Robot dimensions: width 35, height 45
        // Arms are roughly at y + 15

        let laserX, laserY;
        const armY = this.y + 15;

        if (side === 'left') {
            // Left arm (from player perspective, it's left on screen if facing front)
            // But let's assume 'left means left side of body'
            // If facing right, left arm is "back" arm? 
            // Let's simplified: Left Arm offset, Right Arm offset relative to center.

            // Adjust based on facing direction
            if (this.facingRight) {
                laserX = this.x + 10; // Back arm
            } else {
                laserX = this.x + 25; // Front arm (reversed)
            }
        } else {
            // Right arm
            if (this.facingRight) {
                laserX = this.x + 25; // Front arm
            } else {
                laserX = this.x + 10; // Back arm
            }
        }

        laserY = armY;

        // Create laser projectile (horizontal)
        const direction = this.facingRight ? 1 : -1;

        // Use RobotHandLaser logic but straight horizontal? 
        // Or specific 'ArmLaser' class? 
        // Let's use RobotHandLaser but with fixed target direction.

        // Target is straight ahead
        const targetX = laserX + (direction * 500);
        const targetY = laserY; // Straight horizontal

        robotHandLasers.push(new RobotHandLaser(laserX, laserY, targetX, targetY));

        // Play sound
        playLaserZapSound();
    }

    update() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Handle movement
        if (robotControls.left) {
            this.velocityX = -this.speed;
            this.facingRight = false;
        } else if (robotControls.right) {
            this.velocityX = this.speed;
            this.facingRight = true;
        } else {
            // Friction: stronger damping while flying
            const friction = this.onGround ? 0.8 : 0.85;
            this.velocityX *= friction;
        }

        // Track air time for lift delay
        if (!this.onGround) {
            this.airTime++;
        } else {
            this.airTime = 0;
        }

        // Handle jump (tap)
        if (robotControls.jump && this.onGround && !robotControls.jumpHeld) {
            this.velocityY = this.jumpPower;
            this.onGround = false;
            robotControls.jumpHeld = true;
            this.airTime = 0; // Reset air time on jump
        }

        // Handle flight (hold jump after leaving ground) with lift delay
        // liftDelay is in ms, convert to frames: 125ms / 16.67ms per frame ≈ 7-8 frames
        const liftDelayFrames = Math.ceil(this.liftDelay / 16.67);
        const canThrust = !this.onGround && this.airTime >= liftDelayFrames;
        if (robotControls.jump && canThrust && this.fuel > 0) {
            // Apply gentle upward thrust
            this.velocityY += this.thrustPower;
            // Cap upward speed
            if (this.velocityY < this.maxUpwardSpeed) {
                this.velocityY = this.maxUpwardSpeed;
            }
            this.fuel = Math.max(0, this.fuel - this.fuelDrainRate);

            // Apply horizontal damping while flying for stability
            this.velocityX *= 0.92;

            // Create thruster particles
            if (Math.random() < 0.7) {
                const leftThrusterX = this.x + 8;
                const rightThrusterX = this.x + this.width - 8;
                const thrusterY = this.y + this.height - 5;

                this.thrusterParticles.push({
                    x: leftThrusterX + (Math.random() - 0.5) * 4,
                    y: thrusterY,
                    vx: (Math.random() - 0.5) * 2,
                    vy: Math.random() * 2 + 1,
                    life: 10,
                    color: Math.random() < 0.5 ? '#00aaff' : '#ff8800'
                });

                this.thrusterParticles.push({
                    x: rightThrusterX + (Math.random() - 0.5) * 4,
                    y: thrusterY,
                    vx: (Math.random() - 0.5) * 2,
                    vy: Math.random() * 2 + 1,
                    life: 10,
                    color: Math.random() < 0.5 ? '#00aaff' : '#ff8800'
                });
            }
        } else {
            // Regenerate fuel when not flying
            if (this.fuel < this.maxFuel) {
                this.fuel = Math.min(this.maxFuel, this.fuel + this.fuelRegenRate);
            }
        }

        // Update thruster particles
        this.thrusterParticles = this.thrusterParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            return p.life > 0;
        });

        // Handle punch
        if (robotControls.punch && this.punchCooldown <= 0) {
            this.punchActive = true;
            this.punchDuration = 10;
            this.punchCooldown = 18; // 18 frames = ~300ms at 60fps
            robotControls.punch = false; // One-time punch

            // Create punch shockwave
            const punchX = this.facingRight ? this.x + this.width : this.x - 30;
            const punchY = this.y + this.height / 2;
            createPunchShockwave(punchX, punchY);
        }

        // Arm Laser Logic (R / T keys)
        const currentTime = Date.now();

        // Right Arm (R key)
        if (robotControls.rightArmFire && currentTime - this.rightArmCooldown > 200) {
            this.fireArmLaser('right');
            this.rightArmCooldown = currentTime;
        }

        // Left Arm (T key)
        if (robotControls.leftArmFire && currentTime - this.leftArmCooldown > 200) {
            this.fireArmLaser('left');
            this.leftArmCooldown = currentTime;
        }

        // Handle continuous laser firing (pointer-aimed, hold-to-fire)
        if (this.laserFiring && pointerActive && this.laserEnergy > 0) {
            const currentTime = Date.now();
            if (currentTime - this.lastLaserFireTime >= this.laserFireRate) {
                const handX = this.facingRight ? this.x + this.width - 4 : this.x + 4;
                const handY = this.y + this.height / 2;

                robotHandLasers.push(new RobotHandLaser(handX, handY, pointerPosition.x, pointerPosition.y));
                this.lastLaserFireTime = currentTime;

                // Drain energy
                this.laserEnergy = Math.max(0, this.laserEnergy - this.laserEnergyDrainRate);

                // Apply recoil
                const dx = pointerPosition.x - handX;
                const dy = pointerPosition.y - handY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 0) {
                    const recoilX = -dx / distance * 1.5;
                    this.velocityX += recoilX;
                }

                // Play laser sound (occasionally to avoid spam)
                if (Math.random() < 0.3) {
                    playLaserZapSound();
                }
            }
        } else {
            // Regenerate energy when not firing
            if (this.laserEnergy < this.maxLaserEnergy) {
                this.laserEnergy = Math.min(this.maxLaserEnergy, this.laserEnergy + this.laserEnergyRegenRate);
            }
        }

        // Update punch state
        if (this.punchCooldown > 0) {
            this.punchCooldown--;
        }
        if (this.punchDuration > 0) {
            this.punchDuration--;
            if (this.punchDuration === 0) {
                this.punchActive = false;
            }
        }

        // Update missile cooldown and pose
        if (this.missileCooldown > 0) {
            this.missileCooldown--;
        }
        if (this.missilePoseTime > 0) {
            this.missilePoseTime--;
            if (this.missilePoseTime === 0) {
                // Launch missile
                const handX = this.facingRight ? this.x + this.width - 4 : this.x + 4;
                const handY = this.y + this.height / 2;
                const initialVelX = this.facingRight ? 8 : -8;
                const initialVelY = -3; // Slight upward
                robotMissiles.push(new RobotMissile(handX, handY, initialVelX, initialVelY));
            }
        }

        // Handle missile launch (O key)
        if (robotControls.missile && this.missileCooldown <= 0 && this.missilePoseTime === 0) {
            this.missilePoseTime = this.missilePoseDuration;
            this.missileCooldown = this.missileCooldownTime;
            robotControls.missile = false; // One-time trigger
        }

        // Handle Left Arm Laser (T Key)
        if (this.leftArmCooldown > 0) this.leftArmCooldown--;
        if (robotControls.leftArmFire && this.leftArmCooldown <= 0) {
            const handX = this.facingRight ? this.x + 10 : this.x + this.width - 10;
            const handY = this.y + 15; // Upper arm/shoulder height
            const targetX = this.facingRight ? handX + 1000 : handX - 1000;
            const targetY = handY; // Horizontal

            robotHandLasers.push(new RobotHandLaser(handX, handY, targetX, targetY));
            this.leftArmCooldown = this.armFireRate;

            // Recoil
            this.velocityX += this.facingRight ? -0.5 : 0.5;

            // Sound
            if (Math.random() < 0.5) playLaserZapSound();
        }

        // Handle Right Arm Laser (R Key)
        if (this.rightArmCooldown > 0) this.rightArmCooldown--;
        if (robotControls.rightArmFire && this.rightArmCooldown <= 0) {
            const handX = this.facingRight ? this.x + this.width - 5 : this.x + 5;
            const handY = this.y + 30; // Lower arm
            const targetX = this.facingRight ? handX + 1000 : handX - 1000;
            const targetY = handY; // Horizontal

            robotHandLasers.push(new RobotHandLaser(handX, handY, targetX, targetY));
            this.rightArmCooldown = this.armFireRate;

            // Recoil
            this.velocityX += this.facingRight ? -0.5 : 0.5;

            // Sound
            if (Math.random() < 0.5) playLaserZapSound();
        }

        // Laser cooldown no longer used (replaced by energy system)

        // Apply gravity
        if (!this.onGround && (!robotControls.jump || this.fuel <= 0)) {
            this.velocityY += this.gravity;
        }

        // Update position
        const newX = this.x + this.velocityX;
        const newY = this.y + this.velocityY;

        // Check ground collision (including bridge segments)
        let onGroundSurface = false;
        let groundSurfaceY = groundY;

        // Check bridge collision (City 2) - check segments with physics
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    const robotCenterX = this.x + this.width / 2;
                    // Check each intact segment
                    for (let segment of structure.segments) {
                        if (segment.state === 'broken' && segment.isKinematic) continue; // Skip broken kinematic segments

                        // Get segment position (physics-aware)
                        let segmentX, segmentY;
                        if (segment.isKinematic) {
                            segmentX = segment.baseX;
                            segmentY = segment.baseY + structure.swayOffset;
                        } else {
                            segmentX = segment.x;
                            segmentY = segment.y;
                        }

                        if (robotCenterX >= segmentX && robotCenterX <= segmentX + segment.w) {
                            if (newY + this.height >= segmentY && newY + this.height <= segmentY + segment.h + 5) {
                                groundSurfaceY = segmentY;
                                onGroundSurface = true;
                                break;
                            }
                        }
                    }
                    if (onGroundSurface) break;
                }
            }
        }

        if (newY + this.height >= groundSurfaceY) {
            this.y = groundSurfaceY - this.height;
            this.velocityY = 0;
            this.onGround = true;
            robotControls.jumpHeld = false;
        } else {
            this.y = newY;
            this.onGround = false;
        }

        // Check building collisions (horizontal)
        let canMoveX = true;
        for (let building of buildings) {
            if (building.state === 'collapsed') continue;

            if (building.intersects(newX, this.y, this.width, this.height)) {
                canMoveX = false;
                break;
            }
        }

        if (canMoveX) {
            this.x = newX;
        } else {
            this.velocityX = 0;
        }

        // Check building collisions (vertical - for jumping/flying)
        if (!this.onGround) {
            for (let building of buildings) {
                if (building.state === 'collapsed') continue;

                if (building.intersects(this.x, newY, this.width, this.height)) {
                    // Hit ceiling or building bottom
                    if (this.velocityY < 0) {
                        this.velocityY = 0;
                    }
                    break;
                }
            }
        }

        // Boundary check
        this.x = Math.max(0, Math.min(width - this.width, this.x));
    }

    render() {
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        ctx.save();

        // Draw shadow under feet
        const shadowY = drawY + this.height + 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(drawX + this.width / 2, shadowY, this.width * 0.4, this.width * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw thruster particles with glow
        this.thrusterParticles.forEach(p => {
            // Outer glow
            const gradient = ctx.createRadialGradient(
                p.x + screenShake.x, p.y + screenShake.y, 0,
                p.x + screenShake.x, p.y + screenShake.y, 6
            );
            gradient.addColorStop(0, p.color);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x + screenShake.x, p.y + screenShake.y, 6, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + screenShake.x, p.y + screenShake.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Main torso (rounded rectangle with metallic gradient)
        const torsoGradient = ctx.createLinearGradient(drawX + 5, drawY + 15, drawX + 30, drawY + 45);
        torsoGradient.addColorStop(0, '#d42e3f'); // Lighter red
        torsoGradient.addColorStop(0.5, '#c41e3a'); // Base red
        torsoGradient.addColorStop(1, '#a01a2e'); // Darker red
        ctx.fillStyle = torsoGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 5, drawY + 15, 25, 30, 4);
        ctx.fill();

        // Torso highlight (specular)
        const highlightGradient = ctx.createLinearGradient(drawX + 5, drawY + 15, drawX + 5, drawY + 25);
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 5, drawY + 15, 25, 12, 4);
        ctx.fill();

        // Panel lines (subtle)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX + 17.5, drawY + 15);
        ctx.lineTo(drawX + 17.5, drawY + 45);
        ctx.stroke();

        // Chest plate (metallic gold with gradient)
        const chestGradient = ctx.createLinearGradient(drawX + 10, drawY + 20, drawX + 25, drawY + 40);
        chestGradient.addColorStop(0, '#ffed4e'); // Bright gold
        chestGradient.addColorStop(0.5, '#ffd700'); // Base gold
        chestGradient.addColorStop(1, '#ccaa00'); // Dark gold
        ctx.fillStyle = chestGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 10, drawY + 20, 15, 20, 3);
        ctx.fill();

        // Chest plate highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.roundRect(drawX + 10, drawY + 20, 15, 8, 3);
        ctx.fill();

        // Chest reactor core (glowing cyan with pulsing effect)
        const reactorPulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
        const reactorGradient = ctx.createRadialGradient(
            drawX + this.width / 2, drawY + 30, 0,
            drawX + this.width / 2, drawY + 30, 8 * reactorPulse
        );
        reactorGradient.addColorStop(0, '#00ffff');
        reactorGradient.addColorStop(0.5, '#00aaff');
        reactorGradient.addColorStop(1, 'rgba(0, 170, 255, 0)');
        ctx.fillStyle = reactorGradient;
        ctx.beginPath();
        ctx.arc(drawX + this.width / 2, drawY + 30, 8 * reactorPulse, 0, Math.PI * 2);
        ctx.fill();

        // Reactor core
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(drawX + this.width / 2, drawY + 30, 5, 0, Math.PI * 2);
        ctx.fill();

        // Reactor outer glow
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(drawX + this.width / 2, drawY + 30, 12, 0, Math.PI * 2);
        ctx.fill();

        // Head (rounded with metallic gradient)
        const headGradient = ctx.createLinearGradient(drawX + 8, drawY, drawX + 27, drawY + 18);
        headGradient.addColorStop(0, '#d42e3f');
        headGradient.addColorStop(0.5, '#c41e3a');
        headGradient.addColorStop(1, '#a01a2e');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 8, drawY, 19, 18, 3);
        ctx.fill();

        // Head highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.roundRect(drawX + 8, drawY, 19, 9, 3);
        ctx.fill();

        // Helmet visor (gold with reflection)
        const visorGradient = ctx.createLinearGradient(drawX + 10, drawY + 3, drawX + 25, drawY + 15);
        visorGradient.addColorStop(0, '#ffed4e');
        visorGradient.addColorStop(0.3, '#ffd700');
        visorGradient.addColorStop(0.7, '#ccaa00');
        visorGradient.addColorStop(1, '#996600');
        ctx.fillStyle = visorGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 10, drawY + 3, 15, 12, 2);
        ctx.fill();

        // Visor reflection streak
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(drawX + 12, drawY + 5);
        ctx.lineTo(drawX + 20, drawY + 5);
        ctx.lineTo(drawX + 18, drawY + 10);
        ctx.lineTo(drawX + 10, drawY + 10);
        ctx.closePath();
        ctx.fill();

        // Eyes (glowing blue with emissive glow)
        const eyeGlow = ctx.createRadialGradient(drawX + 14, drawY + 8, 0, drawX + 14, drawY + 8, 5);
        eyeGlow.addColorStop(0, '#00aaff');
        eyeGlow.addColorStop(1, 'rgba(0, 170, 255, 0)');
        ctx.fillStyle = eyeGlow;
        ctx.beginPath();
        ctx.arc(drawX + 14, drawY + 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 21, drawY + 8, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00aaff';
        ctx.beginPath();
        ctx.arc(drawX + 14, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 21, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();

        // Shoulders (rounded with metallic gold)
        const shoulderGradient = ctx.createRadialGradient(
            drawX + 4, drawY + 24, 0,
            drawX + 4, drawY + 24, 8
        );
        shoulderGradient.addColorStop(0, '#ffed4e');
        shoulderGradient.addColorStop(1, '#ccaa00');
        ctx.fillStyle = shoulderGradient;
        ctx.beginPath();
        ctx.arc(drawX + 4, drawY + 24, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 31, drawY + 24, 8, 0, Math.PI * 2);
        ctx.fill();

        // Shoulder highlights
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(drawX + 4, drawY + 22, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 31, drawY + 22, 4, 0, Math.PI * 2);
        ctx.fill();

        // Arms (rounded with gradient) - adjust for missile pose
        const missilePoseProgress = this.missilePoseTime > 0 ? 1 - (this.missilePoseTime / this.missilePoseDuration) : 0;
        const armRaise = missilePoseProgress * 8; // Raise arm 8px when launching missile

        const armGradient = ctx.createLinearGradient(drawX, drawY + 30, drawX + 8, drawY + 45);
        armGradient.addColorStop(0, '#d42e3f');
        armGradient.addColorStop(1, '#a01a2e');
        ctx.fillStyle = armGradient;

        // Left arm
        ctx.save();
        ctx.translate(drawX + 4, drawY + 37);
        ctx.rotate(-armRaise * 0.1); // Slight rotation when raising
        ctx.beginPath();
        ctx.roundRect(-4, -7, 8, 15, 2);
        ctx.fill();
        ctx.restore();

        // Right arm (missile launch arm)
        ctx.save();
        ctx.translate(drawX + 31, drawY + 37);
        ctx.rotate(-armRaise * 0.15); // More rotation for missile arm
        ctx.beginPath();
        ctx.roundRect(-4, -7 - armRaise, 8, 15, 2);
        ctx.fill();
        ctx.restore();

        // Hand thrusters (when flying or firing laser) - enhanced glow
        const isThrusting = !this.onGround && robotControls.jump && this.fuel > 0;
        const isFiringLaser = this.laserFiring && pointerActive && this.laserEnergy > 0;

        if (isThrusting || isFiringLaser) {
            // Left hand thruster
            const leftThrusterGlow = ctx.createRadialGradient(
                drawX + 4, drawY + 42, 0,
                drawX + 4, drawY + 42, 10
            );
            leftThrusterGlow.addColorStop(0, '#00aaff');
            leftThrusterGlow.addColorStop(0.5, '#0088ff');
            leftThrusterGlow.addColorStop(1, 'rgba(0, 136, 255, 0)');
            ctx.fillStyle = leftThrusterGlow;
            ctx.beginPath();
            ctx.arc(drawX + 4, drawY + 42, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#00aaff';
            ctx.beginPath();
            ctx.arc(drawX + 4, drawY + 42, 5, 0, Math.PI * 2);
            ctx.fill();

            // Right hand thruster
            const rightThrusterGlow = ctx.createRadialGradient(
                drawX + 31, drawY + 42, 0,
                drawX + 31, drawY + 42, 10
            );
            rightThrusterGlow.addColorStop(0, '#00aaff');
            rightThrusterGlow.addColorStop(0.5, '#0088ff');
            rightThrusterGlow.addColorStop(1, 'rgba(0, 136, 255, 0)');
            ctx.fillStyle = rightThrusterGlow;
            ctx.beginPath();
            ctx.arc(drawX + 31, drawY + 42, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#00aaff';
            ctx.beginPath();
            ctx.arc(drawX + 31, drawY + 42, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Legs (rounded with gradient)
        const legGradient = ctx.createLinearGradient(drawX + 10, drawY + 45, drawX + 16, drawY + 53);
        legGradient.addColorStop(0, '#d42e3f');
        legGradient.addColorStop(1, '#a01a2e');
        ctx.fillStyle = legGradient;
        ctx.beginPath();
        ctx.roundRect(drawX + 10, drawY + 45, 6, 8, 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(drawX + 19, drawY + 45, 6, 8, 2);
        ctx.fill();

        // Vent details (small lines)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(drawX + 7 + i * 2, drawY + 38);
            ctx.lineTo(drawX + 7 + i * 2, drawY + 42);
            ctx.stroke();
        }

        // Draw punch effect
        if (this.punchActive) {
            const punchX = this.facingRight ? drawX + this.width : drawX - 20;
            const punchY = drawY + this.height / 2;

            const punchGlow = ctx.createRadialGradient(punchX, punchY, 0, punchX, punchY, 30);
            punchGlow.addColorStop(0, 'rgba(255, 200, 0, 0.8)');
            punchGlow.addColorStop(1, 'rgba(255, 200, 0, 0)');
            ctx.fillStyle = punchGlow;
            ctx.beginPath();
            ctx.arc(punchX, punchY, 30, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    getLaserEnergyPercent() {
        return this.laserEnergy / this.maxLaserEnergy;
    }

    renderFuelMeter() {
        const width = window.innerWidth;
        const x = 20;
        const y = 80;
        const meterWidth = 120;
        const meterHeight = 8;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, meterWidth, meterHeight);

        // Fuel bar
        const fuelPercent = this.fuel / this.maxFuel;
        ctx.fillStyle = fuelPercent > 0.5 ? '#00ff00' : fuelPercent > 0.25 ? '#ffff00' : '#ff0000';
        ctx.fillRect(x, y, meterWidth * fuelPercent, meterHeight);

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, meterWidth, meterHeight);

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('FUEL', x, y - 5);
    }

    renderLaserEnergyMeter() {
        const width = window.innerWidth;
        const x = 20;
        const y = 100;
        const meterWidth = 120;
        const meterHeight = 8;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, meterWidth, meterHeight);

        // Energy bar
        const energyPercent = this.laserEnergy / this.maxLaserEnergy;
        ctx.fillStyle = energyPercent > 0.5 ? '#00aaff' : energyPercent > 0.25 ? '#ffaa00' : '#ff0000';
        ctx.fillRect(x, y, meterWidth * energyPercent, meterHeight);

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, meterWidth, meterHeight);

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('LASER', x, y - 5);
    }
}

// ============================================
// UFO Class
// ============================================

class UFO {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 30;
        this.velocityX = 0;
        this.velocityY = 0;
        this.baseSpeed = 5;
        this.speed = 5;
        this.laserActive = false;
        this.tractorActive = false;
        this.lastLaserFireTime = 0;
        this.laserFireRate = 125; // Milliseconds between shots (8 shots/sec)
        this.baseLaserDPS = 20; // Base DPS for laser
        this.tractorRadius = 150;
        this.tractorMaxObjects = 30;
        this.tractorObjects = [];
        this.invisible = false; // Invisibility state
        this.shimmerPhase = 0; // For shimmer effect when invisible
        this.variant = ufoVariant || 'scout'; // UFO variant: 'scout', 'destroyer', 'harvester' (default to scout if not set)
        this.laserDPSMultiplier = 1.0;
        this.tractorStrengthMultiplier = 1.0;
        // Tank control properties
        this.angle = -Math.PI / 2; // Face up by default
        this.rotationSpeed = 0.08;
        this.friction = 0.96; // Less friction for space-like feel
        this.updateVariantStats(); // Apply variant stats
    }

    updateVariantStats() {
        // Apply variant-specific stats
        if (this.variant === 'scout') {
            this.speed = this.baseSpeed * 1.2; // +20%
            this.laserDPSMultiplier = 0.75; // -25%
            this.tractorStrengthMultiplier = 0.75; // -25%
        } else if (this.variant === 'destroyer') {
            this.speed = this.baseSpeed * 0.85; // -15%
            this.laserDPSMultiplier = 1.4; // +40%
            this.tractorStrengthMultiplier = 1.0; // +0%
        } else if (this.variant === 'harvester') {
            this.speed = this.baseSpeed; // +0%
            this.laserDPSMultiplier = 0.8; // -20%
            this.tractorStrengthMultiplier = 1.6; // +60%
        }
    }

    update() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Handle movement
        // Handle movement (Tank Controls)
        // Horizontal input -> Rotate
        if (ufoControls.left) {
            this.angle -= this.rotationSpeed;
        } else if (ufoControls.right) {
            this.angle += this.rotationSpeed;
        }

        // Vertical input -> Move forward/backward
        if (ufoControls.up) {
            this.velocityX += Math.cos(this.angle) * this.speed * 0.1; // *0.1 for acceleration feel
            this.velocityY += Math.sin(this.angle) * this.speed * 0.1;
        } else if (ufoControls.down) {
            this.velocityX -= Math.cos(this.angle) * this.speed * 0.05; // Backwards is slower
            this.velocityY -= Math.sin(this.angle) * this.speed * 0.05;
        }

        // Apply friction
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Boundary check
        this.x = Math.max(this.width / 2, Math.min(width - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(height - this.height / 2, this.y));

        // Update shimmer phase for invisibility effect
        if (this.invisible) {
            this.shimmerPhase += 0.1;
            if (this.shimmerPhase > Math.PI * 2) {
                this.shimmerPhase -= Math.PI * 2;
            }
        }

        // Handle laser (continuous beam while E is held, pointer-aimed)
        // Only fire if in UFO mode (safety check)
        if (currentWeapon === 'ufo' && ufoControls.laser && pointerActive) {
            const currentTime = Date.now();
            if (currentTime - this.lastLaserFireTime >= this.laserFireRate) {
                const centerX = this.x;
                const centerY = this.y + this.height / 2;
                // Aim toward pointer position
                ufoHandLasers.push(new UFOLaser(centerX, centerY, pointerPosition.x, pointerPosition.y));
                this.lastLaserFireTime = currentTime;
                playUFOLaserSound();
            }
        }

        // Handle tractor beam (while F is held)
        // Only active if in UFO mode (safety check)
        if (currentWeapon === 'ufo' && ufoControls.tractor) {
            this.tractorActive = true;
            this.applyTractorBeam();
        } else {
            this.tractorActive = false;
            this.tractorObjects = [];
        }
    }

    applyTractorBeam() {
        const centerX = this.x;
        const centerY = this.y + this.height / 2;
        const tractorY = centerY + this.height / 2;

        // Collect nearby fragments/particles
        const nearbyObjects = [];

        // Check particles (only pull non-sleeping ones, but can wake sleeping ones)
        particles.forEach((particle, index) => {
            // Skip particles marked as "do not draw" (too far/old)
            if (particle.doNotDraw) return;

            const dx = particle.x - centerX;
            const dy = particle.y - tractorY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.tractorRadius && nearbyObjects.length < this.tractorMaxObjects) {
                // Wake up sleeping particles if in tractor range
                if (particle.sleeping) {
                    particle.sleeping = false;
                    particle.settledTime = null;
                    particle.doNotDraw = false;
                }
                nearbyObjects.push({ type: 'particle', index, x: particle.x, y: particle.y, obj: particle });
            }
        });

        // Pull objects upward and toward UFO center
        nearbyObjects.forEach(item => {
            if (item.type === 'particle') {
                const particle = item.obj;
                const dx = centerX - particle.x;
                const dy = (tractorY - 20) - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0) {
                    const pullStrength = 0.15 * this.tractorStrengthMultiplier; // Apply variant multiplier
                    const pullX = (dx / distance) * pullStrength;
                    const pullY = (dy / distance) * pullStrength;

                    particle.vx += pullX;
                    particle.vy += pullY;

                    // Add damping to prevent vibration
                    particle.vx *= 0.95;
                    particle.vy *= 0.95;
                }
            }
        });

        // Check intact buildings for voxelization (pixelate into squares)
        const currentTime = Date.now();
        const voxelSpawnInterval = 1000 / MAX_VOXEL_SPAWNS_PER_SECOND; // ~8.3ms per spawn

        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const buildingCenterX = building.getCenterX();
            const buildingCenterY = building.getCenterY();
            const dx = buildingCenterX - centerX;
            const dy = buildingCenterY - tractorY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.tractorRadius) {
                // Rate-limited voxelization: spawn square chunks every 80-140ms
                const timeSinceLastSpawn = currentTime - building.lastVoxelSpawnTime;
                const spawnInterval = 80 + Math.random() * 60; // 80-140ms

                if (timeSinceLastSpawn >= spawnInterval && voxelBits.length < MAX_VOXEL_BITS) {
                    // Voxelize: detach cluster of small squares from building
                    const normalizedDist = distance / this.tractorRadius;
                    const clusterSize = 3 + Math.floor((1 - normalizedDist) * 5); // 3-8 squares per cluster

                    // Find region closest to beam center (lower part of building)
                    const voxelRegionX = building.x + (buildingCenterX - building.x) * (0.3 + Math.random() * 0.4);
                    const voxelRegionY = building.y + building.height * (0.5 + Math.random() * 0.3);

                    for (let i = 0; i < clusterSize; i++) {
                        if (voxelBits.length >= MAX_VOXEL_BITS) break;

                        // Random position within region
                        const voxelX = voxelRegionX + (Math.random() - 0.5) * building.width * 0.3;
                        const voxelY = voxelRegionY + (Math.random() - 0.5) * building.height * 0.2;

                        // Clamp to building bounds
                        const clampedX = Math.max(building.x, Math.min(building.x + building.width, voxelX));
                        const clampedY = Math.max(building.y, Math.min(building.y + building.height, voxelY));

                        // Convert to grid coordinates
                        const gridX = Math.floor((clampedX - building.x) / building.voxelGridSize);
                        const gridY = Math.floor((clampedY - building.y) / building.voxelGridSize);
                        const voxelKey = `${gridX},${gridY}`;

                        // Skip if already removed
                        if (building.voxelCutouts.has(voxelKey)) continue;

                        // Mark as removed
                        building.voxelCutouts.add(voxelKey);

                        // Calculate actual pixel position
                        const actualX = building.x + gridX * building.voxelGridSize;
                        const actualY = building.y + gridY * building.voxelGridSize;

                        // Square size: 6-14px
                        const squareSize = 6 + Math.random() * 8;

                        // Initial velocity: upward + toward UFO
                        const angleToUFO = Math.atan2(centerY - actualY, centerX - actualX);
                        const speed = 2 + Math.random() * 2;
                        const velocityX = Math.cos(angleToUFO) * speed + (Math.random() - 0.5) * 1;
                        const velocityY = -Math.abs(Math.sin(angleToUFO)) * speed - 1 - Math.random() * 1;

                        // Get building color for voxel bit
                        let voxelColor;
                        if (building.buildingStyle === 'glass') {
                            voxelColor = Math.random() < 0.5 ? building.glassColor.mid : building.glassColor.bottom;
                        } else if (building.buildingStyle === 'brick') {
                            voxelColor = Math.random() < 0.5 ? building.brickColor.base : building.brickColor.dark;
                        } else {
                            voxelColor = Math.random() < 0.5 ? building.concreteColor.base : building.concreteColor.dark;
                        }

                        // Create voxel bit
                        voxelBits.push(new VoxelBit(
                            actualX, actualY,
                            squareSize,
                            voxelColor,
                            velocityX, velocityY,
                            building
                        ));
                    }

                    // Reduce building health
                    const normalizedDist = distance / this.tractorRadius;
                    const damage = (1 - normalizedDist) * (clusterSize * 0.8); // Damage based on chunks removed
                    building.takeDamage(damage);

                    // Invalidate render cache to show cutouts
                    building.cacheDirty = true;

                    building.lastVoxelSpawnTime = currentTime;
                }

                // Pull existing voxel bits from this building
                voxelBits.forEach(voxelBit => {
                    if (voxelBit.buildingRef === building && !voxelBit.sleeping) {
                        const dx = centerX - voxelBit.x;
                        const dy = (tractorY - 20) - voxelBit.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < this.tractorRadius) {
                            const pullStrength = 0.2;
                            const pullX = (dx / dist) * pullStrength;
                            const pullY = (dy / dist) * pullStrength;

                            voxelBit.velocityX += pullX;
                            voxelBit.velocityY += pullY;

                            // Damping
                            voxelBit.velocityX *= 0.95;
                            voxelBit.velocityY *= 0.95;
                        }
                    }
                });
            }
        });
    }

    render() {
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        ctx.save();

        // Apply invisibility alpha (0.25-0.4 range as specified)
        const baseAlpha = this.invisible ? 0.3 : 1.0; // 0.3 is within 0.25-0.4 range
        ctx.globalAlpha = baseAlpha;

        // Rotate context for tank controls
        ctx.translate(drawX, drawY + this.height / 2);
        ctx.rotate(this.angle + Math.PI / 2); // Adjust for sprite facing up
        ctx.translate(-drawX, -(drawY + this.height / 2));

        // Draw tractor beam cone (if active)
        if (this.tractorActive) {
            const centerX = drawX;
            const centerY = drawY + this.height / 2;
            const tractorY = centerY + this.height / 2;

            // Cone gradient
            const coneGradient = ctx.createRadialGradient(
                centerX, tractorY, 0,
                centerX, tractorY, this.tractorRadius
            );
            coneGradient.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
            coneGradient.addColorStop(0.5, 'rgba(100, 200, 255, 0.2)');
            coneGradient.addColorStop(1, 'rgba(100, 200, 255, 0)');

            ctx.fillStyle = coneGradient;
            ctx.beginPath();
            ctx.moveTo(centerX - this.tractorRadius * 0.3, centerY);
            ctx.lineTo(centerX - this.tractorRadius, tractorY + this.tractorRadius);
            ctx.lineTo(centerX + this.tractorRadius, tractorY + this.tractorRadius);
            ctx.lineTo(centerX + this.tractorRadius * 0.3, centerY);
            ctx.closePath();
            ctx.fill();

            // Beam lines
            ctx.strokeStyle = 'rgba(150, 220, 255, 0.6)';
            ctx.lineWidth = 2;
            for (let i = -2; i <= 2; i++) {
                const offsetX = i * 15;
                ctx.beginPath();
                ctx.moveTo(centerX + offsetX, centerY);
                ctx.lineTo(centerX + offsetX * 2, tractorY + this.tractorRadius);
                ctx.stroke();
            }
        }

        // Draw pixel-art UFO
        drawPixelUFO(ctx, this, drawX, drawY);

        ctx.restore();
    }
}

// ============================================
// Pixel-Art UFO Renderer
// ============================================

function drawPixelUFO(ctx, ufo, drawX, drawY) {
    const pixelSize = 4; // Fixed pixel size (4px)
    const centerX = Math.floor(drawX);
    const centerY = Math.floor(drawY);

    // Palette
    const colors = {
        outline: '#1a1a1a', // Near-black outline (1px border)
        glassDark: 'rgba(80, 180, 220, 0.6)', // Dark cyan
        glassMid: 'rgba(100, 200, 255, 0.7)', // Medium cyan
        glassLight: 'rgba(150, 230, 255, 0.8)', // Light cyan
        glassHighlight: 'rgba(200, 250, 255, 0.9)', // Highlight cyan
        metalDark: '#505050', // Dark gray (underside)
        metalMid: '#808080', // Medium gray
        metalLight: '#b0b0b0', // Light gray/silver
        rimLine: '#606060', // Rim separator line
        lightOn: '#ffff00', // Yellow light (on)
        lightDim: '#88aa00', // Dim yellow-green light
        glow: 'rgba(100, 200, 255, 0.15)' // Under-glow (low alpha)
    };

    // Apply invisibility alpha
    const baseAlpha = ufo.invisible ? 0.3 : 1.0;

    // Sprite definition: grid-based (x, y relative to center, color type)
    // Format: [gridX, gridY, colorKey]
    // Saucer shape: wider at middle, narrower at top/bottom
    const sprite = [
        // Top outline row
        [-7, -4, 'outline'], [-6, -4, 'outline'], [-5, -4, 'outline'], [-4, -4, 'outline'], [-3, -4, 'outline'], [-2, -4, 'outline'], [-1, -4, 'outline'], [0, -4, 'outline'], [1, -4, 'outline'], [2, -4, 'outline'], [3, -4, 'outline'], [4, -4, 'outline'], [5, -4, 'outline'], [6, -4, 'outline'], [7, -4, 'outline'],

        // Glass dome rows (top half)
        // Row -3 (top of dome)
        [-7, -3, 'outline'], [-5, -3, 'glassDark'], [-4, -3, 'glassMid'], [-3, -3, 'glassLight'], [-2, -3, 'glassLight'], [-1, -3, 'glassLight'], [0, -3, 'glassHighlight'], [1, -3, 'glassLight'], [2, -3, 'glassLight'], [3, -3, 'glassLight'], [4, -3, 'glassMid'], [5, -3, 'glassDark'], [7, -3, 'outline'],
        // Row -2
        [-7, -2, 'outline'], [-6, -2, 'glassDark'], [-5, -2, 'glassMid'], [-4, -2, 'glassLight'], [-3, -2, 'glassLight'], [-2, -2, 'glassLight'], [-1, -2, 'glassLight'], [0, -2, 'glassHighlight'], [1, -2, 'glassLight'], [2, -2, 'glassLight'], [3, -2, 'glassLight'], [4, -2, 'glassMid'], [5, -2, 'glassLight'], [6, -2, 'glassDark'], [7, -2, 'outline'],
        // Row -1
        [-7, -1, 'outline'], [-6, -1, 'glassDark'], [-5, -1, 'glassMid'], [-4, -1, 'glassLight'], [-3, -1, 'glassLight'], [-2, -1, 'glassLight'], [-1, -1, 'glassLight'], [0, -1, 'glassHighlight'], [1, -1, 'glassLight'], [2, -1, 'glassLight'], [3, -1, 'glassLight'], [4, -1, 'glassMid'], [5, -1, 'glassLight'], [6, -1, 'glassDark'], [7, -1, 'outline'],

        // Rim line (separator between dome and body)
        [-7, 0, 'outline'], [-6, 0, 'rimLine'], [-5, 0, 'rimLine'], [-4, 0, 'rimLine'], [-3, 0, 'rimLine'], [-2, 0, 'rimLine'], [-1, 0, 'rimLine'], [0, 0, 'rimLine'], [1, 0, 'rimLine'], [2, 0, 'rimLine'], [3, 0, 'rimLine'], [4, 0, 'rimLine'], [5, 0, 'rimLine'], [6, 0, 'rimLine'], [7, 0, 'outline'],

        // Metal body rows (bottom half)
        // Row 1
        [-7, 1, 'outline'], [-6, 1, 'metalDark'], [-5, 1, 'metalMid'], [-4, 1, 'metalMid'], [-3, 1, 'metalLight'], [-2, 1, 'metalLight'], [-1, 1, 'metalLight'], [0, 1, 'metalLight'], [1, 1, 'metalLight'], [2, 1, 'metalLight'], [3, 1, 'metalLight'], [4, 1, 'metalMid'], [5, 1, 'metalMid'], [6, 1, 'metalDark'], [7, 1, 'outline'],
        // Row 2
        [-7, 2, 'outline'], [-6, 2, 'metalDark'], [-5, 2, 'metalDark'], [-4, 2, 'metalMid'], [-3, 2, 'metalMid'], [-2, 2, 'metalLight'], [-1, 2, 'metalLight'], [0, 2, 'metalLight'], [1, 2, 'metalLight'], [2, 2, 'metalLight'], [3, 2, 'metalMid'], [4, 2, 'metalMid'], [5, 2, 'metalDark'], [6, 2, 'metalDark'], [7, 2, 'outline'],
        // Row 3 (bottom/underside - darker)
        [-7, 3, 'outline'], [-6, 3, 'outline'], [-5, 3, 'metalDark'], [-4, 3, 'metalDark'], [-3, 3, 'metalDark'], [-2, 3, 'metalMid'], [-1, 3, 'metalMid'], [0, 3, 'metalMid'], [1, 3, 'metalMid'], [2, 3, 'metalMid'], [3, 3, 'metalDark'], [4, 3, 'metalDark'], [5, 3, 'metalDark'], [6, 3, 'outline'], [7, 3, 'outline'],
        // Bottom outline row
        [-6, 4, 'outline'], [-5, 4, 'outline'], [-4, 4, 'outline'], [-3, 4, 'outline'], [-2, 4, 'outline'], [-1, 4, 'outline'], [0, 4, 'outline'], [1, 4, 'outline'], [2, 4, 'outline'], [3, 4, 'outline'], [4, 4, 'outline'], [5, 4, 'outline'], [6, 4, 'outline']
    ];

    // Rim lights positions (7 lights on rim line, deterministic blinking)
    const rimLights = [
        [-6, 0], [-3, -1], [0, -2], [3, -1], [6, 0], [3, 1], [-3, 1]
    ];

    // Under-glow pixels (soft, low alpha, drawn as pixel blocks below UFO)
    const underGlow = [
        [-4, 4], [-3, 4], [-2, 4], [-1, 4], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
        [-3, 5], [-2, 5], [-1, 5], [0, 5], [1, 5], [2, 5], [3, 5],
        [-2, 6], [-1, 6], [0, 6], [1, 6], [2, 6]
    ];

    // Draw under-glow first (behind UFO)
    if (!ufo.invisible) {
        ctx.fillStyle = colors.glow;
        ctx.globalAlpha = 1.0; // Use full alpha for glow color itself
        underGlow.forEach(([gx, gy]) => {
            const px = centerX + gx * pixelSize;
            const py = centerY + gy * pixelSize;
            ctx.fillRect(px, py, pixelSize, pixelSize);
        });
    }

    // Draw main sprite pixels
    sprite.forEach(([gx, gy, colorKey]) => {
        const color = colors[colorKey];
        if (!color) return;

        const px = centerX + gx * pixelSize;
        const py = centerY + gy * pixelSize;

        // Apply alpha for glass colors and invisibility
        let finalAlpha = baseAlpha;
        if (colorKey.startsWith('glass')) {
            // Extract alpha from rgba string if present
            const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
            if (rgbaMatch) {
                const parts = rgbaMatch[1].split(',');
                if (parts.length === 4) {
                    finalAlpha = parseFloat(parts[3].trim()) * baseAlpha;
                }
            }
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = finalAlpha;
        ctx.fillRect(px, py, pixelSize, pixelSize);
    });

    // Draw rim lights with deterministic blinking pattern
    const currentTime = Date.now();
    const blinkSpeed = 0.0015; // Slow blink (~2 seconds per cycle)
    rimLights.forEach(([gx, gy], index) => {
        // Deterministic pattern: each light has a phase offset for wave effect
        const phase = currentTime * blinkSpeed + index * 0.6;
        const blinkValue = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // 0 to 1

        if (blinkValue > 0.15) { // Only draw if bright enough
            const px = centerX + gx * pixelSize;
            const py = centerY + gy * pixelSize;

            // Interpolate between dim and bright based on blink value
            const lightAlpha = blinkValue * baseAlpha;
            if (blinkValue > 0.65) {
                ctx.fillStyle = colors.lightOn;
            } else {
                ctx.fillStyle = colors.lightDim;
            }
            ctx.globalAlpha = lightAlpha;
            ctx.fillRect(px, py, pixelSize, pixelSize);
        }
    });

    // Reset alpha
    ctx.globalAlpha = baseAlpha;

    // Shimmer effect when invisible (subtle pixel blocks)
    if (ufo.invisible) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.globalAlpha = 0.25;
        const shimmerCount = 5;
        const shimmerRadius = 20; // pixels
        for (let i = 0; i < shimmerCount; i++) {
            const shimmerAngle = ufo.shimmerPhase + i * Math.PI * 2 / shimmerCount;
            const shimmerX = centerX + Math.cos(shimmerAngle) * shimmerRadius;
            const shimmerY = centerY + Math.sin(shimmerAngle) * shimmerRadius;
            const px = Math.floor(shimmerX / pixelSize) * pixelSize;
            const py = Math.floor(shimmerY / pixelSize) * pixelSize;
            ctx.fillRect(px, py, pixelSize, pixelSize);
        }
    }
}

// ============================================
// UFO Laser Class
// ============================================

class UFOLaser {
    constructor(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.startTime = Date.now();
        this.duration = 200;
        this.active = true;
        this.impactSparks = [];

        // Calculate direction vector (normalized)
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            this.dirX = dx / distance;
            this.dirY = dy / distance;
        } else {
            // Default to straight down if no target
            this.dirX = 0;
            this.dirY = 1;
        }

        // Calculate end point (intersect with screen bounds for infinite range)
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Find intersection with screen rectangle
        let t = Infinity;

        // Check top edge (y = 0)
        if (this.dirY < 0) {
            const tTop = -startY / this.dirY;
            if (tTop > 0 && startX + this.dirX * tTop >= 0 && startX + this.dirX * tTop <= width) {
                t = Math.min(t, tTop);
            }
        }

        // Check bottom edge (y = height)
        if (this.dirY > 0) {
            const tBottom = (height - startY) / this.dirY;
            if (tBottom > 0 && startX + this.dirX * tBottom >= 0 && startX + this.dirX * tBottom <= width) {
                t = Math.min(t, tBottom);
            }
        }

        // Check left edge (x = 0)
        if (this.dirX < 0) {
            const tLeft = -startX / this.dirX;
            if (tLeft > 0 && startY + this.dirY * tLeft >= 0 && startY + this.dirY * tLeft <= height) {
                t = Math.min(t, tLeft);
            }
        }

        // Check right edge (x = width)
        if (this.dirX > 0) {
            const tRight = (width - startX) / this.dirX;
            if (tRight > 0 && startY + this.dirY * tRight >= 0 && startY + this.dirY * tRight <= height) {
                t = Math.min(t, tRight);
            }
        }

        // Calculate end point
        this.endX = startX + this.dirX * t;
        this.endY = startY + this.dirY * t;
        this.length = Math.sqrt(
            Math.pow(this.endX - startX, 2) + Math.pow(this.endY - startY, 2)
        );
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration) {
            this.active = false;
            return;
        }

        // Rate limit impact sparks (max 8 per second)
        const maxSparksPerSecond = 8;
        const sparkInterval = 1000 / maxSparksPerSecond;
        const lastSparkTime = this.impactSparks.length > 0 ? this.impactSparks[this.impactSparks.length - 1].time : 0;
        const canSpawnSpark = elapsed - lastSparkTime >= sparkInterval;

        // Check building intersections
        const step = 8;
        const steps = Math.floor(this.length / step);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const checkX = this.startX + this.dirX * t * this.length;
            const checkY = this.startY + this.dirY * t * this.length;

            buildings.forEach(building => {
                if (building.state === 'collapsed') return;

                if (building.contains(checkX, checkY)) {
                    const hitDistance = Math.sqrt(
                        Math.pow(checkX - this.startX, 2) + Math.pow(checkY - this.startY, 2)
                    );
                    const normalizedDistance = Math.min(1, hitDistance / this.length);
                    const falloff = Math.pow(1 - normalizedDistance, 2);

                    // DPS: damage per frame (apply variant multiplier)
                    const dps = ufo ? (ufo.baseLaserDPS * ufo.laserDPSMultiplier) : 20;
                    const frameDamage = (dps / 60) * (this.duration / 1000);
                    const damage = frameDamage * falloff;

                    building.takeDamage(damage, hitDistance, this.length);

                    // Damage bridge segments if in City 2
                    if (currentCityId === 2) {
                        staticStructures.forEach(structure => {
                            if (structure instanceof Bridge) {
                                for (let segment of structure.segments) {
                                    if (segment.state === 'broken') continue;
                                    const segCenterX = segment.x + segment.w / 2;
                                    const segCenterY = segment.y + segment.h / 2;
                                    const segDist = Math.sqrt(
                                        Math.pow(segCenterX - checkX, 2) + Math.pow(segCenterY - checkY, 2)
                                    );
                                    if (segDist < 20) {
                                        segment.takeDamage(damage * 0.5); // Bridge segments take less damage
                                    }
                                }
                            }
                        });
                    }

                    // Create impact explosion (rate limited)
                    if (canSpawnSpark && !this.impactSparks.some(p =>
                        Math.abs(p.x - checkX) < 25 && Math.abs(p.y - checkY) < 25
                    )) {
                        this.impactSparks.push({ x: checkX, y: checkY, time: elapsed });
                        explosions.push(new Explosion(checkX, checkY, 25, 0));
                    }
                }
            });
        }
    }

    render() {
        if (!this.active) return;

        const drawStartX = this.startX + screenShake.x;
        const drawStartY = this.startY + screenShake.y;
        const drawEndX = this.endX + screenShake.x;
        const drawEndY = this.endY + screenShake.y;

        // Check if UFO is invisible (reduce brightness slightly)
        const ufoInvisible = ufo && ufo.invisible;
        const brightnessMultiplier = ufoInvisible ? 0.6 : 1.0;

        // Outer glow
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 * brightnessMultiplier})`;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();

        // Mid glow
        ctx.strokeStyle = `rgba(150, 220, 255, ${0.6 * brightnessMultiplier})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();

        // Bright core
        ctx.strokeStyle = `rgba(255, 255, 255, ${brightnessMultiplier})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();
    }
}

function playUFOLaserSound() {
    if (!audioContext || audioContext.state !== 'running') return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 400 + Math.random() * 200;

        gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        // Ignore sound errors
    }
}

function createPunchShockwave(x, y) {
    const explosionRadius = 60;
    const damageRadius = 80;

    explosions.push(new Explosion(x, y, explosionRadius));
    screenShake.intensity = Math.max(screenShake.intensity, 8);

    buildings.forEach(building => {
        if (building.state === 'collapsed') return;

        const centerX = building.getCenterX();
        const centerY = building.getCenterY();
        const distance = Math.sqrt(
            Math.pow(centerX - x, 2) + Math.pow(centerY - y, 2)
        );

        if (distance < damageRadius) {
            const normalizedDist = distance / damageRadius;
            const falloff = Math.pow(1 - normalizedDist, 3);
            const baseDamage = 60;
            const damage = baseDamage * falloff;
            building.takeDamage(damage, distance, damageRadius);

            const shakeIntensity = falloff * 8;
            building.applyShake(shakeIntensity);
        }
    });

    // Damage bridge (City 2) - visual only
    if (currentCityId === 2) {
        staticStructures.forEach(structure => {
            if (structure instanceof Bridge) {
                const bridgeCenterX = structure.x + structure.width / 2;
                const bridgeCenterY = structure.y + structure.height / 2;
                const distance = Math.sqrt(
                    Math.pow(bridgeCenterX - x, 2) + Math.pow(bridgeCenterY - y, 2)
                );

                if (distance < damageRadius) {
                    const normalizedDist = distance / damageRadius;
                    const falloff = Math.pow(1 - normalizedDist, 2);
                    structure.takeDamage(20 * falloff, x, y, damageRadius);
                }
            }
        });
    }
}

// ============================================
// Robot Hand Laser Class
// ============================================

class RobotHandLaser {
    constructor(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.startTime = Date.now();
        this.duration = 200; // milliseconds (shorter for continuous feel)
        this.active = true;
        this.hitPoints = [];
        this.impactSparks = []; // Track impact sparks for rate limiting

        // Calculate direction vector
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Normalize direction
        this.dirX = distance > 0 ? dx / distance : 1;
        this.dirY = distance > 0 ? dy / distance : 0;

        // Calculate end point (intersect with screen bounds for infinite range)
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Find intersection with screen rectangle
        let t = Infinity;

        // Check top edge (y = 0)
        if (this.dirY < 0) {
            const tTop = -startY / this.dirY;
            if (tTop > 0 && startX + this.dirX * tTop >= 0 && startX + this.dirX * tTop <= width) {
                t = Math.min(t, tTop);
            }
        }

        // Check bottom edge (y = groundY)
        if (this.dirY > 0) {
            const tBottom = (groundY - startY) / this.dirY;
            if (tBottom > 0 && startX + this.dirX * tBottom >= 0 && startX + this.dirX * tBottom <= width) {
                t = Math.min(t, tBottom);
            }
        }

        // Check left edge (x = 0)
        if (this.dirX < 0) {
            const tLeft = -startX / this.dirX;
            if (tLeft > 0 && startY + this.dirY * tLeft >= 0 && startY + this.dirY * tLeft <= groundY) {
                t = Math.min(t, tLeft);
            }
        }

        // Check right edge (x = width)
        if (this.dirX > 0) {
            const tRight = (width - startX) / this.dirX;
            if (tRight > 0 && startY + this.dirY * tRight >= 0 && startY + this.dirY * tRight <= groundY) {
                t = Math.min(t, tRight);
            }
        }

        // Set end point
        if (t !== Infinity) {
            this.endX = startX + this.dirX * t;
            this.endY = startY + this.dirY * t;
        } else {
            // Fallback: extend far
            this.endX = startX + this.dirX * 2000;
            this.endY = startY + this.dirY * 2000;
        }

        // Calculate beam length for damage falloff
        this.length = Math.sqrt(
            Math.pow(this.endX - this.startX, 2) + Math.pow(this.endY - this.startY, 2)
        );
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration) {
            this.active = false;
            return;
        }

        // Check building intersections along the beam (infinite range)
        // Apply DPS (damage per second) for continuous beam
        const step = 8; // Check every 8 pixels
        const dx = this.endX - this.startX;
        const dy = this.endY - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.floor(distance / step);

        // Rate limit impact sparks (max 6 per second)
        const maxSparksPerSecond = 6;
        const sparkInterval = 1000 / maxSparksPerSecond;
        const lastSparkTime = this.impactSparks.length > 0 ? this.impactSparks[this.impactSparks.length - 1].time : 0;
        const canSpawnSpark = elapsed - lastSparkTime >= sparkInterval;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const checkX = this.startX + dx * t;
            const checkY = this.startY + dy * t;

            // Check each building
            buildings.forEach(building => {
                if (building.state === 'collapsed') return;

                if (building.contains(checkX, checkY)) {
                    // Calculate distance from start for damage falloff
                    const hitDistance = Math.sqrt(
                        Math.pow(checkX - this.startX, 2) + Math.pow(checkY - this.startY, 2)
                    );
                    const normalizedDistance = Math.min(1, hitDistance / this.length);
                    const falloff = Math.pow(1 - normalizedDistance, 2);

                    // DPS: damage per frame (scaled by duration)
                    const dps = 15; // Base DPS
                    const frameDamage = (dps / 60) * (this.duration / 1000); // Damage per frame
                    const damage = frameDamage * falloff;

                    building.takeDamage(damage, hitDistance, this.length);

                    // Create impact explosion (rate limited)
                    if (canSpawnSpark && !this.hitPoints.some(p =>
                        Math.abs(p.x - checkX) < 25 && Math.abs(p.y - checkY) < 25
                    )) {
                        this.hitPoints.push({ x: checkX, y: checkY, time: elapsed });
                        this.impactSparks.push({ x: checkX, y: checkY, time: elapsed });
                        explosions.push(new Explosion(checkX, checkY, 25, 0));
                    }
                }
            });

            // Damage bridge segments (City 2)
            if (currentCityId === 2) {
                staticStructures.forEach(structure => {
                    if (structure instanceof Bridge) {
                        for (let segment of structure.segments) {
                            if (segment.state === 'broken') continue;
                            if (segment.contains(checkX, checkY)) {
                                const hitDistance = Math.sqrt(
                                    Math.pow(checkX - this.startX, 2) + Math.pow(checkY - this.startY, 2)
                                );
                                const normalizedDistance = Math.min(1, hitDistance / this.length);
                                const falloff = Math.pow(1 - normalizedDistance, 2);
                                const dps = 15; // Base DPS
                                const frameDamage = (dps / 60) * (this.duration / 1000);
                                segment.takeDamage(frameDamage * falloff * 0.5); // Bridge segments take less damage
                            }
                        }
                    }
                });
            }
        }
    }

    render() {
        if (!this.active) return;

        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;
        const alpha = Math.max(0, 1 - progress);

        const drawStartX = this.startX + screenShake.x;
        const drawStartY = this.startY + screenShake.y;
        const drawEndX = this.endX + screenShake.x;
        const drawEndY = this.endY + screenShake.y;

        // Draw outer glow
        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();

        // Draw mid glow
        ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();

        // Draw bright core
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(drawStartX, drawStartY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();
    }
}

function playLaserZapSound() {
    if (!audioContext || audioContext.state !== 'running') return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        // Ignore sound errors
    }
}

// ============================================
// Fire System
// ============================================

class FireEmitter {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.startTime = Date.now();
        this.duration = 2000 + Math.random() * 2000; // 2-4 seconds
        this.active = true;
        this.particleSpawnTimer = 0;
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration) {
            this.active = false;
            return;
        }

        // Spawn fire particles periodically
        this.particleSpawnTimer += 16; // ~60fps
        if (this.particleSpawnTimer >= 50 && fireParticles.length < MAX_FIRE_PARTICLES) {
            this.particleSpawnTimer = 0;

            // Spawn flame particle
            fireParticles.push(new FireParticle(
                this.x + (Math.random() - 0.5) * 10,
                this.y + (Math.random() - 0.5) * 10,
                'flame'
            ));

            // Occasionally spawn smoke
            if (Math.random() < 0.3) {
                fireParticles.push(new FireParticle(
                    this.x + (Math.random() - 0.5) * 10,
                    this.y + (Math.random() - 0.5) * 10,
                    'smoke'
                ));
            }
        }
    }
}

class FireParticle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'flame' or 'smoke'
        this.life = 1.0;
        this.lifeDecay = type === 'flame' ? 0.015 : 0.008;

        if (type === 'flame') {
            this.velocityX = (Math.random() - 0.5) * 0.5;
            this.velocityY = -Math.random() * 1.5 - 0.5; // Upward
            this.size = Math.random() * 4 + 3;
            this.color = Math.random() < 0.5 ? '#ff6600' : '#ffaa00';
        } else {
            this.velocityX = (Math.random() - 0.5) * 0.3;
            this.velocityY = -Math.random() * 0.8 - 0.2; // Slower upward
            this.size = Math.random() * 6 + 4;
            this.color = '#333333';
        }
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.life -= this.lifeDecay;

        // Smoke drifts horizontally more
        if (this.type === 'smoke') {
            this.velocityX += (Math.random() - 0.5) * 0.1;
            this.velocityX *= 0.98; // Damping
        }

        return this.life > 0;
    }

    render() {
        const alpha = this.life;
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        if (this.type === 'flame') {
            // Flame: bright orange/yellow circle
            const gradient = ctx.createRadialGradient(
                drawX, drawY, 0,
                drawX, drawY, this.size
            );
            gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.9})`);
            gradient.addColorStop(0.5, `rgba(255, 150, 0, ${alpha * 0.6})`);
            gradient.addColorStop(1, `rgba(255, 100, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Smoke: dark gray, larger, more transparent
            ctx.fillStyle = `rgba(50, 50, 50, ${alpha * 0.4})`;
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function spawnRobot() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    // Always create robot, even if one exists
    robot = new Robot(width / 2, groundY - 45);
    pointerActive = false; // Reset pointer state
    mouseButtonHeld = false; // Reset mouse button state
    robot.laserFiring = false;
    robot.laserEnergy = robot.maxLaserEnergy; // Reset energy
}

function spawnUFO() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Always create UFO, even if one exists
    ufo = new UFO(width / 2, height * 0.3);
    ufo.variant = ufoVariant || 'scout'; // Set current variant (default to scout if not set)
    ufo.updateVariantStats(); // Apply variant stats
    ufoControls.laser = false;
    ufoControls.tractor = false;
    ufoControls.invisibility = false;
    ufo.invisible = false; // Explicitly set to false (stealth OFF by default)
    ufoHandLasers = [];
    pointerActive = false; // Reset pointer for UFO laser aim
    updateStealthIndicator(); // Update UI indicator
}

// ============================================
// Background Rendering
// ============================================


// ============================================
// Bridge Structure Class (City 2)
// ============================================

// Bridge Segment Class (Physics-based)
class BridgeSegment {
    constructor(x, y, w, h, bridgeRef, index) {
        this.baseX = x; // Original position (anchor)
        this.baseY = y;
        this.x = x; // Current position
        this.y = y;
        this.w = w;
        this.h = h;
        this.index = index;
        this.maxHealth = 80 + Math.random() * 40; // 80-120 health
        this.health = this.maxHealth;
        this.state = 'intact'; // 'intact' | 'damaged' | 'broken' | 'dynamic'
        this.bridgeRef = bridgeRef; // Reference to parent bridge

        // Physics properties (Rigidbody-like)
        this.isKinematic = true; // Start as kinematic (static)
        this.velocityX = 0;
        this.velocityY = 0;
        this.rotation = 0; // Rotation angle in radians
        this.angularVelocity = 0;
        this.mass = 1.0 + (index % 3) * 0.3; // Middle segments slightly heavier

        // Joint constraints (to neighbors)
        this.leftJoint = null; // Connection to left segment
        this.rightJoint = null; // Connection to right segment
        this.jointSpring = 0.15; // Spring constant
        this.jointDamping = 0.85; // Damping factor
        this.jointAngularLimit = 0.1; // Max rotation between segments (radians)

        // Cable attachment points (for hangers)
        this.cableAttachments = [];
        this.cableBreakForce = 50 + Math.random() * 30; // Force threshold for cable break

        // Destruction sequence
        this.destructionScheduled = false;
        this.destructionDelay = 0;
    }

    takeDamage(damage) {
        if (this.state === 'broken' || this.state === 'dynamic') return;
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.state = 'broken';
            this.bridgeRef.onSegmentBroken(this);
        } else if (this.health < this.maxHealth * 0.5) {
            this.state = 'damaged';
        }
    }

    contains(x, y) {
        // Use correct position based on kinematic state
        const segX = this.isKinematic ? this.baseX : this.x;
        const segY = this.isKinematic ? this.baseY : this.y;

        // Simple bounding box check (rotation handled in render, collision simplified for performance)
        if (this.rotation === 0 || this.isKinematic) {
            return x >= segX && x <= segX + this.w &&
                y >= segY && y <= segY + this.h;
        }

        // Account for rotation (for dynamic segments)
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const centerX = segX + this.w / 2;
        const centerY = segY + this.h / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const rotatedX = dx * cos + dy * sin;
        const rotatedY = -dx * sin + dy * cos;
        return Math.abs(rotatedX) < this.w / 2 && Math.abs(rotatedY) < this.h / 2;
    }

    // Apply joint forces from neighbors
    applyJointForces() {
        if (this.isKinematic || this.state === 'broken') return;

        // Left neighbor joint
        if (this.leftJoint && this.leftJoint.segment && this.leftJoint.segment.state !== 'broken') {
            const neighbor = this.leftJoint.segment;
            const targetX = neighbor.x + neighbor.w;
            const targetY = neighbor.y;

            // Spring force
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const springForceX = dx * this.jointSpring;
            const springForceY = dy * this.jointSpring;

            // Apply force
            this.velocityX += springForceX / this.mass;
            this.velocityY += springForceY / this.mass;

            // Angular constraint (keep segments aligned)
            const angleDiff = neighbor.rotation - this.rotation;
            if (Math.abs(angleDiff) > this.jointAngularLimit) {
                const angularForce = (angleDiff > 0 ? this.jointAngularLimit : -this.jointAngularLimit) - angleDiff;
                this.angularVelocity += angularForce * 0.05;
            }
        }

        // Right neighbor joint
        if (this.rightJoint && this.rightJoint.segment && this.rightJoint.segment.state !== 'broken') {
            const neighbor = this.rightJoint.segment;
            const targetX = neighbor.x - this.w;
            const targetY = neighbor.y;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const springForceX = dx * this.jointSpring;
            const springForceY = dy * this.jointSpring;

            this.velocityX += springForceX / this.mass;
            this.velocityY += springForceY / this.mass;

            const angleDiff = neighbor.rotation - this.rotation;
            if (Math.abs(angleDiff) > this.jointAngularLimit) {
                const angularForce = (angleDiff > 0 ? this.jointAngularLimit : -this.jointAngularLimit) - angleDiff;
                this.angularVelocity += angularForce * 0.05;
            }
        }
    }

    // Apply cable forces (from hangers)
    applyCableForces() {
        if (this.isKinematic || this.state === 'broken') return;

        for (let cable of this.cableAttachments) {
            if (cable.broken) continue;

            // Cable pulls segment upward toward anchor point
            const dx = cable.anchorX - (this.x + this.w / 2);
            const dy = cable.anchorY - (this.y + this.h / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                // Cable tension force
                const tension = Math.max(0, distance - cable.restLength) * cable.stiffness;
                const forceX = (dx / distance) * tension;
                const forceY = (dy / distance) * tension;

                // Check break force
                if (tension > this.cableBreakForce) {
                    cable.broken = true;
                    cable.breakTime = Date.now();
                    this.bridgeRef.onCableBroken(cable, this);
                    continue;
                }

                this.velocityX += forceX / this.mass * 0.1;
                this.velocityY += forceY / this.mass * 0.1;
            }
        }
    }

    // Update physics
    update(deltaTime = 16) {
        if (this.isKinematic && this.state !== 'dynamic') {
            // Kinematic: return to base position
            this.x = this.baseX;
            this.y = this.baseY;
            this.rotation = 0;
            return;
        }

        // Dynamic physics
        if (this.state === 'dynamic' || this.state === 'broken') {
            // Apply joint forces
            this.applyJointForces();

            // Apply cable forces
            this.applyCableForces();

            // Gravity
            this.velocityY += 0.5 * (deltaTime / 16); // Gravity

            // Damping
            this.velocityX *= 0.95;
            this.velocityY *= 0.95;
            this.angularVelocity *= 0.92;

            // Update position and rotation
            this.x += this.velocityX * (deltaTime / 16);
            this.y += this.velocityY * (deltaTime / 16);
            this.rotation += this.angularVelocity * (deltaTime / 16);

            // Limit rotation
            this.rotation = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.rotation));
        }
    }

    // Break joint to neighbor
    breakJoint(side) {
        if (side === 'left' && this.leftJoint) {
            this.leftJoint.broken = true;
        }
        if (side === 'right' && this.rightJoint) {
            this.rightJoint.broken = true;
        }
    }

    // Make segment dynamic (start physics simulation)
    makeDynamic(impulseX = 0, impulseY = 0, torque = 0) {
        if (this.isKinematic) {
            this.isKinematic = false;
            this.state = 'dynamic';
            this.velocityX += impulseX / this.mass;
            this.velocityY += impulseY / this.mass;
            this.angularVelocity += torque / this.mass;
        }
    }
}

class Bridge {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;

        // Create bridge segments (8-30 segments for more realistic physics)
        const segmentCount = 8 + Math.floor(Math.random() * 23); // 8-30
        const segmentWidth = width / segmentCount;
        this.segments = [];
        for (let i = 0; i < segmentCount; i++) {
            const segment = new BridgeSegment(
                x + i * segmentWidth,
                y,
                segmentWidth,
                height,
                this,
                i
            );
            this.segments.push(segment);
        }

        // Connect segments with joints
        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            if (i > 0) {
                segment.leftJoint = {
                    segment: this.segments[i - 1],
                    broken: false
                };
                this.segments[i - 1].rightJoint = {
                    segment: segment,
                    broken: false
                };
            }
        }

        // Tower properties
        this.towerWidth = 20;
        this.towerHeight = 120;
        this.leftTowerX = x + width * 0.25 - this.towerWidth / 2;
        this.rightTowerX = x + width * 0.75 - this.towerWidth / 2;
        this.towerHealth = 500; // High health for towers
        this.leftTowerHealth = this.towerHealth;
        this.rightTowerHealth = this.towerHealth;

        // Sway physics (spring-damper model)
        this.swayOffset = 0; // Vertical offset from sway
        this.swayVelocity = 0;
        this.swayFrequency = 0.8 + Math.random() * 0.8; // 0.8-1.6 Hz
        this.swayDamping = 0.92; // Damping factor (will be reduced during cable break)
        this.baseDamping = 0.92; // Base damping value
        this.swayAmplitude = 0; // Current amplitude
        this.swayActive = false;
        this.swayStartTime = 0;
        this.swayDuration = 2000 + Math.random() * 2000; // 2-4 seconds

        // Cable system (hangers with physics constraints)
        const hangerSpacing = Math.max(8, segmentWidth * 0.8); // Closer spacing
        const hangerCount = Math.floor(width / hangerSpacing);
        this.hangers = [];
        const height = window.innerHeight;
        const groundY = height * 0.85;
        const waterY = groundY + 20;
        const towerTopY = waterY - this.towerHeight;

        for (let i = 0; i <= hangerCount; i++) {
            const hangerX = x + i * hangerSpacing;
            // Find which segment this hanger attaches to
            const segmentIndex = Math.floor((hangerX - x) / segmentWidth);
            const segment = this.segments[Math.min(segmentIndex, this.segments.length - 1)];

            // Calculate anchor point (on main cable)
            let anchorY;
            const normalizedX = (hangerX - x) / width;
            if (normalizedX < 0.25) {
                const t = normalizedX / 0.25;
                anchorY = waterY + (towerTopY - waterY) * (t * t);
            } else if (normalizedX > 0.75) {
                const t = (normalizedX - 0.75) / 0.25;
                anchorY = towerTopY + (waterY - towerTopY) * (t * t);
            } else {
                const t = (normalizedX - 0.25) / 0.5;
                anchorY = towerTopY - 30 * (4 * t * (1 - t));
            }

            const hanger = {
                x: hangerX,
                anchorX: hangerX,
                anchorY: anchorY,
                broken: false,
                breakTime: 0,
                stiffness: 0.08 + Math.random() * 0.04, // Cable stiffness
                restLength: waterY - anchorY, // Rest length
                breakForce: 40 + Math.random() * 20 // Break force threshold
            };

            this.hangers.push(hanger);

            // Attach cable to segment
            if (segment) {
                segment.cableAttachments.push(hanger);
            }
        }
        this.cablesBroken = false;
        this.cableBreakSequence = []; // Progressive break sequence
        this.destructionSequence = []; // Progressive destruction sequence
    }

    // Check if point is on bridge deck (any intact segment) - physics-aware
    contains(x, y) {
        for (let segment of this.segments) {
            if (segment.state === 'broken' && segment.isKinematic) continue; // Skip broken kinematic segments
            if (segment.state === 'broken' || segment.state === 'dynamic') {
                // Dynamic segments use physics-based contains
                if (segment.contains(x, y)) {
                    return true;
                }
            } else {
                // Intact/damaged segments use base position
                if (segment.contains(x, y)) {
                    return true;
                }
            }
        }
        return false;
    }

    // Called when a segment breaks
    onSegmentBroken(segment) {
        // Check if middle segment broke (key segment)
        const middleIndex = Math.floor(this.segments.length / 2);
        const segmentIndex = this.segments.indexOf(segment);
        const isMiddle = Math.abs(segmentIndex - middleIndex) <= 1;

        if (isMiddle && !this.swayActive) {
            // Start realistic sway animation
            this.swayActive = true;
            this.swayStartTime = Date.now();
            this.swayAmplitude = 2 + Math.random() * 2; // 2-4 pixels amplitude (subtle)
            this.swayVelocity = (Math.random() - 0.5) * 1.5; // Initial velocity

            // Reduce damping temporarily for more dramatic sway
            this.swayDamping = 0.75; // Reduced from 0.92
        }

        // Make segment dynamic (start physics)
        segment.makeDynamic(
            (Math.random() - 0.5) * 0.5, // Small horizontal impulse
            -0.3, // Small upward impulse
            (Math.random() - 0.5) * 0.1 // Small torque
        );

        // Break joints to neighbors (progressive)
        if (segment.leftJoint) {
            segment.breakJoint('left');
        }
        if (segment.rightJoint) {
            segment.breakJoint('right');
        }

        // Schedule progressive destruction of nearby segments
        this.scheduleProgressiveDestruction(segmentIndex);

        // Spawn bridge debris
        const centerX = segment.x + segment.w / 2;
        const centerY = segment.y + segment.h / 2;
        const debrisCount = 8 + Math.floor(Math.random() * 8); // 8-16 chunks

        for (let i = 0; i < debrisCount; i++) {
            if (bridgeDebris.length >= MAX_BRIDGE_DEBRIS) break;

            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            const chunkW = Math.random() * 6 + 4;
            const chunkH = Math.random() * 6 + 4;

            bridgeDebris.push(new BridgeDebrisChunk(
                centerX + (Math.random() - 0.5) * segment.w,
                centerY + (Math.random() - 0.5) * segment.h,
                chunkW, chunkH,
                '#c41e1e', // Bridge red
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1
            ));
        }
    }

    // Called when a cable breaks
    onCableBroken(cable, segment) {
        // Trigger sway if not already active
        if (!this.swayActive) {
            this.swayActive = true;
            this.swayStartTime = Date.now();
            this.swayAmplitude = 1.5 + Math.random() * 1.5; // Subtle sway
            this.swayVelocity = (Math.random() - 0.5) * 1;
            this.swayDamping = 0.78; // Reduced damping for more movement
        }

        // Schedule progressive cable breaking (domino effect)
        this.scheduleCableBreakSequence(cable);

        // Apply small impulse to segment when cable breaks
        if (segment && !segment.isKinematic) {
            const impulseX = (Math.random() - 0.5) * 0.3;
            const impulseY = -0.2;
            const torque = (Math.random() - 0.5) * 0.08;
            segment.velocityX += impulseX / segment.mass;
            segment.velocityY += impulseY / segment.mass;
            segment.angularVelocity += torque / segment.mass;
        }
    }

    // Schedule progressive cable breaking (0.2-0.6s delays)
    scheduleCableBreakSequence(triggerCable) {
        const triggerIndex = this.hangers.indexOf(triggerCable);
        if (triggerIndex === -1) return;

        // Break nearby cables progressively
        const breakDelay = 200 + Math.random() * 400; // 0.2-0.6 seconds
        const breakRadius = 3 + Math.floor(Math.random() * 4); // 3-6 cables

        for (let i = Math.max(0, triggerIndex - breakRadius);
            i <= Math.min(this.hangers.length - 1, triggerIndex + breakRadius);
            i++) {
            const hanger = this.hangers[i];
            if (!hanger.broken && hanger !== triggerCable) {
                const delay = breakDelay + Math.abs(i - triggerIndex) * 100; // Stagger breaks
                this.cableBreakSequence.push({
                    hanger: hanger,
                    breakTime: Date.now() + delay
                });
            }
        }
    }

    // Schedule progressive segment destruction (cinematic)
    scheduleProgressiveDestruction(triggerIndex) {
        const middleIndex = Math.floor(this.segments.length / 2);
        const isMiddleBreak = Math.abs(triggerIndex - middleIndex) <= 1;

        if (!isMiddleBreak) return; // Only trigger sequence for middle breaks

        // Break middle segments first, then spread outward
        const breakDelay = 200 + Math.random() * 400; // 0.2-0.6 seconds initial delay
        const breakCount = 3 + Math.floor(Math.random() * 4); // 3-6 segments

        // Break segments in sequence (every 0.1s)
        for (let i = 0; i < breakCount; i++) {
            const offset = i - Math.floor(breakCount / 2);
            const targetIndex = triggerIndex + offset;

            if (targetIndex >= 0 && targetIndex < this.segments.length) {
                const segment = this.segments[targetIndex];
                if (segment.state !== 'broken' && segment.state !== 'dynamic') {
                    const delay = breakDelay + i * 100; // 0.1s between breaks
                    this.destructionSequence.push({
                        segment: segment,
                        breakTime: Date.now() + delay
                    });
                }
            }
        }
    }

    update() {
        const currentTime = Date.now();
        const deltaTime = 16; // ~60fps

        // Process cable break sequence
        this.cableBreakSequence = this.cableBreakSequence.filter(item => {
            if (currentTime >= item.breakTime && !item.hanger.broken) {
                item.hanger.broken = true;
                item.hanger.breakTime = currentTime;

                // Find segment attached to this cable
                for (let segment of this.segments) {
                    const cableIndex = segment.cableAttachments.indexOf(item.hanger);
                    if (cableIndex !== -1) {
                        this.onCableBroken(item.hanger, segment);
                        break;
                    }
                }

                // Spawn cable particle
                if (bridgeDebris.length < MAX_BRIDGE_DEBRIS) {
                    const hangerX = item.hanger.x;
                    const height = window.innerHeight;
                    const groundY = height * 0.85;
                    const waterY = groundY + 20;
                    const hangerY = waterY;
                    bridgeDebris.push(new BridgeDebrisChunk(
                        hangerX, hangerY,
                        2, 8,
                        '#8b1414',
                        (Math.random() - 0.5) * 1,
                        Math.random() * 2 + 1
                    ));
                }
                return false; // Remove from sequence
            }
            return true; // Keep in sequence
        });

        // Process destruction sequence
        this.destructionSequence = this.destructionSequence.filter(item => {
            if (currentTime >= item.breakTime && item.segment.state !== 'broken') {
                // Force break the segment
                item.segment.health = 0;
                item.segment.state = 'broken';
                item.segment.makeDynamic(
                    (Math.random() - 0.5) * 0.4,
                    -0.2,
                    (Math.random() - 0.5) * 0.08
                );
                this.onSegmentBroken(item.segment);
                return false; // Remove from sequence
            }
            return true; // Keep in sequence
        });

        // Update all segments (physics)
        for (let segment of this.segments) {
            segment.update(deltaTime);
        }

        // Update sway physics (spring-damper) - now affects all segments
        if (this.swayActive) {
            const elapsed = currentTime - this.swayStartTime;

            // Gradually restore damping after initial break
            if (elapsed > 800) {
                this.swayDamping = Math.min(this.baseDamping,
                    this.swayDamping + (this.baseDamping - 0.75) * 0.01);
            }

            if (elapsed < this.swayDuration) {
                // Spring force toward rest position
                const springForce = -this.swayOffset * 0.1;
                // Damping (reduced during cable break for more dramatic effect)
                this.swayVelocity = (this.swayVelocity + springForce) * this.swayDamping;
                this.swayOffset += this.swayVelocity;

                // Apply frequency-based oscillation
                const time = elapsed / 1000;
                const oscillation = Math.sin(time * this.swayFrequency * Math.PI * 2) * this.swayAmplitude;
                this.swayOffset = oscillation * Math.exp(-time * 0.4); // Decay over time
            } else {
                // Sway finished - restore damping
                this.swayActive = false;
                this.swayOffset = 0;
                this.swayVelocity = 0;
                this.swayDamping = this.baseDamping;
            }
        }

        // Damage towers if segments near them are broken
        const leftSegmentIndex = Math.floor(this.segments.length * 0.25);
        const rightSegmentIndex = Math.floor(this.segments.length * 0.75);

        if (this.segments[leftSegmentIndex] &&
            (this.segments[leftSegmentIndex].state === 'broken' ||
                this.segments[leftSegmentIndex].state === 'dynamic')) {
            this.leftTowerHealth -= 0.1; // Slow damage
            if (this.leftTowerHealth <= 0) {
                this.leftTowerHealth = 0;
            }
        }

        if (this.segments[rightSegmentIndex] &&
            (this.segments[rightSegmentIndex].state === 'broken' ||
                this.segments[rightSegmentIndex].state === 'dynamic')) {
            this.rightTowerHealth -= 0.1;
            if (this.rightTowerHealth <= 0) {
                this.rightTowerHealth = 0;
            }
        }
    }

    // Apply damage to segments (from explosions/lasers)
    takeDamage(intensity, damageX, damageY, damageRadius) {
        // Damage segments that overlap with explosion
        for (let segment of this.segments) {
            if (segment.state === 'broken') continue;

            const segCenterX = segment.x + segment.w / 2;
            const segCenterY = segment.y + segment.h / 2;
            const distance = Math.sqrt(
                Math.pow(segCenterX - damageX, 2) + Math.pow(segCenterY - damageY, 2)
            );

            if (distance < damageRadius) {
                const normalizedDist = distance / damageRadius;
                const falloff = Math.pow(1 - normalizedDist, 2);
                segment.takeDamage(intensity * falloff);
            }
        }

        // Damage towers if explosion is near them
        const leftTowerCenterX = this.leftTowerX + this.towerWidth / 2;
        const rightTowerCenterX = this.rightTowerX + this.towerWidth / 2;
        const towerCenterY = this.y + this.height - this.towerHeight / 2;

        const leftDist = Math.sqrt(
            Math.pow(leftTowerCenterX - damageX, 2) + Math.pow(towerCenterY - damageY, 2)
        );
        const rightDist = Math.sqrt(
            Math.pow(rightTowerCenterX - damageX, 2) + Math.pow(towerCenterY - damageY, 2)
        );

        if (leftDist < damageRadius) {
            const normalizedDist = leftDist / damageRadius;
            const falloff = Math.pow(1 - normalizedDist, 2);
            this.leftTowerHealth -= intensity * falloff * 0.1; // Towers take less damage
        }

        if (rightDist < damageRadius) {
            const normalizedDist = rightDist / damageRadius;
            const falloff = Math.pow(1 - normalizedDist, 2);
            this.rightTowerHealth -= intensity * falloff * 0.1;
        }
    }

    render() {
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y + this.swayOffset; // Apply sway offset
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;
        const waterY = groundY + 20;

        // Red suspension bridge colors
        const bridgeRed = '#c41e1e';
        const bridgeRedDark = '#8b1414';
        const bridgeRedLight = '#e63939';

        const towerBaseY = waterY;
        const towerTopY = towerBaseY - this.towerHeight;

        // Draw main suspension cables (curved from tower tops to ends)
        ctx.strokeStyle = bridgeRedDark;
        ctx.lineWidth = 8;
        ctx.beginPath();

        // Left cable
        const leftCableStartX = drawX;
        const leftCableStartY = drawY + this.height;
        const leftCableMidX = this.leftTowerX + this.towerWidth / 2;
        const leftCableMidY = towerTopY;
        ctx.moveTo(leftCableStartX, leftCableStartY);
        ctx.quadraticCurveTo(leftCableMidX, leftCableMidY, leftCableMidX, leftCableMidY);
        ctx.stroke();

        // Right cable
        const rightCableStartX = drawX + this.width;
        const rightCableStartY = drawY + this.height;
        const rightCableMidX = this.rightTowerX + this.towerWidth / 2;
        ctx.beginPath();
        ctx.moveTo(rightCableStartX, rightCableStartY);
        ctx.quadraticCurveTo(rightCableMidX, leftCableMidY, rightCableMidX, leftCableMidY);
        ctx.stroke();

        // Main cable between towers
        ctx.beginPath();
        ctx.moveTo(leftCableMidX, leftCableMidY);
        const mainCableMidX = (this.leftTowerX + this.rightTowerX) / 2 + this.towerWidth / 2;
        const mainCableMidY = towerTopY - 30;
        ctx.quadraticCurveTo(mainCableMidX, mainCableMidY, rightCableMidX, leftCableMidY);
        ctx.stroke();

        // Draw towers (with health-based damage)
        const leftTowerAlpha = this.leftTowerHealth > 0 ? 1.0 : 0.3;
        const rightTowerAlpha = this.rightTowerHealth > 0 ? 1.0 : 0.3;

        // Left tower
        ctx.globalAlpha = leftTowerAlpha;
        ctx.fillStyle = bridgeRed;
        ctx.fillRect(this.leftTowerX, towerTopY, this.towerWidth, this.towerHeight);
        const towerGradient = ctx.createLinearGradient(this.leftTowerX, 0, this.leftTowerX + this.towerWidth, 0);
        towerGradient.addColorStop(0, bridgeRed);
        towerGradient.addColorStop(1, bridgeRedDark);
        ctx.fillStyle = towerGradient;
        ctx.fillRect(this.leftTowerX, towerTopY, this.towerWidth, this.towerHeight);
        ctx.fillStyle = bridgeRedDark;
        const crossbeamCount = 3;
        const crossbeamSpacing = this.towerHeight / (crossbeamCount + 1);
        for (let i = 1; i <= crossbeamCount; i++) {
            const crossbeamY = towerTopY + crossbeamSpacing * i;
            ctx.fillRect(this.leftTowerX - 5, crossbeamY, this.towerWidth + 10, 4);
        }

        // Right tower
        ctx.globalAlpha = rightTowerAlpha;
        ctx.fillStyle = bridgeRed;
        ctx.fillRect(this.rightTowerX, towerTopY, this.towerWidth, this.towerHeight);
        const rightTowerGradient = ctx.createLinearGradient(this.rightTowerX, 0, this.rightTowerX + this.towerWidth, 0);
        rightTowerGradient.addColorStop(0, bridgeRed);
        rightTowerGradient.addColorStop(1, bridgeRedDark);
        ctx.fillStyle = rightTowerGradient;
        ctx.fillRect(this.rightTowerX, towerTopY, this.towerWidth, this.towerHeight);
        ctx.fillStyle = bridgeRedDark;
        for (let i = 1; i <= crossbeamCount; i++) {
            const crossbeamY = towerTopY + crossbeamSpacing * i;
            ctx.fillRect(this.rightTowerX - 5, crossbeamY, this.towerWidth + 10, 4);
        }
        ctx.globalAlpha = 1.0;

        // Draw vertical hanger cables (skip broken ones)
        ctx.strokeStyle = bridgeRedDark;
        ctx.lineWidth = 2;
        for (let hanger of this.hangers) {
            if (hanger.broken) continue; // Skip broken hangers

            const hangerX = hanger.x;
            if (hangerX >= drawX && hangerX <= drawX + this.width) {
                const normalizedX = (hangerX - drawX) / this.width;
                let cableY;
                if (normalizedX < 0.25) {
                    const t = normalizedX / 0.25;
                    const startY = drawY + this.height;
                    const endY = towerTopY;
                    cableY = startY + (endY - startY) * (t * t);
                } else if (normalizedX > 0.75) {
                    const t = (normalizedX - 0.75) / 0.25;
                    const startY = towerTopY;
                    const endY = drawY + this.height;
                    cableY = startY + (endY - startY) * (t * t);
                } else {
                    const t = (normalizedX - 0.25) / 0.5;
                    const startY = towerTopY;
                    const midY = towerTopY - 30;
                    const endY = towerTopY;
                    cableY = startY + (midY - startY) * (4 * t * (1 - t));
                }

                ctx.beginPath();
                ctx.moveTo(hangerX, cableY);
                ctx.lineTo(hangerX, drawY + this.height);
                ctx.stroke();
            }
        }

        // Draw bridge deck segments (with physics-based positions and rotations)
        for (let segment of this.segments) {
            if (segment.state === 'broken' && segment.isKinematic) continue; // Skip broken kinematic segments

            // Calculate draw position (account for physics and sway)
            let segDrawX, segDrawY;
            if (segment.isKinematic) {
                // Kinematic: use base position + sway
                segDrawX = segment.baseX + screenShake.x;
                segDrawY = segment.baseY + screenShake.y + this.swayOffset;
            } else {
                // Dynamic: use physics position
                segDrawX = segment.x + screenShake.x;
                segDrawY = segment.y + screenShake.y;
            }

            ctx.save();

            // Apply rotation for dynamic segments
            if (!segment.isKinematic && segment.rotation !== 0) {
                const centerX = segDrawX + segment.w / 2;
                const centerY = segDrawY + segment.h / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate(segment.rotation);
                ctx.translate(-centerX, -centerY);
            }

            // Deck gradient
            const deckGradient = ctx.createLinearGradient(segDrawX, segDrawY, segDrawX, segDrawY + segment.h);
            deckGradient.addColorStop(0, bridgeRedLight);
            deckGradient.addColorStop(0.5, bridgeRed);
            deckGradient.addColorStop(1, bridgeRedDark);
            ctx.fillStyle = deckGradient;
            ctx.fillRect(segDrawX, segDrawY, segment.w, segment.h);

            // Damage cracks for damaged segments
            if (segment.state === 'damaged') {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.lineWidth = 1.5;
                const crackCount = 2 + Math.floor((1 - segment.health / segment.maxHealth) * 3);
                for (let i = 0; i < crackCount; i++) {
                    ctx.beginPath();
                    const crackX = segDrawX + Math.random() * segment.w;
                    const crackY = segDrawY + Math.random() * segment.h;
                    ctx.moveTo(crackX, crackY);
                    ctx.lineTo(crackX + (Math.random() - 0.5) * 15, crackY + (Math.random() - 0.5) * 15);
                    ctx.stroke();
                }
            }

            ctx.restore();
        }

        // Draw road markings (only on intact segments)
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        for (let segment of this.segments) {
            if (segment.state === 'broken') continue;
            const segDrawX = segment.x + screenShake.x;
            const segDrawY = segment.y + screenShake.y + this.swayOffset;
            ctx.beginPath();
            ctx.moveTo(segDrawX, segDrawY + segment.h / 2);
            ctx.lineTo(segDrawX + segment.w, segDrawY + segment.h / 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
}

// Bridge Debris Chunk Class
class BridgeDebrisChunk {
    constructor(x, y, width, height, color, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.gravity = 0.5;
        this.friction = 0.88;
        this.bounciness = 0.3;
        this.rotation = Math.random() * Math.PI * 2;
        this.angularVelocity = (Math.random() - 0.5) * 0.3;
        this.onGround = false;
        this.z = Math.random() * 100 - 50;
        this.vz = (Math.random() - 0.5) * 0.4;
        this.zDamping = 0.95;
        this.sleeping = false;
        this.settledTime = null;
        this.doNotDraw = false;
    }

    update() {
        if (this.sleeping) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        // Check bridge segment collision (City 2)
        if (currentCityId === 2 && !this.onGround) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    const debrisCenterX = this.x + this.width / 2;
                    for (let segment of structure.segments) {
                        if (segment.state === 'broken') continue;
                        if (debrisCenterX >= segment.x && debrisCenterX <= segment.x + segment.w) {
                            const segmentY = segment.y + structure.swayOffset;
                            if (this.y + this.height >= segmentY && this.y + this.height <= segmentY + segment.h + 5) {
                                this.y = segmentY - this.height;
                                this.velocityY *= -this.bounciness;
                                this.velocityX *= 0.7;
                                this.vz *= 0.8;
                                this.angularVelocity *= 0.6;

                                if (Math.abs(this.velocityY) < 0.5) {
                                    this.onGround = true;
                                    this.velocityY = 0;
                                    this.vz *= 0.9;
                                }
                                return;
                            }
                        }
                    }
                }
            }
        }

        if (this.onGround) {
            this.velocityX *= this.friction;
            this.angularVelocity *= this.friction;
            this.vz *= 0.95;

            if (Math.abs(this.velocityX) < 0.1) this.velocityX = 0;
            if (Math.abs(this.angularVelocity) < 0.01) this.angularVelocity = 0;
            if (Math.abs(this.vz) < 0.05) this.vz = 0;

            if (this.settledTime === null && Math.abs(this.velocityX) < 0.1 && Math.abs(this.angularVelocity) < 0.01) {
                this.settledTime = Date.now();
            }
            return;
        }

        this.velocityY += this.gravity;
        this.vz *= this.zDamping;
        this.z += this.vz;
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.angularVelocity;

        if (this.y + this.height >= groundY) {
            this.y = groundY - this.height;
            this.velocityY *= -this.bounciness;
            this.velocityX *= 0.7;
            this.vz *= 0.8;
            this.angularVelocity *= 0.6;

            if (Math.abs(this.velocityY) < 0.5) {
                this.onGround = true;
                this.velocityY = 0;
                this.vz *= 0.9;
            }
        }

        if (this.x < -200 || this.x > width + 200 || this.y > height + 200) {
            this.sleeping = true;
            this.onGround = true;
        }
    }

    render() {
        if (this.doNotDraw) return;

        const perspectiveScale = Math.max(0.6, Math.min(1.6, 1 + this.z * 0.002));
        const shadowSize = Math.max(1, Math.min(4, 3 - this.z * 0.015));
        const shadowAlpha = Math.max(0.1, Math.min(0.25, 0.2 - this.z * 0.001));
        const depthBrightness = Math.max(-15, Math.min(10, -this.z * 0.1));

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const groundY = window.innerHeight * 0.85;

        // Shadow
        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX + screenShake.x, groundY + 1, shadowSize * perspectiveScale, shadowSize * perspectiveScale * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Chunk
        ctx.save();
        ctx.translate(centerX + screenShake.x, centerY + screenShake.y);
        ctx.rotate(this.rotation);
        ctx.scale(perspectiveScale, perspectiveScale);

        const colorMatch = this.color.match(/\d+/g);
        if (colorMatch && colorMatch.length >= 3) {
            const r = Math.max(0, Math.min(255, parseInt(colorMatch[0]) + depthBrightness));
            const g = Math.max(0, Math.min(255, parseInt(colorMatch[1]) + depthBrightness));
            const b = Math.max(0, Math.min(255, parseInt(colorMatch[2]) + depthBrightness));
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
            ctx.fillStyle = this.color;
        }

        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.strokeStyle = this.adjustBrightness(this.color, 20);
        ctx.lineWidth = 0.5 / perspectiveScale;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }

    adjustBrightness(color, percent) {
        if (color.startsWith('#')) {
            const num = parseInt(color.replace("#", ""), 16);
            const r = Math.max(0, Math.min(255, (num >> 16) + percent));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
            const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
            return `rgb(${r},${g},${b})`;
        }
        return color;
    }
}

// ============================================
// Robot Missile Class
// ============================================

class RobotMissile {
    constructor(x, y, initialVelX, initialVelY) {
        this.x = x;
        this.y = y;
        this.velocityX = initialVelX;
        this.velocityY = initialVelY;
        this.angle = Math.atan2(initialVelY, initialVelX);
        this.maxSpeed = 12;
        this.turnRate = 0.08; // Radians per frame
        this.lifetime = 0;
        this.maxLifetime = 5000; // 5 seconds
        this.active = true;
        this.trail = [];
        this.size = 6;
    }

    update() {
        if (!this.active) return;

        this.lifetime += 16; // ~60fps

        // Mouse steering (left/right)
        if (pointerActive) {
            const targetX = pointerPosition.x;
            const dx = targetX - this.x;
            const targetAngle = Math.atan2(this.velocityY, Math.sign(dx) * Math.abs(dx));

            // Smooth turn toward target
            let angleDiff = targetAngle - this.angle;
            // Normalize angle difference
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Apply turn rate limit
            const maxTurn = this.turnRate;
            if (Math.abs(angleDiff) > maxTurn) {
                angleDiff = Math.sign(angleDiff) * maxTurn;
            }

            this.angle += angleDiff;
        }

        // Update velocity based on angle
        this.velocityX = Math.cos(this.angle) * this.maxSpeed;
        this.velocityY = Math.sin(this.angle) * this.maxSpeed;

        // Cap speed
        const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
        if (speed > this.maxSpeed) {
            this.velocityX = (this.velocityX / speed) * this.maxSpeed;
            this.velocityY = (this.velocityY / speed) * this.maxSpeed;
        }

        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Store trail
        this.trail.push({ x: this.x, y: this.y, time: this.lifetime });
        if (this.trail.length > 8) {
            this.trail.shift();
        }

        // Check collision with buildings
        const width = window.innerWidth;
        const height = window.innerHeight;
        const groundY = height * 0.85;

        for (let building of buildings) {
            if (building.state === 'collapsed') continue;
            if (building.contains(this.x, this.y)) {
                this.explode();
                return;
            }
        }

        // Check collision with bridge segments
        if (currentCityId === 2) {
            for (let structure of staticStructures) {
                if (structure instanceof Bridge) {
                    if (structure.contains(this.x, this.y)) {
                        this.explode();
                        return;
                    }
                }
            }
        }

        // Check ground collision
        if (this.y >= groundY) {
            this.explode();
            return;
        }

        // Check lifetime
        if (this.lifetime >= this.maxLifetime) {
            this.explode();
            return;
        }

        // Boundary check
        if (this.x < -50 || this.x > width + 50 || this.y < -50) {
            this.active = false;
        }
    }

    explode() {
        if (!this.active) return;
        this.active = false;

        const explosionRadius = 80;
        const damageRadius = 100;

        // Create explosion
        explosions.push(new Explosion(this.x, this.y, explosionRadius, 0.2));
        screenShake.intensity = Math.max(screenShake.intensity, 15);

        // Damage buildings
        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - this.x, 2) + Math.pow(centerY - this.y, 2)
            );

            if (distance < damageRadius) {
                const normalizedDist = distance / damageRadius;
                const falloff = Math.pow(1 - normalizedDist, 3);
                const damage = falloff * 70;
                building.takeDamage(damage, distance, damageRadius);
                building.applyShake(falloff * 10);
            }
        });

        // Damage bridge segments (City 2)
        if (currentCityId === 2) {
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    structure.takeDamage(70, this.x, this.y, damageRadius);
                }
            });
        }

        // Spawn fire emitters
        const fireCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < fireCount; i++) {
            const angle = (Math.PI * 2 * i) / fireCount;
            const offset = 25 + Math.random() * 30;
            const fx = this.x + Math.cos(angle) * offset;
            const fy = this.y + Math.sin(angle) * offset;
            fireEmitters.push(new FireEmitter(fx, fy));
        }

        // Spawn sparks (warm orange/yellow, no gray)
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12;
            const speed = 2 + Math.random() * 3;
            particles.push(new Particle(
                this.x, this.y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1,
                Math.random() < 0.5 ? '#ff8800' : '#ffaa00',
                3 + Math.random() * 3,
                30 + Math.random() * 20
            ));
        }
    }

    render() {
        if (!this.active) return;

        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        // Draw trail
        if (this.trail.length > 1) {
            for (let i = 1; i < this.trail.length; i++) {
                const point = this.trail[i];
                const prevPoint = this.trail[i - 1];
                const age = this.lifetime - point.time;
                const alpha = Math.max(0, 1 - age / 200);

                ctx.strokeStyle = `rgba(255, 200, 100, ${alpha * 0.6})`;
                ctx.lineWidth = 4 - i * 0.3;
                ctx.beginPath();
                ctx.moveTo(prevPoint.x + screenShake.x, prevPoint.y + screenShake.y);
                ctx.lineTo(point.x + screenShake.x, point.y + screenShake.y);
                ctx.stroke();
            }
        }

        // Draw missile body
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(this.angle);

        // Body (orange/red)
        const bodyGradient = ctx.createLinearGradient(-this.size, 0, this.size, 0);
        bodyGradient.addColorStop(0, '#ff6600');
        bodyGradient.addColorStop(0.5, '#ff8800');
        bodyGradient.addColorStop(1, '#ffaa00');
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.roundRect(-this.size, -this.size / 2, this.size * 2, this.size, 2);
        ctx.fill();

        // Nose (bright)
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        ctx.lineTo(this.size + 4, -this.size / 2);
        ctx.lineTo(this.size + 4, this.size / 2);
        ctx.closePath();
        ctx.fill();

        // Fins
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(-this.size / 2, -this.size, 2, this.size / 2);
        ctx.fillRect(-this.size / 2, this.size / 2, 2, this.size / 2);

        ctx.restore();
    }
}

// ============================================
// Water Wave System (City 2)
// ============================================

class WaterWaveSystem {
    constructor(startX, width, waterY) {
        this.startX = startX;
        this.width = width;
        this.waterY = waterY;
        this.pointCount = Math.min(MAX_WATER_POINTS, Math.floor(width / 3)); // ~3px spacing
        this.heights = [];
        this.velocities = [];
        this.restHeight = 0;
        this.springConstant = 0.02;
        this.damping = 0.95;
        this.neighborCoupling = 0.1;
        this.flowPhase = 0; // For base flow drift

        // Initialize arrays
        for (let i = 0; i < this.pointCount; i++) {
            this.heights.push(0);
            this.velocities.push(0);
        }
    }

    update() {
        // Base flow drift (very slow, subtle movement)
        this.flowPhase += 0.01;

        // Update each point
        for (let i = 0; i < this.pointCount; i++) {
            // Spring force toward rest height
            const springForce = -this.heights[i] * this.springConstant;

            // Neighbor coupling (smooth waves)
            let neighborForce = 0;
            if (i > 0) {
                neighborForce += (this.heights[i - 1] - this.heights[i]) * this.neighborCoupling;
            }
            if (i < this.pointCount - 1) {
                neighborForce += (this.heights[i + 1] - this.heights[i]) * this.neighborCoupling;
            }

            // Apply forces
            this.velocities[i] += springForce + neighborForce;
            this.velocities[i] *= this.damping; // Damping

            // Update height
            this.heights[i] += this.velocities[i];

            // Add subtle base flow (very small, slow drift)
            this.heights[i] += Math.sin(this.flowPhase + i * 0.1) * 0.05;
        }
    }

    // Inject disturbance from explosion
    addDisturbance(x, velocityImpulse) {
        // Find closest point
        const localX = x - this.startX;
        const pointIndex = Math.floor((localX / this.width) * this.pointCount);

        if (pointIndex >= 0 && pointIndex < this.pointCount) {
            this.velocities[pointIndex] += velocityImpulse;

            // Also affect neighbors (spread)
            if (pointIndex > 0) {
                this.velocities[pointIndex - 1] += velocityImpulse * 0.5;
            }
            if (pointIndex < this.pointCount - 1) {
                this.velocities[pointIndex + 1] += velocityImpulse * 0.5;
            }
        }
    }

    render() {
        const drawX = this.startX + screenShake.x;
        const drawY = this.waterY + screenShake.y;

        // Water gradient (sunset reflection)
        const waterGradient = ctx.createLinearGradient(0, drawY, 0, drawY + 40);
        waterGradient.addColorStop(0, '#1a3a5a');
        waterGradient.addColorStop(0.3, '#0f2a4a');
        waterGradient.addColorStop(0.7, '#0a1a3a');
        waterGradient.addColorStop(1, '#051a2a');
        ctx.fillStyle = waterGradient;
        ctx.fillRect(drawX, drawY, this.width, 40);

        // Surface line with wave heights
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const pointSpacing = this.width / this.pointCount;
        for (let i = 0; i < this.pointCount; i++) {
            const x = drawX + i * pointSpacing;
            const y = drawY + this.heights[i];

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Specular highlights (subtle)
        ctx.strokeStyle = 'rgba(255, 200, 150, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < this.pointCount; i += 2) {
            const x = drawX + i * pointSpacing;
            const y = drawY + this.heights[i];
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 2);
        }
        ctx.stroke();
    }
}

// ============================================
// Billboard Class (City 3)
// ============================================

class Billboard {
    constructor(x, y, width, height, buildingId = null) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.buildingId = buildingId; // For deterministic ad selection

        // Deterministic ad selection based on building ID or position
        const seed = buildingId !== null ? buildingId : Math.floor(x + y);
        this.adIndex = seed % 12; // 12 different ads

        // Ad definitions with icons and text
        this.ads = [
            { main: 'SILK SHAMPOO', sub: 'NEW', icon: 'droplet', color: '#ff6b9d' },
            { main: 'KERATIN BOOST', sub: 'SALE', icon: 'droplet', color: '#ffaa00' },
            { main: 'FRESH SCALP', sub: '24H', icon: 'droplet', color: '#4a90e2' },
            { main: 'NIGHT BREW', sub: 'LIMITED', icon: 'coffee', color: '#8b4513' },
            { main: 'ESPRESSO 2X', sub: 'NEW', icon: 'coffee', color: '#654321' },
            { main: 'NOVA X', sub: 'SALE', icon: 'phone', color: '#00aaff' },
            { main: 'CAMERA PRO', sub: 'NEW', icon: 'phone', color: '#333333' },
            { main: 'RUN FAST', sub: '24H', icon: 'shoe', color: '#ff3333' },
            { main: 'NOIR', sub: 'LIMITED', icon: 'perfume', color: '#663399' },
            { main: 'SILK SHAMPOO', sub: '', icon: 'droplet', color: '#ff6b9d' },
            { main: 'NIGHT BREW', sub: '', icon: 'coffee', color: '#8b4513' },
            { main: 'NOVA X', sub: '', icon: 'phone', color: '#00aaff' }
        ];

        this.ad = this.ads[this.adIndex];
    }

    render() {
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        // Billboard pole
        ctx.fillStyle = '#555';
        ctx.fillRect(drawX + this.width / 2 - 3, drawY + this.height, 6, 30);

        // Billboard face with perspective (slight trapezoid)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(drawX + 2, drawY);
        ctx.lineTo(drawX + this.width - 2, drawY);
        ctx.lineTo(drawX + this.width, drawY + this.height);
        ctx.lineTo(drawX, drawY + this.height);
        ctx.closePath();
        ctx.clip();

        // Background with gradient
        const bgGradient = ctx.createLinearGradient(drawX, drawY, drawX, drawY + this.height);
        bgGradient.addColorStop(0, '#1a1a1a');
        bgGradient.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Panel border
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX + 2, drawY + 2, this.width - 4, this.height - 4);

        // Subtle spotlight/glow effect
        const glowGradient = ctx.createRadialGradient(
            drawX + this.width / 2, drawY + 10, 0,
            drawX + this.width / 2, drawY + 10, this.width * 0.8
        );
        glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Draw icon
        const iconX = drawX + this.width / 2;
        const iconY = drawY + 12;
        ctx.fillStyle = this.ad.color;

        if (this.ad.icon === 'droplet') {
            // Droplet shape
            ctx.beginPath();
            ctx.moveTo(iconX, iconY);
            ctx.bezierCurveTo(iconX - 4, iconY + 2, iconX - 4, iconY + 6, iconX, iconY + 8);
            ctx.bezierCurveTo(iconX + 4, iconY + 6, iconX + 4, iconY + 2, iconX, iconY);
            ctx.fill();
        } else if (this.ad.icon === 'coffee') {
            // Coffee cup outline
            ctx.strokeStyle = this.ad.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(iconX - 4, iconY);
            ctx.lineTo(iconX - 4, iconY + 6);
            ctx.lineTo(iconX + 4, iconY + 6);
            ctx.lineTo(iconX + 4, iconY);
            ctx.stroke();
            // Handle
            ctx.beginPath();
            ctx.arc(iconX + 4, iconY + 3, 2, 0, Math.PI);
            ctx.stroke();
        } else if (this.ad.icon === 'phone') {
            // Phone outline
            ctx.strokeStyle = this.ad.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(iconX - 4, iconY, 8, 10);
            // Screen
            ctx.fillStyle = this.ad.color;
            ctx.fillRect(iconX - 3, iconY + 2, 6, 6);
        } else if (this.ad.icon === 'shoe') {
            // Shoe outline
            ctx.strokeStyle = this.ad.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(iconX - 5, iconY + 8);
            ctx.lineTo(iconX - 5, iconY + 4);
            ctx.lineTo(iconX - 2, iconY);
            ctx.lineTo(iconX + 2, iconY);
            ctx.lineTo(iconX + 5, iconY + 4);
            ctx.lineTo(iconX + 5, iconY + 8);
            ctx.closePath();
            ctx.stroke();
        } else if (this.ad.icon === 'perfume') {
            // Perfume bottle
            ctx.fillStyle = this.ad.color;
            ctx.fillRect(iconX - 2, iconY, 4, 8);
            // Cap
            ctx.fillRect(iconX - 3, iconY, 6, 2);
        }

        // Main text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.ad.main, drawX + this.width / 2, drawY + this.height - 8);

        // Sub-text (if exists)
        if (this.ad.sub) {
            ctx.fillStyle = this.ad.color;
            ctx.font = 'bold 8px sans-serif';
            ctx.fillText(this.ad.sub, drawX + this.width / 2, drawY + this.height - 2);
        }

        ctx.restore();
    }
}

// ============================================
// City Layout Builder
// ============================================

function buildCityLayout(cityId) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;
    const newBuildings = [];
    const newStructures = [];

    if (cityId === 1) {
        // City 1: Side Placement (User Request)
        // Static Buildings on Left and Right

        const groundY = height * 0.85;

        // Left Side Buildings (0% to 35%)
        let currentX = 0;
        const leftLimit = width * 0.35;

        while (currentX < leftLimit) {
            const widthRoll = Math.random();
            let buildingWidth = 30 + Math.random() * 50; // Random width 30-80

            // Check limits
            if (currentX + buildingWidth > leftLimit) break;

            // Varied heights
            const heightRoll = Math.random();
            let buildingHeight;
            if (heightRoll < 0.3) {
                buildingHeight = 100 + Math.random() * 100;
            } else if (heightRoll < 0.7) {
                buildingHeight = 200 + Math.random() * 100;
            } else {
                buildingHeight = 300 + Math.random() * 150;
            }

            const buildingY = groundY - buildingHeight;
            const gap = 5 + Math.random() * 15;

            newBuildings.push(new Building(currentX, buildingY, buildingWidth, buildingHeight));
            currentX += buildingWidth + gap;
        }

        // Right Side Buildings (65% to 100%)
        currentX = width * 0.65;
        const rightLimit = width;

        while (currentX < rightLimit) {
            const widthRoll = Math.random();
            let buildingWidth = 30 + Math.random() * 50;

            // Check limits
            if (currentX + buildingWidth > rightLimit + 30) break;

            // Varied heights
            const heightRoll = Math.random();
            let buildingHeight;
            if (heightRoll < 0.3) {
                buildingHeight = 100 + Math.random() * 100;
            } else if (heightRoll < 0.7) {
                buildingHeight = 200 + Math.random() * 100;
            } else {
                buildingHeight = 300 + Math.random() * 150;
            }

            const buildingY = groundY - buildingHeight;
            const gap = 5 + Math.random() * 15;

            newBuildings.push(new Building(currentX, buildingY, buildingWidth, buildingHeight));
            currentX += buildingWidth + gap;
        }
    } else if (cityId === 2) {
        // City 2: Bridge variant with river
        const waterY = groundY + 20; // Water level slightly below ground
        const waterHeight = 40;
        const bridgeY = waterY - 15; // Bridge deck above water
        const bridgeHeight = 12;
        const riverWidth = width * 0.4; // River takes 40% of width
        const riverStartX = width * 0.3; // River starts at 30% from left
        const bridgeX = riverStartX - 20; // Bridge extends beyond river
        const bridgeWidth = riverWidth + 40;

        // Create red suspension bridge
        const bridge = new Bridge(bridgeX, bridgeY, bridgeWidth, bridgeHeight);
        newStructures.push(bridge);

        // Create water wave system
        waterWaves = new WaterWaveSystem(riverStartX, riverWidth, waterY);

        // Buildings on left bank (mixed skyline with gaps)
        const leftBankWidth = riverStartX - 20;
        let leftCurrentX = 0;
        const minBuildingWidth = 20;
        const maxBuildingWidth = 60;

        while (leftCurrentX < leftBankWidth) {
            const widthRoll = Math.random();
            let buildingWidth;
            if (widthRoll < 0.5) {
                buildingWidth = Math.random() * 15 + minBuildingWidth;
            } else if (widthRoll < 0.85) {
                buildingWidth = Math.random() * 20 + 35;
            } else {
                buildingWidth = Math.random() * 15 + 55;
            }

            const heightRoll = Math.random();
            let buildingHeight;
            if (heightRoll < 0.3) {
                buildingHeight = Math.random() * 80 + 100;
            } else if (heightRoll < 0.7) {
                buildingHeight = Math.random() * 120 + 180;
            } else {
                buildingHeight = Math.random() * 150 + 300;
            }

            const gap = Math.random() * 14 + 6;
            const x = leftCurrentX + gap;
            const y = groundY - buildingHeight;

            if (x + buildingWidth <= leftBankWidth) {
                newBuildings.push(new Building(x, y, buildingWidth, buildingHeight));
            }
            leftCurrentX = x + buildingWidth;
        }

        // Buildings on right bank (mixed skyline with gaps)
        const rightBankStartX = riverStartX + riverWidth + 20;
        let rightCurrentX = rightBankStartX;

        while (rightCurrentX < width) {
            const widthRoll = Math.random();
            let buildingWidth;
            if (widthRoll < 0.5) {
                buildingWidth = Math.random() * 15 + minBuildingWidth;
            } else if (widthRoll < 0.85) {
                buildingWidth = Math.random() * 20 + 35;
            } else {
                buildingWidth = Math.random() * 15 + 55;
            }

            const heightRoll = Math.random();
            let buildingHeight;
            if (heightRoll < 0.3) {
                buildingHeight = Math.random() * 80 + 100;
            } else if (heightRoll < 0.7) {
                buildingHeight = Math.random() * 120 + 180;
            } else {
                buildingHeight = Math.random() * 150 + 300;
            }

            const gap = Math.random() * 14 + 6;
            const x = rightCurrentX + gap;
            const y = groundY - buildingHeight;

            if (x + buildingWidth <= width) {
                newBuildings.push(new Building(x, y, buildingWidth, buildingHeight));
            }
            rightCurrentX = x + buildingWidth;
        }
    } else if (cityId === 3) {
        // City 3: Downtown cluster in center, smaller buildings on edges
        const centerX = width / 2;
        const centerClusterRadius = width * 0.25;

        // Mixed skyline with downtown cluster in center
        let currentX = 0;
        const minBuildingWidth = 20;
        const maxBuildingWidth = 65;

        while (currentX < width) {
            const isDowntown = currentX >= centerX - centerClusterRadius && currentX <= centerX + centerClusterRadius;

            // Varied widths
            const widthRoll = Math.random();
            let buildingWidth;
            if (widthRoll < 0.5) {
                buildingWidth = Math.random() * 15 + minBuildingWidth;
            } else if (widthRoll < 0.85) {
                buildingWidth = Math.random() * 20 + 35;
            } else {
                buildingWidth = Math.random() * 15 + 55;
            }

            // Varied heights (taller in downtown)
            let buildingHeight;
            if (isDowntown) {
                const heightRoll = Math.random();
                if (heightRoll < 0.3) {
                    buildingHeight = Math.random() * 100 + 250; // Mid-tall: 250-350
                } else {
                    buildingHeight = Math.random() * 150 + 350; // Very tall: 350-500
                }
            } else {
                const heightRoll = Math.random();
                if (heightRoll < 0.4) {
                    buildingHeight = Math.random() * 80 + 100; // Short: 100-180
                } else {
                    buildingHeight = Math.random() * 100 + 180; // Mid-rise: 180-280
                }
            }

            const gap = Math.random() * 14 + 6;
            const x = currentX + gap;
            const y = groundY - buildingHeight;

            if (x + buildingWidth <= width) {
                newBuildings.push(new Building(x, y, buildingWidth, buildingHeight));
            }
            currentX = x + buildingWidth;
        }

        // Add billboards on some buildings
        newBuildings.forEach((building, index) => {
            if (index % 3 === 0 && building.height > 150) {
                const billboardX = building.x + building.width / 2 - 30;
                const billboardY = building.y - 40;
                newStructures.push(new Billboard(billboardX, billboardY, 60, 30, index));
            }
        });
    }

    return {
        buildings: newBuildings,
        structures: newStructures
    };
}

// ============================================
// City Generation
// ============================================

function generateCity() {
    // Clear all entities
    buildings = [];
    staticStructures = [];
    particles.length = 0;
    explosions.length = 0;
    bombs.length = 0;
    lasers.length = 0;
    tornados.length = 0;
    stickyBombs.length = 0;
    robotHandLasers.length = 0;
    ufoHandLasers.length = 0;
    meteors.length = 0;
    fireEmitters.length = 0;
    fireParticles.length = 0;
    buildingDebris.length = 0; // Clear debris
    microDebris.length = 0; // Clear micro-debris
    dustParticles.length = 0; // Clear dust particles
    voxelBits.length = 0; // Clear voxel bits
    screenShake = { x: 0, y: 0, intensity: 0 };
    screenFlash = { active: false, intensity: 0 };
    pointerActive = false; // Reset pointer state

    // Clear UFO states (cooldowns, stealth, held keys)
    ufoControls.laser = false;
    ufoControls.tractor = false;
    ufoControls.invisibility = false;
    if (ufo) {
        ufo.laserActive = false;
        ufo.tractorActive = false;
        ufo.invisible = false;
        ufo.lastLaserFireTime = 0;
    }

    // Clear voxel cutouts from all buildings
    buildings.forEach(building => {
        building.voxelCutouts.clear();
        building.lastVoxelSpawnTime = 0;
        building.cacheDirty = true; // Invalidate cache to redraw without cutouts
    });

    // Clear bridge debris
    bridgeDebris = [];

    // Clear robot missiles
    robotMissiles = [];

    // Clear water waves (will be recreated for City 2)
    waterWaves = null;

    // Close UFO drawer
    closeUFODrawer();

    // Clear bridge state (City 2)
    if (currentCityId === 2) {
        staticStructures.forEach(structure => {
            if (structure instanceof Bridge) {
                // Reset bridge segments, sway, cables, physics
                structure.segments.forEach(seg => {
                    seg.health = seg.maxHealth;
                    seg.state = 'intact';
                    seg.isKinematic = true; // Reset to kinematic
                    seg.x = seg.baseX; // Reset position
                    seg.y = seg.baseY;
                    seg.velocityX = 0;
                    seg.velocityY = 0;
                    seg.rotation = 0;
                    seg.angularVelocity = 0;
                    // Reset joints
                    if (seg.leftJoint) seg.leftJoint.broken = false;
                    if (seg.rightJoint) seg.rightJoint.broken = false;
                    // Reset cable attachments
                    seg.cableAttachments.forEach(cable => {
                        cable.broken = false;
                        cable.breakTime = 0;
                    });
                });
                structure.swayActive = false;
                structure.swayOffset = 0;
                structure.swayVelocity = 0;
                structure.swayDamping = structure.baseDamping; // Reset damping
                structure.hangers.forEach(h => {
                    h.broken = false;
                    h.breakTime = 0;
                });
                structure.cablesBroken = false;
                structure.cableBreakSequence = []; // Clear break sequences
                structure.destructionSequence = []; // Clear destruction sequences
                structure.leftTowerHealth = structure.towerHealth;
                structure.rightTowerHealth = structure.towerHealth;
            }
        });
    }

    // Clear all building caches (cracks, impact scars, etc.)
    // This is handled by creating new buildings, but ensure old ones are cleared

    // Update detonate button
    updateDetonateButton();

    // Build city layout based on current city ID
    const layout = buildCityLayout(currentCityId);
    buildings = layout.buildings;
    staticStructures = layout.structures;

    // Reset robot if in robot mode (ALWAYS respawn)
    if (currentWeapon === 'robot') {
        spawnRobot();
    }

    // Reset UFO if in ufo mode (ALWAYS respawn)
    if (currentWeapon === 'ufo') {
        spawnUFO(); // This will set invisible = false and apply variant
    } else {
        // Clear UFO state if not in ufo mode
        if (ufo) {
            ufo.invisible = false;
        }
        ufoControls.invisibility = false;
    }

    // Keep UFO variant selection (don't reset it)

    // Reinitialize background
    initBackground();
}

// ============================================
// Weapon Actions
// ============================================

// ============================================
// Meteor Class (Sky Streak)
// ============================================

class Meteor {
    constructor(targetX, targetY) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Start from top-left or top-right
        const startFromLeft = Math.random() > 0.5;
        this.startX = startFromLeft ? -50 : width + 50;
        this.startY = -50;
        this.targetX = targetX;
        this.targetY = targetY;

        // Calculate travel distance and time
        const dx = this.targetX - this.startX;
        const dy = this.targetY - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        this.travelTime = Math.max(400, Math.min(900, distance * 1.2)); // 400-900ms

        this.startTime = Date.now();
        this.x = this.startX;
        this.y = this.startY;
        this.exploded = false;
        this.trail = []; // Store trail points
    }

    update() {
        if (this.exploded) return;

        const elapsed = Date.now() - this.startTime;
        const progress = Math.min(1, elapsed / this.travelTime);

        // Interpolate position
        this.x = this.startX + (this.targetX - this.startX) * progress;
        this.y = this.startY + (this.targetY - this.startY) * progress;

        // Store trail point
        this.trail.push({ x: this.x, y: this.y, time: elapsed });
        // Keep only recent trail points
        if (this.trail.length > 15) {
            this.trail.shift();
        }

        // Check if reached target
        if (progress >= 1) {
            this.explode();
        }
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;

        const explosionRadius = 120;
        const damageRadius = 150;

        // Create explosion visual
        explosions.push(new Explosion(this.targetX, this.targetY, explosionRadius));

        // Screen shake
        screenShake.intensity = 15;

        // Calculate damage to buildings with non-linear falloff
        buildings.forEach(building => {
            if (building.state === 'collapsed') return;

            const centerX = building.getCenterX();
            const centerY = building.getCenterY();
            const distance = Math.sqrt(
                Math.pow(centerX - this.targetX, 2) + Math.pow(centerY - this.targetY, 2)
            );

            if (distance < damageRadius) {
                // Non-linear damage falloff (cubed)
                const normalizedDist = distance / damageRadius;
                const falloff = Math.pow(1 - normalizedDist, 3);
                const baseDamage = 80;
                const damage = baseDamage * falloff;

                building.takeDamage(damage, distance, damageRadius);

                // Apply shake effect
                const shakeIntensity = falloff * 10;
                building.applyShake(shakeIntensity);
            }
        });

        // Create fire emitters
        const fireCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < fireCount; i++) {
            const angle = (Math.PI * 2 * i) / fireCount;
            const offset = 20 + Math.random() * 30;
            const fx = this.targetX + Math.cos(angle) * offset;
            const fy = this.targetY + Math.sin(angle) * offset;
            fireEmitters.push(new FireEmitter(fx, fy));
        }

        // Damage bridge segments (City 2)
        if (currentCityId === 2) {
            staticStructures.forEach(structure => {
                if (structure instanceof Bridge) {
                    structure.takeDamage(25, this.targetX, this.targetY, damageRadius);
                }
            });
        }
    }

    render() {
        if (this.exploded) return;

        // Draw trail
        if (this.trail.length > 1) {
            for (let i = 1; i < this.trail.length; i++) {
                const point = this.trail[i];
                const prevPoint = this.trail[i - 1];
                const age = Date.now() - point.time;
                const alpha = Math.max(0, 1 - age / 200);

                const gradient = ctx.createLinearGradient(
                    prevPoint.x, prevPoint.y,
                    point.x, point.y
                );
                gradient.addColorStop(0, `rgba(255, 200, 100, ${alpha * 0.6})`);
                gradient.addColorStop(1, `rgba(255, 150, 50, ${alpha * 0.3})`);

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 8 - i * 0.4;
                ctx.beginPath();
                ctx.moveTo(prevPoint.x + screenShake.x, prevPoint.y + screenShake.y);
                ctx.lineTo(point.x + screenShake.x, point.y + screenShake.y);
                ctx.stroke();
            }
        }

        // Draw meteor head (bright)
        const drawX = this.x + screenShake.x;
        const drawY = this.y + screenShake.y;

        // Outer glow
        ctx.fillStyle = 'rgba(255, 200, 100, 0.8)';
        ctx.beginPath();
        ctx.arc(drawX, drawY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.beginPath();
        ctx.arc(drawX, drawY, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createMeteorStrike(x, y) {
    if (meteors.length >= MAX_METEORS) return;
    meteors.push(new Meteor(x, y));
}

function createNukeStrike(x, y) {
    const bombCount = Math.floor(Math.random() * 5) + 6; // 6-10 bombs
    const spread = 300;

    for (let i = 0; i < bombCount; i++) {
        if (bombs.length >= MAX_BOMBS) break;

        const offsetX = (Math.random() - 0.5) * spread;
        const bombX = x + offsetX;
        const bombY = -50; // Start above screen

        bombs.push(new NuclearBomb(bombX, bombY));
    }
}

function createLaserStrike(x, y) {
    // Create laser at x position
    lasers.push(new Laser(x));

    // Screen shake
    screenShake.intensity = 10;
}

function createTornadoStrike(x, y) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    if (tornados.length >= MAX_TORNADOS) return;

    tornados.push(new Tornado(x, groundY));
}

function createStickyBombPlacement(x, y) {
    placeStickyBomb(x, y);
}

// ============================================
// Input Handling
// ============================================

function handlePointerMove(event) {
    // Track pointer for both robot and UFO modes
    if (currentWeapon !== 'robot' && currentWeapon !== 'ufo') return;

    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX !== undefined ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
    const clientY = event.clientY !== undefined ? event.clientY : (event.touches && event.touches[0] ? event.touches[0].clientY : 0);

    pointerPosition.x = clientX - rect.left;
    pointerPosition.y = clientY - rect.top;
    pointerActive = true;
}

function handlePointerDown(event) {
    if (currentWeapon === 'robot') {
        mouseButtonHeld = true;
        if (robot) {
            robot.laserFiring = true;
        }
        // Update pointer position
        handlePointerMove(event);
    }
}

function handlePointerUp(event) {
    if (currentWeapon === 'robot') {
        mouseButtonHeld = false;
        if (robot) {
            robot.laserFiring = false;
        }
    }
}

function handlePointer(event) {
    if (isDestroying) return;

    event.preventDefault();
    initAudioOnInteraction();

    const rect = canvas.getBoundingClientRect();

    // Get pointer position in CSS pixels (context scaling handles the rest)
    const clientX = event.clientX !== undefined ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
    const clientY = event.clientY !== undefined ? event.clientY : (event.touches && event.touches[0] ? event.touches[0].clientY : 0);

    // Calculate position relative to canvas (accounting for any offset)
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Update pointer position for robot laser aim
    if (currentWeapon === 'robot') {
        pointerPosition.x = x;
        pointerPosition.y = y;
        pointerActive = true;
        // Continuous firing is handled in Robot.update() via laserFiring flag
        return;
    }

    // Trigger appropriate weapon for non-robot modes
    switch (currentWeapon) {
        case 'meteor':
            createMeteorStrike(x, y);
            break;
        case 'nuke':
            createNukeStrike(x, y);
            break;
        case 'laser':
            createLaserStrike(x, y);
            break;
        case 'tornado':
            createTornadoStrike(x, y);
            break;
        case 'sticky':
            createStickyBombPlacement(x, y);
            break;
    }
}

// Use pointer events for unified input handling
canvas.addEventListener('pointerdown', (e) => {
    handlePointerDown(e);
    handlePointer(e);
});
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('mousedown', (e) => {
    handlePointerDown(e);
    handlePointer(e);
});
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('click', handlePointer);

// Fallback for older browsers
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        handlePointerDown(e.touches[0]);
        handlePointer(e.touches[0]);
    }
});
canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    handlePointerUp(e);
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0 && (currentWeapon === 'robot' || currentWeapon === 'ufo')) {
        handlePointerMove(e.touches[0]);
    }
});

// Handle pointer leave (stop firing when mouse leaves canvas)
canvas.addEventListener('pointerleave', () => {
    if (robot) {
        robot.laserFiring = false;
    }
    mouseButtonHeld = false;
});
canvas.addEventListener('mouseleave', () => {
    if (robot) {
        robot.laserFiring = false;
    }
    mouseButtonHeld = false;
});

// Prevent context menu on long press
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// City selection button
function initCitySelection() {
    const cityBtn = document.getElementById('cityBtn');

    function updateCityButton() {
        const cityNames = ['', 'CITY: 1', 'CITY: 2', 'CITY: 3'];
        cityBtn.textContent = cityNames[currentCityId];
    }

    cityBtn.addEventListener('click', () => {
        currentCityId = (currentCityId % 3) + 1; // Cycle 1 -> 2 -> 3 -> 1
        updateCityButton();
        generateCity();
    });

    updateCityButton();
}

// Reset button
document.getElementById('resetBtn').addEventListener('click', () => {
    generateCity();
});

// Robot controls - Desktop
document.addEventListener('keydown', (e) => {
    if (currentWeapon !== 'robot') return;
    initAudioOnInteraction();

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            robotControls.left = true;
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            robotControls.right = true;
            e.preventDefault();
            break;
        case ' ':
            robotControls.jump = true;
            e.preventDefault();
            break;
        case 'f':
        case 'F':
            robotControls.punch = true;
            e.preventDefault();
            break;
        case 'o':
        case 'O':
            // O key for missile launch (ROBOT mode only)
            robotControls.missile = true;
            e.preventDefault();
            break;
        case 'r':
        case 'R':
            robotControls.rightArmFire = true;
            e.preventDefault();
            break;
        case 't':
        case 'T':
            robotControls.leftArmFire = true;
            e.preventDefault();
            break;
        // E key removed - laser is now pointer-aimed
    }
});

document.addEventListener('keyup', (e) => {
    if (currentWeapon !== 'robot') return;

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            robotControls.left = false;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            robotControls.right = false;
            break;
        case ' ':
            robotControls.jump = false;
            robotControls.jumpHeld = false;
            break;
        case 'r':
        case 'R':
            robotControls.rightArmFire = false;
            break;
        case 't':
        case 'T':
            robotControls.leftArmFire = false;
            break;
    }
});

// UFO controls - Desktop (E/F only work in UFO mode)
document.addEventListener('keydown', (e) => {
    if (currentWeapon !== 'ufo') return;
    initAudioOnInteraction();

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            ufoControls.left = true;
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            ufoControls.right = true;
            e.preventDefault();
            break;
        case 'ArrowUp':
        case 'w':
        case 'W':
            ufoControls.up = true;
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            ufoControls.down = true;
            e.preventDefault();
            break;
        case 'e':
        case 'E':
            ufoControls.laser = true;
            e.preventDefault();
            break;
        case 'f':
        case 'F':
            ufoControls.tractor = true;
            e.preventDefault();
            break;
        case 'o':
        case 'O':
            // Toggle invisibility (UFO mode only)
            if (currentWeapon === 'ufo') {
                ufoControls.invisibility = !ufoControls.invisibility;
                if (ufo) {
                    ufo.invisible = ufoControls.invisibility;
                }
                updateStealthIndicator();
                e.preventDefault();
            }
            break;
    }
});

document.addEventListener('keyup', (e) => {
    if (currentWeapon !== 'ufo') return;

    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            ufoControls.left = false;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            ufoControls.right = false;
            break;
        case 'ArrowUp':
        case 'w':
        case 'W':
            ufoControls.up = false;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            ufoControls.down = false;
            break;
        case 'e':
        case 'E':
            ufoControls.laser = false;
            break;
        case 'f':
        case 'F':
            ufoControls.tractor = false;
            break;
    }
});

// Robot controls - Mobile buttons
function initRobotControls() {
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnJump = document.getElementById('btnJump');
    const btnPunch = document.getElementById('btnPunch');
    const btnLaser = document.getElementById('btnLaser');

    btnLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        robotControls.left = true;
    });
    btnLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        robotControls.left = false;
    });
    btnLeft.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        robotControls.left = true;
    });
    btnLeft.addEventListener('mouseup', () => {
        robotControls.left = false;
    });

    btnRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        robotControls.right = true;
    });
    btnRight.addEventListener('touchend', (e) => {
        e.preventDefault();
        robotControls.right = false;
    });
    btnRight.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        robotControls.right = true;
    });
    btnRight.addEventListener('mouseup', () => {
        robotControls.right = false;
    });

    btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        robotControls.jump = true;
    });
    btnJump.addEventListener('touchend', (e) => {
        e.preventDefault();
        robotControls.jump = false;
        robotControls.jumpHeld = false;
    });
    btnJump.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        robotControls.jump = true;
    });
    btnJump.addEventListener('mouseup', () => {
        robotControls.jump = false;
        robotControls.jumpHeld = false;
    });

    btnPunch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        robotControls.punch = true;
    });
    btnPunch.addEventListener('touchend', (e) => {
        e.preventDefault();
        robotControls.punch = false;
    });
    btnPunch.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        robotControls.punch = true;
    });
    btnPunch.addEventListener('mouseup', () => {
        robotControls.punch = false;
    });

    // Laser button now supports hold-to-fire continuous laser
    btnLaser.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        if (robot && pointerActive) {
            robot.laserFiring = true;
        }
    });
    btnLaser.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (robot) {
            robot.laserFiring = false;
        }
    });
    btnLaser.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        if (robot && pointerActive) {
            robot.laserFiring = true;
        }
    });
    btnLaser.addEventListener('mouseup', () => {
        if (robot) {
            robot.laserFiring = false;
        }
    });

    // Update laser button energy indicator
    function updateLaserButton() {
        if (robot && currentWeapon === 'robot') {
            const energyPercent = robot.getLaserEnergyPercent();
            if (energyPercent <= 0) {
                btnLaser.style.opacity = '0.5';
                btnLaser.style.filter = 'grayscale(50%)';
            } else if (energyPercent < 0.3) {
                btnLaser.style.opacity = '0.7';
                btnLaser.style.filter = 'none';
            } else {
                btnLaser.style.opacity = '1';
                btnLaser.style.filter = 'none';
            }
        }
    }

    // Update button state periodically
    setInterval(updateLaserButton, 50);
}

// UFO controls - Mobile buttons
function initUFOControls() {
    const ufoBtnLeft = document.getElementById('ufoBtnLeft');
    const ufoBtnRight = document.getElementById('ufoBtnRight');
    const ufoBtnUp = document.getElementById('ufoBtnUp');
    const ufoBtnDown = document.getElementById('ufoBtnDown');
    const ufoBtnLaser = document.getElementById('ufoBtnLaser');
    const ufoBtnTractor = document.getElementById('ufoBtnTractor');

    // Movement buttons
    ufoBtnLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.left = true;
    });
    ufoBtnLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.left = false;
    });
    ufoBtnLeft.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.left = true;
    });
    ufoBtnLeft.addEventListener('mouseup', () => {
        ufoControls.left = false;
    });

    ufoBtnRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.right = true;
    });
    ufoBtnRight.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.right = false;
    });
    ufoBtnRight.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.right = true;
    });
    ufoBtnRight.addEventListener('mouseup', () => {
        ufoControls.right = false;
    });

    ufoBtnUp.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.up = true;
    });
    ufoBtnUp.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.up = false;
    });
    ufoBtnUp.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.up = true;
    });
    ufoBtnUp.addEventListener('mouseup', () => {
        ufoControls.up = false;
    });

    ufoBtnDown.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.down = true;
    });
    ufoBtnDown.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.down = false;
    });
    ufoBtnDown.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.down = true;
    });
    ufoBtnDown.addEventListener('mouseup', () => {
        ufoControls.down = false;
    });

    // Laser button (hold-to-fire)
    ufoBtnLaser.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.laser = true;
    });
    ufoBtnLaser.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.laser = false;
    });
    ufoBtnLaser.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.laser = true;
    });
    ufoBtnLaser.addEventListener('mouseup', () => {
        ufoControls.laser = false;
    });

    // Tractor button (hold-to-activate)
    ufoBtnTractor.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initAudioOnInteraction();
        ufoControls.tractor = true;
    });
    ufoBtnTractor.addEventListener('touchend', (e) => {
        e.preventDefault();
        ufoControls.tractor = false;
    });
    ufoBtnTractor.addEventListener('mousedown', () => {
        initAudioOnInteraction();
        ufoControls.tractor = true;
    });
    ufoBtnTractor.addEventListener('mouseup', () => {
        ufoControls.tractor = false;
    });
}

// ============================================
// Screen Shake Update
// ============================================

function updateScreenShake() {
    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.9;

        if (screenShake.intensity < 0.1) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }
}

function updateScreenFlash() {
    if (screenFlash.active) {
        screenFlash.intensity *= 0.85;
        if (screenFlash.intensity < 0.01) {
            screenFlash.active = false;
            screenFlash.intensity = 0;
        }
    }
}

function renderScreenFlash() {
    if (!screenFlash.active) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.fillStyle = `rgba(255, 255, 255, ${screenFlash.intensity})`;
    ctx.fillRect(0, 0, width, height);
}

function renderCrosshair() {
    // Show crosshair for robot and UFO modes
    if ((currentWeapon !== 'robot' && currentWeapon !== 'ufo') || !pointerActive) return;

    const x = pointerPosition.x;
    const y = pointerPosition.y;
    const size = 12;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;

    // Draw crosshair
    ctx.beginPath();
    // Horizontal line
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    // Vertical line
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();

    // Outer circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
}

// ============================================
// Ground Rendering
// ============================================

// Render ground (Road / Grid)
function renderGround() {
    // Use window dimensions directly
    const width = window.innerWidth;
    const height = window.innerHeight;
    const groundY = height * 0.85;

    if (currentCityId === 2) {
        // City 2: River and bridge (Keep existing logic)
        const waterY = groundY + 20;
        const waterHeight = 40;
        const riverWidth = width * 0.4;
        const riverStartX = width * 0.3;

        // Ground fill (left bank)
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, groundY, riverStartX, height - groundY);

        // Ground fill (right bank)
        ctx.fillRect(riverStartX + riverWidth, groundY, width - (riverStartX + riverWidth), height - groundY);

        // Water is rendered by WaterWaveSystem (if exists)
        if (waterWaves) {
            waterWaves.render();
        } else {
            // Fallback: simple water fill
            const waterGradient = ctx.createLinearGradient(0, waterY, 0, waterY + waterHeight);
            waterGradient.addColorStop(0, '#1a3a5a');
            waterGradient.addColorStop(0.5, '#0f2a4a');
            waterGradient.addColorStop(1, '#0a1a3a');
            ctx.fillStyle = waterGradient;
            ctx.fillRect(riverStartX, waterY, riverWidth, waterHeight);
        }

        // Ground lines
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(riverStartX, groundY);
        ctx.moveTo(riverStartX + riverWidth, groundY);
        ctx.lineTo(width, groundY);
        ctx.stroke();

        // Render bridge
        staticStructures.forEach(structure => {
            if (structure instanceof Bridge) {
                structure.render();
            }
        });
    } else {
        // City 1 & 3: Enhanced Road / Grid

        // Background for ground (Dark Asphalt)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, groundY, width, height - groundY);

        // Draw perspective grid / road markings
        ctx.save();

        // Road surface texture (noise-like)
        // (Skipping complex noise for performance, using color)

        // Road Stripes (Horizontal for side-scroller)
        ctx.fillStyle = '#e0e0e0';
        const stripeWidth = 60;
        const stripeHeight = 15;
        const stripeGap = 80;
        const roadMiddleY = groundY + (height - groundY) / 2;

        // Draw dashed center line
        for (let x = 0; x < width; x += (stripeWidth + stripeGap)) {
            ctx.fillRect(x, roadMiddleY - stripeHeight / 2, stripeWidth, stripeHeight);
        }

        // Top and Bottom Road Edges (Curbs)
        ctx.fillStyle = '#555';
        ctx.fillRect(0, groundY, width, 10); // Top Curb
        // ctx.fillRect(0, height - 10, width, 10); // Bottom Curb

        // "Invisible Wall" indicators
        // Left
        ctx.fillStyle = 'rgba(255, 50, 50, 0.15)';
        ctx.fillRect(0, 0, 10, height);
        // Right
        ctx.fillRect(width - 10, 0, 10, height);

        ctx.restore();
    }

    // Render other static structures (billboards, etc.)
    staticStructures.forEach(structure => {
        if (structure instanceof Billboard) {
            structure.render();
        }
    });
}

// ============================================
// Game Loop
// ============================================

function renderDebugOverlay() {
    if (!showDebug) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // Draw debug info box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 250, 160);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const debugInfo = [
        `Canvas CSS: ${width}x${height}`,
        `DPR: ${dpr.toFixed(2)}`,
        `Canvas Internal: ${canvas.width}x${canvas.height}`,
        `Buildings: ${buildings.length}`,
        `Fragments: ${particles.length}`,
        `Bombs: ${bombs.length}`,
        `Lasers: ${lasers.length}`,
        `Tornados: ${tornados.length}`,
        `Sticky: ${stickyBombs.length}`,
        `Weapon: ${currentWeapon}`,
        `Press D to toggle`
    ];

    debugInfo.forEach((line, i) => {
        ctx.fillText(line, 15, 15 + i * 18);
    });
}

function gameLoop() {
    // Use window dimensions directly (CSS pixels, context is already scaled by dpr)
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Clear canvas (use CSS pixel dimensions, context handles scaling)
    ctx.clearRect(0, 0, width, height);

    // Update screen shake and flash
    updateScreenShake();
    updateScreenFlash();

    // Render background
    renderBackground();

    // Update buildings and remove collapsed ones
    buildings = buildings.filter(building => {
        if (building.state === 'collapsed') {
            return false; // Remove collapsed buildings
        }
        building.update();
        return true;
    });

    // Failsafe: Ensure robot exists if in robot mode
    if (currentWeapon === 'robot' && !robot) {
        spawnRobot();
    }

    // Failsafe: Ensure UFO exists if in ufo mode
    if (currentWeapon === 'ufo' && !ufo) {
        spawnUFO();
    }

    // Update robot (ALWAYS update if in robot mode)
    if (currentWeapon === 'robot' && robot) {
        robot.update();
    }

    // Update UFO (ALWAYS update if in ufo mode)
    if (currentWeapon === 'ufo' && ufo) {
        ufo.update();
        updateStealthIndicator();
    }

    // Update bridge (City 2)
    if (currentCityId === 2) {
        staticStructures.forEach(structure => {
            if (structure instanceof Bridge) {
                structure.update();
            }
        });
    }

    // Update water waves (City 2)
    if (currentCityId === 2 && waterWaves) {
        waterWaves.update();
    }

    // Update robot missiles
    robotMissiles = robotMissiles.filter(missile => {
        missile.update();
        return missile.active;
    });

    // Cap robot missiles
    if (robotMissiles.length > 10) {
        robotMissiles.splice(0, robotMissiles.length - 10);
    }

    // Update bridge debris
    bridgeDebris = bridgeDebris.filter(debris => {
        debris.update();
        return !debris.sleeping || !debris.doNotDraw; // Keep if not sleeping or still drawing
    });

    // Cap bridge debris
    if (bridgeDebris.length > MAX_BRIDGE_DEBRIS) {
        const sleepingDebris = bridgeDebris.filter(d => d.sleeping && d.settledTime !== null);
        sleepingDebris.sort((a, b) => a.settledTime - b.settledTime);
        const excessCount = bridgeDebris.length - MAX_BRIDGE_DEBRIS;
        for (let i = 0; i < Math.min(excessCount, sleepingDebris.length); i++) {
            sleepingDebris[i].doNotDraw = true;
        }
    }

    // Update bombs
    bombs = bombs.filter(bomb => {
        bomb.update();
        return !bomb.exploded;
    });

    // Cap bombs
    if (bombs.length > MAX_BOMBS) {
        bombs.splice(0, bombs.length - MAX_BOMBS);
    }

    // Update lasers
    lasers = lasers.filter(laser => {
        laser.update();
        return laser.active;
    });

    // Update robot hand lasers
    robotHandLasers = robotHandLasers.filter(laser => {
        laser.update();
        return laser.active;
    });

    // Update UFO lasers
    ufoHandLasers = ufoHandLasers.filter(laser => {
        laser.update();
        return laser.active;
    });

    // Update tornados
    tornados = tornados.filter(tornado => {
        tornado.update();
        return tornado.active;
    });

    // Update sticky bombs (only active ones)
    stickyBombs = stickyBombs.filter(bomb => {
        if (bomb.active) {
            bomb.update();
        }
        return bomb.isArmed;
    });

    // Update detonate button if sticky weapon is active
    if (currentWeapon === 'sticky') {
        updateDetonateButton();
    }

    // Update particles with persistent debris (sleeping state)
    let activeParticleCount = 0;
    let sleepingCount = 0;
    const SLEEP_DELAY = 5000; // 5 seconds after settling before sleeping

    for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];

        // Check if particle should sleep (settled for a while)
        if (particle.onGround && particle.settledTime !== null && !particle.sleeping) {
            const settledDuration = Date.now() - particle.settledTime;
            if (settledDuration > SLEEP_DELAY) {
                particle.sleeping = true;
            }
        }

        // Only update physics if not sleeping
        if (!particle.sleeping) {
            particle.update();
            activeParticleCount++;
        } else {
            sleepingCount++;
        }
    }

    // Performance: if we exceed max particles, mark oldest sleeping ones as "do not draw"
    // But keep them in array for potential reactivation
    if (particles.length > MAX_PARTICLES) {
        // Sort sleeping particles by settled time (oldest first)
        const sleepingParticles = particles.filter(p => p.sleeping && p.settledTime !== null);
        sleepingParticles.sort((a, b) => a.settledTime - b.settledTime);

        // Mark oldest sleeping particles as "do not draw" (but keep in array)
        const excessCount = particles.length - MAX_PARTICLES;
        for (let i = 0; i < Math.min(excessCount, sleepingParticles.length); i++) {
            sleepingParticles[i].doNotDraw = true; // Flag to skip rendering
        }
    }

    // Update explosions
    explosions = explosions.filter(explosion => {
        explosion.update();
        return explosion.active;
    });

    // Update meteors
    meteors = meteors.filter(meteor => {
        meteor.update();
        return !meteor.exploded;
    });

    // Update fire emitters
    fireEmitters = fireEmitters.filter(emitter => {
        emitter.update();
        return emitter.active;
    });

    // Update fire particles
    fireParticles = fireParticles.filter(particle => {
        return particle.update();
    });

    // Cap fire particles
    if (fireParticles.length > MAX_FIRE_PARTICLES) {
        fireParticles.splice(0, fireParticles.length - MAX_FIRE_PARTICLES);
    }

    // Update building debris
    buildingDebris = buildingDebris.filter(debris => {
        return debris.update();
    });

    // Cap building debris
    if (buildingDebris.length > MAX_BUILDING_DEBRIS) {
        buildingDebris.splice(0, buildingDebris.length - MAX_BUILDING_DEBRIS);
    }

    // Update micro-debris
    microDebris = microDebris.filter(debris => {
        return debris.update();
    });

    // Cap micro-debris
    if (microDebris.length > MAX_MICRO_DEBRIS) {
        microDebris.splice(0, microDebris.length - MAX_MICRO_DEBRIS);
    }

    // Update dust particles
    dustParticles = dustParticles.filter(particle => {
        return particle.update();
    });

    // Cap dust particles
    if (dustParticles.length > MAX_DUST_PARTICLES) {
        dustParticles.splice(0, dustParticles.length - MAX_DUST_PARTICLES);
    }

    // Update voxel bits (square chunks from UFO tractor)
    let activeVoxelCount = 0;
    const VOXEL_SLEEP_DELAY = 5000; // 5 seconds after settling

    for (let i = 0; i < voxelBits.length; i++) {
        const voxelBit = voxelBits[i];

        // Check if voxel bit should sleep
        if (voxelBit.onGround && voxelBit.settledTime !== null && !voxelBit.sleeping) {
            const settledDuration = Date.now() - voxelBit.settledTime;
            if (settledDuration > VOXEL_SLEEP_DELAY) {
                voxelBit.sleeping = true;
            }
        }

        // Only update physics if not sleeping
        if (!voxelBit.sleeping) {
            voxelBit.update();
            activeVoxelCount++;
        }
    }

    // Performance: if we exceed max voxel bits, mark oldest sleeping ones as "do not draw"
    if (voxelBits.length > MAX_VOXEL_BITS) {
        const sleepingVoxels = voxelBits.filter(v => v.sleeping && v.settledTime !== null);
        sleepingVoxels.sort((a, b) => a.settledTime - b.settledTime);

        const excessCount = voxelBits.length - MAX_VOXEL_BITS;
        for (let i = 0; i < Math.min(excessCount, sleepingVoxels.length); i++) {
            sleepingVoxels[i].doNotDraw = true;
        }
    }

    // Render everything
    renderGround();

    // Render meteors (before buildings so they appear in front)
    meteors.forEach(meteor => meteor.render());

    // Render buildings (alive and collapsing ones)
    buildings.forEach(building => {
        if (building.state !== 'collapsed') {
            building.render();
        }
    });

    // Render static structures (billboards are rendered in renderGround, but bridge is here)
    // Bridge is already rendered in renderGround, but we render it again if needed for layering

    // Render bombs
    bombs.forEach(bomb => bomb.render());

    // Render lasers
    lasers.forEach(laser => laser.render());

    // Render robot hand lasers
    robotHandLasers.forEach(laser => laser.render());

    // Render tornados
    tornados.forEach(tornado => tornado.render());

    // Render sticky bombs
    stickyBombs.forEach(bomb => bomb.render());

    // Render particles (before robot/UFO so they appear behind)
    // Skip sleeping particles marked as "do not draw"
    particles.forEach(particle => {
        if (!particle.doNotDraw) {
            particle.render();
        }
    });

    // Render voxel bits (square chunks from UFO tractor)
    voxelBits.forEach(voxelBit => {
        if (!voxelBit.doNotDraw) {
            voxelBit.render();
        }
    });

    // Render building debris (small falling pieces)
    buildingDebris.forEach(debris => debris.render());

    // Render micro-debris
    microDebris.forEach(debris => debris.render());

    // Render dust particles
    dustParticles.forEach(particle => particle.render());

    // Render fire particles (on top of chunks)
    fireParticles.forEach(particle => particle.render());

    // Render explosions
    explosions.forEach(explosion => explosion.render());

    // Render robot missiles
    robotMissiles.forEach(missile => missile.render());

    // Render bridge debris
    bridgeDebris.forEach(debris => {
        if (!debris.doNotDraw) {
            debris.render();
        }
    });

    // Render robot (ALWAYS render if in robot mode, after particles)
    if (currentWeapon === 'robot') {
        // Failsafe: spawn if missing
        if (!robot) {
            spawnRobot();
        }
        if (robot) {
            robot.render();
            robot.renderFuelMeter();
            robot.renderLaserEnergyMeter();
        }
    }

    // Render UFO (ALWAYS render if in ufo mode, after particles)
    if (currentWeapon === 'ufo') {
        // Failsafe: spawn if missing
        if (!ufo) {
            spawnUFO();
        }
        if (ufo) {
            ufo.render();
        }
    }

    // Render UFO lasers
    ufoHandLasers.forEach(laser => laser.render());

    // Render screen flash
    renderScreenFlash();

    // Render crosshair (robot mode)
    renderCrosshair();

    // Render debug overlay
    renderDebugOverlay();

    // Continue loop
    requestAnimationFrame(gameLoop);
}

// ============================================
// Initialize Game
// ============================================

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCanvas();
        initWeaponUI();
        initRobotControls();
        initUFOControls();
        initCitySelection();
        initBackground();

        // Initialize Level Manager
        LevelManager.init();

        generateCity();
        gameLoop();
    });
} else {
    // DOM is already ready
    initCanvas();
    initWeaponUI();
    initRobotControls();
    initUFOControls();
    initCitySelection();
    initBackground();
    generateCity();
    gameLoop();
}
