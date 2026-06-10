'use client';

/**
 * MinecraftScene — a static, data-driven Minecraft diorama.
 *
 * A *staged scene*, not a single spinnable avatar. Describe a SceneSpec
 * (characters + props + camera); the engine builds it once and holds it still.
 * First scene: "two around a campfire".
 *
 * Characters reuse skinview3d's PlayerObject (correct box model / slim-wide /
 * UV), textured via skinview-utils, then added into our own three.js scene
 * (several players in one scene — which SkinViewer can't do).
 *
 * Props use REAL Minecraft textures extracted from the Java default pack
 * (public/mc-tex): the campfire flame is the vanilla `campfire_fire.png`
 * flipbook on two crossed billboards (exactly how Minecraft renders it), logs
 * are `oak_log.png`, the ground is `dirt.png`. NearestFilter keeps them crisp.
 *
 * Motion policy: characters NEVER move. The only motion is the vanilla fire
 * flipbook + a faint light flicker, both disabled under prefers-reduced-motion.
 * Output is forced B&W by a grayscale CSS filter on the canvas.
 */

import { useEffect, useRef } from 'react';
import type { BendPose } from './BendablePlayer';

/* ─────────────────────────── Scene spec types ─────────────────────────── */

type Vec3 = [number, number, number];
type PosePreset = 'stand' | 'sit' | 'bench';

// Absolute per-bone transform — the studio's native node state. A pose captured
// from a shared render reproduces 1:1 (no rest-delta guessing). Wrapped in
// `{ node }` so it's distinguishable from a BendPose at runtime.
export type NodeXform = Record<string, { rotation?: [number, number, number]; translation?: [number, number, number]; scale?: number }>;

export type CharSpec = {
  skin: string;
  cape?: string | null;
  slim?: boolean;
  pose?: PosePreset | BendPose | { node: NodeXform };
  position: Vec3;
  rotationY?: number;
  /** Subtle looping idle animation layered on top of the pose (off by default,
   *  and always disabled under prefers-reduced-motion). `roast` also spawns a
   *  stick + marshmallow held out over the fire. */
  idle?: 'roast' | 'breathe';
};

export type PropSpec =
  | { type: 'campfire'; position: Vec3 }
  | { type: 'log'; position: Vec3; rotationY?: number }
  | { type: 'block'; position: Vec3; size?: number; tone?: number }
  /** Plank seat (stump/bench) for a character to sit on. */
  | { type: 'seat'; position: Vec3; width?: number; rotationY?: number }
  /** Background tree: trunk + leaf canopy. */
  | { type: 'tree'; position: Vec3; trunk?: number; rotationY?: number }
  /** Stone cliff / quarry wall / boulder — a big stone (or cobblestone) box.
   *  position = the BASE centre (bottom sits on position.y). */
  | { type: 'cliff'; position: Vec3; width?: number; height?: number; depth?: number; cobble?: boolean; rotationY?: number; tint?: number; tex?: string }
  /** Glowing ore block — stone cube with a soft emissive (reads as a mineral
   *  vein in B&W, NOT fire). */
  | { type: 'ore'; position: Vec3; size?: number; color?: number }
  /** Beacon light beam — a bright unlit pillar that pierces the fog into the
   *  sky (a glowing core + a fainter halo + a base light). */
  | { type: 'beam'; position: Vec3; width?: number; height?: number; color?: number };

export type SceneSpec = {
  characters: CharSpec[];
  props: PropSpec[];
  camera?: { position?: Vec3; target?: Vec3; fov?: number; /** subtle looping dolly toward the target (scene units of travel) */ push?: number };
  fire?: boolean;
  /** Rolling ground mist — soft drifting billboards near the floor for cinematic depth. */
  mist?: { count?: number; y?: number; opacity?: number; z?: number };
  /** Ground plane Y. Characters/props are authored relative to this. */
  groundY?: number;
  /** Ground surface texture (defaults to grassy earth). Swap per scene —
   *  e.g. stone for the quarry. */
  ground?: { tex?: string; repeat?: number; tint?: number };
  /** Extra flat ambient light. Non-fire scenes lose the campfire's point light,
   *  so a touch of fill keeps them from reading flat-dark. */
  fill?: number;
  /** Background scenery for depth + life. `fogColor` defaults to black; a dark
   *  grey reads as a misty night that keeps the far treeline visible. */
  background?: { stars?: boolean; moon?: Vec3; fog?: [number, number]; fogColor?: number };
};

/* ─────────────────────────── Texture paths ─────────────────────────── */

const TEX = {
  fire: '/mc-tex/campfire_fire.png', // 16×128, 8-frame flipbook
  log: '/mc-tex/oak_log.png',
  logTop: '/mc-tex/oak_log_top.png',
  dirt: '/mc-tex/dirt.png',
  planks: '/mc-tex/oak_planks.png',
  leaves: '/mc-tex/oak_leaves.png',
  trunk: '/mc-tex/spruce_log.png',
  trunkTop: '/mc-tex/spruce_log_top.png',
  moon: '/mc-tex/moon_phases.png', // 128×64 = 4×2 grid of 32px phases
  sun: '/mc-tex/sun.png', // 32×32 square
};
const FIRE_FRAMES = 8;

/* ─────────────────────────── Pose presets ─────────────────────────── */

// Poses use the bendable rig: each limb has a `swing` (shoulder/hip) and a
// `bend` (elbow/knee). This is what gives a *correct* seated silhouette —
// thigh forward + shin down, upper-arm down + forearm resting.
const POSES: Record<PosePreset, BendPose> = {
  stand: {
    rightArm: { swing: [0.05, 0, -0.06] },
    leftArm: { swing: [0.05, 0, 0.06] },
  },
  // Seated on the ground: thighs forward, knees bent up a little, hands back.
  sit: {
    body: [0.05, 0, 0],
    head: [0.14, 0, 0],
    rightLeg: { swing: [-1.45, 0, 0.05], bend: 0.5 },
    leftLeg: { swing: [-1.45, 0, -0.05], bend: 0.5 },
    rightArm: { swing: [-0.25, 0, -0.12], bend: 0.2 },
    leftArm: { swing: [-0.25, 0, 0.12], bend: 0.2 },
  },
  // Sitting on a plank, leaning toward the fire. Tuned for the mcrender gltf
  // rig (limbs rest pointing DOWN; +x swings the limb forward). Thigh forward
  // ~horizontal, shin bent down; upper arm forward a touch, forearm resting;
  // torso ("Body" bone) leans in, head looks at the flames.
  bench: {
    body: [0.24, 0, 0],
    head: [0.18, 0, 0],
    rightLeg: { swing: [1.45, 0, 0.06], bend: 1.5 },
    leftLeg: { swing: [1.5, 0, -0.06], bend: 1.55 },
    rightArm: { swing: [0.55, 0, 0.05], bend: 0.85 },
    leftArm: { swing: [0.5, 0, -0.05], bend: 0.8 },
  },
};

function resolvePose(p: CharSpec['pose']): BendPose {
  if (!p) return POSES.stand;
  if (typeof p === 'string') return POSES[p];
  return p as BendPose; // node form is handled before this is called
}

/* ─────────────────────────── Component ─────────────────────────── */

export function MinecraftScene({
  scene,
  className,
}: {
  scene: SceneSpec;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { clone: cloneSkinned } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const { loadImage, loadSkinToCanvas, loadCapeToCanvas, inferModelType } =
        await import('skinview-utils');
      if (disposed || !mountRef.current) return;

      // Load mcrender's public rig once (their bone hierarchy = correct elbow/
      // knee joints, standard 64×64 skin UV). We pose it by rotating bones, so
      // no hand-rolled pivot/twist bugs.
      const gltf = await new GLTFLoader().loadAsync('/models/player.gltf');
      if (disposed) return;
      // Slim (Alex, 3px arms) rig — used for characters with `slim: true` so a slim
      // skin maps correctly instead of stretching onto wide classic arms.
      const gltfSlim = await new GLTFLoader().loadAsync('/models/pfp.gltf');
      if (disposed) return;

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const groundY = scene.groundY ?? -16;

      /* ── pixel texture loader ── */
      const texLoader = new THREE.TextureLoader();
      const disposables: { dispose: () => void }[] = [];
      const pixelTex = (url: string, repeat?: [number, number]) => {
        const t = texLoader.load(url);
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(repeat[0], repeat[1]);
        }
        disposables.push(t);
        return t;
      };

      const logTex = pixelTex(TEX.log);
      const logTopTex = pixelTex(TEX.logTop);
      const groundCfg = scene.ground ?? {};
      const groundRepeat = groundCfg.repeat ?? 40;
      const groundTex = pixelTex(groundCfg.tex ?? '/mc-tex/grass_block_top.png', [groundRepeat, groundRepeat]); // grassy earth by default; per-scene swappable (e.g. stone)
      const planksTex = pixelTex(TEX.planks);
      const leavesTex = pixelTex(TEX.leaves);
      const trunkTex = pixelTex(TEX.trunk);
      const trunkTopTex = pixelTex(TEX.trunkTop);

      /* ── renderer ── */
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      // Super-sample a touch (1.5× the device ratio, capped) for crisper edges
      // on the blocky geometry — closes part of the polish gap vs mcrender.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.5, 2.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.5;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';

      /* ── scene + camera ── */
      const threeScene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(scene.camera?.fov ?? 26, 1, 0.1, 2000);
      cam.position.set(...(scene.camera?.position ?? [0, 20, 116]));
      cam.lookAt(...(scene.camera?.target ?? [0, -1, 0]));

      /* ── background scenery (depth + life) ── */
      const bg = scene.background ?? {};
      if (bg.fog) threeScene.fog = new THREE.Fog(bg.fogColor ?? 0x000000, bg.fog[0], bg.fog[1]);
      if (bg.stars) {
        const starGeo = new THREE.BufferGeometry();
        const N = 320;
        const arr = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          // deterministic scatter across a wide back dome (no Math.random
          // dependency on SSR; layered trig gives an even spread)
          const a = i * 2.39996;
          const r = 200 + ((i * 53) % 260);
          arr[i * 3] = Math.cos(a) * r;
          arr[i * 3 + 1] = 40 + ((i * 37) % 220);
          arr[i * 3 + 2] = -160 - ((i * 17) % 220);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, fog: false });
        disposables.push(starGeo, starMat);
        threeScene.add(new THREE.Points(starGeo, starMat));
      }
      if (bg.moon) {
        // Minecraft's sun/moon is a SQUARE sprite, not a smooth disc. A solid
        // bright white square reads exactly as the vanilla full moon and can't
        // fail on texture alpha/colour like the radial sun.png did (it sampled
        // dark in grayscale). Billboarded toward the camera.
        const sunGeo = new THREE.PlaneGeometry(26, 26);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, fog: false });
        disposables.push(sunGeo, sunMat);
        const sun = new THREE.Mesh(sunGeo, sunMat);
        sun.position.set(...bg.moon);
        sun.lookAt(cam.position);
        threeScene.add(sun);

        // soft round glow halos behind it (radial falloff, additive — not hard
        // squares that read as a picture frame)
        const glowTex = makeGlowTexture(THREE);
        disposables.push(glowTex);
        for (const [size, op] of [[64, 0.5], [120, 0.28]] as const) {
          const gGeo = new THREE.PlaneGeometry(size, size);
          const gMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: op, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
          disposables.push(gGeo, gMat);
          const g = new THREE.Mesh(gGeo, gMat);
          g.position.set(bg.moon[0], bg.moon[1], bg.moon[2] - 1);
          g.lookAt(cam.position);
          threeScene.add(g);
        }
      }

      /* ── lights ── */
      threeScene.add(new THREE.AmbientLight(0xffffff, 1.65));
      if (scene.fill) threeScene.add(new THREE.AmbientLight(0xffffff, scene.fill));
      const key = new THREE.DirectionalLight(0xffffff, 2.3);
      key.position.set(18, 70, 32);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 240;
      const sc = key.shadow.camera as THREE.OrthographicCamera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
      key.shadow.bias = -0.0005;
      key.shadow.radius = 4; // soft shadow edge (PCFSoft)
      threeScene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.9);
      rim.position.set(-40, 28, -34);
      threeScene.add(rim);

      /* ── ground (dirt) ── */
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 600),
        new THREE.MeshStandardMaterial({ map: groundTex, color: groundCfg.tint ?? 0x7a7a7a, roughness: 1, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = groundY;
      ground.receiveShadow = true;
      threeScene.add(ground);

      /* ── props ── */
      let fireLight: THREE.PointLight | null = null;
      let fireTex: THREE.Texture | null = null;

      for (const prop of scene.props) {
        if (prop.type === 'campfire') {
          const { group, light, fireTexture } = buildCampfire(THREE, disposables, {
            logTex, logTopTex, pixelTex,
          });
          group.position.set(...prop.position);
          threeScene.add(group);
          fireLight = light;
          fireTex = fireTexture;
        } else if (prop.type === 'log') {
          const log = buildLog(THREE, disposables, logTex, logTopTex);
          log.position.set(...prop.position);
          log.rotation.y = prop.rotationY ?? 0;
          threeScene.add(log);
        } else if (prop.type === 'block') {
          const b = buildLog(THREE, disposables, logTex, logTopTex);
          b.scale.setScalar((prop.size ?? 16) / 20);
          b.position.set(...prop.position);
          threeScene.add(b);
        } else if (prop.type === 'seat') {
          const s = buildSeat(THREE, disposables, planksTex, prop.width ?? 26);
          s.position.set(...prop.position);
          s.rotation.y = prop.rotationY ?? 0;
          threeScene.add(s);
        } else if (prop.type === 'tree') {
          const tr = buildTree(THREE, disposables, { trunkTex, trunkTopTex, leavesTex }, prop.trunk ?? 34);
          tr.position.set(...prop.position);
          tr.rotation.y = prop.rotationY ?? 0;
          threeScene.add(tr);
        } else if (prop.type === 'cliff') {
          const cl = buildCliff(THREE, disposables, pixelTex, {
            w: prop.width ?? 60, h: prop.height ?? 40, d: prop.depth ?? 16, cobble: prop.cobble, tint: prop.tint, tex: prop.tex,
          });
          cl.position.set(...prop.position);
          cl.rotation.y = prop.rotationY ?? 0;
          threeScene.add(cl);
        } else if (prop.type === 'ore') {
          const or = buildOre(THREE, disposables, pixelTex, prop.size ?? 9, prop.color);
          or.position.set(...prop.position);
          threeScene.add(or);
        } else if (prop.type === 'beam') {
          const bm = buildBeam(THREE, disposables, { w: prop.width ?? 6, h: prop.height ?? 440, color: prop.color });
          bm.position.set(...prop.position);
          threeScene.add(bm);
        }
      }

      /* ── characters ── */
      // Soft round contact shadow so a seated body always reads as grounded
      // (independent of the cast shadow direction).
      const blobTex = makeBlobTexture(THREE);
      disposables.push(blobTex);

      // Per-character idle animators, ticked every frame in the render loop.
      const animators: ((now: number) => void)[] = [];

      for (const c of scene.characters) {
        try {
          const skinImg = await loadImage(c.skin);
          if (disposed) return;
          const skinCanvas = document.createElement('canvas');
          loadSkinToCanvas(skinCanvas, skinImg);
          const skinTex = new THREE.Texture(skinCanvas);
          skinTex.magFilter = THREE.NearestFilter;
          skinTex.minFilter = THREE.NearestFilter;
          skinTex.colorSpace = THREE.SRGBColorSpace;
          skinTex.flipY = false; // glTF textures are not flipped
          skinTex.needsUpdate = true;
          disposables.push(skinTex);

          // Clone the rig (SkeletonUtils handles skinned meshes) and give this
          // character its own skin by cloning materials + swapping the map.
          const rig = cloneSkinned((c.slim ? gltfSlim : gltf).scene) as THREE.Object3D;
          rig.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            m.material = mats.map((mat) => {
              const nm = (mat as THREE.MeshStandardMaterial).clone();
              nm.map = skinTex;
              (nm as THREE.MeshStandardMaterial).roughness = 1;
              (nm as THREE.MeshStandardMaterial).metalness = 0;
              nm.needsUpdate = true;
              disposables.push(nm);
              return nm;
            });
            if (Array.isArray(m.material) && m.material.length === 1) m.material = m.material[0];
          });

          // Bone map by name. three.js sanitizes glTF node names (strips the
          // ":" in "Arm:Right:Upper" → "ArmRightUpper").
          const bone: Record<string, THREE.Object3D> = {};
          rig.traverse((o) => { if (o.name) bone[o.name] = o; });

          // The rig's bind pose is NOT identity — bones carry rest rotations
          // (Body≈π/2, arms≈π, legs≈-π/2). Overwriting rotation wiped that and
          // collapsed the model. Instead we compose a DELTA quaternion on top
          // of each bone's rest, so a pose value is a swing/bend FROM standing.
          const restQ: Record<string, THREE.Quaternion> = {};
          for (const n of Object.keys(bone)) restQ[n] = bone[n].quaternion.clone();
          const applyDelta = (name: string, euler?: [number, number, number]) => {
            const b = bone[name];
            if (!b || !euler || !restQ[name]) return;
            const dq = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(euler[0], euler[1], euler[2], 'XYZ'),
            );
            b.quaternion.copy(restQ[name]).multiply(dq);
          };

          if (c.pose && typeof c.pose === 'object' && 'node' in c.pose) {
            // Exact node transform: stamp absolute rotation/translation/scale.
            const nt = (c.pose as { node: NodeXform }).node;
            for (const name in nt) {
              const b = bone[name];
              if (!b) continue;
              const t = nt[name];
              if (t.rotation) b.quaternion.setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'XYZ'));
              if (t.translation) b.position.set(t.translation[0], t.translation[1], t.translation[2]);
              if (t.scale !== undefined) b.scale.setScalar(t.scale);
            }
          } else {
            const pose = resolvePose(c.pose);
            applyDelta('Head', pose.head);
            applyDelta('Body', pose.body);
            const limb = (
              up: string, lo: string,
              p?: { swing?: [number, number, number]; bend?: number },
            ) => {
              if (!p) return;
              applyDelta(up, p.swing);
              if (p.bend !== undefined) applyDelta(lo, [p.bend, 0, 0]);
            };
            limb('ArmRightUpper', 'ArmRightLower', pose.rightArm);
            limb('ArmLeftUpper', 'ArmLeftLower', pose.leftArm);
            limb('LegRightUpper', 'LegRightLower', pose.rightLeg);
            limb('LegLeftUpper', 'LegLeftLower', pose.leftLeg);
          }

          // ── idle animation ── layer a time-based delta on top of the POSED
          // bones (base = the current posed quaternion, so the seated pose is
          // preserved). Skipped under prefers-reduced-motion.
          if (c.idle && !reduced) {
            const phase = c.position[0] * 17; // deterministic de-sync between figures
            const _q = new THREE.Quaternion();
            const _e = new THREE.Euler();
            const grab = (n: string) => {
              const b = bone[n];
              return b ? { b, base: b.quaternion.clone() } : null;
            };
            const swing = (h: { b: THREE.Object3D; base: THREE.Quaternion } | null, x: number, y: number, z: number) => {
              if (!h) return;
              _e.set(x, y, z, 'XYZ');
              _q.setFromEuler(_e);
              h.b.quaternion.copy(h.base).multiply(_q);
            };
            if (c.idle === 'roast') {
              // BOTH hands hold the stick out front. Animator so it can be live-tuned
              // (window.__sc) then baked; mirrored Z so the forearms meet centre-front.
              // STATIC pose (set once; the forearms then drive the stick grip below).
              swing(grab('ArmRightUpper'), -0.55, 0, -0.42); // right upper: forward-down + inward
              swing(grab('ArmRightLower'), 0.5, 0, 0); // right forearm: forward toward centre
              swing(grab('ArmLeftUpper'), -0.55, 0, 0.42); // left upper: mirror
              swing(grab('ArmLeftLower'), 0.5, 0, 0);
            } else if (c.idle === 'breathe') {
              const bd = grab('Body'), hd = grab('Head');
              animators.push((now) => {
                const s = Math.sin((now + phase) * 0.0014);
                swing(bd, 0.022 * s, 0, 0); // gentle torso bob
                swing(hd, 0.04 * s, 0.05 * Math.sin((now + phase) * 0.0009), 0); // slow look-around
              });
            }
          }

          // Scale the ~2-unit-tall rig up to scene units (≈30 tall) + place.
          rig.scale.setScalar(15);
          rig.position.set(...c.position);
          rig.rotation.y = c.rotationY ?? 0;
          threeScene.add(rig);

          // Ground the POSED figure. For a SEATED pose the dangling feet are the
          // lowest point but the BUTT (hip) is what rests on the seat — grounding by
          // box.min.y floats the butt up by the shin length (the "floating" bug). So
          // ground by the HIP bone (top of the thighs) when present; fall back to the
          // bbox bottom for standing figures. c.position[1] = the hip's rest height.
          rig.updateWorldMatrix(true, true);
          let hipY: number | null = null;
          let hipX = 0, hipZ = 0, hipN = 0;
          const _hipV = new THREE.Vector3();
          rig.traverse((o) => {
            if (o.name === 'LegLeftUpper' || o.name === 'LegRightUpper') {
              o.getWorldPosition(_hipV);
              hipY = hipY === null ? _hipV.y : Math.max(hipY, _hipV.y);
              hipX += _hipV.x; hipZ += _hipV.z; hipN++;
            }
          });
          const groundRef = hipY ?? new THREE.Box3().setFromObject(rig).min.y;
          rig.position.y += c.position[1] - groundRef;
          // Re-centre X/Z on the seat too: the slim pfp.gltf renders offset from its
          // rig origin (it shoved the figure way off to the side), so anchor the hips
          // to the authored x/z. ~no-op for the centred classic rig.
          if (hipN) {
            rig.position.x += c.position[0] - hipX / hipN;
            rig.position.z += c.position[2] - hipZ / hipN;
          }

          // contact shadow on the ground beneath this character
          const blob = new THREE.Mesh(
            new THREE.PlaneGeometry(26, 18),
            new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false }),
          );
          blob.rotation.x = -Math.PI / 2;
          blob.position.set(c.position[0], groundY + 0.2, c.position[2] + 4);
          threeScene.add(blob);

          // ── roasting stick + marshmallow ── a stick from the hand out over the
          // fire with a marshmallow at the tip that the figure slowly turns. Built
          // in WORLD space (hand → flame) so it points at the flame regardless of
          // the exact arm pose.
          if (c.idle === 'roast') {
            const body = bone['Chest'] || bone['Body'];
            if (body) {
              const stickMat = new THREE.MeshStandardMaterial({ color: 0x4a3b29, roughness: 1, metalness: 0 });
              disposables.push(stickMat);
              const stick = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1), stickMat); // unit Z, scaled per frame
              stick.castShadow = true; stick.frustumCulled = false;
              const mMat = new THREE.MeshStandardMaterial({ color: 0xf3ede0, roughness: 0.85, metalness: 0, emissive: 0x2a1e10, emissiveIntensity: 0.4 });
              disposables.push(mMat);
              const marsh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), mMat);
              marsh.castShadow = true; marsh.frustumCulled = false;
              // group: anchored at the GRIP (front-centre, where the two hands meet)
              // and aimed at the flame. The stick fills grip → flame; marshmallow near
              // the flame end. Bobs gently (no spin).
              const roast = new THREE.Group();
              roast.add(stick, marsh);
              threeScene.add(roast);
              const armR = bone['ArmRightLower'], armL = bone['ArmLeftLower'];
              const _hR = new THREE.Vector3(), _hL = new THREE.Vector3(), _grip = new THREE.Vector3(), _flame = new THREE.Vector3();
              animators.push((now) => {
                // GRIP = midpoint of the two forearms (the hands), nudged a touch toward
                // the flame to the hand tips. So the stick base is literally between the
                // two hands — no shoulder gap.
                armR?.getWorldPosition(_hR);
                armL?.getWorldPosition(_hL);
                _grip.addVectors(_hR, _hL).multiplyScalar(0.5);
                _flame.set(0, groundY + 13, 0);
                _grip.lerp(_flame, 0.08);
                roast.position.copy(_grip);
                roast.position.y += Math.sin(now * 0.0011) * 1.0; // чуть-чуть вверх/вниз
                roast.lookAt(_flame); // group −Z faces the flame
                const dist = _grip.distanceTo(_flame);
                stick.scale.z = dist;
                stick.position.set(0, 0, -dist / 2); // span grip(0) → flame(−dist)
                marsh.position.set(0, 0, -dist * 0.86); // near the flame end
              });
            }
          }
        } catch (err) {
          console.error('[MinecraftScene] character load failed:', err);
        }
      }

      /* ── camera dolly — a slow, looping push toward the target (cinematic life) ── */
      if (scene.camera?.push && !reduced) {
        const basePos = cam.position.clone();
        const tgt = new THREE.Vector3(...(scene.camera?.target ?? [0, -1, 0]));
        const dir = tgt.clone().sub(basePos).normalize();
        const amp = scene.camera.push;
        animators.push((now) => {
          const k = (1 - Math.cos(now * 0.00018)) * 0.5; // slow ease 0..1..0
          cam.position.copy(basePos).addScaledVector(dir, k * amp);
          cam.lookAt(tgt);
        });
      }

      /* ── rolling ground mist — soft additive billboards drifting near the floor ── */
      if (scene.mist) {
        const mcfg = scene.mist;
        const cnt = mcfg.count ?? 6;
        const mtex = makeGlowTexture(THREE); // white radial — additive needs a bright source, not the black blob
        disposables.push(mtex);
        const my = mcfg.y ?? groundY + 6;
        const baseOp = mcfg.opacity ?? 0.22;
        const mz = mcfg.z ?? -24;
        const puffs: { m: THREE.Mesh; bx: number; ph: number; sp: number }[] = [];
        for (let i = 0; i < cnt; i++) {
          const w = 70 + ((i * 37) % 90);
          const h = 22 + ((i * 17) % 18);
          const geo = new THREE.PlaneGeometry(w, h);
          const mat = new THREE.MeshBasicMaterial({
            map: mtex, transparent: true, depthWrite: false, fog: false,
            blending: THREE.AdditiveBlending,
            opacity: baseOp * (0.55 + 0.45 * (((i * 13) % 10) / 10)),
          });
          disposables.push(geo, mat);
          const m = new THREE.Mesh(geo, mat);
          const bx = -130 + ((i * 70) % 260);
          m.position.set(bx, my + (i % 3) * 5, mz - ((i * 23) % 70));
          m.renderOrder = 5;
          threeScene.add(m);
          puffs.push({ m, bx, ph: i * 1.7, sp: 0.00003 + 0.000012 * (i % 4) });
        }
        if (!reduced) {
          animators.push((now) => {
            for (const p of puffs) {
              p.m.position.x = p.bx + Math.sin(now * p.sp + p.ph) * 20;
              p.m.lookAt(cam.position);
            }
          });
        } else {
          for (const p of puffs) p.m.lookAt(cam.position);
        }
      }

      /* ── sizing ── */
      const resize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || 1;
        const h = mountRef.current.clientHeight || 1;
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      /* ── render ── */
      const animate = scene.fire !== false && !reduced && !!fireTex;
      let raf = 0;
      let frame = 0;
      const baseI = fireLight ? fireLight.intensity : 0;
      const render = () => renderer.render(threeScene, cam);

      // DEBUG: expose scene + render so bone angles can be tuned live from the
      // console / playwright without an edit-reload cycle. Removed before ship.
      (window as unknown as Record<string, unknown>).__mc = {
        scene: threeScene,
        render,
        THREE,
        cam,
      };

      // Flipbook is time-based, NOT raf-counted. The old `tick % 2` advanced a
      // frame every ~33 ms (~30 fps) — far too fast, the fire strobed. Vanilla
      // campfire is 2 game ticks/frame = 100 ms; we use a calmer 130 ms so the
      // flame idles rather than flickers frantically.
      const FRAME_MS = 130;

      const hasFire = animate && !!fireTex;
      if (hasFire || animators.length) {
        if (fireTex) {
          fireTex.wrapT = THREE.RepeatWrapping;
          fireTex.repeat.set(1, 1 / FIRE_FRAMES);
        }
        let lastFrameAt = 0;
        const loop = (now: number) => {
          let dirty = false;
          // fire flipbook advances on its own slow clock (not every frame)
          if (hasFire && now - lastFrameAt >= FRAME_MS) {
            lastFrameAt = now;
            frame = (frame + 1) % FIRE_FRAMES;
            fireTex!.offset.y = 1 - (frame + 1) / FIRE_FRAMES;
            if (fireLight) fireLight.intensity = baseI * (0.9 + 0.1 * Math.sin(now * 0.002));
            dirty = true;
          }
          // character idles tick EVERY frame for smooth motion
          if (animators.length) {
            for (const a of animators) a(now);
            dirty = true;
          }
          if (dirty) render();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } else {
        // static: ensure textures are decoded before the single paint
        setTimeout(render, 60);
        render();
      }

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        disposables.forEach((d) => d.dispose());
        threeScene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        });
        renderer.dispose();
        renderer.domElement.parentNode?.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />;
}

/* ─────────────────────────── Prop builders ─────────────────────────── */

type T = typeof import('three');
type PixelTex = (url: string, repeat?: [number, number]) => import('three').Texture;

/** A single oak log box (bark on the sides, rings on the ends). */
function buildLog(
  THREE: T,
  disp: { dispose: () => void }[],
  side: import('three').Texture,
  top: import('three').Texture,
) {
  const geo = new THREE.BoxGeometry(20, 5, 5);
  const matSide = new THREE.MeshStandardMaterial({ map: side, color: 0x8a8a8a, roughness: 1 });
  const matTop = new THREE.MeshStandardMaterial({ map: top, color: 0x8a8a8a, roughness: 1 });
  disp.push(geo, matSide, matTop);
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z. The log runs along X, so the
  // ±x faces show the end rings, the rest show bark.
  const m = new THREE.Mesh(geo, [matTop, matTop, matSide, matSide, matSide, matSide]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Campfire: four oak logs in a low cross, an embers block, and the vanilla
 * fire as two crossed billboards textured with campfire_fire.png. Returns the
 * group + the point light + the (shared) fire texture so the loop can animate
 * the flipbook.
 */
function buildCampfire(
  THREE: T,
  disp: { dispose: () => void }[],
  tex: { logTex: import('three').Texture; logTopTex: import('three').Texture; pixelTex: PixelTex },
) {
  const group = new THREE.Group();

  // logs (cross of four)
  const logGeo = new THREE.BoxGeometry(18, 4, 4);
  const logSide = new THREE.MeshStandardMaterial({ map: tex.logTex, color: 0x8a8a8a, roughness: 1 });
  const logTop = new THREE.MeshStandardMaterial({ map: tex.logTopTex, color: 0x8a8a8a, roughness: 1 });
  disp.push(logGeo, logSide, logTop);
  const logMats = [logTop, logTop, logSide, logSide, logSide, logSide];
  const layout = [
    { y: -14, ry: 0 },
    { y: -14, ry: Math.PI / 2 },
    { y: -11.5, ry: Math.PI / 4 },
    { y: -11.5, ry: -Math.PI / 4 },
  ];
  for (const l of layout) {
    const log = new THREE.Mesh(logGeo, logMats);
    log.position.y = l.y;
    log.rotation.y = l.ry;
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  }

  // fire — two crossed billboards with the vanilla campfire_fire flipbook.
  const fireTexture = tex.pixelTex(TEX.fire);
  fireTexture.wrapT = THREE.RepeatWrapping;
  fireTexture.repeat.set(1, 1 / FIRE_FRAMES);
  fireTexture.offset.y = 1 - 1 / FIRE_FRAMES;
  const fireGeo = new THREE.PlaneGeometry(16, 16);
  disp.push(fireGeo);
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: fireTexture,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: 0xffffff,
    });
    disp.push(mat);
    const plane = new THREE.Mesh(fireGeo, mat);
    plane.position.y = -6;
    plane.rotation.y = i === 0 ? Math.PI / 4 : -Math.PI / 4;
    group.add(plane);
  }

  const light = new THREE.PointLight(0xffffff, 4.6, 210, 1.5);
  light.position.set(0, -2, 0);
  group.add(light);

  return { group, light, fireTexture };
}

/** Plank seat — a low wide bench/stump a character sits on. */
function buildSeat(
  THREE: T,
  disp: { dispose: () => void }[],
  planks: import('three').Texture,
  width: number,
) {
  const geo = new THREE.BoxGeometry(width, 7, 14);
  const mat = new THREE.MeshStandardMaterial({ map: planks, color: 0x8a8a8a, roughness: 1 });
  disp.push(geo, mat);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Background tree: a spruce-log trunk topped with a blocky leaf canopy. Kept
 * stylised (a few stacked leaf boxes) so it reads from a distance and fogs out
 * nicely for depth.
 */
function buildTree(
  THREE: T,
  disp: { dispose: () => void }[],
  tex: {
    trunkTex: import('three').Texture;
    trunkTopTex: import('three').Texture;
    leavesTex: import('three').Texture;
  },
  trunkH: number,
) {
  const grp = new THREE.Group();

  const trunkGeo = new THREE.BoxGeometry(6, trunkH, 6);
  const trunkSide = new THREE.MeshStandardMaterial({ map: tex.trunkTex, color: 0x6f6f6f, roughness: 1 });
  const trunkTop = new THREE.MeshStandardMaterial({ map: tex.trunkTopTex, color: 0x6f6f6f, roughness: 1 });
  disp.push(trunkGeo, trunkSide, trunkTop);
  const trunk = new THREE.Mesh(trunkGeo, [trunkSide, trunkSide, trunkTop, trunkTop, trunkSide, trunkSide]);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  grp.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    map: tex.leavesTex,
    color: 0x5d9c3a,
    roughness: 1,
    transparent: true,
    alphaTest: 0.5,
  });
  disp.push(leafMat);
  // Pyramid-ish canopy: three shrinking leaf cubes stacked above the trunk.
  const tiers = [
    { y: trunkH - 4, s: 26 },
    { y: trunkH + 9, s: 19 },
    { y: trunkH + 20, s: 12 },
  ];
  for (const t of tiers) {
    const g = new THREE.BoxGeometry(t.s, t.s * 0.8, t.s);
    disp.push(g);
    const leaf = new THREE.Mesh(g, leafMat);
    leaf.position.y = t.y;
    leaf.castShadow = true;
    grp.add(leaf);
  }
  return grp;
}

/**
 * Stone cliff / quarry wall / boulder — a big stone (or cobblestone) box with
 * the texture tiled one-per-16-units (so it reads as stacked blocks). Returned
 * in a group with the box raised so its BASE sits at the group origin → the
 * prop's `position` is the base centre (sits flush on the ground).
 */
function buildCliff(
  THREE: T,
  disp: { dispose: () => void }[],
  pixelTex: PixelTex,
  o: { w: number; h: number; d: number; cobble?: boolean; tint?: number; tex?: string },
) {
  const path = o.tex ?? (o.cobble ? '/mc-tex/cobblestone.png' : '/mc-tex/stone.png');
  const rep = (a: number, b: number): [number, number] => [Math.max(1, Math.round(a / 16)), Math.max(1, Math.round(b / 16))];
  const sideTex = pixelTex(path, rep(o.w, o.h));
  const endTex = pixelTex(path, rep(o.d, o.h));
  const topTex = pixelTex(path, rep(o.w, o.d));
  const tint = o.tint ?? 0x8a8a8a;
  const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
  const matSide = new THREE.MeshStandardMaterial({ map: sideTex, color: tint, roughness: 1 });
  const matEnd = new THREE.MeshStandardMaterial({ map: endTex, color: tint, roughness: 1 });
  const matTop = new THREE.MeshStandardMaterial({ map: topTex, color: tint, roughness: 1 });
  disp.push(geo, matSide, matEnd, matTop);
  // face order: +x,-x,+y,-y,+z,-z  → ends on ±x, top/bottom on ±y, faces on ±z
  const m = new THREE.Mesh(geo, [matEnd, matEnd, matTop, matTop, matSide, matSide]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.y = o.h / 2; // base at the group origin
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/**
 * Glowing ore block — a stone cube with a soft white emissive. In the forced
 * B&W it reads as a bright mineral vein in the rock (NOT a flame): static, no
 * point light, no flicker.
 */
function buildOre(
  THREE: T,
  disp: { dispose: () => void }[],
  pixelTex: PixelTex,
  size: number,
  color?: number,
) {
  const tex = pixelTex('/mc-tex/stone.png');
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, color: 0xcccccc, roughness: 1, metalness: 0,
    emissive: color ?? 0xffffff, emissiveIntensity: 1.6, // bright enough to read as a glowing vein after grayscale
  });
  disp.push(geo, mat);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/**
 * Beacon light beam — a vertical pillar of light that pierces the night.
 * Built from unlit (MeshBasic) boxes so it always reads full-bright regardless
 * of scene lighting, with `fog:false` so it punches through the fog into the
 * sky, and `depthWrite:false` so the halo blends over the dark backdrop. A
 * bright opaque core + a wide faint halo + a soft base light that pools on the
 * ground around the beacon.
 */
function buildBeam(
  THREE: T,
  disp: { dispose: () => void }[],
  o: { w: number; h: number; color?: number },
) {
  const grp = new THREE.Group();

  const coreGeo = new THREE.BoxGeometry(o.w, o.h, o.w);
  const beamColor = o.color ?? 0xffffff;
  const coreMat = new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.92, fog: false, depthWrite: false });
  const glowGeo = new THREE.BoxGeometry(o.w * 2.4, o.h, o.w * 2.4);
  const glowMat = new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.14, fog: false, depthWrite: false });
  disp.push(coreGeo, coreMat, glowGeo, glowMat);

  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = o.h / 2;
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = o.h / 2;
  grp.add(glow, core);

  // soft pool of light at the base (lights the gathered figures)
  const light = new THREE.PointLight(beamColor, 3.2, 170, 1.6);
  light.position.y = 8;
  grp.add(light);

  return grp;
}

/** Soft white radial glow texture (moon/light halos, soft mist). */
function makeGlowTexture(THREE: T) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Radial soft-shadow blob texture for character ground contact. */
function makeBlobTexture(THREE: T) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}
