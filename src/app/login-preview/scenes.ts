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
