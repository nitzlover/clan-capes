/**
 * Login diorama scenes — the data behind the staged Minecraft logins.
 *
 * Each builder takes the resolved clan-member skins and returns a SceneSpec the
 * MinecraftScene engine renders once and holds still. Three "situations":
 *   • campfire — the live login (two seated round the fire + a lurking creeper)
 *   • grove    — preview 1: the clan standing in a moonlit forest clearing
 *   • quarry   — preview 2: the clan working a stone quarry, ore glowing in the wall
 *
 * All pure B&W, static (only the campfire flickers), front-3⁄4 framing.
 */

import type { SceneSpec, NodeXform } from './v9/MinecraftScene';
import { POSES } from './poses';

/** Wrap a curated mcrender pose as a CharSpec pose. */
const P = (name: keyof typeof POSES | string): { node: NodeXform } => ({ node: POSES[name] });

// Clan roster shown in every scene — real Minecraft skins, fetched live by
// nickname through the /api/skin Mojang proxy. [0,1] = the pair, [2] = the lurker.
export const MEMBERS = ['obllako', 'n1tzzz', 'MHF_Creeper'];
export const CLAN_CAPE = '/capes/migration.png';
export const FALLBACK_SKIN = '/skins/steve.png';

// Exact seated node transform (verified 1:1 in /studio) — thighs forward, shins
// down, arms at sides, torso upright. Sits a figure truthfully on a plank bench.
const SEATED: NodeXform = {
  Body: { rotation: [Math.PI / 2, 0, 0] },
  Head: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  ArmLeftLower: { rotation: [0, 0, 0], translation: [0, 0.4, 0] },
  ArmLeftUpper: { scale: 1, rotation: [Math.PI, 0, -0.19198621771937624], translation: [0.6, 0.41, 0] },
  LegLeftLower: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  LegLeftUpper: { scale: 1, rotation: [-Math.PI, 0, -0.2792526803190927], translation: [0.23, 0.18, 0] },
  ArmRightLower: { rotation: [0, 0, 0], translation: [0, 0.4, 0] },
  ArmRightUpper: { scale: 1, rotation: [Math.PI, 0, 0.08726646259971647], translation: [-0.6, 0.3, 0] },
  LegRightLower: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  LegRightUpper: { scale: 1, rotation: [-Math.PI, 0, 0.20943951023931953], translation: [-0.2, 0.11, 0] },
};

// Standing hip-rest height above a -16 ground (so the feet land on it). Matches
// the verified lurker placement.
const STAND_Y = -2;

/* ─────────────────────────── 1 · Campfire (live login) ─────────────────── */

export const campfireScene = (skins: string[]): SceneSpec => ({
  fire: true,
  groundY: -16,
  camera: { position: [0, 13, 96], target: [0, -4, 0], fov: 33 },
  background: { stars: true, moon: [80, 60, -150], fog: [138, 346] },
  props: [
    { type: 'campfire', position: [0, -2, 0] },
    { type: 'seat', position: [-26, -13, 4], width: 24 },
    { type: 'seat', position: [26, -13, 4], width: 24 },
    // layered treeline (near → far) that fogs into a painterly backdrop
    { type: 'tree', position: [-82, -16, -58], trunk: 40, rotationY: 0.6 },
    { type: 'tree', position: [74, -16, -72], trunk: 48, rotationY: -0.4 },
    { type: 'tree', position: [22, -16, -98], trunk: 32, rotationY: 1.2 },
    { type: 'tree', position: [-42, -16, -94], trunk: 30, rotationY: -1.1 },
    { type: 'tree', position: [-116, -16, -86], trunk: 36, rotationY: 0.3 },
    { type: 'tree', position: [112, -16, -104], trunk: 30, rotationY: -0.9 },
    { type: 'tree', position: [-6, -16, -134], trunk: 26, rotationY: 1.7 },
    { type: 'tree', position: [54, -16, -126], trunk: 28, rotationY: -1.5 },
    { type: 'tree', position: [-36, -16, -22], trunk: 46, rotationY: 0.4 }, // the lurker's tree
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: { node: SEATED }, position: [-26, -9.5, 4], rotationY: Math.PI * 0.3, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: { node: SEATED }, position: [26, -9.5, 4], rotationY: -Math.PI * 0.3, idle: 'breathe' },
    { skin: skins[2], pose: 'stand', position: [-43, -2, -31], rotationY: 0.7, idle: 'breathe' },
  ],
});

/* ─────────────────────────── 2 · The Grove (preview 1) ─────────────────── */
// Moonlit forest clearing. No fire — the pair stand together among the trees,
// one big oak as the hero, the creeper peering from behind a far trunk.

export const groveScene = (skins: string[]): SceneSpec => ({
  fire: false,
  groundY: -16,
  fill: 0.72, // no campfire → soft fill so the clearing isn't flat-dark
  // pulled well back + raised for standing figures (taller than the seated pair)
  camera: { position: [0, 20, 146], target: [0, 1, -10], fov: 31 },
  background: { stars: true, moon: [-44, 66, -92], fog: [170, 440], fogColor: 0x0d0d0f }, // moon in frame as the focal
  props: [
    // hero tree — tall, just off-centre so the pair frame it
    { type: 'tree', position: [34, -16, -34], trunk: 62, rotationY: 0.3 },
    // a second near tree on the left for the clearing to feel enclosed
    { type: 'tree', position: [-54, -16, -30], trunk: 54, rotationY: -0.5 },
    // mid + far treeline
    { type: 'tree', position: [-88, -16, -74], trunk: 42, rotationY: 0.7 },
    { type: 'tree', position: [80, -16, -82], trunk: 44, rotationY: -0.6 },
    { type: 'tree', position: [-30, -16, -108], trunk: 32, rotationY: 1.1 },
    { type: 'tree', position: [42, -16, -122], trunk: 30, rotationY: -1.3 },
    { type: 'tree', position: [6, -16, -146], trunk: 26, rotationY: 0.4 },
    // a mossy fallen log + a low boulder the clearing is built around
    { type: 'log', position: [-18, -13, 12], rotationY: 0.18 },
    { type: 'cliff', position: [26, -16, 8], width: 16, height: 9, depth: 12 }, // low mossy boulder
  ],
  characters: [
    // the pair, standing close, looking around the clearing (3⁄4 front)
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: 'stand', position: [-16, STAND_Y, 0], rotationY: 0.5, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: 'stand', position: [14, STAND_Y, -4], rotationY: -0.42, idle: 'breathe' },
    // the lurker — creeper peeking out beside the hero trunk
    { skin: skins[2], pose: 'stand', position: [46, STAND_Y, -32], rotationY: 2.7, idle: 'breathe' },
  ],
});

/* ─────────────────────────── 3 · The Quarry (preview 2) ────────────────── */
// A stone pit at night: a tall cobblestone back wall, stepped ledges, ore
// glowing in the rock. Stone ground (not grass). The pair stand working it.

export const quarryScene = (skins: string[]): SceneSpec => ({
  fire: false,
  groundY: -16,
  fill: 0.7,
  ground: { tex: '/mc-tex/stone.png', repeat: 30, tint: 0x8a8a8a },
  camera: { position: [0, 15, 116], target: [0, 0, -4], fov: 32 },
  background: { stars: true, moon: [76, 70, -130], fog: [190, 460], fogColor: 0x0d0d0f },
  props: [
    // tall back wall (the quarry face)
    { type: 'cliff', position: [0, -16, -50], width: 200, height: 78, depth: 16, cobble: true },
    // stepped ledges left + right framing the pit
    { type: 'cliff', position: [-72, -16, -20], width: 56, height: 30, depth: 40, cobble: true },
    { type: 'cliff', position: [74, -16, -22], width: 52, height: 22, depth: 36, cobble: true },
    // rubble blocks scattered in the pit
    { type: 'cliff', position: [-22, -16, 12], width: 12, height: 8, depth: 12 },
    { type: 'cliff', position: [32, -16, 14], width: 10, height: 6, depth: 10 },
    // ore veins glowing in the back wall (bright focal points)
    { type: 'ore', position: [-34, -2, -42], size: 10 },
    { type: 'ore', position: [20, -7, -42], size: 9 },
    { type: 'ore', position: [48, 4, -42], size: 8 },
    { type: 'ore', position: [-58, 6, -42], size: 8 },
    // a couple low in the pit so the foreground catches the glow too
    { type: 'ore', position: [-30, -14, 16], size: 6 },
    { type: 'ore', position: [38, -14, 18], size: 5 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: 'stand', position: [-16, STAND_Y, 10], rotationY: 0.42, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: 'stand', position: [12, STAND_Y, 8], rotationY: -0.38, idle: 'breathe' },
    // the lurker — up on the left ledge (in-frame, the right is under the form), watching
    { skin: skins[2], pose: 'stand', position: [-64, 12, -14], rotationY: -2.4, idle: 'breathe' },
  ],
});

/* ─────────────────────────── 4 · The Beacon (preview 3) ────────────────── */
// The unique one. A pillar of beacon light punches straight up into the starry
// night; the clan gathers at the foot of a stepped stone base, the beacon block
// glowing at its apex. No fire — the focal is a vertical shaft of light.

export const beaconScene = (skins: string[]): SceneSpec => ({
  fire: false,
  groundY: -16,
  fill: 0.42, // the beam's base light + the beacon block do most of the lifting
  camera: { position: [0, 15, 122], target: [0, 9, -8], fov: 36 },
  background: { stars: true, moon: [-70, 58, -150], fog: [170, 470], fogColor: 0x0c0c0e },
  props: [
    // stepped stone base (a small pyramid) the beacon sits on
    { type: 'cliff', position: [0, -16, -8], width: 46, height: 8, depth: 46 },
    { type: 'cliff', position: [0, -8, -8], width: 30, height: 6, depth: 30 },
    { type: 'cliff', position: [0, -2, -8], width: 16, height: 5, depth: 16 },
    // the beacon block (glowing) at the apex
    { type: 'ore', position: [0, 5, -8], size: 9 },
    // the light beam rising from it into the sky (mostly off the top of frame)
    { type: 'beam', position: [0, 9, -8], width: 6, height: 470 },
    // a little surrounding life + the lurker's tree
    { type: 'tree', position: [-66, -16, -46], trunk: 46, rotationY: 0.5 },
    { type: 'tree', position: [72, -16, -58], trunk: 42, rotationY: -0.6 },
    { type: 'tree', position: [42, -16, -30], trunk: 40, rotationY: 0.3 }, // lurker tree
  ],
  characters: [
    // the pair gathered at the foot of the beacon, looking out (3⁄4 front)
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: 'stand', position: [-22, STAND_Y, 12], rotationY: 0.45, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: 'stand', position: [20, STAND_Y, 10], rotationY: -0.4, idle: 'breathe' },
    // the lurker — creeper watching from behind the right tree
    { skin: skins[2], pose: 'stand', position: [42, STAND_Y, -26], rotationY: 2.8, idle: 'breathe' },
  ],
});

/* ═══════════════════════ POSE-DRIVEN SCENES (4-11) ═══════════════════════ */
/* Real mcrender poses (POSES.*) on each character — no more stiff stand. */

const SEAT_Y = -9.5; // seated hip rest height on a plank (top ≈ -10)

/* 4 · Council Fire — the campfire, but alive: two seated leaning to the flames,
 *     the creeper standing in thought behind its tree. */
export const councilScene = (skins: string[]): SceneSpec => ({
  fire: true, groundY: -16,
  camera: { position: [0, 13, 96], target: [0, -4, 0], fov: 33 },
  background: { stars: true, moon: [80, 60, -150], fog: [138, 346] },
  props: [
    { type: 'campfire', position: [0, -2, 0] },
    { type: 'seat', position: [-26, -13, 4], width: 24 },
    { type: 'seat', position: [26, -13, 4], width: 24 },
    { type: 'tree', position: [-82, -16, -58], trunk: 40, rotationY: 0.6 },
    { type: 'tree', position: [74, -16, -72], trunk: 48, rotationY: -0.4 },
    { type: 'tree', position: [22, -16, -98], trunk: 32, rotationY: 1.2 },
    { type: 'tree', position: [-42, -16, -94], trunk: 30, rotationY: -1.1 },
    { type: 'tree', position: [-36, -16, -22], trunk: 46, rotationY: 0.4 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('sit'), position: [-26, SEAT_Y, 4], rotationY: Math.PI * 0.3, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('lookDown'), position: [26, SEAT_Y, 4], rotationY: -Math.PI * 0.3, idle: 'breathe' },
    { skin: skins[2], pose: P('think'), position: [-43, STAND_Y, -31], rotationY: 0.7 },
  ],
});

/* 5 · The Throne — a lord enthroned, a guard saluting, the creeper kneeling. */
export const throneScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.28, // darker → moodier, rim-lit (ref throne1)
  ground: { tex: '/mc-tex/stone.png', repeat: 30, tint: 0x6e6e6e },
  // low-angle hero looking UP at a towering throne (ref throne1): subject left,
  // right third empty for the form, slow dolly in.
  // CENTERED in the scene canvas (the form is a SEPARATE column, not an overlay —
  // so the throne fills the canvas, no dead gap). Slight off-axis for a 3/4 read.
  camera: { position: [6, -4, 58], target: [0, 15, -16], fov: 44, push: 7 },
  background: { stars: true, moon: [38, 78, -150], fog: [120, 380], fogColor: 0x0b0b0d },
  mist: { count: 14, y: -8, opacity: 0.6, z: 6 }, // thick, rolling forward at the base
  props: [
    // towering cobblestone throne (dais -> seat -> tall back), centered
    { type: 'cliff', position: [0, -16, -16], width: 34, height: 12, depth: 24, cobble: true }, // dais (top -4)
    { type: 'cliff', position: [0, -4, -16], width: 20, height: 12, depth: 12, cobble: true },  // seat (top 8)
    { type: 'cliff', position: [0, -4, -24], width: 24, height: 52, depth: 8, cobble: true },   // tall back tower
    { type: 'cliff', position: [-11, -4, -15], width: 4, height: 15, depth: 12, cobble: true }, // armrest L
    { type: 'cliff', position: [11, -4, -15], width: 4, height: 15, depth: 12, cobble: true },  // armrest R
    // a single dark hanging banner to one side
    { type: 'cliff', position: [-32, -16, -24], width: 7, height: 50, depth: 2, tint: 0x222226 },
  ],
  characters: [
    // the lord, enthroned high, alone (creeper removed per ref)
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('sitThrone'), position: [0, 8.5, -14], rotationY: 0, idle: 'breathe' },
  ],
});

/* 6 · The Duel — two squared off mid-fight in a stone ring, a spectator watching. */
export const duelScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.5,
  ground: { tex: '/mc-tex/stone.png', repeat: 28, tint: 0x8a8a8a },
  camera: { position: [0, 13, 104], target: [0, -1, -6], fov: 34 },
  background: { stars: true, moon: [-76, 62, -150], fog: [180, 470], fogColor: 0x0d0d0f },
  props: [
    { type: 'cliff', position: [0, -16, -34], width: 92, height: 16, depth: 8, cobble: true }, // back wall
    { type: 'cliff', position: [-44, -16, 2], width: 8, height: 16, depth: 70, cobble: true }, // side L
    { type: 'cliff', position: [44, -16, 2], width: 8, height: 16, depth: 70, cobble: true },  // side R
    { type: 'ore', position: [-30, -2, -28], size: 7 }, { type: 'ore', position: [30, -2, -28], size: 7 }, // braziers
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('twoSwords'), position: [-14, STAND_Y, 6], rotationY: 1.25, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('battleReady'), position: [15, STAND_Y, 4], rotationY: -1.25, idle: 'breathe' },
    { skin: skins[2], pose: P('looking'), position: [33, STAND_Y, -14], rotationY: -2.4 },
  ],
});

/* 7 · Stargazers — two lying back on the grass, one sitting pointing up at a
 *     dense sky + a shooting star. */
export const stargazeScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.55,
  camera: { position: [0, 22, 96], target: [0, -6, -12], fov: 36 },
  background: { stars: true, moon: [-58, 70, -120], fog: [170, 470], fogColor: 0x0d0d0f },
  props: [
    { type: 'log', position: [-2, -13, 22], rotationY: 0.1 },
    { type: 'tree', position: [-74, -16, -40], trunk: 50, rotationY: 0.5 },
    { type: 'tree', position: [76, -16, -52], trunk: 44, rotationY: -0.6 },
    { type: 'tree', position: [40, -16, -90], trunk: 30, rotationY: 1.1 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('layBack'), position: [-16, -14.5, 8], rotationY: 0.1 },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('laySide'), position: [10, -14.5, 6], rotationY: -0.4 },
    { skin: skins[2], pose: P('lookUp'), position: [30, STAND_Y, -2], rotationY: -0.5, idle: 'breathe' },
  ],
});

/* 8 · The Forge — a smith mid-swing at the anvil, the forge glowing, a watcher. */
export const forgeScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.4,
  ground: { tex: '/mc-tex/stone.png', repeat: 30, tint: 0x8a8a8a },
  camera: { position: [0, 13, 100], target: [0, -2, -6], fov: 33 },
  background: { stars: true, moon: [70, 64, -150], fog: [170, 460], fogColor: 0x0d0d0f },
  props: [
    { type: 'cliff', position: [16, -16, -4], width: 8, height: 7, depth: 5 },   // anvil base
    { type: 'cliff', position: [16, -9, -4], width: 13, height: 3, depth: 7 },    // anvil top
    { type: 'cliff', position: [40, -16, -16], width: 24, height: 26, depth: 18, cobble: true }, // forge housing
    { type: 'ore', position: [40, -4, -5], size: 9 }, // forge mouth glow
    { type: 'ore', position: [40, 6, -5], size: 5 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('hammerSwing'), position: [4, STAND_Y, 2], rotationY: -0.55, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('think2'), position: [-20, STAND_Y, 6], rotationY: 0.5, idle: 'breathe' },
    { skin: skins[2], pose: P('looking'), position: [-40, STAND_Y, -14], rotationY: 0.8 },
  ],
});

/* 9 · The Long March — a column crossing a ridge at moonrise. */
export const marchScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.5,
  camera: { position: [0, 16, 110], target: [0, 2, -10], fov: 33 },
  background: { stars: true, moon: [62, 56, -150], fog: [160, 440], fogColor: 0x0c0c0e },
  props: [
    { type: 'tree', position: [-80, -16, -50], trunk: 44, rotationY: 0.5 },
    { type: 'tree', position: [80, -16, -64], trunk: 40, rotationY: -0.5 },
    { type: 'tree', position: [-30, -16, -100], trunk: 30, rotationY: 1.0 },
    { type: 'tree', position: [44, -16, -118], trunk: 28, rotationY: -1.2 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('walk'), position: [-22, STAND_Y, 14], rotationY: 0.7, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('walk2'), position: [0, STAND_Y, 2], rotationY: 0.7, idle: 'breathe' },
    { skin: skins[2], pose: P('run'), position: [20, STAND_Y, -12], rotationY: 0.7 },
  ],
});

/* 10 · Spider Perch — a scout crouched atop a pillar, a partner staring up, a
 *      creeper sneaking at the base. */
export const perchScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.5,
  ground: { tex: '/mc-tex/stone.png', repeat: 30, tint: 0x8a8a8a },
  camera: { position: [0, 16, 108], target: [0, 6, -8], fov: 35 },
  background: { stars: true, moon: [-66, 70, -150], fog: [180, 470], fogColor: 0x0d0d0f },
  props: [
    { type: 'cliff', position: [12, -16, -18], width: 16, height: 42, depth: 16, cobble: true }, // pillar
    { type: 'cliff', position: [-26, -16, -10], width: 18, height: 14, depth: 18, cobble: true }, // low block
    { type: 'ore', position: [12, 20, -10], size: 4 },
  ],
  characters: [
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('crouchPerch'), position: [12, 24, -18], rotationY: 0.3, idle: 'breathe' },
    { skin: skins[1], cape: CLAN_CAPE, pose: P('stareUp'), position: [-12, STAND_Y, 10], rotationY: 0.4, idle: 'breathe' },
    { skin: skins[2], pose: P('sneak'), position: [26, STAND_Y, -2], rotationY: -2.5 },
  ],
});

/* 11 · The Fallen — a vigil over a fallen clanmate among gravestones. */
export const fallenScene = (skins: string[]): SceneSpec => ({
  fire: false, groundY: -16, fill: 0.45,
  camera: { position: [0, 12, 96], target: [0, -4, -4], fov: 33 },
  background: { stars: true, moon: [70, 50, -150], fog: [120, 320], fogColor: 0x0d0d0f },
  props: [
    { type: 'cliff', position: [-30, -16, -24], width: 9, height: 15, depth: 4, cobble: true }, // gravestones
    { type: 'cliff', position: [-12, -16, -28], width: 9, height: 13, depth: 4, cobble: true },
    { type: 'cliff', position: [8, -16, -26], width: 9, height: 16, depth: 4, cobble: true },
    { type: 'cliff', position: [28, -16, -30], width: 9, height: 13, depth: 4, cobble: true },
    { type: 'tree', position: [-60, -16, -34], trunk: 40, rotationY: 0.4 },
    { type: 'ore', position: [22, -8, -6], size: 5 }, // lantern
  ],
  characters: [
    { skin: skins[1], cape: CLAN_CAPE, pose: P('fallen'), position: [2, -14.5, 2], rotationY: 1.3 },          // the fallen
    { skin: skins[0], cape: CLAN_CAPE, slim: true, pose: P('mourn'), position: [-14, STAND_Y, 8], rotationY: 0.5 }, // mourner
    { skin: skins[2], pose: P('sad'), position: [20, STAND_Y, 6], rotationY: -0.5 },                          // creeper, sad
  ],
});
