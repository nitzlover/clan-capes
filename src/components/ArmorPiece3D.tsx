'use client';

/**
 * Per-slot 3D armour preview.
 *
 * Renders the relevant body part as a slowly-rotating Minecraft cube
 * cluster textured with the actual vanilla armour layer + the picked
 * trim. This is the closest we can get to "see what your trim looks
 * like on the gear" without spinning up a full third-person player
 * viewport.
 *
 * Composite pipeline:
 *   1. Diamond armour base (humanoid/diamond.png or humanoid_leggings/
 *      diamond.png) painted onto a 64x32 backing canvas.
 *   2. Trim grayscale pattern (humanoid/<pat>.png) recoloured via the
 *      vanilla {trim_palette.png → color_palettes/<mat>.png} map and
 *      overlaid on top — overwriting the armour base where the trim
 *      is opaque (same blend Mojang uses).
 *   3. Canvas wrapped in a THREE.CanvasTexture with magFilter=Nearest
 *      so the chunky pixel-art preserves through the upscale.
 *
 * Cubes are sized to the canonical Minecraft player model proportions
 * (8x8x8 head, 8x12x4 body, 4x12x4 arms/legs). Each cube's UV is set
 * by face from the standard 64x32 skin layout so the same texture
 * paints the right region on every face — no per-cube texture juggle.
 *
 * Body cubes (a dark-grey "inside" figure) sit underneath the armour
 * cubes scaled up by ARMOR_SCALE so the armour looks worn rather than
 * floating in space.
 *
 * One renderer per component instance. Webgl context count = number
 * of visible ArmorPiece3D widgets — capped by typical browser limits
 * (~8-16). We accept that ceiling rather than building a shared
 * renderer + viewport multiplexer, since a leader / admin only
 * inspects a couple of clan rows at a time.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Slot = 'head' | 'chest' | 'legs' | 'feet';

type Props = {
  slot: Slot;
  material: string;
  pattern: string;
};

const ARMOR_SCALE = 1.06;

// 64x32 skin UV layout. Each entry is [x, y, w, h] in TEXTURE pixels
// (top-left origin). Face order matches the BoxGeometry default:
// [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]. MC's
// "right" body side maps to BoxGeometry's -X (because the figure
// faces +Z toward the camera), so the MC-right column lives at face
// index 1 (-X) and MC-left at 0 (+X).
type UvSet = [
  /* +X / mc-left */ [number, number, number, number],
  /* -X / mc-right */ [number, number, number, number],
  /* +Y / top */ [number, number, number, number],
  /* -Y / bottom */ [number, number, number, number],
  /* +Z / front */ [number, number, number, number],
  /* -Z / back */ [number, number, number, number],
];

const UV_HEAD: UvSet = [
  [16, 8, 8, 8], // left
  [0, 8, 8, 8],  // right
  [8, 0, 8, 8],  // top
  [16, 0, 8, 8], // bottom
  [8, 8, 8, 8],  // front
  [24, 8, 8, 8], // back
];

const UV_BODY: UvSet = [
  [28, 20, 4, 12], // left
  [16, 20, 4, 12], // right
  [20, 16, 8, 4],  // top
  [28, 16, 8, 4],  // bottom
  [20, 20, 8, 12], // front
  [32, 20, 8, 12], // back
];

const UV_RARM: UvSet = [
  [48, 20, 4, 12], // left
  [40, 20, 4, 12], // right
  [44, 16, 4, 4],  // top
  [48, 16, 4, 4],  // bottom
  [44, 20, 4, 12], // front
  [52, 20, 4, 12], // back
];

const UV_RLEG: UvSet = [
  [8, 20, 4, 12],  // left
  [0, 20, 4, 12],  // right
  [4, 16, 4, 4],   // top
  [8, 16, 4, 4],   // bottom
  [4, 20, 4, 12],  // front
  [12, 20, 4, 12], // back
];

/**
 * Boots cover only the lower half of the leg cube. We render a short
 * (height 6) cube positioned at the foot and remap the UV to sample
 * just the bottom 6 rows of the leg region (y = 26..32). Same trick
 * the vanilla renderer uses — boots are layer 1, but only the lower
 * half of the leg UV is visible because the upper half is covered by
 * leggings layer 2 (which we're not rendering here for the boots
 * slot).
 */
const UV_RFOOT: UvSet = [
  [8, 26, 4, 6],  // left (lower half of left face of leg)
  [0, 26, 4, 6],  // right
  [4, 16, 4, 4],  // top (foot top is just whatever)
  [8, 16, 4, 4],  // bottom
  [4, 26, 4, 6],  // front
  [12, 26, 4, 6], // back
];

const TEX_W = 64;
const TEX_H = 32;

/**
 * Apply MC-style UVs to a BoxGeometry. Three.js BoxGeometry exposes
 * one uv attribute with 24 (x, y) pairs in face order — 4 verts per
 * face × 6 faces. Per-face vertex order is
 *   topLeft, topRight, bottomLeft, bottomRight.
 * MC textures use top-left origin pixels, which we flip into the GL
 * convention (y=0 at bottom) here.
 */
function applyUvs(geom: THREE.BoxGeometry, uvs: UvSet) {
  const arr = geom.attributes.uv.array as Float32Array;
  for (let face = 0; face < 6; face++) {
    const [x, y, w, h] = uvs[face];
    const u0 = x / TEX_W;
    const u1 = (x + w) / TEX_W;
    const v0 = 1 - y / TEX_H;
    const v1 = 1 - (y + h) / TEX_H;
    const o = face * 8;
    // top-left
    arr[o + 0] = u0;
    arr[o + 1] = v0;
    // top-right
    arr[o + 2] = u1;
    arr[o + 3] = v0;
    // bottom-left
    arr[o + 4] = u0;
    arr[o + 5] = v1;
    // bottom-right
    arr[o + 6] = u1;
    arr[o + 7] = v1;
  }
  geom.attributes.uv.needsUpdate = true;
}

// ===== Texture loading + composite =====

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

function imageData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

let referencePromise: Promise<Uint8ClampedArray> | null = null;
function loadReference(): Promise<Uint8ClampedArray> {
  if (referencePromise) return referencePromise;
  referencePromise = loadImage('/mc/trims/color_palettes/trim_palette.png').then(
    (img) => {
      const d = imageData(img);
      const out = new Uint8ClampedArray(8);
      for (let i = 0; i < 8; i++) out[i] = d.data[i * 4];
      return out;
    },
  );
  return referencePromise;
}

const palettePromises = new Map<string, Promise<Uint8ClampedArray>>();
function loadPalette(material: string): Promise<Uint8ClampedArray> {
  const cached = palettePromises.get(material);
  if (cached) return cached;
  const p = loadImage(`/mc/trims/color_palettes/${material}.png`).then((img) => {
    const d = imageData(img);
    const out = new Uint8ClampedArray(8 * 3);
    for (let i = 0; i < 8; i++) {
      out[i * 3 + 0] = d.data[i * 4 + 0];
      out[i * 3 + 1] = d.data[i * 4 + 1];
      out[i * 3 + 2] = d.data[i * 4 + 2];
    }
    return out;
  });
  palettePromises.set(material, p);
  return p;
}

function nearestIndex(value: number, reference: Uint8ClampedArray): number {
  let best = 0;
  let bestDelta = Math.abs(value - reference[0]);
  for (let i = 1; i < 8; i++) {
    const d = Math.abs(value - reference[i]);
    if (d < bestDelta) {
      best = i;
      bestDelta = d;
    }
  }
  return best;
}

/**
 * Paint the diamond armour layer onto a 64x32 canvas, then composite
 * the trim grayscale pattern recoloured by the material palette over
 * the top — overwriting armour pixels where the trim is opaque.
 */
async function buildArmorTexture(
  layer: 'humanoid' | 'humanoid_leggings',
  material: string,
  pattern: string,
): Promise<HTMLCanvasElement> {
  const [base, trim, palette, reference] = await Promise.all([
    loadImage(`/mc/equipment/${layer}/diamond.png`),
    loadImage(`/mc/trims/entity/${layer}/${pattern}.png`),
    loadPalette(material),
    loadReference(),
  ]);
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0);

  const trimData = imageData(trim);
  const out = ctx.createImageData(TEX_W, TEX_H);
  const src = trimData.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3];
    if (alpha === 0) {
      dst[i + 3] = 0;
      continue;
    }
    const idx = nearestIndex(src[i], reference);
    dst[i + 0] = palette[idx * 3 + 0];
    dst[i + 1] = palette[idx * 3 + 1];
    dst[i + 2] = palette[idx * 3 + 2];
    dst[i + 3] = alpha;
  }
  // Drawing trim ImageData would overwrite armour pixels with the
  // transparent ones too (putImageData ignores blending). Paint via
  // a temp canvas with normal alpha compositing instead.
  const tmp = document.createElement('canvas');
  tmp.width = TEX_W;
  tmp.height = TEX_H;
  tmp.getContext('2d')!.putImageData(out, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  return c;
}

// ===== Cube builder =====

type CubeSpec = {
  size: [number, number, number]; // width, height, depth
  position: [number, number, number]; // center
  uv: UvSet;
};

function buildCube(spec: CubeSpec, mat: THREE.Material): THREE.Mesh {
  const geom = new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
  applyUvs(geom, spec.uv);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(...spec.position);
  return mesh;
}

/**
 * Return the cube layout for a given armour slot. Heights are MC
 * pixel units (1 unit = 1 px of texture); positions place each cube
 * so the bottom of the assembly sits at y = -baseHeight / 2.
 */
function slotCubes(slot: Slot): { cubes: CubeSpec[]; assemblyHeight: number } {
  switch (slot) {
    case 'head':
      return {
        cubes: [
          { size: [8, 8, 8], position: [0, 0, 0], uv: UV_HEAD },
        ],
        assemblyHeight: 8,
      };
    case 'chest':
      return {
        cubes: [
          // body
          { size: [8, 12, 4], position: [0, 0, 0], uv: UV_BODY },
          // right arm (-X), left arm (+X) — both use the same right-arm UV.
          { size: [4, 12, 4], position: [-6, 0, 0], uv: UV_RARM },
          { size: [4, 12, 4], position: [6, 0, 0], uv: UV_RARM },
        ],
        assemblyHeight: 12,
      };
    case 'legs':
      return {
        cubes: [
          { size: [4, 12, 4], position: [-2, 0, 0], uv: UV_RLEG },
          { size: [4, 12, 4], position: [2, 0, 0], uv: UV_RLEG },
        ],
        assemblyHeight: 12,
      };
    case 'feet':
      return {
        cubes: [
          { size: [4, 6, 4], position: [-2, 0, 0], uv: UV_RFOOT },
          { size: [4, 6, 4], position: [2, 0, 0], uv: UV_RFOOT },
        ],
        assemblyHeight: 6,
      };
  }
}

export function ArmorPiece3D({ slot, material, pattern }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const id = ++generationRef.current;
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 200;
    const height = container.clientHeight || 120;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 200);
    // Distance + framing tuned per slot height — fits the cluster
    // comfortably without zoom-in clipping the helmet horn or arm tips.
    const cam = slot === 'head' ? 32 : slot === 'feet' ? 24 : 42;
    camera.position.set(0, 0, cam);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    const directional = new THREE.DirectionalLight(0xffffff, 0.55);
    directional.position.set(5, 10, 8);
    scene.add(ambient, directional);

    // Pivot rotates around Y; the assembly is centered on the
    // pivot's origin in X/Z so the spin looks balanced.
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Body filler — dark grey cubes inside the armour so the piece
    // looks worn rather than hollow. Plain MeshBasicMaterial keeps
    // the colour predictable across browsers.
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x222025 });
    const { cubes, assemblyHeight } = slotCubes(slot);
    for (const c of cubes) {
      pivot.add(buildCube(c, bodyMat));
    }
    // Vertical centering: shift the pivot up so the assembly's bottom
    // sits at -assemblyHeight / 2 relative to scene origin (which is
    // already at pivot center). Just centering on the pivot is enough
    // since cube positions already use the assembly's vertical center.

    // Pointer-drag rotation only — no auto-spin (operator vetoed
    // the constant rotation because it stole attention while
    // reading the trim). Renders are scheduled imperatively via
    // requestRender(), which coalesces overlapping calls so a fast
    // pointermove burst still draws at most one frame per refresh.
    let renderQueued = false;
    const requestRender = () => {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        renderer.render(scene, camera);
      });
    };

    // Armor pass — separate cubes scaled up by ARMOR_SCALE so the
    // texture sits on top of the body filler without z-fighting.
    let cancelled = false;
    const armorLayer: 'humanoid' | 'humanoid_leggings' =
      slot === 'legs' ? 'humanoid_leggings' : 'humanoid';

    buildArmorTexture(armorLayer, material, pattern)
      .then((canvas) => {
        if (cancelled || id !== generationRef.current) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.1,
        });
        for (const c of cubes) {
          const armorCube = buildCube(c, mat);
          armorCube.scale.setScalar(ARMOR_SCALE);
          pivot.add(armorCube);
        }
        requestRender();
      })
      .catch(() => {
        // Texture missing → leave the body filler showing.
      });

    const drag = { active: false, lastX: 0, lastY: 0 };
    const SENSITIVITY = 0.01;
    const X_TILT_MAX = Math.PI / 2 - 0.05;

    const onPointerDown = (e: PointerEvent) => {
      drag.active = true;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag.active) return;
      pivot.rotation.y += (e.clientX - drag.lastX) * SENSITIVITY;
      pivot.rotation.x = Math.max(
        -X_TILT_MAX,
        Math.min(X_TILT_MAX, pivot.rotation.x + (e.clientY - drag.lastY) * SENSITIVITY),
      );
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      requestRender();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!drag.active) return;
      drag.active = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer might already be released.
      }
      renderer.domElement.style.cursor = 'grab';
    };
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    // Initial paint so the body cubes are visible before the armour
    // texture finishes loading.
    requestRender();

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || 200;
      const h = container.clientHeight || 120;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    });
    ro.observe(container);

    // Suppress unused-binding warning — assemblyHeight is reserved
    // for future camera-fit tweaks; kept exposed so adding a "fit
    // tightly" toggle later is a 1-line change.
    void assemblyHeight;

    return () => {
      cancelled = true;
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.dispose();
      // Three.js GC bookkeeping — drop each material+geometry+texture
      // we built so a row that swaps trim material 10 times doesn't
      // leak 10 sets of GPU buffers.
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) {
            o.material.forEach((m) => m.dispose());
          } else {
            o.material.dispose();
          }
        }
      });
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [slot, material, pattern]);

  return (
    <div
      ref={containerRef}
      className="h-20 w-32 shrink-0 border-2 border-[var(--rule-strong)] bg-black"
      style={{ imageRendering: 'pixelated' }}
      title={`${material} · ${pattern}`}
    />
  );
}
