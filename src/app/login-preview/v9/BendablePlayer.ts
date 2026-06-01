/**
 * BendablePlayer — a Minecraft player model with bendable knees & elbows.
 *
 * skinview3d's PlayerObject renders each arm/leg as ONE box (a single pivot at
 * the shoulder/hip), so a seated character has stiff straight limbs. This is
 * the thing the user flagged ("персонажи в текстурах … правильность анимации")
 * and what mcskins.top's renderer does differently — its limbs bend at a mid
 * joint (the `e` param).
 *
 * This module rebuilds the player with TWO segments per arm/leg (upper + lower)
 * joined by an elbow/knee pivot, so poses can bend. UV mapping reuses the exact
 * standard-skin layout skinview3d uses (verified against its model.js), split
 * across the two segments so the texture still lines up.
 *
 * Units match skinview3d (1 unit = 1 skin pixel), so a BendablePlayer drops
 * into the same scene at the same scale as the old PlayerObject.
 *
 * Scope kept tight: base layer everywhere + outer (overlay) layer on head &
 * body (hat / jacket — the visually important overlays). Limb overlays
 * (sleeves/trousers) are omitted to keep the segmented UV math small; add later
 * if a clan skin needs them.
 */

import {
  BoxGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector2,
} from 'three';

type Seg = 'upper' | 'lower' | 'full';

/**
 * Standard Minecraft box UV (port of skinview3d's setUVs) with optional
 * vertical segmenting for split limbs.
 *
 * For a limb of full height H rendered as two h=H/2 boxes:
 *   - 'upper' uses the top half of the side strip + the real TOP cap.
 *   - 'lower' uses the bottom half of the side strip + the real BOTTOM cap.
 * The cut-facing caps reuse the real cap texture (hidden when straight, only
 * faintly visible when bent — acceptable in a stylised B&W scene).
 */
function setUVs(
  box: BoxGeometry,
  u: number,
  v: number,
  width: number,
  height: number,
  depth: number,
  texW = 64,
  texH = 64,
  seg: Seg = 'full',
  fullHeight = height,
) {
  const face = (x1: number, y1: number, x2: number, y2: number) => [
    new Vector2(x1 / texW, 1 - y2 / texH),
    new Vector2(x2 / texW, 1 - y2 / texH),
    new Vector2(x2 / texW, 1 - y1 / texH),
    new Vector2(x1 / texW, 1 - y1 / texH),
  ];

  // Side strip vertical range for this segment.
  const sideTopV = seg === 'lower' ? v + depth + (fullHeight - height) : v + depth;
  const sideBotV = sideTopV + height;

  const top = face(u + depth, v, u + width + depth, v + depth);
  const bottom = face(u + width + depth, v, u + width * 2 + depth, v + depth);
  const left = face(u, sideTopV, u + depth, sideBotV);
  const front = face(u + depth, sideTopV, u + width + depth, sideBotV);
  const right = face(u + width + depth, sideTopV, u + width + depth * 2, sideBotV);
  const back = face(u + width + depth * 2, sideTopV, u + width * 2 + depth * 2, sideBotV);

  const uvRight = [right[3], right[2], right[0], right[1]];
  const uvLeft = [left[3], left[2], left[0], left[1]];
  const uvTop = [top[3], top[2], top[0], top[1]];
  const uvBottom = [bottom[0], bottom[1], bottom[3], bottom[2]];
  const uvFront = [front[3], front[2], front[0], front[1]];
  const uvBack = [back[3], back[2], back[0], back[1]];

  const data: number[] = [];
  for (const arr of [uvRight, uvLeft, uvTop, uvBottom, uvFront, uvBack])
    for (const p of arr) data.push(p.x, p.y);

  // BoxGeometry's uv is a BufferAttribute (has .set); the union type also admits
  // InterleavedBufferAttribute (no .set), so cast structurally to satisfy tsc.
  const attr = box.attributes.uv as unknown as { set(a: ArrayLike<number>): void; needsUpdate: boolean };
  attr.set(new Float32Array(data));
  attr.needsUpdate = true;
}

export type LimbPose = {
  /** swing of the whole limb at the shoulder/hip (radians) */
  swing?: [number, number, number];
  /** bend at the elbow/knee (radians, +x folds the lower segment forward) */
  bend?: number;
};
export type BendPose = {
  head?: [number, number, number];
  body?: [number, number, number];
  rightArm?: LimbPose;
  leftArm?: LimbPose;
  rightLeg?: LimbPose;
  leftLeg?: LimbPose;
};

export type BendablePlayer = {
  root: Group;
  joints: {
    head: Object3D;
    body: Object3D;
    rightArm: Object3D;
    leftArm: Object3D;
    rightLeg: Object3D;
    leftLeg: Object3D;
    rightElbow: Object3D;
    leftElbow: Object3D;
    rightKnee: Object3D;
    leftKnee: Object3D;
  };
  applyPose: (p: BendPose) => void;
};

/**
 * Build the rig. `map` is the skin Texture (NearestFilter, from skinview-utils
 * loadSkinToCanvas). `slim` selects the 3px-arm Alex model.
 */
export function buildBendablePlayer(
  map: Texture,
  slim: boolean,
  capeMap?: Texture | null,
): BendablePlayer {
  const base = new MeshStandardMaterial({ side: FrontSide, map, roughness: 1, metalness: 0 });
  const overlay = new MeshStandardMaterial({
    side: DoubleSide,
    map,
    transparent: true,
    alphaTest: 1e-5,
    roughness: 1,
    metalness: 0,
  });

  const root = new Group();

  /* Head (with hat overlay) */
  const head = new Group();
  const headBox = new BoxGeometry(8, 8, 8);
  setUVs(headBox, 0, 0, 8, 8, 8);
  const headMesh = new Mesh(headBox, base);
  headMesh.position.y = 4;
  const hatBox = new BoxGeometry(9, 9, 9);
  setUVs(hatBox, 32, 0, 8, 8, 8);
  const hatMesh = new Mesh(hatBox, overlay);
  hatMesh.position.y = 4;
  head.add(headMesh, hatMesh);
  root.add(head);

  /* Body (with jacket overlay) */
  const body = new Group();
  const bodyBox = new BoxGeometry(8, 12, 4);
  setUVs(bodyBox, 16, 16, 8, 12, 4);
  const bodyMesh = new Mesh(bodyBox, base);
  const jacketBox = new BoxGeometry(8.5, 12.5, 4.5);
  setUVs(jacketBox, 16, 32, 8, 12, 4);
  const jacketMesh = new Mesh(jacketBox, overlay);
  body.add(bodyMesh, jacketMesh);
  body.position.y = -6;
  root.add(body);

  /* Cape (optional) — 10×16×1 quad on the back, tilted out, hung from the
   * shoulders. UV from the cape texture (64×32 layout). */
  if (capeMap) {
    const capeMat = new MeshStandardMaterial({
      side: DoubleSide,
      map: capeMap,
      transparent: true,
      alphaTest: 1e-5,
      roughness: 1,
      metalness: 0,
    });
    const capePivot = new Group();
    capePivot.position.set(0, 6, -2); // shoulders, behind the body
    capePivot.rotation.x = 0.2; // drape angle
    const capeBox = new BoxGeometry(10, 16, 1);
    setUVs(capeBox, 0, 0, 10, 16, 1, 64, 32);
    const capeMesh = new Mesh(capeBox, capeMat);
    capeMesh.position.y = -8; // hang down from the shoulders
    capeMesh.rotation.y = Math.PI; // outer face points backward
    capePivot.add(capeMesh);
    body.add(capePivot);
  }

  const armW = slim ? 3 : 4;
  const armXOff = slim ? 0.5 : 1; // pivot tweak so slim arm aligns with body

  /**
   * Build a two-segment limb. Returns { root (swings at shoulder/hip), elbow
   * (bends the lower segment) }. UVs split the limb's standard rect across the
   * upper & lower 6px halves.
   */
  const buildLimb = (
    u: number,
    v: number,
    w: number,
    d: number,
    side: -1 | 1,
    kind: 'arm' | 'leg',
  ) => {
    const limbRoot = new Group();

    // Upper segment: top at +2 (arm) / 0 (leg), 6 tall.
    const upTop = kind === 'arm' ? 2 : 0;
    const upBox = new BoxGeometry(w, 6, d);
    setUVs(upBox, u, v, w, 6, d, 64, 64, 'upper', 12);
    const upMesh = new Mesh(upBox, base);
    upMesh.position.y = upTop - 3; // center of the 6-tall upper
    limbRoot.add(upMesh);

    // Elbow / knee pivot at the bottom of the upper segment.
    const joint = new Group();
    joint.position.y = upTop - 6;
    const loBox = new BoxGeometry(w, 6, d);
    setUVs(loBox, u, v, w, 6, d, 64, 64, 'lower', 12);
    const loMesh = new Mesh(loBox, base);
    loMesh.position.y = -3; // hangs below the joint
    joint.add(loMesh);
    limbRoot.add(joint);

    return { limbRoot, joint };
  };

  // Right arm: UV 40,16 ; shoulder at x=-5,y=-2
  const rArm = buildLimb(40, 16, armW, 4, -1, 'arm');
  rArm.limbRoot.position.set(-5 + (slim ? 0 : 0) - 0, -2, 0);
  rArm.limbRoot.position.x = -4 - armXOff;
  root.add(rArm.limbRoot);

  // Left arm: UV 32,48 ; shoulder at x=5,y=-2
  const lArm = buildLimb(32, 48, armW, 4, 1, 'arm');
  lArm.limbRoot.position.set(4 + armXOff, -2, 0);
  root.add(lArm.limbRoot);

  // Right leg: UV 0,16 ; hip at x=-1.9,y=-12
  const rLeg = buildLimb(0, 16, 4, 4, -1, 'leg');
  rLeg.limbRoot.position.set(-1.9, -12, -0.1);
  root.add(rLeg.limbRoot);

  // Left leg: UV 16,48 ; hip at x=1.9,y=-12
  const lLeg = buildLimb(16, 48, 4, 4, 1, 'leg');
  lLeg.limbRoot.position.set(1.9, -12, -0.1);
  root.add(lLeg.limbRoot);

  root.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  const joints = {
    head,
    body,
    rightArm: rArm.limbRoot,
    leftArm: lArm.limbRoot,
    rightLeg: rLeg.limbRoot,
    leftLeg: lLeg.limbRoot,
    rightElbow: rArm.joint,
    leftElbow: lArm.joint,
    rightKnee: rLeg.joint,
    leftKnee: lLeg.joint,
  };

  const applyLimb = (limb: Object3D, joint: Object3D, p?: LimbPose) => {
    if (!p) return;
    if (p.swing) limb.rotation.set(p.swing[0], p.swing[1], p.swing[2]);
    if (p.bend !== undefined) joint.rotation.x = p.bend;
  };

  const applyPose = (p: BendPose) => {
    if (p.head) head.rotation.set(...p.head);
    if (p.body) body.rotation.set(...p.body);
    applyLimb(joints.rightArm, joints.rightElbow, p.rightArm);
    applyLimb(joints.leftArm, joints.leftElbow, p.leftArm);
    applyLimb(joints.rightLeg, joints.rightKnee, p.rightLeg);
    applyLimb(joints.leftLeg, joints.leftKnee, p.leftLeg);
  };

  return { root, joints, applyPose };
}
