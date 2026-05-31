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
};

export type PropSpec =
  | { type: 'campfire'; position: Vec3 }
  | { type: 'log'; position: Vec3; rotationY?: number }
  | { type: 'block'; position: Vec3; size?: number; tone?: number }
  /** Plank seat (stump/bench) for a character to sit on. */
  | { type: 'seat'; position: Vec3; width?: number; rotationY?: number }
  /** Background tree: trunk + leaf canopy. */
  | { type: 'tree'; position: Vec3; trunk?: number; rotationY?: number };

export type SceneSpec = {
  characters: CharSpec[];
  props: PropSpec[];
  camera?: { position?: Vec3; target?: Vec3; fov?: number };
  fire?: boolean;
  /** Ground plane Y. Characters/props are authored relative to this. */
  groundY?: number;
  /** Background scenery for depth + life. */
  background?: { stars?: boolean; moon?: Vec3; fog?: [number, number] };
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
      const dirtTex = pixelTex(TEX.dirt, [40, 40]);
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
      renderer.toneMappingExposure = 1.15;
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
      if (bg.fog) threeScene.fog = new THREE.Fog(0x000000, bg.fog[0], bg.fog[1]);
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
        const sunGeo = new THREE.PlaneGeometry(40, 40);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
        disposables.push(sunGeo, sunMat);
        const sun = new THREE.Mesh(sunGeo, sunMat);
        sun.position.set(...bg.moon);
        sun.lookAt(cam.position);
        threeScene.add(sun);

        // stacked faint SQUARE glow halos behind it (blocky, matches the sprite)
        for (const [size, op] of [[64, 0.1], [92, 0.05]] as const) {
          const gGeo = new THREE.PlaneGeometry(size, size);
          const gMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, fog: false });
          disposables.push(gGeo, gMat);
          const g = new THREE.Mesh(gGeo, gMat);
          g.position.set(bg.moon[0], bg.moon[1], bg.moon[2] - 1);
          g.lookAt(cam.position);
          threeScene.add(g);
        }
      }

      /* ── lights ── */
      threeScene.add(new THREE.AmbientLight(0xffffff, 0.64));
      const key = new THREE.DirectionalLight(0xffffff, 1.0);
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
      const rim = new THREE.DirectionalLight(0xffffff, 0.3);
      rim.position.set(-40, 28, -34);
      threeScene.add(rim);

      /* ── ground (dirt) ── */
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 600),
        new THREE.MeshStandardMaterial({ map: dirtTex, color: 0x6a6a6a, roughness: 1, metalness: 0 }),
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
        }
      }

      /* ── characters ── */
      // Soft round contact shadow so a seated body always reads as grounded
      // (independent of the cast shadow direction).
      const blobTex = makeBlobTexture(THREE);
      disposables.push(blobTex);

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
          const rig = cloneSkinned(gltf.scene) as THREE.Object3D;
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

          // Scale the ~2-unit-tall rig up to scene units (≈30 tall) + place.
          rig.scale.setScalar(15);
          rig.position.set(...c.position);
          rig.rotation.y = c.rotationY ?? 0;
          threeScene.add(rig);

          // Ground the POSED figure: drop it so its lowest point rests at the
          // authored y (the seat top), regardless of how the pose folds it.
          rig.updateWorldMatrix(true, true);
          const box = new THREE.Box3().setFromObject(rig);
          rig.position.y += c.position[1] - box.min.y;

          // contact shadow on the ground beneath this character
          const blob = new THREE.Mesh(
            new THREE.PlaneGeometry(26, 18),
            new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false }),
          );
          blob.rotation.x = -Math.PI / 2;
          blob.position.set(c.position[0], groundY + 0.2, c.position[2] + 4);
          threeScene.add(blob);
        } catch (err) {
          console.error('[MinecraftScene] character load failed:', err);
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
      };

      // Flipbook is time-based, NOT raf-counted. The old `tick % 2` advanced a
      // frame every ~33 ms (~30 fps) — far too fast, the fire strobed. Vanilla
      // campfire is 2 game ticks/frame = 100 ms; we use a calmer 130 ms so the
      // flame idles rather than flickers frantically.
      const FRAME_MS = 130;

      if (animate && fireTex) {
        fireTex.wrapT = THREE.RepeatWrapping;
        fireTex.repeat.set(1, 1 / FIRE_FRAMES);
        let lastFrameAt = 0;
        const loop = (now: number) => {
          if (now - lastFrameAt >= FRAME_MS) {
            lastFrameAt = now;
            frame = (frame + 1) % FIRE_FRAMES;
            fireTex!.offset.y = 1 - (frame + 1) / FIRE_FRAMES;
            // gentle light breathing, stepped with the flame (not per-frame)
            if (fireLight) fireLight.intensity = baseI * (0.9 + 0.1 * Math.sin(now * 0.002));
            render();
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } else {
        // ensure textures are decoded before the single paint
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

  const light = new THREE.PointLight(0xffffff, 2.2, 170, 1.5);
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
    color: 0x7a7a7a,
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
