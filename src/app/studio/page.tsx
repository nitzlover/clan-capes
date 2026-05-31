'use client';

/**
 * /studio — Minecraft character studio.
 *
 * Site design mirrors mcrender.net/studio 1:1 (layout, controls, chrome) but
 * branded Clan Capes. Full operator surface: site header, resizable 70/30 split
 * (canvas | settings), crop-frame overlay with corner brackets, floating
 * accessory toolbar, and a tabbed settings sidebar (scene / camera / other)
 * with a download bar.
 *
 * Posing: bones carry rest rotations, so slider values apply a DELTA quaternion
 * on top of rest (0 = standing). Exact mcrender poses use absolute node
 * transforms (rotation rad XYZ + translation + scale) applied 1:1.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Images, Camera, PersonStanding, User, Upload, ChevronDown, Download, Share2,
  Sword, Hand, Shield, Axis3d, Check, Palette, Tag, Ban,
  Sun, Zap, Search, CircleCheck, X, RotateCcw, MousePointer2,
  Plus, Lock, Globe, FileText, Sparkles, ArrowRight, Settings2,
} from 'lucide-react';

const FALLBACK_SKIN = '/models/steve.png';
const SKIN_RE = /^[A-Za-z0-9_]{2,16}$/;
const D2R = Math.PI / 180;

const BONES = [
  { key: 'Head', label: 'Head', axes: ['x', 'y', 'z'] as const },
  { key: 'Body', label: 'Body', axes: ['x', 'y', 'z'] as const },
  { key: 'ArmRightUpper', label: 'R Arm · shoulder', axes: ['x', 'y', 'z'] as const },
  { key: 'ArmRightLower', label: 'R Arm · elbow', axes: ['x'] as const },
  { key: 'ArmLeftUpper', label: 'L Arm · shoulder', axes: ['x', 'y', 'z'] as const },
  { key: 'ArmLeftLower', label: 'L Arm · elbow', axes: ['x'] as const },
  { key: 'LegRightUpper', label: 'R Leg · hip', axes: ['x', 'y', 'z'] as const },
  { key: 'LegRightLower', label: 'R Leg · knee', axes: ['x'] as const },
  { key: 'LegLeftUpper', label: 'L Leg · hip', axes: ['x', 'y', 'z'] as const },
  { key: 'LegLeftLower', label: 'L Leg · knee', axes: ['x'] as const },
] as const;

type Axis = 'x' | 'y' | 'z';
type PoseState = Record<string, { x: number; y: number; z: number }>;
const ZERO_POSE = (): PoseState =>
  Object.fromEntries(BONES.map((b) => [b.key, { x: 0, y: 0, z: 0 }]));

const PRESETS: Record<string, PoseState> = {
  Standing: ZERO_POSE(),
  Sitting: {
    ...ZERO_POSE(),
    Body: { x: 12, y: 0, z: 0 }, Head: { x: 10, y: 0, z: 0 },
    LegRightUpper: { x: -85, y: 4, z: 0 }, LegRightLower: { x: 88, y: 0, z: 0 },
    LegLeftUpper: { x: -85, y: -4, z: 0 }, LegLeftLower: { x: 88, y: 0, z: 0 },
    ArmRightUpper: { x: -32, y: 0, z: 6 }, ArmRightLower: { x: 46, y: 0, z: 0 },
    ArmLeftUpper: { x: -32, y: 0, z: -6 }, ArmLeftLower: { x: 46, y: 0, z: 0 },
  },
  Waving: {
    ...ZERO_POSE(),
    ArmRightUpper: { x: -10, y: 0, z: -150 }, ArmRightLower: { x: 30, y: 0, z: 0 },
    Head: { x: 0, y: -12, z: 4 },
  },
  Strut: {
    ...ZERO_POSE(),
    Body: { x: 2, y: -6, z: 0 }, Head: { x: -4, y: 8, z: 0 },
    LegRightUpper: { x: 24, y: 0, z: 0 }, LegRightLower: { x: 18, y: 0, z: 0 },
    LegLeftUpper: { x: -22, y: 0, z: 0 }, LegLeftLower: { x: 30, y: 0, z: 0 },
    ArmRightUpper: { x: -28, y: 0, z: 8 }, ArmRightLower: { x: 30, y: 0, z: 0 },
    ArmLeftUpper: { x: 26, y: 0, z: -6 }, ArmLeftLower: { x: 20, y: 0, z: 0 },
  },
};

type CamPreset =
  | 'default'
  | 'front' | 'back' | 'left' | 'right' | 'top' | 'isometric'
  | 'portrait' | 'headshot' | 'overShoulder' | 'hero' | 'closeup'
  | 'thumbLeft' | 'thumbRight';

type NodeXform = Record<string, { rotation?: [number, number, number]; translation?: [number, number, number]; scale?: number }>;

const MC_SEATED: NodeXform = {
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
// Exact nodeTransformation from mcrender.net/p/inspecting-item-11a9a939 (verbatim).
const MC_INSPECT: NodeXform = {
  Body: { rotation: [1.5707963267948966, 0, 0] },
  Head: { scale: 1, rotation: [0.2610225511985076, 0.851866972356743, -0.15567723275236287], translation: [0, 0.6, 0] },
  Main: { rotation: [0, 0, 0] },
  Chest: { rotation: [0, 0, 0] },
  Center: { rotation: [0, 0, 0] },
  ArmLeftLower: { scale: 1, rotation: [1.66268077907884, 0.5099629432082076, 0.5479380392179579], translation: [0, 0.4, 0] },
  ArmLeftUpper: { scale: 1, rotation: [-0.35945128830314504, 0.3303939678877799, -2.4350353637051922], translation: [0.6, 0.41, 0] },
  LegLeftLower: { scale: 1, rotation: [0.1763172793909779, 0, 0], translation: [0, 0.6, 0] },
  LegLeftUpper: { scale: 1, rotation: [-1.692151482882297, -0.22101531512243067, -0.0267285246403477], translation: [0.2, 0, 0] },
  ArmRightLower: { scale: 1, rotation: [0, 0, -0.30378675183602627], translation: [0, 0.4, 0] },
  ArmRightUpper: { scale: 1, rotation: [3.141592653589793, 0.07312072203670453, 0.1707449598797469], translation: [-0.6, 0.4, 0] },
  LegRightLower: { rotation: [0, 0, 0], translation: [0, 0.6, 0] },
  LegRightUpper: { rotation: [-1.5707963267948966, 0, 0], translation: [-0.2, 0, 0] },
};
const NODE_POSES: Record<string, NodeXform> = { 'Seated': MC_SEATED, 'Inspecting Item': MC_INSPECT };

// Backdrop swatches — exact mcrender rgb values + order.
const BACKDROPS = [
  { label: 'Red', css: 'rgb(239,68,68)' },
  { label: 'Green', css: 'rgb(16,185,129)' },
  { label: 'Blue', css: 'rgb(59,130,246)' },
  { label: 'Purple', css: 'rgb(139,92,246)' },
  { label: 'Orange', css: 'rgb(245,158,11)' },
  { label: 'Pink', css: 'rgb(236,72,153)' },
  { label: 'White', css: 'rgb(255,255,255)' },
  { label: 'Black', css: 'rgb(0,0,0)' },
  { label: 'None', css: 'transparent' },
];
// Named sky gradients — exact mcrender stops (top→bottom).
const GRADIENTS: { label: string; css: string }[] = [
  { label: 'Day', css: 'linear-gradient(rgb(74,144,226),rgb(120,185,242),rgb(192,216,240))' },
  { label: 'Sunrise', css: 'linear-gradient(rgb(43,27,61),rgb(115,75,109),rgb(255,160,122),rgb(255,215,0),rgb(135,206,235))' },
  { label: 'Sunset', css: 'linear-gradient(rgb(61,90,128),rgb(238,108,77),rgb(244,162,97),rgb(255,184,77),rgb(224,172,105))' },
  { label: 'Dusk', css: 'linear-gradient(rgb(26,26,46),rgb(22,33,62),rgb(139,90,143),rgb(233,75,60),rgb(241,143,1))' },
  { label: 'Night', css: 'linear-gradient(rgb(11,16,38),rgb(26,26,62),rgb(42,42,94))' },
  { label: 'Midnight', css: 'linear-gradient(rgb(0,0,0),rgb(10,14,39),rgb(26,26,64))' },
  { label: 'Overcast', css: 'linear-gradient(rgb(107,124,147),rgb(139,153,172),rgb(176,190,197))' },
  { label: 'Storm', css: 'linear-gradient(rgb(44,62,80),rgb(74,85,104),rgb(97,110,124))' },
];

// Floor blocks — full mcrender set, served from /textures/block/<name>.png.
const FLOOR_BLOCKS: { label: string; url: string }[] = [
  'amethyst_block', 'azalea_top', 'bamboo_mosaic', 'basalt_top', 'bedrock', 'calcite',
  'coarse_dirt', 'cobbled_deepslate', 'cobblestone', 'crimson_nylium', 'debug', 'deepslate',
  'deepslate_tiles', 'diamond_block', 'dirt', 'dirt_path_top', 'emerald_block', 'end_stone',
  'farmland', 'farmland_moist', 'gold_block', 'granite', 'gravel', 'honey_block_top', 'ice',
  'mud', 'mycelium_top', 'netherrack', 'purpur_block', 'red_sand', 'red_wool', 'redstone_block',
  'sand', 'sandstone_top', 'sculk_catalyst_top', 'sculk_sensor_top', 'slime_block', 'soul_sand',
  'soul_soil', 'terracotta', 'tuff', 'warped_nylium',
].map((n) => ({ label: n.replace(/_/g, ' '), url: `/textures/block/${n}.png` }));

// mcrender's exact effects defaults (saturation/contrast are -1..1 deltas).
const DEFAULT_FX = {
  saturation: 0.02, contrast: -0.03,
  vignette: false, vignetteDark: 0.7, vignetteOffset: 0.3,
  bloom: false, bloomIntensity: 0.5, bloomThreshold: 0.4,
  chromatic: false, chromaticOffset: 0.003,
  outline: false, outlineColor: '#000000',
  innerShadow: false, innerShadowColor: '#000000', innerShadowIntensity: 0.6, innerShadowDistance: 1, innerShadowSharpness: 1.5,
};

const ASPECTS = { square: [1, 1], portrait: [3, 4], landscape: [16, 9], story: [9, 16] } as const;
const RESOS = [480, 720, 1080, 1440] as const;

const TABS = [
  { id: 'scene', label: 'scene', Icon: Images },
  { id: 'camera', label: 'camera', Icon: Camera },
  { id: 'other', label: 'other', Icon: PersonStanding },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Held items — full mcrender catalogue (143), served from /textures/items/<id>.png.
const ITEM_IDS = [
  'amethyst_shard', 'apple', 'arrow', 'axolotl_bucket', 'bamboo', 'barrier', 'bell', 'bone',
  'bow', 'bread', 'breeze_rod', 'brush', 'cake', 'carrot', 'carrot_on_a_stick', 'cod',
  'cod_bucket', 'copper_axe', 'copper_hoe', 'copper_pickaxe', 'copper_shovel', 'copper_spear',
  'copper_spear_in_hand', 'copper_sword', 'crossbow_arrow', 'crossbow_firework',
  'crossbow_standby', 'diamond', 'diamond_axe', 'diamond_hoe', 'diamond_pickaxe',
  'diamond_shovel', 'diamond_spear', 'diamond_spear_in_hand', 'diamond_sword', 'echo_shard',
  'elytra', 'emerald', 'enchanted_book', 'end_crystal', 'ender_eye', 'ender_pearl',
  'experience_bottle', 'fire_charge', 'firework_rocket', 'fishing_rod', 'glow_berries',
  'gold_ingot', 'golden_apple', 'golden_axe', 'golden_carrot', 'golden_hoe', 'golden_pickaxe',
  'golden_shovel', 'golden_spear', 'golden_spear_in_hand', 'golden_sword', 'iron_axe',
  'iron_hoe', 'iron_ingot', 'iron_pickaxe', 'iron_shovel', 'iron_spear', 'iron_spear_in_hand',
  'iron_sword', 'knowledge_book', 'lantern', 'lapis_lazuli', 'lava_bucket', 'lead', 'mace',
  'map', 'melon_slice', 'milk_bucket', 'mushroom_stew', 'music_disc_13', 'music_disc_blocks',
  'music_disc_cat', 'music_disc_chirp', 'music_disc_creator', 'music_disc_creator_music_box',
  'music_disc_far', 'music_disc_lava_chicken', 'music_disc_mall', 'music_disc_mellohi',
  'music_disc_otherside', 'music_disc_pigstep', 'music_disc_precipice', 'music_disc_relic',
  'music_disc_stal', 'music_disc_strad', 'music_disc_tears', 'music_disc_wait',
  'music_disc_ward', 'name_tag', 'nether_star', 'netherite_axe', 'netherite_hoe',
  'netherite_ingot', 'netherite_pickaxe', 'netherite_scrap', 'netherite_shovel',
  'netherite_spear', 'netherite_spear_in_hand', 'netherite_sword', 'ominous_bottle',
  'ominous_trial_key', 'oxidized_copper_lantern', 'potion', 'powder_snow_bucket',
  'pufferfish_bucket', 'raw_copper', 'raw_gold', 'raw_iron', 'recovery_compass_06', 'redstone',
  'resin_brick', 'resin_clump', 'shears', 'stone_axe', 'stone_hoe', 'stone_pickaxe',
  'stone_shovel', 'stone_spear', 'stone_spear_in_hand', 'stone_sword', 'structure_void',
  'totem_of_undying', 'trial_key', 'trident', 'warped_fungus_on_a_stick', 'water_bucket',
  'wheat', 'wind_charge', 'wooden_axe', 'wooden_hoe', 'wooden_pickaxe', 'wooden_shovel',
  'wooden_spear', 'wooden_spear_in_hand', 'wooden_sword', 'writable_book', 'written_book',
];
// mcrender's 3 held-item transform archetypes (sword / tool / generic).
const SWORD_IDS = new Set(['copper_sword', 'diamond_sword', 'golden_sword', 'iron_sword', 'netherite_sword', 'stone_sword', 'wooden_sword']);
const TOOL_RE = /(_axe|_hoe|_pickaxe|_shovel|_spear|_spear_in_hand)$|^(bow|crossbow_|trident|mace|shears|fishing_rod|brush|carrot_on_a_stick|warped_fungus_on_a_stick|lead)$/;
type Vec3 = [number, number, number];
type ItemXform = { pos: Vec3; rot: Vec3; scale: number };
function itemXform(id: string): ItemXform {
  if (SWORD_IDS.has(id)) return { pos: [0, 0.35, -0.6], rot: [0, Math.PI / 2, -Math.PI / 4], scale: 0.075 };
  if (TOOL_RE.test(id)) return { pos: [0, 0.45, -0.35], rot: [0, Math.PI / 2, -Math.PI / 4], scale: 0.085 };
  return { pos: [0, 0.85, 0], rot: [0, 0, 0], scale: 0.05 };
}
// Full per-hand item transform (the settings window edits this live).
type HeldXf = { pos: Vec3; rot: Vec3; scale: Vec3 };
const EMPTY_HELD_XF: HeldXf = { pos: [0, 0.45, -0.35], rot: [0, 0, 0], scale: [0.085, 0.085, 0.085] };
function defaultHeldXf(id: string): HeldXf {
  if (id.startsWith('custom:')) return { pos: [0, 0.45, -0.35], rot: [0, Math.PI / 2, -Math.PI / 4], scale: [0.085, 0.085, 0.085] };
  const x = itemXform(id);
  return { pos: [...x.pos], rot: [...x.rot], scale: [x.scale, x.scale, x.scale] };
}

const ARMOR_TIERS = ['leather', 'chainmail', 'iron', 'gold', 'diamond', 'netherite', 'turtle'] as const;
type ArmorSlots = { helmet: string | null; chestplate: string | null; leggings: string | null; boots: string | null };
const EMPTY_ARMOR: ArmorSlots = { helmet: null, chestplate: null, leggings: null, boots: null };
// Real Minecraft capes (mcrender's exact set + order). texture `/capes/<id>.png`,
// thumbnail `/capes/preview/<id>.png`. Rendered on cape.gltf, not a colour quad.
const CAPES: string[] = [
  'builder', '15', 'bday', 'cherry', 'classic', 'cobalt', 'common', 'con11', 'con12',
  'copper', 'creeper', 'db', 'enderman', 'founder', 'golem', 'home', 'menace', 'migration',
  'million', 'minecon', 'moderator', 'mojang', 'office', 'oxeye', 'pan', 'piston', 'prismarine',
  'purple', 'realms', 'scrolls', 'snowman', 'spade', 'studios', 'test', 'tiktok', 'translator',
  'turtle', 'vanilla', 'villager', 'yearn', 'zombie',
];

// Hats (mcrender's exact set). model gltf on the Head bone, textured per hat,
// thumbnail `/hats/display/<img>`.
const HATS: { id: string; label: string; model: string; tex: string; img: string }[] = [
  { id: 'santa', label: 'santa hat', model: '/hats/hat.gltf', tex: '/hats/santa_hat.png', img: '/hats/display/hat.png' },
  { id: 'fedora', label: 'fedora', model: '/hats/fedora.gltf', tex: '/hats/fedora_texture.png', img: '/hats/display/fedora.png' },
];

export default function StudioPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<StudioApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabId>('scene');
  const [rightMode, setRightMode] = useState<'poses' | 'scene'>('poses');
  const [poseTab, setPoseTab] = useState<'private' | 'published' | 'drafts'>('published');
  const [pose, setPose] = useState<PoseState>(PRESETS.Standing);
  const [username, setUsername] = useState('');
  const [skinErr, setSkinErr] = useState(false);
  const [skinLoading, setSkinLoading] = useState(false);
  const [skinApplied, setSkinApplied] = useState(false);
  const [modelKind, setModelKind] = useState<'classic' | 'slim'>('classic');
  const [status, setStatus] = useState('loading…');

  const [backdrop, setBackdrop] = useState<string>(BACKDROPS[3].css); // mcrender default purple #8B5CF6
  const [floor, setFloor] = useState(false);
  const [floorBlock, setFloorBlock] = useState<string>('/textures/block/dirt.png');
  const [secondLayer, setSecondLayer] = useState(true);
  const [layers3d, setLayers3d] = useState({ on: false, thickness: 0.0625 });
  const [clouds, setClouds] = useState(false);
  const [cloudCfg, setCloudCfg] = useState({ height: 35, size: 12, thickness: 6, density: 100, opacity: 85, drift: 5 });
  const [fog, setFog] = useState(false);
  const [fogColor, setFogColor] = useState('#87ceeb');
  const [fogNear, setFogNear] = useState(10);
  const [fogFar, setFogFar] = useState(100);
  const [customOpen, setCustomOpen] = useState(false);
  const [customHex, setCustomHex] = useState('#4F46E5');
  const [fxOpen, setFxOpen] = useState(false);
  const [fx, setFx] = useState(DEFAULT_FX);
  const [nametag, setNametag] = useState({ show: true, text: 'PLACEHOLDER' });
  const [cape, setCape] = useState<string | null>(null); // texture URL; null = no cape
  const [capeCustom, setCapeCustom] = useState<string | null>(null); // uploaded custom cape data URL
  const [capesExpanded, setCapesExpanded] = useState(false);
  const capeFileRef = useRef<HTMLInputElement | null>(null);
  const [hat, setHat] = useState<string | null>(null); // HATS id; null = no hat
  const [armor, setArmor] = useState<ArmorSlots>(EMPTY_ARMOR);
  const [elytra, setElytra] = useState(false);
  const [mainItem, setMainItem] = useState<string | null>(null);
  const [offItem, setOffItem] = useState<string | null>(null);
  const [heldXf, setHeldXf] = useState<{ main: HeldXf; off: HeldXf }>({ main: EMPTY_HELD_XF, off: EMPTY_HELD_XF });
  const [heldWin, setHeldWin] = useState<'main' | 'off' | null>(null);
  const [heldWinTab, setHeldWinTab] = useState<'rot' | 'pos' | 'scale'>('rot');
  const [heldWinPos, setHeldWinPos] = useState<{ x: number; y: number } | null>(null);
  const [openTool, setOpenTool] = useState<null | 'main' | 'off' | 'armor'>(null);
  // mcrender-style bone editor: visual body-part selector + draggable transform panel.
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const selectedBoneRef = useRef<string | null>(null);
  const pickStart = useRef<{ x: number; y: number } | null>(null);
  const [tcOpen, setTcOpen] = useState(false);
  const [tcMode, setTcMode] = useState<'rotation' | 'position'>('rotation');
  const [boneVals, setBoneVals] = useState({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
  const [tcPos, setTcPos] = useState<{ x: number; y: number } | null>(null);
  // whole-model transform window (the axis3d "model transform" button)
  const [mtOpen, setMtOpen] = useState(false);
  const [mtTab, setMtTab] = useState<'rotation' | 'position'>('rotation');
  const [mtVals, setMtVals] = useState({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
  const [mtPos, setMtPos] = useState<{ x: number; y: number } | null>(null);
  const [lightAmbient, setLightAmbient] = useState(0.8);
  const [lightDir, setLightDir] = useState(2.0);
  const [lightMode, setLightMode] = useState<'presets' | 'custom'>('custom');

  const [reso, setReso] = useState<(typeof RESOS)[number]>(720);
  const [aspect, setAspect] = useState<keyof typeof ASPECTS>('square');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const api = await bootViewer(mount, () => disposed);
      if (disposed || !api) return;
      apiRef.current = api;
      await api.setSkin(FALLBACK_SKIN);
      api.setSceneBg(backdrop);
      api.setPose(PRESETS.Standing);
      api.setCamera('default');
      setStatus('ready');
      cleanup = api.dispose;
    })();
    return () => { disposed = true; apiRef.current = null; cleanup?.(); };
  }, []);

  useEffect(() => { apiRef.current?.setPose(pose); }, [pose]);
  useEffect(() => { apiRef.current?.setFloor(floor); }, [floor]);
  useEffect(() => { apiRef.current?.setSceneBg(backdrop); }, [backdrop]);
  useEffect(() => { apiRef.current?.setSecondLayer(secondLayer); }, [secondLayer]);
  useEffect(() => { apiRef.current?.setFog({ on: fog, color: fogColor, near: fogNear, far: fogFar }); }, [fog, fogColor, fogNear, fogFar]);
  useEffect(() => { apiRef.current?.setFloorTexture(floorBlock); }, [floorBlock]);
  useEffect(() => { apiRef.current?.setClouds(clouds, cloudCfg); }, [clouds, cloudCfg]);
  useEffect(() => { apiRef.current?.setCape(cape); }, [cape]);
  useEffect(() => { apiRef.current?.setHat(hat); }, [hat]);
  useEffect(() => { apiRef.current?.setArmor(armor); }, [armor]);
  useEffect(() => { apiRef.current?.setElytra(elytra); }, [elytra]);
  useEffect(() => { apiRef.current?.setHeld('main', mainItem); }, [mainItem]);
  useEffect(() => { apiRef.current?.setHeld('off', offItem); }, [offItem]);
  useEffect(() => { if (mainItem) apiRef.current?.setHeldTransform('main', heldXf.main); }, [heldXf.main, mainItem]);
  useEffect(() => { if (offItem) apiRef.current?.setHeldTransform('off', heldXf.off); }, [heldXf.off, offItem]);
  useEffect(() => { apiRef.current?.setLighting({ ambient: lightAmbient, directional: lightDir }); }, [lightAmbient, lightDir]);
  // Apply skin from the typed name (on Accept ✓ / Enter): same-origin proxy →
  // Mojang lookup → skin data URI. On success the chooser switches to the
  // [clear · default/slim] state, and the rig is auto-picked from the profile.
  const acceptSkin = useCallback(async () => {
    const v = username.trim();
    if (!SKIN_RE.test(v)) { setSkinErr(true); return; }
    setSkinLoading(true); setSkinErr(false);
    try {
      const r = await fetch(`/api/skin/${encodeURIComponent(v)}`);
      const d = (await r.json()) as { ok: boolean; dataUrl?: string; model?: 'classic' | 'slim' };
      if (d.ok && d.dataUrl) {
        await apiRef.current?.setSkin(d.dataUrl);
        if (d.model) setModelKind(d.model);
        setSkinApplied(true);
      } else setSkinErr(true);
    } catch {
      setSkinErr(true);
    } finally {
      setSkinLoading(false);
    }
  }, [username]);

  const clearSkin = useCallback(() => {
    setUsername(''); setSkinApplied(false); setSkinErr(false); setModelKind('classic');
    apiRef.current?.setSkin(FALLBACK_SKIN);
  }, []);

  // Rig swap (classic ↔ slim): rebuild the model, then re-apply pose + every
  // accessory from current state (read via ref so this only fires on modelKind).
  const reapplyRef = useRef({ pose, mainItem, offItem, hat, cape, armor, elytra, secondLayer, layers3d, fx });
  reapplyRef.current = { pose, mainItem, offItem, hat, cape, armor, elytra, secondLayer, layers3d, fx };
  useEffect(() => {
    const api = apiRef.current; if (!api) return;
    let cancelled = false;
    (async () => {
      await api.setModel(modelKind);
      if (cancelled) return;
      const s = reapplyRef.current;
      api.setSecondLayer(s.secondLayer);
      api.set3DLayers(s.layers3d.on, s.layers3d.thickness);
      api.setPose(s.pose);
      api.setHeld('main', s.mainItem); api.setHeld('off', s.offItem);
      await api.setHat(s.hat);
      api.setCape(s.cape);
      await api.setArmor(s.armor);
      await api.setElytra(s.elytra);
      api.setOutline({ enabled: s.fx.outline, color: s.fx.outlineColor });
      api.setInnerShadow({ enabled: s.fx.innerShadow, color: s.fx.innerShadowColor, intensity: s.fx.innerShadowIntensity, distance: s.fx.innerShadowDistance, sharpness: s.fx.innerShadowSharpness });
    })();
    return () => { cancelled = true; };
  }, [modelKind]);

  const setAxis = useCallback((bk: string, ax: Axis, val: number) => {
    setPose((p) => ({ ...p, [bk]: { ...p[bk], [ax]: val } }));
  }, []);

  const selectBone = useCallback((name: string) => {
    setSelectedBone(name);
    setTcOpen(true);
    const v = apiRef.current?.getBone(name);
    if (v) setBoneVals(v);
  }, []);
  const onBoneRot = (axis: 'x' | 'y' | 'z', deg: number) => {
    if (!selectedBone) return;
    apiRef.current?.setBoneRot(selectedBone, axis, deg);
    setBoneVals((v) => ({ ...v, ['r' + axis]: deg } as typeof v));
  };
  const onBonePos = (axis: 'x' | 'y' | 'z', val: number) => {
    if (!selectedBone) return;
    apiRef.current?.setBonePos(selectedBone, axis, val);
    setBoneVals((v) => ({ ...v, ['p' + axis]: val } as typeof v));
  };
  const onBoneReset = (kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => {
    if (!selectedBone) return;
    apiRef.current?.resetBoneAxis(selectedBone, kind, axis);
    const v = apiRef.current?.getBone(selectedBone); if (v) setBoneVals(v);
  };
  const startDragTc = (e: React.PointerEvent) => {
    e.preventDefault();
    const panel = e.currentTarget.parentElement as HTMLElement; const r = panel.getBoundingClientRect();
    const offX = e.clientX - r.left, offY = e.clientY - r.top;
    const move = (ev: PointerEvent) => setTcPos({ x: ev.clientX - offX, y: ev.clientY - offY });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // Whole-model transform window (axis3d button) — rotates/moves the entire rig.
  const toggleModelWin = useCallback(() => {
    setMtOpen((o) => {
      const next = !o;
      if (next) { const v = apiRef.current?.getModel(); if (v) setMtVals(v); }
      return next;
    });
  }, []);
  const onModelRot = (axis: 'x' | 'y' | 'z', deg: number) => {
    apiRef.current?.setModelRot(axis, deg);
    setMtVals((v) => ({ ...v, ['r' + axis]: deg } as typeof v));
  };
  const onModelPos = (axis: 'x' | 'y' | 'z', val: number) => {
    apiRef.current?.setModelPos(axis, val);
    setMtVals((v) => ({ ...v, ['p' + axis]: val } as typeof v));
  };
  const onModelReset = (kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => {
    apiRef.current?.resetModelAxis(kind, axis);
    const v = apiRef.current?.getModel(); if (v) setMtVals(v);
  };
  const startDragMt = (e: React.PointerEvent) => {
    e.preventDefault();
    const panel = e.currentTarget.parentElement as HTMLElement; const r = panel.getBoundingClientRect();
    const offX = e.clientX - r.left, offY = e.clientY - r.top;
    const move = (ev: PointerEvent) => setMtPos({ x: ev.clientX - offX, y: ev.clientY - offY });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // Viewport rotation gizmo: attach the X/Y/Z rings to whatever's being edited —
  // the model wrapper (when the model-transform window is open) takes priority,
  // else the selected bone. Mode follows the active tab (rotate vs translate).
  useEffect(() => { selectedBoneRef.current = selectedBone; }, [selectedBone]);
  useEffect(() => {
    const api = apiRef.current; if (!api) return;
    if (mtOpen) {
      api.gizmoModel(true, mtTab === 'rotation' ? 'rotate' : 'translate');
      api.setGizmoMode(mtTab === 'rotation' ? 'rotate' : 'translate');
      api.onGizmo(() => { const v = apiRef.current?.getModel(); if (v) setMtVals(v); });
    } else if (selectedBone) {
      api.gizmoAttach(selectedBone);
      api.setGizmoMode(tcMode === 'rotation' ? 'rotate' : 'translate');
      api.onGizmo(() => { const b = selectedBoneRef.current; if (!b) return; const v = apiRef.current?.getBone(b); if (v) setBoneVals(v); });
    } else {
      api.gizmoAttach(null);
      api.onGizmo(null);
    }
  }, [selectedBone, tcMode, mtOpen, mtTab]);

  // Editor hotkeys: R = rotate tab, T = move/position tab, Esc = deselect/close.
  // Ignored while typing in a field (skin-name search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'r') { if (mtOpen) setMtTab('rotation'); else if (selectedBone) setTcMode('rotation'); }
      else if (k === 't') { if (mtOpen) setMtTab('position'); else if (selectedBone) setTcMode('position'); }
      else if (e.key === 'Escape') {
        if (mtOpen) setMtOpen(false);
        else if (selectedBone) { setSelectedBone(null); setTcOpen(false); }
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBone, mtOpen]);

  // Held-item pickers + transform window.
  const pickItem = useCallback((hand: 'main' | 'off', id: string | null) => {
    if (hand === 'main') setMainItem(id); else setOffItem(id);
    if (id) setHeldXf((h) => ({ ...h, [hand]: defaultHeldXf(id) }));
    else setHeldWin((w) => (w === hand ? null : w));
  }, []);
  const onHeldAxis = (kind: 'pos' | 'rot' | 'scale', axis: number, val: number) => {
    if (!heldWin) return;
    setHeldXf((h) => {
      const cur = h[heldWin];
      const arr = cur[kind].map((v, i) => (i === axis ? val : v)) as Vec3;
      return { ...h, [heldWin]: { ...cur, [kind]: arr } };
    });
  };
  const onHeldReset = (kind: 'pos' | 'rot' | 'scale', axis: number) => {
    if (!heldWin) return;
    const id = heldWin === 'main' ? mainItem : offItem; if (!id) return;
    const def = defaultHeldXf(id);
    setHeldXf((h) => {
      const cur = h[heldWin];
      const arr = cur[kind].map((v, i) => (i === axis ? def[kind][i] : v)) as Vec3;
      return { ...h, [heldWin]: { ...cur, [kind]: arr } };
    });
  };
  const startDragHeld = (e: React.PointerEvent) => {
    e.preventDefault();
    const panel = e.currentTarget.parentElement as HTMLElement; const r = panel.getBoundingClientRect();
    const offX = e.clientX - r.left, offY = e.clientY - r.top;
    const move = (ev: PointerEvent) => setHeldWinPos({ x: ev.clientX - offX, y: ev.clientY - offY });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    apiRef.current?.setSkin(URL.createObjectURL(f));
    setUsername(''); setSkinErr(false); setSkinApplied(true);
  };

  useEffect(() => { apiRef.current?.setBloom({ enabled: fx.bloom, intensity: fx.bloomIntensity, threshold: fx.bloomThreshold }); }, [fx.bloom, fx.bloomIntensity, fx.bloomThreshold]);
  useEffect(() => { apiRef.current?.setChromatic({ enabled: fx.chromatic, offset: fx.chromaticOffset }); }, [fx.chromatic, fx.chromaticOffset]);
  useEffect(() => { apiRef.current?.setVignette({ enabled: fx.vignette, darkness: fx.vignetteDark, offset: fx.vignetteOffset }); }, [fx.vignette, fx.vignetteDark, fx.vignetteOffset]);
  useEffect(() => { apiRef.current?.setSaturation(fx.saturation); }, [fx.saturation]);
  useEffect(() => { apiRef.current?.setContrast(fx.contrast); }, [fx.contrast]);
  useEffect(() => { apiRef.current?.setOutline({ enabled: fx.outline, color: fx.outlineColor }); }, [fx.outline, fx.outlineColor]);
  useEffect(() => { apiRef.current?.setInnerShadow({ enabled: fx.innerShadow, color: fx.innerShadowColor, intensity: fx.innerShadowIntensity, distance: fx.innerShadowDistance, sharpness: fx.innerShadowSharpness }); }, [fx.innerShadow, fx.innerShadowColor, fx.innerShadowIntensity, fx.innerShadowDistance, fx.innerShadowSharpness]);
  useEffect(() => { apiRef.current?.set3DLayers(layers3d.on, layers3d.thickness); }, [layers3d]);
  useEffect(() => { apiRef.current?.setNametag(nametag.show, nametag.text); }, [nametag.show, nametag.text]);
  const isGradient = backdrop.startsWith('linear-gradient');

  const download = async () => {
    const api = apiRef.current; if (!api) return;
    const [aw, ah] = ASPECTS[aspect];
    const h = reso, w = Math.round((h * aw) / ah);
    const blob = await api.exportPNG({
      width: w, height: h,
      backdrop: backdrop === 'transparent' ? null : backdrop,
      filter: 'none', vignette: 0, // sat/contrast/vignette baked by the composer now
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'character.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  };

  const activeIdx = TABS.findIndex((t) => t.id === tab);

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#09090b] text-zinc-100">
      {/* ───────── Site header ───────── */}
      <header className="sticky top-0 z-50 flex-none border-b-[1.5px] border-zinc-800 bg-[#09090b]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-2.5">
          <a href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-white text-[11px] font-black text-black">CC</span>
            <span className="text-lg font-bold lowercase tracking-tight sm:text-xl">clan capes</span>
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            <a href="/studio" className="rounded-full bg-zinc-800/70 px-4 py-1.5 text-sm font-semibold lowercase">studio</a>
            <a href="/login-preview/v9" className="rounded-full px-4 py-1.5 text-sm font-semibold lowercase text-zinc-300 hover:bg-zinc-800/60 hover:text-white">scene</a>
            <a href="/avagen" className="rounded-full px-4 py-1.5 text-sm font-semibold lowercase text-zinc-300 hover:bg-zinc-800/60 hover:text-white">avatars</a>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 sm:inline">{status}</span>
            <span className="h-6 w-px bg-zinc-800" />
            <a href="/login-preview" className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold ring-2 ring-transparent transition hover:ring-white/20">CC</a>
          </div>
        </div>
      </header>

      {/* ───────── Studio body (mcrender 3-column) ───────── */}
      <div className="flex min-h-0 flex-1">
        {/* ===== Left toolbar: body-part selector + tools ===== */}
        <aside className="hidden w-14 flex-none flex-col items-center border-r border-zinc-800 py-4 sm:flex">
          <div className="flex flex-col items-center gap-1">
            <BoneSeg bone="Head" w="w-5" h="h-5" sel={selectedBone} onSelect={selectBone} />
            <div className="flex items-start gap-0.5">
              <div className="flex flex-col gap-0.5">
                <BoneSeg bone="ArmLeftUpper" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
                <BoneSeg bone="ArmLeftLower" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
              </div>
              <BoneSeg bone="Body" w="w-5" h="h-7" sel={selectedBone} onSelect={selectBone} />
              <div className="flex flex-col gap-0.5">
                <BoneSeg bone="ArmRightUpper" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
                <BoneSeg bone="ArmRightLower" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
              </div>
            </div>
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5">
                <BoneSeg bone="LegLeftUpper" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
                <BoneSeg bone="LegLeftLower" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
              </div>
              <div className="flex flex-col gap-0.5">
                <BoneSeg bone="LegRightUpper" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
                <BoneSeg bone="LegRightLower" w="w-2" h="h-3.5" sel={selectedBone} onSelect={selectBone} />
              </div>
            </div>
          </div>
          <div className="my-4 h-px w-7 bg-zinc-800" />
          <ToolIcon Icon={MousePointer2} title="Select bone" active onClick={() => { if (!selectedBone) selectBone('Head'); }} />
          <ToolIcon Icon={Hand} title="Pan" />
        </aside>

        {/* ===== Center viewport (fills edge-to-edge) ===== */}
        <section className="relative min-h-0 flex-1 overflow-hidden">
              {/* canvas */}
              <div className="relative h-full min-h-0 w-full overflow-hidden">
                {/* 3D backdrop */}
                <div className="pointer-events-none absolute inset-0" style={{ background: isGradient ? undefined : (backdrop === 'transparent' ? 'transparent' : backdrop), backgroundImage: isGradient ? backdrop : undefined }} />
                {/* model — saturation/contrast/vignette/inner-shadow now in the engine.
                    A clean click (no drag) while transform mode is on picks the body part
                    under the cursor on the model itself (mcrender behaviour). */}
                <div ref={mountRef} className="relative h-full w-full"
                  onPointerDown={(e) => { pickStart.current = { x: e.clientX, y: e.clientY }; }}
                  onPointerUp={(e) => {
                    const s = pickStart.current; pickStart.current = null;
                    if (!s || !selectedBoneRef.current) return;
                    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) return; // was a drag/orbit
                    const r = e.currentTarget.getBoundingClientRect();
                    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
                    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
                    const name = apiRef.current?.pickBone(nx, ny);
                    if (name) selectBone(name);
                    else { setSelectedBone(null); setTcOpen(false); } // clicked empty → hide axes
                  }} />
                {/* Selected-part badge (top-centre), like mcrender */}
                {selectedBone && (
                  <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-md backdrop-blur-sm">
                    <CircleCheck className="h-4 w-4 text-emerald-400" /> Selected {BONES.find((b) => b.key === selectedBone)?.label ?? selectedBone}
                  </div>
                )}
                {/* nametag is now a 3D billboard sprite in the scene (floats above the head, faces camera) */}
                {/* crop frame — reflects the selected aspect ratio live + corner brackets */}
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
                  <div className="relative rounded-md ring-2 ring-white/50"
                    style={{
                      aspectRatio: `${ASPECTS[aspect][0]} / ${ASPECTS[aspect][1]}`,
                      width: ASPECTS[aspect][0] >= ASPECTS[aspect][1] ? '100%' : undefined,
                      height: ASPECTS[aspect][0] >= ASPECTS[aspect][1] ? undefined : '100%',
                      maxWidth: '100%', maxHeight: '100%',
                      boxShadow: 'rgba(0,0,0,0.45) 0 0 0 2px, rgba(255,255,255,0.08) 0 0 20px inset',
                    }}>
                    <span className="absolute -left-1.5 -top-1.5 h-5 w-5 rounded-tl-md border-l-[3px] border-t-[3px] border-white" />
                    <span className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-tr-md border-r-[3px] border-t-[3px] border-white" />
                    <span className="absolute -bottom-1.5 -left-1.5 h-5 w-5 rounded-bl-md border-b-[3px] border-l-[3px] border-white" />
                    <span className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-br-md border-b-[3px] border-r-[3px] border-white" />
                  </div>
                </div>
                {/* open transform controls — toggles the gizmo: 1st press shows it on the
                    Head, 2nd press hides the axes (deselect). */}
                <button onClick={() => { if (selectedBone) { setSelectedBone(null); setTcOpen(false); } else selectBone('Head'); }}
                  className={`absolute right-3 top-3 z-30 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition ${selectedBone ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800'}`}>
                  open transform controls
                </button>

                {/* floating accessory toolbar + popovers */}
                <div className="absolute bottom-3 left-3 z-30">
                  {openTool && (
                    <div className="absolute bottom-full left-0 mb-2 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl backdrop-blur-sm">
                      {openTool === 'main' && <ItemPicker hand="main" value={mainItem} onPick={(id) => pickItem('main', id)} />}
                      {openTool === 'off' && <ItemPicker hand="off" value={offItem} onPick={(id) => pickItem('off', id)} />}
                      {openTool === 'armor' && (
                        <div className="w-64">
                          <div className="mb-2 text-xs font-semibold lowercase">armor & elytra</div>
                          <ArmorSlots armor={armor} setArmor={setArmor} elytra={elytra} setElytra={setElytra} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700/70 bg-zinc-900/90 p-1 shadow-md backdrop-blur-sm">
                    {/* main hand: item thumbnail + settings gear */}
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setOpenTool((t) => (t === 'main' ? null : 'main'))} title="Select main hand item"
                        className={`relative h-9 w-9 overflow-hidden rounded-lg transition ${openTool === 'main' || mainItem ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-zinc-800'}`}>
                        {mainItem && !mainItem.startsWith('custom:')
                          ? <img src={`/textures/items/${mainItem}.png`} alt="" className="h-full w-full object-contain p-1 [image-rendering:pixelated]" />
                          : <span className="grid h-full w-full place-items-center text-zinc-300"><Sword className="h-[18px] w-[18px]" /></span>}
                      </button>
                      {mainItem && (
                        <button onClick={() => { setOpenTool(null); setHeldWin((w) => (w === 'main' ? null : 'main')); }} title="main hand settings"
                          className={`grid h-9 w-7 place-items-center rounded-lg transition ${heldWin === 'main' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* off hand */}
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setOpenTool((t) => (t === 'off' ? null : 'off'))} title="Select off hand item"
                        className={`relative h-9 w-9 overflow-hidden rounded-lg transition ${openTool === 'off' || offItem ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-zinc-800'}`}>
                        {offItem && !offItem.startsWith('custom:')
                          ? <img src={`/textures/items/${offItem}.png`} alt="" className="h-full w-full object-contain p-1 [image-rendering:pixelated]" />
                          : <span className="grid h-full w-full place-items-center text-zinc-400"><Hand className="h-[18px] w-[18px]" /></span>}
                      </button>
                      {offItem && (
                        <button onClick={() => { setOpenTool(null); setHeldWin((w) => (w === 'off' ? null : 'off')); }} title="off hand settings"
                          className={`grid h-9 w-7 place-items-center rounded-lg transition ${heldWin === 'off' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* armor */}
                    <button onClick={() => setOpenTool((t) => (t === 'armor' ? null : 'armor'))} title="Armor & elytra"
                      className={`grid h-9 w-9 place-items-center rounded-lg transition ${openTool === 'armor' || Object.values(armor).some(Boolean) || elytra ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                      <Shield className="h-[18px] w-[18px]" />
                    </button>
                    <span className="mx-0.5 h-5 w-px bg-zinc-700" />
                    {/* model transform */}
                    <button onClick={toggleModelWin} title="Model Transform"
                      className={`grid h-9 w-9 place-items-center rounded-lg transition hover:bg-zinc-800 hover:text-white ${mtOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}>
                      <Axis3d className="h-[17px] w-[17px]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* floating bottom bar (centered over the viewport, mcrender-style) */}
              <div className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2">
                <div className={`flex h-9 min-w-0 max-w-[300px] flex-1 items-center gap-1 rounded-lg border bg-[#09090b] px-2 transition-colors ${skinErr ? 'border-red-500/70' : 'border-zinc-700 focus-within:border-white/40'}`}>
                  {!skinApplied ? (
                    <>
                      <User className={`ml-1 h-4 w-4 shrink-0 ${skinLoading ? 'animate-pulse text-white' : skinErr ? 'text-red-400' : 'text-zinc-500'}`} />
                      <input value={username} type="search" spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="none"
                        onChange={(e) => { setUsername(e.target.value); setSkinErr(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') acceptSkin(); }}
                        placeholder="minecraft player name"
                        className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-medium outline-none placeholder:font-normal placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden" />
                      {skinErr && <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-red-400">not found</span>}
                      {username && (
                        <button onClick={() => { setUsername(''); setSkinErr(false); }} title="clear"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-zinc-400 transition hover:bg-zinc-700 hover:text-white">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={acceptSkin} disabled={!SKIN_RE.test(username.trim()) || skinLoading} title="apply skin"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-zinc-800 text-zinc-300 transition enabled:hover:bg-white enabled:hover:text-black disabled:opacity-40">
                        <CircleCheck className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={clearSkin} title="remove skin"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-zinc-800 text-zinc-400 transition hover:bg-red-600 hover:text-white">
                        <Ban className="h-4 w-4" />
                      </button>
                      <ModelInline value={modelKind} onPick={setModelKind} />
                    </>
                  )}
                  <button onClick={() => fileRef.current?.click()} title="upload skin PNG"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-white hover:text-black">
                    <Upload className="h-4 w-4" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/png" hidden onChange={onUpload} />
                </div>
                <Dropdown value={`${reso}p`} badge="HD" options={RESOS.map((r) => `${r}p`)} onPick={(v) => setReso(+v.replace('p', '') as (typeof RESOS)[number])} />
                <Dropdown value={`${aspect} (${ASPECTS[aspect][0]}:${ASPECTS[aspect][1]})`} options={Object.keys(ASPECTS).map((a) => `${a} (${ASPECTS[a as keyof typeof ASPECTS][0]}:${ASPECTS[a as keyof typeof ASPECTS][1]})`)} onPick={(v) => setAspect(v.split(' ')[0] as keyof typeof ASPECTS)} />
              </div>
        </section>

        {/* ===== Settings sidebar (fixed width, mcrender ~360px) ===== */}
        <aside className="flex min-h-0 w-full flex-none flex-col border-t border-zinc-800 sm:w-[340px] sm:border-l sm:border-t-0 lg:w-[360px]">
          {/* right-panel mode: poses (mcrender default) | scene settings */}
          <div className="flex-none px-3 pt-3">
            <div className="flex gap-1 rounded-lg bg-zinc-900/60 p-1">
              {(['poses', 'scene'] as const).map((m) => (
                <button key={m} onClick={() => setRightMode(m)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold lowercase transition ${rightMode === m ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>{m}</button>
              ))}
            </div>
          </div>

          {rightMode === 'poses' ? (
            <PosesPanel poseTab={poseTab} setPoseTab={setPoseTab} />
          ) : (
          <>
          {/* tabs */}
          <div className="flex-none p-3">
            <div className="relative flex rounded-2xl bg-zinc-900/60 p-1">
              <span className="absolute top-1 z-0 rounded-xl bg-white transition-all duration-200"
                style={{ height: 'calc(100% - 8px)', width: `calc(${100 / TABS.length}% - 4px)`, left: `calc(${(activeIdx * 100) / TABS.length}% + 2px)` }} />
              {TABS.map((t) => {
                const on = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold lowercase transition-colors ${on ? 'text-black' : 'text-zinc-400 hover:text-white'}`}>
                    <t.Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* scroll content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {tab === 'scene' && (
              <div className="space-y-5">
                {/* backdrop color */}
                <div>
                  <H3>backdrop color</H3>
                  <div className="flex flex-wrap gap-2">
                    {BACKDROPS.map((b) => (
                      <button key={b.css} onClick={() => { setBackdrop(b.css); setCustomOpen(false); }} title={b.label}
                        className={`group relative h-8 w-8 rounded-lg border-2 transition-all hover:scale-105 ${backdrop === b.css ? 'border-white' : 'border-zinc-700 hover:border-zinc-500'}`}
                        style={{ background: b.css === 'transparent' ? 'repeating-conic-gradient(#3f3f46 0% 25%,#27272a 0% 50%) 50%/10px 10px' : b.css }}>
                        {b.label === 'White' && <span className="absolute inset-0.5 rounded-md border border-zinc-300/30" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* gradients */}
                <div>
                  <H3>gradients</H3>
                  <div className="flex flex-wrap gap-2">
                    {GRADIENTS.map((g) => (
                      <button key={g.label} onClick={() => { setBackdrop(g.css); setCustomOpen(false); }} title={g.label}
                        className={`group relative h-8 w-16 rounded-lg border-2 transition-all hover:scale-105 ${backdrop === g.css ? 'border-white shadow-md' : 'border-zinc-700 hover:border-zinc-500'}`}
                        style={{ backgroundImage: g.css }}>
                        {backdrop === g.css && <Check className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* custom color */}
                <div className="space-y-2">
                  <button onClick={() => setCustomOpen((o) => !o)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${customOpen || backdrop === customHex ? 'border-white/70 bg-white/5 text-white' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>
                    <Palette className="h-3 w-3" /> custom color
                    {backdrop === customHex && <Check className="ml-auto h-3 w-3" />}
                  </button>
                  {customOpen && (
                    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
                      <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(customHex) ? customHex : '#4F46E5'}
                          onChange={(e) => setCustomHex(e.target.value.toUpperCase())}
                          className="h-9 w-12 cursor-pointer rounded-md border border-zinc-700 bg-transparent p-0.5" />
                        <input value={customHex} onChange={(e) => setCustomHex(e.target.value)}
                          className="h-9 flex-1 rounded-md border border-zinc-700 bg-[#09090b] px-3 font-mono text-sm uppercase outline-none focus:border-white/40" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setBackdrop(customHex)} className="h-9 flex-1 rounded-md bg-white font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black hover:bg-white/90">Apply</button>
                        <button onClick={() => setCustomOpen(false)} className="h-9 rounded-md border border-zinc-700 px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300 hover:bg-zinc-800">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* render options */}
                <div>
                  <H3>render options</H3>
                  <div className="space-y-2">
                    <CheckCard label="render second layer" checked={secondLayer} onChange={setSecondLayer} />
                    {/* 3D skin layers + thickness */}
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                      <CheckRow label="3D skin layers" checked={layers3d.on} onChange={(v) => setLayers3d((s) => ({ ...s, on: v }))} />
                      {layers3d.on && (
                        <div className="mt-2 border-t border-zinc-800/60 pt-3">
                          <Row label="thickness" min={0.015} max={0.15} step={0.005} value={layers3d.thickness} onChange={(v) => setLayers3d((s) => ({ ...s, thickness: v }))} unit="px" display={(v) => (v / 0.0625).toFixed(2)} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                      <CheckRow label="show floor" checked={floor} onChange={setFloor} />
                      {floor && (
                        <div className="mt-2 space-y-2 border-t border-zinc-800/60 pt-3">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">floor block</div>
                          <div className="grid grid-cols-6 gap-2">
                            {FLOOR_BLOCKS.map((b) => (
                              <button key={b.url} onClick={() => setFloorBlock(b.url)} title={b.label}
                                className={`relative aspect-square overflow-hidden rounded border-2 transition-all hover:scale-110 ${floorBlock === b.url ? 'border-white ring-2 ring-white/20' : 'border-zinc-700 hover:border-zinc-500'}`}>
                                <img src={b.url} alt={b.label} loading="lazy" className="h-full w-full object-cover [image-rendering:pixelated]" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* clouds + height/size/thickness/density/opacity/drift */}
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                      <CheckRow label="show clouds" checked={clouds} onChange={setClouds} />
                      {clouds && (
                        <div className="mt-2 space-y-4 border-t border-zinc-800/60 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500">height</span>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setCloudCfg((c) => ({ ...c, height: Math.max(5, c.height - 5) }))} className="grid h-7 w-7 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">−</button>
                              <span className="min-w-10 text-center font-mono text-xs tabular-nums text-zinc-200">{cloudCfg.height}</span>
                              <button onClick={() => setCloudCfg((c) => ({ ...c, height: Math.min(200, c.height + 5) }))} className="grid h-7 w-7 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">+</button>
                            </div>
                          </div>
                          <Row label="size" min={6} max={24} step={1} value={cloudCfg.size} onChange={(v) => setCloudCfg((c) => ({ ...c, size: v }))} />
                          <Row label="thickness" min={2} max={14} step={1} value={cloudCfg.thickness} onChange={(v) => setCloudCfg((c) => ({ ...c, thickness: v }))} />
                          <Row label="density" min={15} max={100} step={1} value={cloudCfg.density} onChange={(v) => setCloudCfg((c) => ({ ...c, density: v }))} unit="%" />
                          <Row label="opacity" min={40} max={100} step={1} value={cloudCfg.opacity} onChange={(v) => setCloudCfg((c) => ({ ...c, opacity: v }))} unit="%" />
                          <Row label="drift speed" min={0} max={15} step={1} value={cloudCfg.drift} onChange={(v) => setCloudCfg((c) => ({ ...c, drift: v }))} />
                        </div>
                      )}
                    </div>
                    {/* fog + color/near/far */}
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                      <CheckRow label="show fog" checked={fog} onChange={setFog} />
                      {fog && (
                        <div className="mt-2 space-y-2 border-t border-zinc-800/60 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400">fog color</span>
                            <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} className="h-5 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent" />
                          </div>
                          <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>Near: {fogNear}</span><span>Far: {fogFar}</span>
                          </div>
                          <Row label="Near" min={0} max={100} step={1} value={fogNear} onChange={setFogNear} />
                          <Row label="Far" min={10} max={500} step={1} value={fogFar} onChange={setFogFar} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* effects (collapsible) */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <button onClick={() => setFxOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium text-zinc-200 hover:text-white">
                      <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${fxOpen ? '' : '-rotate-90'}`} /> effects
                    </button>
                    <button onClick={() => setFx(DEFAULT_FX)}
                      className="rounded border border-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200">reset all</button>
                  </div>
                  {fxOpen && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                        <Row label="saturation" signed min={-1} max={1} step={0.01} value={fx.saturation} onChange={(v) => setFx((f) => ({ ...f, saturation: v }))} />
                        <p className="mt-1 text-[10px] text-zinc-500">negative desaturates, positive boosts color</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                        <Row label="contrast" signed min={-1} max={1} step={0.01} value={fx.contrast} onChange={(v) => setFx((f) => ({ ...f, contrast: v }))} />
                        <p className="mt-1 text-[10px] text-zinc-500">negative flattens, positive adds punch</p>
                      </div>
                      <FxBlock label="vignette" checked={fx.vignette} onToggle={(v) => setFx((f) => ({ ...f, vignette: v }))}>
                        <Row label="darkness" min={0} max={1} step={0.01} value={fx.vignetteDark} onChange={(v) => setFx((f) => ({ ...f, vignetteDark: v }))} />
                        <Row label="offset" min={0} max={1} step={0.01} value={fx.vignetteOffset} onChange={(v) => setFx((f) => ({ ...f, vignetteOffset: v }))} />
                      </FxBlock>
                      <FxBlock label="bloom / glow" checked={fx.bloom} onToggle={(v) => setFx((f) => ({ ...f, bloom: v }))}>
                        <Row label="intensity" min={0} max={3} step={0.1} value={fx.bloomIntensity} onChange={(v) => setFx((f) => ({ ...f, bloomIntensity: v }))} />
                        <Row label="threshold" min={0} max={1} step={0.05} value={fx.bloomThreshold} onChange={(v) => setFx((f) => ({ ...f, bloomThreshold: v }))} />
                      </FxBlock>
                      <FxBlock label="chromatic aberration" checked={fx.chromatic} onToggle={(v) => setFx((f) => ({ ...f, chromatic: v }))}>
                        <Row label="offset" min={0} max={0.02} step={0.001} value={fx.chromaticOffset} onChange={(v) => setFx((f) => ({ ...f, chromaticOffset: v }))} />
                      </FxBlock>
                      <FxBlock label="model outline" checked={fx.outline} onToggle={(v) => setFx((f) => ({ ...f, outline: v }))}>
                        <FxColor label="outline color" value={fx.outlineColor} onChange={(c) => setFx((f) => ({ ...f, outlineColor: c }))} />
                      </FxBlock>
                      <FxBlock label="inner shadow" checked={fx.innerShadow} onToggle={(v) => setFx((f) => ({ ...f, innerShadow: v }))}>
                        <FxColor label="shadow color" value={fx.innerShadowColor} onChange={(c) => setFx((f) => ({ ...f, innerShadowColor: c }))} />
                        <Row label="intensity" min={0} max={1} step={0.05} value={fx.innerShadowIntensity} onChange={(v) => setFx((f) => ({ ...f, innerShadowIntensity: v }))} />
                        <Row label="distance" min={0.5} max={5} step={0.1} value={fx.innerShadowDistance} onChange={(v) => setFx((f) => ({ ...f, innerShadowDistance: v }))} />
                        <Row label="sharpness" min={0.5} max={5} step={0.1} value={fx.innerShadowSharpness} onChange={(v) => setFx((f) => ({ ...f, innerShadowSharpness: v }))} />
                      </FxBlock>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'camera' && (
              <div className="space-y-5">
                <div>
                  <H3>camera presets</H3>
                  <div className="flex flex-wrap gap-2">
                    {(['front', 'back', 'left', 'right', 'top', 'isometric'] as CamPreset[]).map((p) => (
                      <CamBtn key={p} onClick={() => apiRef.current?.setCamera(p)}>{p}</CamBtn>
                    ))}
                  </div>
                </div>
                <div>
                  <H3>portrait views</H3>
                  <div className="flex flex-wrap gap-2">
                    {([['portrait', 'portrait'], ['headshot', 'headshot'], ['overShoulder', 'over shoulder'], ['hero', 'hero angle'], ['closeup', 'close-up'], ['thumbLeft', 'thumb left'], ['thumbRight', 'thumb right']] as [CamPreset, string][]).map(([p, lbl]) => (
                      <CamBtn key={p} onClick={() => apiRef.current?.setCamera(p)}>{lbl}</CamBtn>
                    ))}
                  </div>
                </div>
                <div>
                  <H3>pose presets</H3>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(NODE_POSES).map((k) => (
                      <CamBtn key={k} onClick={() => apiRef.current?.setNode(NODE_POSES[k])}>{k} ★</CamBtn>
                    ))}
                    {Object.keys(PRESETS).map((k) => (
                      <CamBtn key={k} onClick={() => setPose(PRESETS[k])}>{k}</CamBtn>
                    ))}
                    <CamBtn onClick={() => setPose(ZERO_POSE())}>reset</CamBtn>
                  </div>
                </div>
              </div>
            )}

            {tab === 'other' && (
              <div className="space-y-4">
                {/* nametag */}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <h1 className="font-bold">nametag</h1>
                    <Tag className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                    <CheckRow label="show nametag above player" checked={nametag.show} onChange={(v) => setNametag((n) => ({ ...n, show: v }))} />
                    <div className="mt-2 space-y-2 border-t border-zinc-800/60 pt-3">
                      <label className="text-xs font-medium text-zinc-400">text</label>
                      <input value={nametag.text} maxLength={24} onChange={(e) => setNametag((n) => ({ ...n, text: e.target.value }))}
                        className="h-8 w-full rounded-md border border-zinc-700 bg-transparent px-3 text-sm outline-none focus:border-white/40" placeholder="PLACEHOLDER" />
                      <p className="text-[11px] text-zinc-500">tag floats above the player and always faces the camera.</p>
                    </div>
                  </div>
                </div>

                <Divider />

                {/* capes — mcrender's real cape set (cape.gltf + per-cape texture) */}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <h1 className="font-bold">capes</h1>
                    <button type="button" disabled title="cape settings" aria-label="cape settings"
                      className="pointer-events-none rounded-full p-2 text-zinc-500 opacity-30">
                      <Settings2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* custom upload */}
                    <button type="button" onClick={() => capeFileRef.current?.click()} aria-label="upload custom cape"
                      className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded p-2 text-center transition-all ${cape && cape === capeCustom ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                      <Upload className="h-5 w-5 text-zinc-400" />
                      <span className="text-[10px] lowercase text-zinc-400">custom cape</span>
                    </button>
                    {/* no cape */}
                    <button type="button" onClick={() => setCape(null)} aria-label="select no cape" title="no cape"
                      className={`flex h-24 cursor-pointer items-center justify-center rounded p-2 transition-all ${cape === null ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                      <img alt="no cape" src="/barrier.png" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    </button>
                    {/* uploaded custom preview */}
                    {capeCustom && (
                      <button type="button" onClick={() => setCape(capeCustom)} aria-label="select custom cape" title="custom"
                        className={`flex h-24 cursor-pointer items-center justify-center rounded p-2 transition-all ${cape === capeCustom ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                        <img alt="custom" src={capeCustom} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      </button>
                    )}
                    {/* preset capes */}
                    {(capesExpanded ? CAPES : CAPES.slice(0, 5)).map((id) => {
                      const url = `/capes/${id}.png`;
                      return (
                        <button key={id} type="button" onClick={() => setCape(url)} title={id} aria-label={`select ${id} cape`}
                          className={`flex h-24 cursor-pointer items-center justify-center rounded p-2 transition-all ${cape === url ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                          <img alt={id} src={`/capes/preview/${id}.png`} loading="lazy" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => setCapesExpanded((v) => !v)}
                    className="mt-2 cursor-pointer px-1 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200 hover:underline">
                    {capesExpanded ? 'show less' : 'show more'}
                  </button>
                  <input ref={capeFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-hidden="true" tabIndex={-1}
                    onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const r = new FileReader();
                      r.onload = () => { const url = String(r.result); setCapeCustom(url); setCape(url); };
                      r.readAsDataURL(f);
                      e.target.value = '';
                    }} />
                </div>

                <Divider />

                {/* hats — mcrender's real hat set (gltf + texture on the Head bone) */}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <h1 className="font-bold">hats</h1>
                    <button type="button" disabled title="hat settings" aria-label="hat settings"
                      className="pointer-events-none rounded-full p-2 text-zinc-500 opacity-30">
                      <Settings2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* no hat */}
                    <button type="button" onClick={() => setHat(null)} aria-label="select no hat" title="no hat"
                      className={`flex h-24 cursor-pointer items-center justify-center rounded p-2 transition-all ${hat === null ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                      <img alt="no hat" src="/barrier.png" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    </button>
                    {HATS.map((h) => (
                      <button key={h.id} type="button" onClick={() => setHat(h.id)} title={h.label} aria-label={`select ${h.label}`}
                        className={`flex h-24 cursor-pointer items-center justify-center rounded p-2 transition-all ${hat === h.id ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
                        <img alt={h.label} src={h.img} loading="lazy" className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      </button>
                    ))}
                  </div>
                </div>

                <Divider />

                {/* armor & elytra (also on the canvas shield toolbar) */}
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <h1 className="font-bold">armor</h1>
                    <Shield className="h-4 w-4 text-zinc-500" />
                  </div>
                  <ArmorSlots armor={armor} setArmor={setArmor} elytra={elytra} setElytra={setElytra} />
                </div>

                <Divider />

                {/* lighting (real) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold lowercase text-zinc-400">lighting mode</label>
                    <div className="flex rounded-lg bg-zinc-800 p-[3px]">
                      {(['presets', 'custom'] as const).map((m) => (
                        <button key={m} onClick={() => setLightMode(m)}
                          className={`rounded-md px-2 py-1 text-xs lowercase ${lightMode === m ? 'bg-[#09090b] text-white shadow-sm' : 'text-zinc-400'}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  {lightMode === 'presets' ? (
                    <div className="flex flex-wrap gap-2">
                      <CamBtn onClick={() => { setLightAmbient(0.4); setLightDir(1.4); }}><Sun className="mr-1 inline h-3 w-3" />studio</CamBtn>
                      <CamBtn onClick={() => { setLightAmbient(0.9); setLightDir(0.6); }}><Zap className="mr-1 inline h-3 w-3" />soft</CamBtn>
                      <CamBtn onClick={() => { setLightAmbient(0.2); setLightDir(1.8); }}>dramatic</CamBtn>
                      <CamBtn onClick={() => { setLightAmbient(0.8); setLightDir(2.0); }}>standard</CamBtn>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Row label="ambient" min={0} max={2} step={0.01} value={lightAmbient} onChange={setLightAmbient} />
                      <Row label="directional" min={0} max={3} step={0.01} value={lightDir} onChange={setLightDir} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </>
          )}

          {/* download bar */}
          <div className="flex flex-none items-stretch border-t border-zinc-800 bg-zinc-900/40">
            <button onClick={download} className="flex h-12 flex-1 items-center justify-start gap-2.5 bg-white px-4 font-semibold lowercase text-black transition hover:bg-white/90">
              <Download className="h-4 w-4" /> download
            </button>
            <span className="w-px self-stretch bg-zinc-800" />
            <button title="Share (soon)" className="grid h-12 w-12 place-items-center text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <Share2 className="h-[18px] w-[18px]" />
            </button>
          </div>
        </aside>
      </div>

      {/* mcrender draggable bone transform panel */}
      {tcOpen && selectedBone && (
        <div className="fixed z-[60] w-[300px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur"
          style={tcPos ? { left: tcPos.x, top: tcPos.y } : { right: 16, bottom: 16 }}>
          <div onPointerDown={startDragTc} className="flex cursor-grab items-center justify-between px-4 py-3 active:cursor-grabbing">
            <span className="text-sm font-semibold">{BONES.find((b) => b.key === selectedBone)?.label ?? selectedBone}</span>
            <button onClick={() => { setTcOpen(false); setSelectedBone(null); }} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex px-3">
            {(['rotation', 'position'] as const).map((m, i) => (
              <button key={m} onClick={() => setTcMode(m)}
                className={`flex-1 border border-zinc-700 py-2 text-xs font-medium lowercase transition ${i === 0 ? 'rounded-l-md' : 'rounded-r-md border-l-0'} ${tcMode === m ? 'bg-white text-black' : 'bg-transparent text-zinc-400 hover:text-white'}`}>{m}</button>
            ))}
          </div>
          <div className="space-y-1 px-3 pb-4 pt-2">
            {tcMode === 'rotation'
              ? (['x', 'y', 'z'] as const).map((ax) => (
                  <TcSlider key={ax} label={`Rotation ${ax.toUpperCase()}`} min={-180} max={180} step={0.1} unit="°"
                    value={boneVals[('r' + ax) as 'rx']} onChange={(v) => onBoneRot(ax, v)} onReset={() => onBoneReset('rot', ax)} />
                ))
              : (['x', 'y', 'z'] as const).map((ax) => (
                  <TcSlider key={ax} label={`Position ${ax.toUpperCase()}`} min={-2} max={2} step={0.01}
                    value={boneVals[('p' + ax) as 'px']} onChange={(v) => onBonePos(ax, v)} onReset={() => onBoneReset('pos', ax)} />
                ))}
          </div>
        </div>
      )}

      {/* whole-model transform window — rotates/moves the entire rig (axis3d button) */}
      {mtOpen && (
        <div className="fixed z-[60] w-[300px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur"
          style={mtPos ? { left: mtPos.x, top: mtPos.y } : { right: 16, bottom: 16 }}>
          <div onPointerDown={startDragMt} className="flex cursor-grab items-center justify-between px-4 py-3 active:cursor-grabbing">
            <span className="text-sm font-semibold lowercase">model transform</span>
            <button onClick={() => setMtOpen(false)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex px-3">
            {(['rotation', 'position'] as const).map((m, i) => (
              <button key={m} onClick={() => setMtTab(m)}
                className={`flex-1 border border-zinc-700 py-2 text-xs font-medium lowercase transition ${i === 0 ? 'rounded-l-md' : 'rounded-r-md border-l-0'} ${mtTab === m ? 'bg-white text-black' : 'bg-transparent text-zinc-400 hover:text-white'}`}>{m}</button>
            ))}
          </div>
          <div className="space-y-1 px-3 pb-4 pt-2">
            {mtTab === 'rotation'
              ? (['x', 'y', 'z'] as const).map((ax) => (
                  <TcSlider key={ax} label={`Rotation ${ax.toUpperCase()}`} min={-180} max={180} step={0.1} unit="°"
                    value={mtVals[('r' + ax) as 'rx']} onChange={(v) => onModelRot(ax, v)} onReset={() => onModelReset('rot', ax)} />
                ))
              : (['x', 'y', 'z'] as const).map((ax) => (
                  <TcSlider key={ax} label={`Position ${ax.toUpperCase()}`} min={-3} max={3} step={0.01}
                    value={mtVals[('p' + ax) as 'px']} onChange={(v) => onModelPos(ax, v)} onReset={() => onModelReset('pos', ax)} />
                ))}
          </div>
        </div>
      )}

      {/* held-item transform window (rot / pos / scale), mcrender-style */}
      {heldWin && (heldWin === 'main' ? mainItem : offItem) && (
        <div className="fixed z-[60] w-[280px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur"
          style={heldWinPos ? { left: heldWinPos.x, top: heldWinPos.y } : { left: 16, bottom: 16 }}>
          <div onPointerDown={startDragHeld} className="flex cursor-grab items-center justify-between px-4 py-3 active:cursor-grabbing">
            <span className="text-sm font-semibold lowercase">{heldWin} hand item</span>
            <button onClick={() => setHeldWin(null)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex px-3">
            {(['rot', 'pos', 'scale'] as const).map((m, i) => (
              <button key={m} onClick={() => setHeldWinTab(m)}
                className={`flex-1 border border-zinc-700 py-2 text-xs font-medium lowercase transition ${i === 0 ? 'rounded-l-md' : i === 2 ? 'rounded-r-md border-l-0' : 'border-l-0'} ${heldWinTab === m ? 'bg-white text-black' : 'bg-transparent text-zinc-400 hover:text-white'}`}>{m}</button>
            ))}
          </div>
          <div className="space-y-1 px-3 pb-4 pt-2">
            {heldWinTab === 'rot' && (['x', 'y', 'z'] as const).map((ax, i) => (
              <TcSlider key={ax} label={`Rotation ${ax.toUpperCase()}`} min={-180} max={180} step={0.1} unit="°"
                value={heldXf[heldWin].rot[i] * 180 / Math.PI} onChange={(v) => onHeldAxis('rot', i, v * Math.PI / 180)} onReset={() => onHeldReset('rot', i)} />
            ))}
            {heldWinTab === 'pos' && (['x', 'y', 'z'] as const).map((ax, i) => (
              <TcSlider key={ax} label={`Position ${ax.toUpperCase()}`} min={-2} max={2} step={0.01}
                value={heldXf[heldWin].pos[i]} onChange={(v) => onHeldAxis('pos', i, v)} onReset={() => onHeldReset('pos', i)} />
            ))}
            {heldWinTab === 'scale' && (['x', 'y', 'z'] as const).map((ax, i) => (
              <TcSlider key={ax} label={`Scale ${ax.toUpperCase()}`} min={0.01} max={0.3} step={0.005}
                value={heldXf[heldWin].scale[i]} onChange={(v) => onHeldAxis('scale', i, v)} onReset={() => onHeldReset('scale', i)} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// Poses management panel (mcrender clone's right panel).
function PosesPanel({ poseTab, setPoseTab }: { poseTab: 'private' | 'published' | 'drafts'; setPoseTab: (t: 'private' | 'published' | 'drafts') => void }) {
  const tabs = [
    { id: 'private' as const, label: 'private', Icon: Lock },
    { id: 'published' as const, label: 'published', Icon: Globe },
    { id: 'drafts' as const, label: 'drafts', Icon: FileText },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
      <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900/40">
        <Plus className="h-4 w-4" /> new pose
      </button>
      <button className="flex w-full items-center justify-between rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90">
        <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI studio</span>
        <ArrowRight className="h-4 w-4" />
      </button>
      <div className="flex rounded-full bg-zinc-900/60 p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setPoseTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition ${poseTab === t.id ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'}`}>
            <t.Icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-zinc-500">No poses found</div>
    </div>
  );
}

/* ── bone editor atoms ── */
function BoneSeg({ bone, w, h, sel, onSelect }: { bone: string; w: string; h: string; sel: string | null; onSelect: (b: string) => void }) {
  const active = sel === bone;
  return (
    <button onClick={() => onSelect(bone)} title={bone.replace(/([A-Z])/g, ' $1').trim()}
      className={`${w} ${h} rounded-[2px] border transition-colors ${active ? 'border-white bg-white' : 'border-zinc-500 hover:bg-white/15'}`} />
  );
}
function TcSlider({ label, min, max, step, unit = '', value, onChange, onReset }: { label: string; min: number; max: number; step: number; unit?: string; value: number; onChange: (v: number) => void; onReset: () => void }) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-14 text-right font-mono text-[11px] tabular-nums text-zinc-400">{step < 1 ? value.toFixed(step < 0.1 ? 2 : 1) : value}{unit}</span>
          <button onClick={onReset} title="reset" className="text-zinc-500 transition hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="h-1 w-full accent-white" />
    </div>
  );
}

/* ── UI atoms ── */
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-medium text-zinc-200">{children}</h3>;
}
function Divider() { return <div className="h-px w-full bg-zinc-800" />; }
function CamBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex h-8 items-center rounded-md border border-zinc-700 bg-[#09090b] px-3 text-xs font-medium lowercase shadow-xs transition hover:bg-zinc-800">
      {children}
    </button>
  );
}
function Row({ label, min, max, step = 1, value, onChange, unit = '', signed = false, display }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; unit?: string; signed?: boolean; display?: (v: number) => string | number }) {
  const disp = display ? display(value) : (step < 1 ? (step < 0.01 ? value.toFixed(4) : value.toFixed(2)) : value);
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-300">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-400">{signed && value >= 0 ? '+' : ''}{disp}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-400 [&::-webkit-slider-thumb]:bg-white" />
    </div>
  );
}
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span className={`grid size-4 shrink-0 place-items-center rounded-[4px] border ${checked ? 'border-white bg-white text-black' : 'border-zinc-600'}`}>
      {checked && <Check className="size-3.5" />}
    </span>
  );
}
function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <Checkbox checked={checked} />
      <span className="flex-1 text-sm font-medium">{label}</span>
    </button>
  );
}
function CheckCard({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
      <CheckRow label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
// Effect block — toggle card with collapsible sliders (mcrender effects layout).
function FxBlock({ label, checked, onToggle, children }: { label: string; checked: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
      <CheckRow label={label} checked={checked} onChange={onToggle} />
      {checked && <div className="mt-2 space-y-1 border-t border-zinc-800/60 pt-3">{children}</div>}
    </div>
  );
}
function FxColor({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-5 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent" />
    </div>
  );
}
function AccTile({ selected, onClick, label, Icon }: { selected: boolean; onClick: () => void; label: string; Icon: typeof Ban }) {
  return (
    <button onClick={onClick} title={label}
      className={`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 transition-all ${selected ? 'bg-zinc-800/75 ring-[3px] ring-white/25' : 'bg-zinc-900/50 hover:bg-zinc-800'}`}>
      <Icon className={`h-7 w-7 ${label === 'none' ? 'text-zinc-600' : 'text-zinc-300'}`} />
      <span className="text-[10px] lowercase text-zinc-400">{label}</span>
    </button>
  );
}
function ToolIcon({ Icon, title, active, onClick }: { Icon: typeof Sword; title: string; active?: boolean; onClick?: () => void }) {
  return (
    <button title={title} onClick={onClick} className={`grid h-9 w-9 place-items-center rounded-lg transition ${active ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
function Dropdown({ value, options, onPick, badge }: { value: string; options: string[]; onPick: (v: string) => void; badge?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-[#09090b] px-3 text-sm hover:bg-zinc-800">
        {badge && <span className="grid h-4 w-4 place-items-center rounded-xs bg-zinc-600 text-[8px] font-semibold text-white">{badge}</span>}
        <span className="lowercase">{value}</span>
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-1 min-w-full overflow-hidden rounded-lg border border-zinc-700 bg-[#111113] shadow-xl">
          {options.map((o) => (
            <button key={o} onMouseDown={() => onPick(o)} className={`block w-full px-3 py-2 text-left text-sm lowercase hover:bg-zinc-800 ${o === value ? 'text-white' : 'text-zinc-400'}`}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline default/slim model select — shown in the skin chooser once a skin is set.
function ModelInline({ value, onPick }: { value: 'classic' | 'slim'; onPick: (v: 'classic' | 'slim') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0 flex-1">
      <button onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-7 w-full items-center justify-between gap-1 rounded px-2 text-sm text-zinc-200 hover:bg-zinc-800">
        <span>{value === 'slim' ? 'slim' : 'default'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1 min-w-[120px] overflow-hidden rounded-md border border-zinc-700 bg-[#111113] shadow-xl">
          {([['classic', 'default'], ['slim', 'slim']] as const).map(([k, lbl]) => (
            <button key={k} onMouseDown={() => onPick(k)}
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${value === k ? 'bg-sky-500 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}>
              {lbl}{value === k && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Item picker — mcrender's searchable command palette over /textures/items/*.
function ItemPicker({ hand, value, onPick }: { hand: 'main' | 'off'; value: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const needle = q.trim().toLowerCase().replace(/ /g, '_');
  const list = needle ? ITEM_IDS.filter((id) => id.includes(needle)) : ITEM_IDS;
  return (
    <div className="w-72">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold lowercase">{hand === 'main' ? 'main hand' : 'off hand'}</span>
        {value && <button onClick={() => onPick(null)} className="text-[10px] text-zinc-400 hover:text-white">clear</button>}
      </div>
      <div className="mb-2 flex items-center gap-2 rounded-md border border-zinc-700 bg-[#09090b] px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search items..."
          className="h-8 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-500" />
      </div>
      <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
        <button onClick={() => fileRef.current?.click()} title="custom upload"
          className="grid aspect-square place-items-center rounded border border-dashed border-zinc-600 hover:border-zinc-400">
          <Upload className="h-4 w-4 text-zinc-400" />
        </button>
        <button onClick={() => onPick(null)} title="None"
          className={`grid aspect-square place-items-center rounded border ${!value ? 'border-white bg-white/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
          <Ban className="h-4 w-4 text-zinc-500" />
        </button>
        {list.map((id) => (
          <button key={id} title={id.replace(/_/g, ' ')} onClick={() => onPick(id)}
            className={`aspect-square overflow-hidden rounded border ${value === id ? 'border-white bg-white/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
            <img src={`/textures/items/${id}.png`} alt={id} loading="lazy" className="h-full w-full object-contain p-0.5 [image-rendering:pixelated]" />
          </button>
        ))}
        {!list.length && <div className="col-span-4 py-6 text-center text-[11px] text-zinc-500">no items match “{q}”.</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/png" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick('custom:' + URL.createObjectURL(f)); }} />
    </div>
  );
}

// Armor slot dropdown (helmet / chestplate / leggings / boots).
function SlotSelect({ label, value, tiers, onChange }: { label: string; value: string | null; tiers: readonly string[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <button onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-zinc-700 bg-[#09090b] px-2 text-xs lowercase hover:bg-zinc-800">
        <span className={value ? 'text-white' : 'text-zinc-500'}>{value ?? 'none'}</span>
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-700 bg-[#111113] shadow-xl">
          <button onMouseDown={() => onChange(null)} className="block w-full px-2 py-1.5 text-left text-xs lowercase text-zinc-400 hover:bg-zinc-800">none</button>
          {tiers.map((t) => (
            <button key={t} onMouseDown={() => onChange(t)}
              className={`block w-full px-2 py-1.5 text-left text-xs lowercase hover:bg-zinc-800 ${value === t ? 'text-white' : 'text-zinc-300'}`}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Armor & elytra controls — 4 slot dropdowns + an elytra toggle (mcrender layout).
function ArmorSlots({ armor, setArmor, elytra, setElytra }: { armor: ArmorSlots; setArmor: (a: ArmorSlots) => void; elytra: boolean; setElytra: (v: boolean) => void }) {
  const noTurtle = ARMOR_TIERS.filter((t) => t !== 'turtle');
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <SlotSelect label="Helmet" value={armor.helmet} tiers={ARMOR_TIERS} onChange={(v) => setArmor({ ...armor, helmet: v })} />
        <SlotSelect label="Chestplate" value={armor.chestplate} tiers={noTurtle} onChange={(v) => setArmor({ ...armor, chestplate: v })} />
        <SlotSelect label="Leggings" value={armor.leggings} tiers={noTurtle} onChange={(v) => setArmor({ ...armor, leggings: v })} />
        <SlotSelect label="Boots" value={armor.boots} tiers={noTurtle} onChange={(v) => setArmor({ ...armor, boots: v })} />
      </div>
      <button onClick={() => setElytra(!elytra)}
        className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs hover:border-zinc-500">
        <Checkbox checked={elytra} /> elytra
      </button>
    </div>
  );
}

/* ─────────────────────────── three.js viewer ─────────────────────────── */

type StudioApi = {
  setPose: (p: PoseState) => void;
  setNode: (nt: NodeXform) => void;
  setSkin: (url: string) => Promise<void>;
  setCamera: (preset: CamPreset) => void;
  setModel: (kind: 'classic' | 'slim') => Promise<void>;
  getBone: (name: string) => { rx: number; ry: number; rz: number; px: number; py: number; pz: number } | null;
  setBoneRot: (name: string, axis: 'x' | 'y' | 'z', deg: number) => void;
  setBonePos: (name: string, axis: 'x' | 'y' | 'z', v: number) => void;
  resetBoneAxis: (name: string, kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => void;
  getModel: () => { rx: number; ry: number; rz: number; px: number; py: number; pz: number };
  setModelRot: (axis: 'x' | 'y' | 'z', deg: number) => void;
  setModelPos: (axis: 'x' | 'y' | 'z', v: number) => void;
  resetModelAxis: (kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => void;
  gizmoAttach: (name: string | null) => void;
  pickBone: (nx: number, ny: number) => string | null;
  gizmoModel: (on: boolean, target?: 'rotate' | 'translate') => void;
  setGizmoMode: (m: 'rotate' | 'translate') => void;
  onGizmo: (cb: (() => void) | null) => void;
  setFloor: (on: boolean) => void;
  setFloorTexture: (url: string) => void;
  setSceneBg: (css: string) => void;
  setSecondLayer: (on: boolean) => void;
  setFog: (o: { on: boolean; color?: string; near?: number; far?: number }) => void;
  setBloom: (o: { enabled?: boolean; intensity?: number; threshold?: number }) => void;
  setChromatic: (o: { enabled?: boolean; offset?: number }) => void;
  setVignette: (o: { enabled?: boolean; darkness?: number; offset?: number }) => void;
  setSaturation: (v: number) => void;
  setContrast: (v: number) => void;
  setOutline: (o: { enabled?: boolean; color?: string }) => void;
  setInnerShadow: (o: { enabled?: boolean; color?: string; intensity?: number; distance?: number; sharpness?: number }) => void;
  set3DLayers: (on: boolean, thickness: number) => void;
  setHeld: (hand: 'main' | 'off', id: string | null) => void;
  setHeldTransform: (hand: 'main' | 'off', t: { pos: Vec3; rot: Vec3; scale: Vec3 }) => void;
  setHat: (id: string | null) => Promise<void>;
  setCape: (texUrl: string | null) => void;
  setArmor: (slots: ArmorSlots) => Promise<void>;
  setElytra: (on: boolean) => Promise<void>;
  setLighting: (o: { ambient?: number; directional?: number }) => void;
  setClouds: (on: boolean, cfg?: { height: number; size: number; thickness: number; density: number; opacity: number; drift: number }) => void;
  setNametag: (show: boolean, text: string) => void;
  exportPNG: (o: { width: number; height: number; backdrop: string | null; filter: string; vignette: number }) => Promise<Blob | null>;
  dispose: () => void;
};

function gradientColors(css: string): string[] {
  const hex = css.match(/#([0-9a-f]{6})/gi);
  if (hex && hex.length) return hex;
  const rgb = css.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi);
  if (rgb && rgb.length) return rgb;
  return ['#111111', '#000000'];
}

// ── mcrender's VoxelOuterLayer tables (module 742273), ported verbatim ──
type VoxBox = { min: [number, number, number]; max: [number, number, number] };
const VOX_BOX_CLASSIC: Record<string, VoxBox> = {
  head: { min: [-.248, 1.502, -.248], max: [.248, 1.998, .248] },
  body: { min: [-.248, .757, -.124], max: [.248, 1.501, .124] },
  armR: { min: [-.496, .757, -.124], max: [-.248, 1.501, .124] },
  armL: { min: [.248, .757, -.124], max: [.496, 1.501, .124] },
  legR: { min: [-.248, .012, -.124], max: [0, .756, .124] },
  legL: { min: [0, .012, -.124], max: [.248, .756, .124] },
};
const VOX_BOX_SLIM: Record<string, VoxBox> = {
  head: { min: [-.248, 1.502, 3.632], max: [.248, 1.998, 4.128] },
  body: { min: [-.248, .757, 3.756], max: [.248, 1.501, 4.004] },
  armR: { min: [-.434, .757, 3.756], max: [-.248, 1.501, 4.004] },
  armL: { min: [.248, .757, 3.756], max: [.434, 1.501, 4.004] },
  legR: { min: [-.248, .012, 3.756], max: [0, .756, 4.004] },
  legL: { min: [0, .012, 3.756], max: [.248, .756, 4.004] },
};
const VOX_UV_CLASSIC: Record<string, Record<string, number[]>> = {
  head: { top: [40, 0, 48, 8], bottom: [48, 0, 56, 8], right: [32, 8, 40, 16], front: [40, 8, 48, 16], left: [48, 8, 56, 16], back: [56, 8, 64, 16] },
  body: { top: [20, 32, 28, 36], bottom: [28, 32, 36, 36], right: [16, 36, 20, 48], front: [20, 36, 28, 48], left: [28, 36, 32, 48], back: [32, 36, 40, 48] },
  armR: { top: [44, 32, 48, 36], bottom: [48, 32, 52, 36], right: [40, 36, 44, 48], front: [44, 36, 48, 48], left: [48, 36, 52, 48], back: [52, 36, 56, 48] },
  armL: { top: [52, 48, 56, 52], bottom: [56, 48, 60, 52], right: [48, 52, 52, 64], front: [52, 52, 56, 64], left: [56, 52, 60, 64], back: [60, 52, 64, 64] },
  legR: { top: [4, 32, 8, 36], bottom: [8, 32, 12, 36], right: [0, 36, 4, 48], front: [4, 36, 8, 48], left: [8, 36, 12, 48], back: [12, 36, 16, 48] },
  legL: { top: [4, 48, 8, 52], bottom: [8, 48, 12, 52], right: [0, 52, 4, 64], front: [4, 52, 8, 64], left: [8, 52, 12, 64], back: [12, 52, 16, 64] },
};
const VOX_UV_SLIM: Record<string, Record<string, number[]>> = {
  ...VOX_UV_CLASSIC,
  armR: { top: [44, 32, 47, 36], bottom: [47, 32, 50, 36], right: [40, 36, 44, 48], front: [44, 36, 47, 48], left: [47, 36, 51, 48], back: [51, 36, 55, 48] },
  armL: { top: [52, 48, 55, 52], bottom: [55, 48, 58, 52], right: [48, 52, 52, 64], front: [52, 52, 55, 64], left: [55, 52, 59, 64], back: [59, 52, 63, 64] },
};
const VOX_SKIP: Record<string, Set<string>> = {
  head: new Set(['bottom']), body: new Set(['top', 'bottom']),
  armR: new Set(['top']), armL: new Set(['top']), legR: new Set(['top']), legL: new Set(['top']),
};
const VOX_BONE_ALIASES: Record<string, string[]> = {
  Head: ['Head'], Body: ['Body'], Chest: ['Chest'],
  ArmLeftUpper: ['ArmLeftUpper', 'Arm:Left:Upper'], ArmLeftLower: ['ArmLeftLower', 'Arm:Left:Lower'],
  ArmRightUpper: ['ArmRightUpper', 'Arm:Right:Upper'], ArmRightLower: ['ArmRightLower', 'Arm:Right:Lower'],
  LegLeftUpper: ['LegLeftUpper', 'Leg:Left:Upper'], LegLeftLower: ['LegLeftLower', 'Leg:Left:Lower'],
  LegRightUpper: ['LegRightUpper', 'Leg:Right:Upper'], LegRightLower: ['LegRightLower', 'Leg:Right:Lower'],
};
const srgb2lin = (e: number) => (e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4));
type VoxFace = { origin: number[]; axisU: number[]; axisV: number[]; normal: number[] };
const voxFaceGeom = (face: string, b: VoxBox): VoxFace | null => {
  const r = b.min, i = b.max;
  switch (face) {
    case 'top': return { origin: [i[0], i[1], i[2]], axisU: [-.0625, 0, 0], axisV: [0, 0, -.0625], normal: [0, 1, 0] };
    case 'bottom': return { origin: [r[0], r[1], i[2]], axisU: [.0625, 0, 0], axisV: [0, 0, -.0625], normal: [0, -1, 0] };
    case 'front': return { origin: [r[0], i[1], i[2]], axisU: [.0625, 0, 0], axisV: [0, -.0625, 0], normal: [0, 0, 1] };
    case 'back': return { origin: [i[0], i[1], r[2]], axisU: [-.0625, 0, 0], axisV: [0, -.0625, 0], normal: [0, 0, -1] };
    case 'right': return { origin: [r[0], i[1], i[2]], axisU: [0, 0, -.0625], axisV: [0, -.0625, 0], normal: [-1, 0, 0] };
    case 'left': return { origin: [i[0], i[1], r[2]], axisU: [0, 0, .0625], axisV: [0, -.0625, 0], normal: [1, 0, 0] };
    default: return null;
  }
};

async function bootViewer(mount: HTMLDivElement, isDisposed: () => boolean): Promise<StudioApi | null> {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js');
  // mcrender's post-FX are the `postprocessing` (pmndrs) library effects — match 1:1.
  const PP = await import('postprocessing');
  const { loadImage, loadSkinToCanvas } = await import('skinview-utils');
  if (isDisposed()) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio * 2, 3)); // supersample for crisp AA edges
  // mcrender's exact renderer: ACES Filmic + exposure 1, sRGB, shadows off.
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  mount.appendChild(renderer.domElement);
  // NO image-rendering:pixelated here — that nearest-scales the whole canvas and
  // destroys the antialiasing. Crispness comes from the texture's NearestFilter;
  // the geometry edges stay smoothly antialiased like mcrender.
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

  const scene = new THREE.Scene();
  // Wraps the rig so "model transform" rotates/moves the WHOLE model (every bone),
  // not a single bone. modelGroup = translation (move); pivotGroup = rotation,
  // re-centred each build so the model tilts around its own centre (not the feet).
  const modelGroup = new THREE.Group(); scene.add(modelGroup);
  const pivotGroup = new THREE.Group(); modelGroup.add(pivotGroup);

  // ── nametag: a billboard Sprite floating above the head (mcrender renders a
  // Sprite at feet + 2.25 that always faces the camera). Lives in modelGroup so it
  // tracks the model's position; depthTest off + high renderOrder so it never clips
  // behind the body — exactly like a Minecraft nametag. In-scene → it's captured by
  // the composer for live view AND the exported PNG, at the right spot above the head.
  // mcrender draws the nametag text in the authentic **Minecraftia** font (troika
  // `Text`, font "/fonts/Minecraftia-Regular.ttf", white, on a translucent dark
  // plate). We replicate that look on a canvas sprite: same font, sharp-rect plate.
  const NAMETAG_Y = 2.15; // small gap above the 2.019-tall rig's head-top (tight `front` preset clips it, same as mcrender)
  const NAMETAG_H = 0.16; // world height of the plate (glyph ≈ mcrender's 0.1 world)
  let nametagSprite: import('three').Sprite | null = null;
  let nametagShow = true, nametagText = 'PLACEHOLDER';
  let mcFontReady = false;
  const buildNametagTexture = (text: string) => {
    const fontPx = 140; // hi-res canvas → crisp sprite
    const fam = mcFontReady ? '"Minecraftia"' : 'ui-monospace, monospace';
    const padX = Math.round(fontPx * 0.32), padY = Math.round(fontPx * 0.30);
    const tmp = document.createElement('canvas'); const tctx = tmp.getContext('2d')!;
    const font = `${fontPx}px ${fam}`;
    tctx.font = font; tctx.textBaseline = 'alphabetic';
    // size the plate to the ACTUAL ink box — Minecraftia's font-metrics 'middle' baseline
    // sits high, clipping the glyph tops; measure asc/desc and centre on them instead.
    const m = tctx.measureText(text || ' ');
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const tw = Math.ceil(m.width), glyphH = Math.ceil(asc + desc);
    const w = tw + padX * 2, h = glyphH + padY * 2;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(0, 0, w, h); // MC translucent plate (sharp rect)
    ctx.font = font; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, w / 2, padY + asc); // ink top at padY, bottom at padY+glyphH → exact vertical centre
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, aspect: w / h };
  };
  const applyNametag = () => {
    if (nametagSprite) {
      modelGroup.remove(nametagSprite);
      const m = nametagSprite.material as import('three').SpriteMaterial; m.map?.dispose(); m.dispose();
      nametagSprite = null;
    }
    if (!nametagShow || !nametagText.trim()) return;
    const { tex, aspect } = buildNametagTexture(nametagText);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
    spr.scale.set(NAMETAG_H * aspect, NAMETAG_H, 1);
    spr.position.set(0, NAMETAG_Y, 0);
    spr.renderOrder = 1; // depthTest on → the character occludes the tag (mcrender: behind the player)
    modelGroup.add(spr);
    nametagSprite = spr;
  };
  const setNametag = (show: boolean, text: string) => { nametagShow = show; nametagText = text; applyNametag(); };
  // load the real Minecraft font, then redraw the tag with it
  new FontFace('Minecraftia', 'url(/fonts/Minecraftia-Regular.ttf)').load()
    .then((f) => { document.fonts.add(f); mcFontReady = true; applyNametag(); }).catch(() => {});
  applyNametag();

  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 4000); // mcrender FOV 50 (far raised for the distant cloud band)
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.6;
  controls.maxDistance = 12;

  // ── transform gizmo: the X/Y/Z rotation rings on the selected body part ──
  // (mcrender shows red/green/blue circles you can drag to rotate a bone live).
  // TransformControls (three r156, extends Object3D → add directly to scene).
  let gizmoCb: (() => void) | null = null;
  const gizmo = new TransformControls(cam, renderer.domElement);
  gizmo.setMode('rotate');
  gizmo.setSpace('local');
  gizmo.setSize(0.9);
  // dragging the gizmo must not also orbit the camera
  gizmo.addEventListener('dragging-changed', (e) => { controls.enabled = !(e as { value: boolean }).value; });
  // sync the dragged transform back into the React sliders
  gizmo.addEventListener('objectChange', () => { gizmoCb?.(); });
  // Gizmo lives in its OWN scene, drawn as a crisp overlay AFTER the composer —
  // so bloom/outline/chromatic never touch the rings (TransformControls still
  // tracks the attached bone's world matrix regardless of which scene holds it).
  const gizmoScene = new THREE.Scene(); gizmoScene.add(gizmo);
  // hold Shift → snap rotation to 15° / translate to 0.1 for clean angles
  const onSnapKey = (e: KeyboardEvent) => {
    if (e.key !== 'Shift') return;
    const on = e.type === 'keydown';
    gizmo.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
    gizmo.setTranslationSnap(on ? 0.1 : null);
  };
  window.addEventListener('keydown', onSnapKey); window.addEventListener('keyup', onSnapKey);

  // mcrender's "standard" lighting preset — ambient 0.8 + a bright directional
  // 2.0 from front-top-right [5,5,5] (gives the 3D face shading / "свечение");
  // a faint fill keeps the back faces from going pure black. No cast shadows.
  const ambient = new THREE.AmbientLight(0xffffff, 0.8); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5, 5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.2); rim.position.set(-3, 2, -3); scene.add(rim);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.visible = false; scene.add(floor);

  const texLoader = new THREE.TextureLoader();
  const setFloorTexture = (url: string) => {
    const t = texLoader.load(url);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60);
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    floorMat.map?.dispose();
    floorMat.map = t; floorMat.color.set(0xffffff); floorMat.needsUpdate = true;
  };
  setFloorTexture('/textures/block/dirt.png');

  // Two rigs: classic (4px arms) + slim (3px arms / Alex). Either can be the
  // active rig; the body, bones, and accessory anchors are identical names.
  const MODEL_URL: Record<'classic' | 'slim', string> = { classic: '/models/player.gltf', slim: '/models/pfp.gltf' };
  const CAPE_MODEL_URL = '/models/cape.gltf';
  let currentModel: 'classic' | 'slim' = 'classic';
  let secondLayerOn = true;
  // 3D skin layers (real per-pixel voxel extrusion of the 2nd layer)
  let layers3dOn = false;
  let layers3dThk = 0.0625;
  let voxelGroups: import('three').Object3D[] = [];
  let skinData: ImageData | null = null;
  let skinW = 64, skinH = 64;

  let rig!: import('three').Object3D;
  let overlayMeshes: import('three').Mesh[] = [];
  let bone: Record<string, import('three').Object3D> = {};
  let restQ: Record<string, import('three').Quaternion> = {};
  let restPos: Record<string, import('three').Vector3> = {};
  let restWorldByBone: Record<string, import('three').Matrix4> = {}; // bone rest (bind-pose) world matrices — for rigid armor/elytra attach
  // The classic rig defines the target footprint; any other rig (slim/pfp has a
  // different root origin + scale) is normalised to centre + height-match it so
  // the camera frames both identically.
  let targetBox: import('three').Box3 | null = null;
  const buildRig = (scn: import('three').Object3D) => {
    rig = scn;
    overlayMeshes = [];
    scn.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh) return;
      m.castShadow = false; m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => { (mat as import('three').MeshStandardMaterial).roughness = 1; (mat as import('three').MeshStandardMaterial).metalness = 0; });
      if (mats.some((mat) => /alpha/i.test((mat as import('three').Material).name) || (mat as import('three').Material).transparent)) overlayMeshes.push(m);
    });
    // Measure with the wrappers at identity so the bbox is axis-aligned.
    modelGroup.position.set(0, 0, 0); pivotGroup.rotation.set(0, 0, 0); pivotGroup.position.set(0, 0, 0);
    pivotGroup.add(scn);
    scn.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(scn);
    if (!targetBox) {
      targetBox = box.clone(); // classic = reference
    } else {
      const size = box.getSize(new THREE.Vector3());
      const tsize = targetBox.getSize(new THREE.Vector3());
      scn.scale.multiplyScalar(tsize.y / (size.y || 1));
      scn.updateWorldMatrix(true, true);
      const box2 = new THREE.Box3().setFromObject(scn);
      const c2 = box2.getCenter(new THREE.Vector3());
      const tc = targetBox.getCenter(new THREE.Vector3());
      scn.position.x += tc.x - c2.x;
      scn.position.z += tc.z - c2.z;
      scn.position.y += targetBox.min.y - box2.min.y; // align feet
      scn.updateWorldMatrix(true, true);
    }
    // Re-centre the rotation pivot on the model's centre: move pivotGroup to the
    // centre and counter-shift the rig so its world position is unchanged. Now
    // pivotGroup.rotation tilts the model in place instead of swinging it.
    {
      const fb = new THREE.Box3().setFromObject(scn);
      const fc = fb.getCenter(new THREE.Vector3());
      scn.position.sub(fc);
      pivotGroup.position.copy(fc);
      scn.updateWorldMatrix(true, true);
    }
    bone = {}; restQ = {}; restPos = {}; restWorldByBone = {};
    scn.updateWorldMatrix(true, true);
    scn.traverse((o) => { if (o.name) { bone[o.name] = o; restQ[o.name] = o.quaternion.clone(); restPos[o.name] = o.position.clone(); restWorldByBone[o.name] = o.matrixWorld.clone(); } });
    overlayMeshes.forEach((m) => { m.visible = secondLayerOn; });
  };
  {
    const g = await new GLTFLoader().loadAsync(MODEL_URL.classic);
    if (isDisposed()) return null;
    buildRig(g.scene);
  }

  let skinTex: import('three').Texture | null = null;
  let lastSkin = FALLBACK_SKIN;
  const setSkin = async (url: string) => {
    try {
      const img = await loadImage(url);
      if (isDisposed()) return;
      const cv = document.createElement('canvas');
      loadSkinToCanvas(cv, img);
      const sctx = cv.getContext('2d');
      if (sctx) { skinData = sctx.getImageData(0, 0, cv.width, cv.height); skinW = cv.width; skinH = cv.height; }
      const tex = new THREE.Texture(cv);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter;
      tex.generateMipmaps = true; tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.needsUpdate = true;
      rig.traverse((o) => {
        const m = o as import('three').Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => { (mat as import('three').MeshStandardMaterial).map = tex; (mat as import('three').MeshStandardMaterial).needsUpdate = true; });
      });
      skinTex?.dispose(); skinTex = tex; lastSkin = url;
      if (layers3dOn) applyLayers(); // re-voxelise with the new skin colours
    } catch { /* keep current */ }
  };

  /* ── accessories ── */
  const pixTex = (url: string) => {
    const t = texLoader.load(url);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    return t;
  };

  // Held items — mcrender's per-pixel voxel extrusion: each opaque pixel of the
  // item PNG becomes one cube (InstancedMesh), parented to a forearm bone with
  // the item's own pos/rot/scale archetype.
  const held: Record<'main' | 'off', import('three').Object3D | null> = { main: null, off: null };
  const setHeld = (hand: 'main' | 'off', id: string | null) => {
    const prev = held[hand];
    if (prev) { prev.parent?.remove(prev); held[hand] = null; }
    if (!id) return;
    const b = bone[hand === 'main' ? 'ArmRightLower' : 'ArmLeftLower'];
    if (!b) return;
    const custom = id.startsWith('custom:');
    const url = custom ? id.slice(7) : `/textures/items/${id}.png`;
    const xf: ItemXform = custom ? { pos: [0, 0.45, -0.35], rot: [0, Math.PI / 2, -Math.PI / 4], scale: 0.085 } : itemXform(id);
    const grp = new THREE.Group();
    grp.position.set(xf.pos[0], xf.pos[1], xf.pos[2]);
    grp.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
    grp.scale.setScalar(xf.scale);
    b.add(grp); held[hand] = grp;
    const img = new Image();
    img.onload = () => {
      if (isDisposed() || held[hand] !== grp) return;
      const w = Math.min(img.width, 16), h = Math.min(img.height, 16);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); if (!cx) return;
      cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      const px: number[][] = [];
      for (let y = 0; y < h && px.length < 512; y++) {
        for (let x = 0; x < w && px.length < 512; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 128) px.push([x - w / 2, h - y - h / 2, data[i], data[i + 1], data[i + 2]]);
        }
      }
      // Voxels at UNIT scale + size; the group's scale gives the final size, so
      // pos/rot/scale of the whole item stay fully adjustable from the panel.
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), px.length);
      const dummy = new THREE.Object3D(); const col = new THREE.Color();
      px.forEach((v, k) => {
        dummy.position.set(v[0], v[1], 0); dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
        inst.setColorAt(k, col.setRGB(v[2] / 255, v[3] / 255, v[4] / 255).convertSRGBToLinear());
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = true;
      grp.add(inst);
    };
    img.onerror = () => { if (held[hand] === grp) { grp.parent?.remove(grp); held[hand] = null; } };
    img.src = url;
  };

  // Live transform of a held item (driven by the per-hand settings window).
  const setHeldTransform = (hand: 'main' | 'off', t: { pos: Vec3; rot: Vec3; scale: Vec3 }) => {
    const grp = held[hand]; if (!grp) return;
    grp.position.set(t.pos[0], t.pos[1], t.pos[2]);
    grp.rotation.set(t.rot[0], t.rot[1], t.rot[2]);
    grp.scale.set(t.scale[0], t.scale[1], t.scale[2]);
  };

  // Hat — mcrender's hat gltf (santa / fedora) cloned onto the Head bone, textured
  // with the hat's PNG. mcrender's hatTransform: translation [0,.1,0], scale 1.5,
  // rotation [0,0,0]. `id` = HATS id or null (no hat). gltfs + textures cached.
  let hatObj: import('three').Object3D | null = null;
  let hatWant: string | null = null;
  const hatGltfCache = new Map<string, import('three').Group>();
  const hatTexCache = new Map<string, import('three').Texture>();
  const loadHatTex = (url: string) => {
    let t = hatTexCache.get(url);
    if (!t) {
      t = new THREE.TextureLoader().load(url);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
      hatTexCache.set(url, t);
    }
    return t;
  };
  const setHat = async (id: string | null) => {
    hatWant = id;
    if (hatObj) { hatObj.parent?.remove(hatObj); hatObj = null; }
    if (!id) return;
    const def = HATS.find((h) => h.id === id); if (!def) return;
    let tmpl = hatGltfCache.get(id);
    if (!tmpl) { const g = await new GLTFLoader().loadAsync(def.model); if (isDisposed()) return; tmpl = g.scene; hatGltfCache.set(id, tmpl); }
    if (hatWant !== id) return; // superseded while loading
    const tex = loadHatTex(def.tex);
    const h = tmpl.clone(true);
    h.traverse((o) => {
      const m = o as import('three').Mesh;
      if (m.isMesh) { m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }); m.castShadow = true; }
    });
    h.position.set(0, 0.1, 0);
    h.scale.setScalar(1.5);
    bone['Head']?.add(h); hatObj = h;
  };

  // Real Minecraft cape: mcrender's cape.gltf draped on the back, textured with the
  // selected cape PNG. Attached to the Body bone with mcrender's exact capeTransform
  // (position [0,.6,-.25], rotation [π+π/8,0,0] — the π flip makes it hang down from
  // its top pivot — scale 1.5). `texUrl` = `/capes/<id>.png` or a custom data URL;
  // null = no cape. cape.gltf is loaded once and cloned; textures are cached.
  let capeObj: import('three').Object3D | null = null;
  let capeTemplate: import('three').Object3D | null = null;
  let capeWant: string | null = null; // last requested texture (guards async races)
  const capeTexCache = new Map<string, import('three').Texture>();
  const loadCapeTex = (url: string) => {
    let t = capeTexCache.get(url);
    if (!t) {
      t = new THREE.TextureLoader().load(url);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; // gltf UV convention
      capeTexCache.set(url, t);
    }
    return t;
  };
  const setCape = async (texUrl: string | null) => {
    capeWant = texUrl;
    if (capeObj) { capeObj.parent?.remove(capeObj); capeObj = null; }
    if (!texUrl) return;
    if (!capeTemplate) {
      const g = await new GLTFLoader().loadAsync(CAPE_MODEL_URL);
      if (isDisposed()) return;
      capeTemplate = g.scene;
    }
    if (capeWant !== texUrl) return; // superseded while loading
    // mcrender attaches the cape to the **Chest** node (not Body), which is why its
    // capeTransform y=0.6 lands at the neck. Replicated 1:1 from chunk 0c2vjqunp:
    // position [0,.6,-.25], rotation [π+π/8,0,0], scale [-1.5,1.5,-1.5] (negative X/Z
    // mirror — that's how their cape primitive group is scaled, p=[-Bx,By,-Bz]).
    const b = bone['Chest'] ?? bone['Body']; if (!b) return;
    const scn = capeTemplate.clone(true);
    const tex = loadCapeTex(texUrl);
    scn.traverse((o) => {
      const mesh = o as import('three').Mesh;
      if (mesh.isMesh) { mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, side: THREE.DoubleSide }); mesh.castShadow = true; }
    });
    scn.position.set(0, 0.6, -0.25);
    scn.rotation.set(Math.PI + Math.PI / 8, 0, 0);
    scn.scale.set(-1.5, 1.5, -1.5);
    b.add(scn); capeObj = scn;
  };

  // Armor — mcrender's EXACT method (reverse-engineered from its `ArmorLayers` module):
  // each piece is a RIGID Mesh (the armor gltf's per-piece geometry) wrapped in a group
  // with a calibrated offset/rotation/scale, then PARENTED INTO a single named player
  // bone — so the live bone's world transform drives it (follows the pose). The shell is
  // pulled toward the camera with polygonOffset(-0.5,-0.5) so it wins the depth test over
  // the coincident skin (THIS is the fix for the "belly bulges / flat back" z-fighting).
  type PieceDef = { bone: string; layer: 1 | 2; offset: Vec3; rot: Vec3; scale: number };
  const ARMOR_PIECES: Record<string, PieceDef> = {
    head: { bone: 'Head', layer: 1, offset: [0, 0.06, 0.038], rot: [0, Math.PI, 0], scale: 1.5904 },
    body: { bone: 'Chest', layer: 1, offset: [0, 0.45, 0.045], rot: [0, 0, 0], scale: 1.5008 },
    left_arm: { bone: 'ArmLeftUpper', layer: 1, offset: [0.1, 0, 0.03], rot: [Math.PI, 0, 0], scale: 1.4784 },
    right_arm: { bone: 'ArmRightUpper', layer: 1, offset: [-0.1, 0, 0.03], rot: [Math.PI, 0, 0], scale: 1.4784 },
    left_shoe: { bone: 'LegLeftLower', layer: 1, offset: [0, -0.4, 0.035], rot: [Math.PI, Math.PI, 0], scale: 1.4784 },
    right_shoe: { bone: 'LegRightLower', layer: 1, offset: [0, -0.4, 0.035], rot: [Math.PI, Math.PI, 0], scale: 1.4784 },
    waist: { bone: 'Chest', layer: 2, offset: [0, 0.1, 0], rot: [0, 0, 0], scale: 1.5456 },
    left_leg: { bone: 'LegLeftUpper', layer: 2, offset: [0, 0, 0.035], rot: [Math.PI, 0, 0], scale: 1.5232 },
    right_leg: { bone: 'LegRightUpper', layer: 2, offset: [0, 0, 0.035], rot: [Math.PI, 0, 0], scale: 1.5232 },
  };
  const L1_ORDER = ['head', 'body', 'left_shoe', 'right_shoe', 'left_arm', 'right_arm'];
  const L2_ORDER = ['waist', 'left_leg', 'right_leg'];
  const PIECE_SLOT: Record<string, string> = {
    head: 'helmet', body: 'chestplate', left_arm: 'chestplate', right_arm: 'chestplate',
    left_shoe: 'boots', right_shoe: 'boots', waist: 'leggings', left_leg: 'leggings', right_leg: 'leggings',
  };
  // raw per-piece geometry from each armor layer gltf (mesh-local; positioned by the group)
  const pieceGeoCache: Record<number, Record<string, import('three').BufferGeometry> | null> = { 1: null, 2: null };
  const loadPieceGeo = async (layer: 1 | 2) => {
    if (pieceGeoCache[layer]) return pieceGeoCache[layer]!;
    const url = layer === 1 ? '/models/armor/armor_layer_1.gltf' : '/models/armor/armor_layer_2.gltf';
    const g = await new GLTFLoader().loadAsync(url);
    const map: Record<string, import('three').BufferGeometry> = {};
    g.scene.traverse((o) => { const sm = o as import('three').SkinnedMesh; if (sm.isSkinnedMesh && o.name) map[o.name.replace(/_\d+$/, '')] = sm.geometry; });
    pieceGeoCache[layer] = map;
    return map;
  };
  const armorMat = (texUrl: string, opts: { color?: number; transparent?: boolean; side?: import('three').Side } = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: pixTex(texUrl), color: opts.color ?? 0xffffff, side: opts.side ?? THREE.FrontSide,
      flatShading: true, roughness: 1, metalness: 0, alphaTest: 0.1, transparent: !!opts.transparent, envMapIntensity: 0,
    });
    m.polygonOffset = true; m.polygonOffsetFactor = -0.5; m.polygonOffsetUnits = -0.5; // win depth over the skin
    return m;
  };
  let armorGroups: import('three').Object3D[] = [];
  let elytraGroup: import('three').Object3D | null = null;
  let armorToken = 0;
  let curSlots: ArmorSlots = EMPTY_ARMOR; // remembered so setElytra can re-gate the chest/arms
  let elytraOn = false;
  const setArmor = async (slots: ArmorSlots) => {
    curSlots = slots;
    const token = ++armorToken;
    armorGroups.forEach((g) => g.parent?.remove(g)); armorGroups = [];
    const jobs: { piece: string; mat: string }[] = [];
    for (const piece of [...L1_ORDER, ...L2_ORDER]) {
      const def = ARMOR_PIECES[piece];
      const mat = (slots as Record<string, string | null>)[PIECE_SLOT[piece]];
      if (!mat) continue;
      if (def.layer === 2 && mat === 'turtle') continue; // turtle: no layer-2 sheet
      jobs.push({ piece, mat });
    }
    if (!jobs.length) return;
    const need = new Set(jobs.map((j) => ARMOR_PIECES[j.piece].layer));
    const geos: Record<number, Record<string, import('three').BufferGeometry>> = {};
    for (const l of need) geos[l] = await loadPieceGeo(l as 1 | 2);
    if (isDisposed() || token !== armorToken) return;
    for (const { piece, mat } of jobs) {
      const def = ARMOR_PIECES[piece];
      const geo = geos[def.layer]?.[piece]; if (!geo) continue;
      const pb = bone[def.bone]; if (!pb) continue;
      const ro = def.layer === 1 ? 42 + 0.1 * L1_ORDER.indexOf(piece) : 50 + 0.1 * L2_ORDER.indexOf(piece);
      const isLeather = mat === 'leather';
      const grp = new THREE.Group();
      grp.position.set(def.offset[0], def.offset[1], def.offset[2]);
      grp.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
      grp.scale.setScalar(def.scale);
      // base shell (leather base = grayscale tinted brown; other tiers = as-is)
      const base = new THREE.Mesh(geo, armorMat(`/textures/armor/${mat}_layer_${def.layer}.png`, isLeather ? { color: 0xa06540 } : {}));
      base.castShadow = false; base.frustumCulled = false; base.renderOrder = ro;
      grp.add(base);
      // leather: untinted overlay (buckles/straps) just above the dyed base
      if (isLeather) {
        const ov = new THREE.Mesh(geo, armorMat(`/textures/armor/leather_layer_${def.layer}_overlay.png`, { transparent: true }));
        ov.castShadow = false; ov.frustumCulled = false; ov.renderOrder = ro + 0.05;
        grp.add(ov);
      }
      pb.add(grp); armorGroups.push(grp);
    }
  };

  // Elytra — each wing's geometry BAKED with its own rest world matrix (folded shape +
  // model-space position straight from the gltf), then parented to the Body bone with the
  // bone's rest-world inverse → sits folded on the back + follows the torso. (mcrender's
  // rigid root-rotation lands crooked on our Chest bone, so we bake instead.) Shown whenever
  // enabled — on TOP of the chestplate, both visible (no gating, unlike mcrender's hide).
  // mcrender's EXACT elytra (ArmorLayers): each wing = a rigid Mesh whose local transform
  // is decomposed from inverse(elytraScene.matrixWorld)·wingNode.matrixWorld; both wings in
  // one group with root pos/rot/scale, portaled into a bone. Live-tunable via window.__ely.
  const ELY = { bone: 'Chest', rx: Math.PI + 0.36, ry: Math.PI + 0.04, rz: 0.1, px: 0, py: 0.4, pz: -0.16, s: 1.12 };
  const buildElytra = async () => {
    if (elytraGroup) { elytraGroup.parent?.remove(elytraGroup); elytraGroup = null; }
    if (!elytraOn) return;
    const g = await new GLTFLoader().loadAsync('/models/armor/elytra.gltf');
    if (isDisposed()) return;
    const pb = bone[ELY.bone]; if (!pb) return;
    g.scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(g.scene.matrixWorld).invert();
    const root = new THREE.Group();
    g.scene.traverse((o) => {
      const sm = o as import('three').SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, sm.matrixWorld);
      const baseMat = (Array.isArray(sm.material) ? sm.material[0] : sm.material) as import('three').MeshStandardMaterial;
      const mat = baseMat.clone(); mat.side = THREE.DoubleSide; mat.roughness = 1; mat.metalness = 0;
      mat.polygonOffset = true; mat.polygonOffsetFactor = -0.5; mat.polygonOffsetUnits = -0.5;
      const mesh = new THREE.Mesh(sm.geometry.clone(), mat);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      rel.decompose(p, q, s); mesh.position.copy(p); mesh.quaternion.copy(q); mesh.scale.copy(s);
      mesh.castShadow = false; mesh.frustumCulled = false; mesh.renderOrder = 46;
      root.add(mesh);
    });
    root.position.set(ELY.px, ELY.py, ELY.pz);
    root.rotation.set(ELY.rx, ELY.ry, ELY.rz);
    root.scale.setScalar(ELY.s);
    pb.add(root); elytraGroup = root;
  };
  (window as typeof window & { __ely?: unknown }).__ely = (rxDeg: number, ryDeg: number, rzDeg: number, px: number, py: number, pz: number, s: number, boneName?: string) => {
    ELY.rx = rxDeg * Math.PI / 180; ELY.ry = ryDeg * Math.PI / 180; ELY.rz = rzDeg * Math.PI / 180;
    ELY.px = px; ELY.py = py; ELY.pz = pz; ELY.s = s; if (boneName) ELY.bone = boneName;
    buildElytra();
    return { rxDeg, ryDeg, rzDeg, px, py, pz, s, bone: ELY.bone };
  };
  const setElytra = async (on: boolean) => {
    elytraOn = on;
    await buildElytra();
  };

  const setLighting = (o: { ambient?: number; directional?: number }) => {
    if (o.ambient !== undefined) ambient.intensity = o.ambient;
    if (o.directional !== undefined) key.intensity = o.directional;
  };

  // Clouds — mcrender's exact build (chunk 04--6mg4fuznz): one cube per opaque pixel of
  // clouds.png, a depth-only mask pass + a white opacity-0.8 pass, as a vast distant band
  // at y=120 drifting in X. Our camera matches mcrender's, so the band reads at the top.
  let cloudsGroup: import('three').Object3D | null = null;
  let cloudDrift = 5;   // X units/sec
  let cloudWrap = 1536; // = 128 * size
  const setClouds = (on: boolean, cfg?: { height: number; size: number; thickness: number; density: number; opacity: number; drift: number }) => {
    cloudDrift = cfg?.drift ?? 5;
    if (cloudsGroup) { scene.remove(cloudsGroup); cloudsGroup = null; }
    if (!on) return;
    const size = cfg?.size ?? 12, thick = cfg?.thickness ?? 6, height = cfg?.height ?? 35;
    const density = (cfg?.density ?? 100) / 100, opacity = (cfg?.opacity ?? 85) / 100;
    cloudWrap = 128 * size;
    const img = new window.Image();
    img.onload = () => {
      if (isDisposed() || !on || cloudsGroup) return;
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d'); if (!cx) return;
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const pts: [number, number][] = [];
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (!(d[i + 3] > 128 || d[i] > 128)) continue;
        // density: deterministic subsample (hash so it doesn't flicker on rebuild)
        if (density < 1 && ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 100) >= density * 100) continue;
        pts.push([x, y]);
      }
      if (!pts.length) return;
      const box = new THREE.BoxGeometry(size + 0.1, thick, size + 0.1);
      const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: false });
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false });
      const mask = new THREE.InstancedMesh(box, maskMat, pts.length);
      const white = new THREE.InstancedMesh(box, whiteMat, pts.length);
      mask.frustumCulled = false; white.frustumCulled = false; mask.renderOrder = 0; white.renderOrder = 0;
      const m = new THREE.Matrix4();
      pts.forEach((p, i) => { m.makeTranslation((p[0] - 128) * size, 0, (p[1] - 128) * size); mask.setMatrixAt(i, m); white.setMatrixAt(i, m); });
      mask.instanceMatrix.needsUpdate = true; white.instanceMatrix.needsUpdate = true;
      const grp = new THREE.Group(); grp.add(mask, white); grp.position.set(0, height, 0);
      scene.add(grp); cloudsGroup = grp;
    };
    img.src = '/textures/clouds.png';
  };

  const setPose = (p: PoseState) => {
    for (const name in restPos) bone[name]?.position.copy(restPos[name]);
    for (const b of BONES) {
      const o = bone[b.key]; if (!o || !restQ[b.key]) continue;
      const v = p[b.key] ?? { x: 0, y: 0, z: 0 };
      const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x * D2R, v.y * D2R, v.z * D2R, 'XYZ'));
      o.quaternion.copy(restQ[b.key]).multiply(dq);
    }
  };

  const setNode = (nt: NodeXform) => {
    for (const name in restPos) { bone[name]?.position.copy(restPos[name]); }
    for (const name in restQ) { bone[name]?.quaternion.copy(restQ[name]); }
    for (const name in nt) {
      const o = bone[name]; if (!o) continue;
      const t = nt[name];
      if (t.rotation) o.quaternion.setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'XYZ'));
      if (t.translation) o.position.set(t.translation[0], t.translation[1], t.translation[2]);
      if (t.scale !== undefined) o.scale.setScalar(t.scale);
    }
  };

  // Per-bone direct manipulation (drives the body-selector + transform panel,
  // mcrender-style). Rotations are absolute euler degrees on the bone (so the
  // slider shows the bone's current/rest value); reset restores the rest pose.
  const getBone = (name: string) => {
    const b = bone[name]; if (!b) return null;
    return {
      rx: b.rotation.x * 180 / Math.PI, ry: b.rotation.y * 180 / Math.PI, rz: b.rotation.z * 180 / Math.PI,
      px: b.position.x, py: b.position.y, pz: b.position.z,
    };
  };
  const setBoneRot = (name: string, axis: 'x' | 'y' | 'z', deg: number) => { const b = bone[name]; if (b) b.rotation[axis] = deg * Math.PI / 180; };
  const setBonePos = (name: string, axis: 'x' | 'y' | 'z', v: number) => { const b = bone[name]; if (b) b.position[axis] = v; };
  const resetBoneAxis = (name: string, kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => {
    const b = bone[name]; if (!b) return;
    if (kind === 'rot') {
      const rq = restQ[name]; if (rq) { const e = new THREE.Euler().setFromQuaternion(rq, 'XYZ'); b.rotation[axis] = e[axis]; }
    } else {
      const rp = restPos[name]; if (rp) b.position[axis] = rp[axis];
    }
  };

  // Whole-model transform (the "model transform" window) — rotates/moves the rig
  // wrapper, so EVERY bone moves together (not just the upper half).
  const getModel = () => ({
    rx: pivotGroup.rotation.x * 180 / Math.PI, ry: pivotGroup.rotation.y * 180 / Math.PI, rz: pivotGroup.rotation.z * 180 / Math.PI,
    px: modelGroup.position.x, py: modelGroup.position.y, pz: modelGroup.position.z,
  });
  const setModelRot = (axis: 'x' | 'y' | 'z', deg: number) => { pivotGroup.rotation[axis] = deg * Math.PI / 180; };
  const setModelPos = (axis: 'x' | 'y' | 'z', v: number) => { modelGroup.position[axis] = v; };
  const resetModelAxis = (kind: 'rot' | 'pos', axis: 'x' | 'y' | 'z') => {
    if (kind === 'rot') pivotGroup.rotation[axis] = 0; else modelGroup.position[axis] = 0;
  };

  // ── transform-gizmo controls (the viewport rotation rings) ──
  const gizmoAttach = (name: string | null) => {
    const b = name ? bone[name] : null;
    if (b) gizmo.attach(b); else gizmo.detach();
  };
  // rotate → pivotGroup (centre-pivot, matches getModel rotation);
  // translate → modelGroup (matches getModel position, doesn't clobber the pivot).
  const gizmoModel = (on: boolean, target: 'rotate' | 'translate' = 'rotate') => {
    if (!on) { gizmo.detach(); return; }
    gizmo.attach(target === 'translate' ? modelGroup : pivotGroup);
  };
  const setGizmoMode = (m: 'rotate' | 'translate') => gizmo.setMode(m);
  const onGizmo = (cb: (() => void) | null) => { gizmoCb = cb; };
  // Pick the selectable bone under the cursor by raycasting the model in WORLD space.
  // We compute each triangle's true skinned world position with the GPU formula
  // (boneMatrixWorld · boneInverse · bindMatrix · v) and intersect the world-space ray.
  // three's built-in SkinnedMesh.raycast can't be used: with the gltf's identity
  // bindMatrix, applyBoneTransform already returns world coords and the raycaster then
  // multiplies by mesh.matrixWorld a SECOND time → a double transform that misses every
  // part except near the origin. Computing world positions ourselves avoids that entirely.
  const SELECTABLE_BONES = new Set(['Head', 'Body', 'ArmLeftUpper', 'ArmLeftLower', 'ArmRightUpper', 'ArmRightLower', 'LegLeftUpper', 'LegLeftLower', 'LegRightUpper', 'LegRightLower']);
  const pickRay = new THREE.Raycaster();
  const _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _pC = new THREE.Vector3();
  const _base = new THREE.Vector3(), _tmp = new THREE.Vector3(), _hit = new THREE.Vector3(), _bm = new THREE.Matrix4();
  const skinnedWorld = (m: import('three').SkinnedMesh, i: number, out: import('three').Vector3) => {
    const geo = m.geometry;
    const pos = geo.attributes.position as import('three').BufferAttribute;
    const si = geo.attributes.skinIndex as import('three').BufferAttribute;
    const sw = geo.attributes.skinWeight as import('three').BufferAttribute;
    _base.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix);
    out.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(i, j); if (w === 0) continue;
      const bi = si.getComponent(i, j);
      _bm.multiplyMatrices(m.skeleton.bones[bi].matrixWorld, m.skeleton.boneInverses[bi]);
      out.addScaledVector(_tmp.copy(_base).applyMatrix4(_bm), w);
    }
  };
  const domBoneName = (m: import('three').SkinnedMesh, i: number): string | null => {
    const si = m.geometry.attributes.skinIndex as import('three').BufferAttribute;
    const sw = m.geometry.attributes.skinWeight as import('three').BufferAttribute;
    let slot = si.getX(i), best = sw.getX(i);
    if (sw.getY(i) > best) { best = sw.getY(i); slot = si.getY(i); }
    if (sw.getZ(i) > best) { best = sw.getZ(i); slot = si.getZ(i); }
    if (sw.getW(i) > best) { best = sw.getW(i); slot = si.getW(i); }
    let b: import('three').Object3D | null = m.skeleton.bones[slot];
    while (b && !SELECTABLE_BONES.has(b.name)) b = (b.parent && (b.parent as import('three').Bone).isBone) ? b.parent : null;
    return b && SELECTABLE_BONES.has(b.name) ? b.name : null;
  };
  const pickBone = (nx: number, ny: number): string | null => {
    if (!rig) return null;
    pickRay.setFromCamera(new THREE.Vector2(nx, ny), cam);
    const ray = pickRay.ray;
    let bestDist = Infinity, bestName: string | null = null;
    rig.traverse((o) => {
      const m = o as import('three').SkinnedMesh;
      if (!m.isSkinnedMesh || !m.visible) return;
      const geo = m.geometry;
      if (!geo.attributes.skinIndex || !geo.attributes.skinWeight) return;
      const index = geo.index;
      const triN = index ? index.count / 3 : geo.attributes.position.count / 3;
      const gi = (k: number) => (index ? index.getX(k) : k);
      for (let t = 0; t < triN; t++) {
        const ia = gi(t * 3), ib = gi(t * 3 + 1), ic = gi(t * 3 + 2);
        skinnedWorld(m, ia, _pA); skinnedWorld(m, ib, _pB); skinnedWorld(m, ic, _pC);
        if (!ray.intersectTriangle(_pA, _pB, _pC, false, _hit)) continue;
        const d = ray.origin.distanceToSquared(_hit);
        if (d < bestDist) { const name = domBoneName(m, ia); if (name) { bestDist = d; bestName = name; } }
      }
    });
    return bestName;
  };

  // mcrender's EXACT camera presets (position + lookAt), ported verbatim.
  const CAM_PRESETS: Record<CamPreset, { pos: [number, number, number]; at: [number, number, number] }> = {
    default: { pos: [0, 1.5, 5], at: [0, 1.5, 0] }, // mcrender's initial framing — headroom above the head for the nametag
    front: { pos: [0, 1, 4], at: [0, 0.5, 0] },
    back: { pos: [0, 1, -4], at: [0, 0.5, 0] },
    left: { pos: [-4, 1, 0], at: [0, 0.5, 0] },
    right: { pos: [4, 1, 0], at: [0, 0.5, 0] },
    top: { pos: [0, 5, 0.001], at: [0, 0.5, 0] }, // mcrender [0,5,0]; tiny z avoids OrbitControls gimbal
    isometric: { pos: [3, 3, 3], at: [0, 0.5, 0] },
    portrait: { pos: [0.645, 0.949, 1.843], at: [-0.001, 0.823, -0.01] },
    // mcrender's verbatim headshot (pos[.013,.942,1.603] at[1.144]) looks at the CHEST of this
    // 2.0-unit-tall rig → frames the whole torso, not the head. Retuned to frame head + shoulders.
    headshot: { pos: [0, 1.66, 1.07], at: [0, 1.8, -0.04] },
    overShoulder: { pos: [0.893, 1.585, -2.07], at: [0.296, 1.249, 0.161] },
    hero: { pos: [0.001, -0.14, 1.88], at: [0.001, 0.96, -0.32] },
    closeup: { pos: [0.361, 1.206, 1.439], at: [0.008, 1.123, 0.022] },
    thumbLeft: { pos: [-2.01, 0.506, 1.385], at: [-0.01, 0.506, -0.015] },
    thumbRight: { pos: [1.994, 0.512, 1.408], at: [-0.006, 0.512, 0.008] },
  };
  const setCamera = (p: CamPreset) => {
    const c = CAM_PRESETS[p]; if (!c) return;
    cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    controls.target.set(c.at[0], c.at[1], c.at[2]);
    controls.update();
  };

  // ── post-processing: bloom/glow ("свечение") + chromatic aberration ──
  // ── post-FX: mcrender's exact postprocessing-lib stack ──
  // EffectComposer(multisampling for AA) → RenderPass → one EffectPass holding
  // Bloom + Vignette + ChromaticAberration + HueSaturation + BrightnessContrast,
  // with mcrender's exact default params. Disabled effects are neutralised (param→0)
  // rather than removed, so no shader recompiles when toggling.
  const composer = new PP.EffectComposer(renderer, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
  composer.addPass(new PP.RenderPass(scene, cam));
  const bloomFx = new PP.BloomEffect({ intensity: 0, luminanceThreshold: 0.4, luminanceSmoothing: 0.025, mipmapBlur: true, radius: 0.8 });
  const vignetteFx = new PP.VignetteEffect({ offset: 0.3, darkness: 0, blendFunction: PP.BlendFunction.NORMAL });
  const chromaticFx = new PP.ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: false, modulationOffset: 0.15 });
  const hueSatFx = new PP.HueSaturationEffect({ hue: 0, saturation: 0 });
  const brightContrastFx = new PP.BrightnessContrastEffect({ brightness: 0, contrast: 0 });
  composer.addPass(new PP.EffectPass(cam, vignetteFx, bloomFx, chromaticFx, hueSatFx, brightContrastFx));
  const setBloom = (o: { enabled?: boolean; intensity?: number; threshold?: number }) => {
    if (o.intensity !== undefined || o.enabled !== undefined) bloomFx.intensity = (o.enabled ?? true) ? (o.intensity ?? bloomFx.intensity) : 0;
    if (o.threshold !== undefined) bloomFx.luminanceMaterial.threshold = o.threshold;
  };
  const setChromatic = (o: { enabled?: boolean; offset?: number }) => {
    // postprocessing 6.34's ChromaticAberration applies R=uv+offset / B=uv−offset (2× separation)
    // and ×aspect on Y — far stronger than mcrender's build at the same slider value. Scale to
    // a gentle fringe so the UI's 0.003 matches mcrender's subtle look.
    const v = (o.enabled ?? true) ? (o.offset ?? 0.003) * 0.35 : 0;
    (chromaticFx.offset as import('three').Vector2).set(v, v);
  };
  const setVignette = (o: { enabled?: boolean; darkness?: number; offset?: number }) => {
    if (o.offset !== undefined) vignetteFx.uniforms.get('offset')!.value = o.offset;
    if (o.darkness !== undefined || o.enabled !== undefined) vignetteFx.uniforms.get('darkness')!.value = (o.enabled ?? true) ? (o.darkness ?? 0.7) : 0;
  };
  const setSaturation = (v: number) => { hueSatFx.uniforms.get('saturation')!.value = v; };
  const setContrast = (v: number) => { brightContrastFx.uniforms.get('contrast')!.value = v; };

  // ── model outline — mcrender's exact drei <Outlines> shader: a BackSide copy of the
  // rig offset in CLIP space (screen-constant thickness), NOT world inflation (which
  // reads chunky/uneven). `size` = drawing-buffer size; thickness 0.05. ──
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: 0.05 }, screenspace: { value: false },
      size: { value: new THREE.Vector2(1, 1) },
      color: { value: new THREE.Color('black') }, opacity: { value: 1 },
    },
    vertexShader: `#include <common>
      #include <skinning_pars_vertex>
      uniform float thickness; uniform vec2 size;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 tNormal = vec4(objectNormal, 0.0);
        vec4 tPosition = vec4(transformed, 1.0);
        vec4 clipPosition = projectionMatrix * modelViewMatrix * tPosition;
        vec4 clipNormal = projectionMatrix * modelViewMatrix * tNormal;
        vec2 offset = normalize(clipNormal.xy) * thickness / size * clipPosition.w * 2.0;
        clipPosition.xy += offset;
        gl_Position = clipPosition;
      }`,
    fragmentShader: `uniform vec3 color; uniform float opacity;
      void main(){ gl_FragColor = vec4(color, opacity); }`,
    side: THREE.BackSide,
  });
  let outlineMeshes: import('three').Object3D[] = [];
  const setOutline = (o: { enabled?: boolean; color?: string }) => {
    outlineMeshes.forEach((m) => m.parent?.remove(m)); outlineMeshes = [];
    if (o.color) (outlineMat.uniforms.color.value as import('three').Color).set(o.color);
    if (!o.enabled || !rig) return;
    rig.traverse((node) => {
      const sm = node as import('three').SkinnedMesh;
      if (!sm.isMesh && !sm.isSkinnedMesh) return;
      let clone: import('three').Mesh;
      if (sm.isSkinnedMesh) { const c = new THREE.SkinnedMesh(sm.geometry, outlineMat); c.bind(sm.skeleton, sm.bindMatrix); clone = c; }
      else clone = new THREE.Mesh((node as import('three').Mesh).geometry, outlineMat);
      clone.renderOrder = -1; clone.frustumCulled = false; clone.castShadow = false;
      sm.parent?.add(clone); outlineMeshes.push(clone);
    });
  };

  // ── inner shadow — mcrender's exact onBeforeCompile fresnel edge-darken on the model
  // material (darkens the silhouette of the model itself, NOT the frame). ──
  const isU = { color: { value: new THREE.Color('#000000') }, intensity: { value: 0 }, distance: { value: 1 }, sharpness: { value: 1.5 } };
  const patchInnerShadow = (mat: import('three').Material & { userData: { isPatched?: boolean }; onBeforeCompile?: (s: { uniforms: Record<string, unknown>; fragmentShader: string }) => void }) => {
    if (mat.userData.isPatched) return; mat.userData.isPatched = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      prev?.(sh as never);
      sh.uniforms.uInnerShadowColor = isU.color; sh.uniforms.uInnerShadowIntensity = isU.intensity;
      sh.uniforms.uInnerShadowDistance = isU.distance; sh.uniforms.uInnerShadowSharpness = isU.sharpness;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 uInnerShadowColor;\nuniform float uInnerShadowIntensity;\nuniform float uInnerShadowDistance;\nuniform float uInnerShadowSharpness;\nvoid main() {')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          vec3 _is_vd = normalize(vViewPosition);
          float _is_f = 1.0 - abs(dot(_is_vd, normal));
          float _is_f2 = clamp(_is_f * uInnerShadowDistance, 0.0, 1.0);
          float _is_s = pow(_is_f2, uInnerShadowSharpness) * uInnerShadowIntensity;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uInnerShadowColor, clamp(_is_s, 0.0, 1.0));`);
    };
    (mat as import('three').Material).needsUpdate = true;
  };
  const setInnerShadow = (o: { enabled?: boolean; color?: string; intensity?: number; distance?: number; sharpness?: number }) => {
    if (o.color) isU.color.value.set(o.color);
    if (o.distance !== undefined) isU.distance.value = o.distance;
    if (o.sharpness !== undefined) isU.sharpness.value = o.sharpness;
    isU.intensity.value = (o.enabled ?? false) ? (o.intensity ?? 0.6) : 0;
    if (o.enabled && rig) rig.traverse((node) => {
      const m = node as import('three').Mesh;
      if (!m.isMesh && !(m as import('three').SkinnedMesh).isSkinnedMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => patchInnerShadow(mt as never));
    });
  };
  // Backdrop rendered INTO the scene so post-fx (bloom) composite over it
  // correctly instead of turning the transparent canvas black. Solid → Color;
  // gradient → a vertical CanvasTexture; None/transparent → null (CSS shows through).
  let bgTex: import('three').Texture | null = null;
  const setSceneBg = (css: string) => {
    bgTex?.dispose(); bgTex = null;
    if (!css || css === 'transparent') { scene.background = null; return; }
    if (css.startsWith('linear-gradient')) {
      const cols = gradientColors(css);
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
      const ctx = cv.getContext('2d');
      if (ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        cols.forEach((c, i) => g.addColorStop(cols.length === 1 ? 1 : i / (cols.length - 1), c));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
        bgTex = new THREE.CanvasTexture(cv); bgTex.colorSpace = THREE.SRGBColorSpace;
        scene.background = bgTex;
      }
    } else {
      try { scene.background = new THREE.Color(css); } catch { scene.background = null; }
    }
  };

  // ── 3D skin layers — REAL per-pixel voxel extrusion, like mcrender's VoxelOuterLayer ──
  // For every opaque texel of the 2nd-layer (char_alpha) geometry we drop a 1px cube on the
  // body surface, popped outward along the face normal by `(thickness/0.0625)` pixels — so
  // the slider's "2.40px" really is a 2.4px pop. Cubes are baked into per-bone InstancedMeshes
  // (grouped by the texel's dominant skin bone, parented with the inverse-bind matrix, exactly
  // like the armour bake) so they animate with the rig. When 3D is on we hide the flat overlay
  // and show the voxels; when off, the flat overlay returns. Rebuilt on skin / model change.
  // Faithful port of mcrender's VoxelOuterLayer (module 742273). Builds the 2nd layer
  // from the skin pixels + hardcoded MC box/UV tables (NOT the gltf overlay geometry):
  // every opaque 2nd-layer texel becomes a 0.0625² face extruded `thickness` along the
  // face normal; inner cap dropped + side faces culled against opaque neighbours so the
  // voxels merge into one solid per-bone mesh (voxel fur, fuzzy only at the silhouette).
  const buildVoxelLayer = () => {
    voxelGroups.forEach((g) => { g.parent?.remove(g); }); voxelGroups = [];
    const sm = overlayMeshes[0] as import('three').SkinnedMesh | undefined;
    if (!sm || !sm.isSkinnedMesh || !skinData) return;
    const sk = sm.skeleton;
    const slim = currentModel === 'slim';
    const BOX = slim ? VOX_BOX_SLIM : VOX_BOX_CLASSIC;
    const UV = slim ? VOX_UV_SLIM : VOX_UV_CLASSIC;
    const thickness = layers3dThk;
    const W = skinW, data = skinData.data;
    // binary opacity masks per part/face UV rect
    const masks: Record<string, Record<string, { w: number; h: number; mask: Uint8Array }>> = {};
    for (const part of Object.keys(UV)) {
      masks[part] = {};
      for (const face of Object.keys(UV[part])) {
        const [x0, y0, x1, y1] = UV[part][face];
        const w = x1 - x0, h = y1 - y0; const mk = new Uint8Array(w * h);
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) mk[r * w + c] = data[((y0 + r) * W + (x0 + c)) * 4 + 3] > 0 ? 1 : 0;
        masks[part][face] = { w, h, mask: mk };
      }
    }
    const A = (part: string, face: string, col: number, row: number) => {
      const n = masks[part]?.[face]; return !!n && col >= 0 && col < n.w && row >= 0 && row < n.h && n.mask[row * n.w + col] === 1;
    };
    const boneMap = new Map<string, { ibm: import('three').Matrix4; bone: import('three').Object3D }>();
    sk.bones.forEach((b, i) => boneMap.set(b.name, { ibm: sk.boneInverses[i], bone: b }));
    const resolveBone = (name: string | null) => {
      if (!name) return null;
      for (const al of (VOX_BONE_ALIASES[name] || [name])) { const f = boneMap.get(al); if (f) return f; }
      return null;
    };
    const partBone = (part: string, y: number): string | null => {
      switch (part) {
        case 'head': return 'Head';
        case 'body': return y >= 1.222 ? 'Chest' : 'Body';
        case 'armR': return y >= 1.129 ? 'ArmRightUpper' : 'ArmRightLower';
        case 'armL': return y >= 1.129 ? 'ArmLeftUpper' : 'ArmLeftLower';
        case 'legR': return y >= .376 ? 'LegRightUpper' : 'LegRightLower';
        case 'legL': return y >= .376 ? 'LegLeftUpper' : 'LegLeftLower';
        default: return null;
      }
    };
    const buckets = new Map<string, { positions: number[]; colors: number[]; indices: number[]; bone: import('three').Object3D }>();
    const V = new THREE.Vector3();
    const add3 = (a: number[], b: number[]): number[] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const mul3 = (a: number[], s: number): number[] => [a[0] * s, a[1] * s, a[2] * s];
    for (const part of Object.keys(BOX)) {
      const bounds = BOX[part]; const uvp = UV[part]; const skip = VOX_SKIP[part] || new Set<string>();
      for (const face of Object.keys(uvp)) {
        if (skip.has(face)) continue;
        const fg = voxFaceGeom(face, bounds); if (!fg) continue;
        const [x0, y0, x1, y1] = uvp[face]; const fw = x1 - x0, fh = y1 - y0;
        for (let row = 0; row < fh; row++) for (let col = 0; col < fw; col++) {
          if (!A(part, face, col, row)) continue;
          const pidx = ((y0 + row) * W + (x0 + col)) * 4;
          const cr = data[pidx], cg = data[pidx + 1], cb = data[pidx + 2], ca = data[pidx + 3] / 255;
          const yH = fg.origin[1] + fg.axisU[1] * (col + .5) + fg.axisV[1] * (row + .5) + fg.normal[1] * thickness * .5;
          const jb = resolveBone(partBone(part, yH)); if (!jb) continue;
          const E = jb.bone.name;
          let bk = buckets.get(E); if (!bk) { bk = { positions: [], colors: [], indices: [], bone: jb.bone }; buckets.set(E, bk); }
          // 8 cube corners (pixel face extruded `thickness` along normal), → bone-local via ibm
          const u = add3(add3(fg.origin, mul3(fg.axisU, col)), mul3(fg.axisV, row));
          const g3 = mul3(fg.normal, thickness);
          const h = [u, add3(u, fg.axisU), add3(u, fg.axisV), add3(add3(u, fg.axisU), fg.axisV), add3(u, g3), add3(add3(u, fg.axisU), g3), add3(add3(u, fg.axisV), g3), add3(add3(add3(u, fg.axisU), fg.axisV), g3)]
            .map((p) => { V.set(p[0], p[1], p[2]).applyMatrix4(jb.ibm); return [V.x, V.y, V.z]; });
          const lr = srgb2lin(cr / 255), lg = srgb2lin(cg / 255), lb = srgb2lin(cb / 255);
          const cubeFaces = [
            { v: [h[4], h[5], h[7], h[6]], skip: false },                       // outer cap
            { v: [h[2], h[3], h[1], h[0]], skip: true },                        // inner cap (against body)
            { v: [h[1], h[5], h[7], h[3]], skip: A(part, face, col + 1, row) }, // +U
            { v: [h[4], h[0], h[2], h[6]], skip: A(part, face, col - 1, row) }, // -U
            { v: [h[3], h[7], h[6], h[2]], skip: A(part, face, col, row + 1) }, // +V
            { v: [h[0], h[4], h[5], h[1]], skip: A(part, face, col, row - 1) }, // -V
          ];
          for (const fc of cubeFaces) {
            if (fc.skip) continue;
            const base = bk.positions.length / 3;
            for (const vert of fc.v) { bk.positions.push(vert[0], vert[1], vert[2]); bk.colors.push(lr, lg, lb, ca); }
            bk.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, flatShading: true, transparent: true, alphaTest: .001, depthWrite: true });
    buckets.forEach((bk) => {
      if (!bk.indices.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(bk.colors, 4));
      geo.setIndex(bk.indices); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.renderOrder = 4;
      bk.bone.add(mesh); voxelGroups.push(mesh);
    });
  };
  // Coordinate visibility of the flat overlay vs the voxel layer from both toggles.
  const applyLayers = () => {
    if (layers3dOn && secondLayerOn) {
      overlayMeshes.forEach((m) => { m.visible = false; });
      buildVoxelLayer();
    } else {
      voxelGroups.forEach((g) => { g.parent?.remove(g); (g as import('three').InstancedMesh).dispose?.(); }); voxelGroups = [];
      overlayMeshes.forEach((m) => { m.visible = secondLayerOn; });
    }
  };
  const set3DLayers = (on: boolean, thickness: number) => {
    layers3dOn = on; layers3dThk = thickness;
    applyLayers();
  };

  const resize = () => {
    const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    renderer.getDrawingBufferSize(outlineMat.uniforms.size.value as import('three').Vector2);
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(mount);

  let raf = 0;
  let lastT = 0;
  const loop = (t?: number) => {
    const now = t ?? 0; const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0.016; lastT = now;
    controls.update();
    // drift clouds in X and wrap around the band width (mcrender behaviour)
    if (cloudsGroup) { cloudsGroup.position.x += cloudDrift * dt; if (cloudsGroup.position.x > cloudWrap) cloudsGroup.position.x -= cloudWrap * 2; }
    composer.render(dt);
    // overlay the gizmo crisp on top, outside the post-FX chain
    if (gizmo.visible && (gizmo as unknown as { object?: object }).object) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(gizmoScene, cam);
      renderer.autoClear = true;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const exportPNG: StudioApi['exportPNG'] = async (o) => {
    const prevAspect = cam.aspect;
    const gizmoWasVisible = gizmo.visible;
    gizmo.visible = false; // keep the rotation rings out of the exported PNG
    renderer.setSize(o.width, o.height, false);
    composer.setSize(o.width, o.height);
    cam.aspect = o.width / o.height; cam.updateProjectionMatrix();
    renderer.getDrawingBufferSize(outlineMat.uniforms.size.value as import('three').Vector2);
    composer.render(0.016);

    const out = document.createElement('canvas');
    out.width = o.width; out.height = o.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    if (o.backdrop) {
      if (o.backdrop.startsWith('linear-gradient')) {
        const g = ctx.createLinearGradient(0, 0, 0, o.height);
        const cols = gradientColors(o.backdrop);
        cols.forEach((c, i) => g.addColorStop(cols.length === 1 ? 1 : i / (cols.length - 1), c));
        ctx.fillStyle = g;
      } else ctx.fillStyle = o.backdrop;
      ctx.fillRect(0, 0, o.width, o.height);
    }
    // saturation / contrast / vignette now live in the composer, so the canvas is final
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(renderer.domElement, 0, 0, o.width, o.height);
    // nametag is an in-scene billboard sprite → already composited above the head by the render
    cam.aspect = prevAspect; cam.updateProjectionMatrix(); resize();
    gizmo.visible = gizmoWasVisible;
    return await new Promise<Blob | null>((res) => out.toBlob((b) => res(b), 'image/png'));
  };

  // Swap the body rig (classic ↔ slim). Old rig + its bone-parented accessories
  // are dropped; the caller re-applies pose + accessories from React state. Skin
  // is re-applied here from the last-loaded texture.
  const setModel = async (kind: 'classic' | 'slim') => {
    if (kind === currentModel) return;
    currentModel = kind;
    if (rig) rig.parent?.remove(rig);
    held.main = null; held.off = null;
    hatObj = null; capeObj = null; armorGroups = []; elytraGroup = null;
    const g = await new GLTFLoader().loadAsync(MODEL_URL[kind]);
    if (isDisposed()) return;
    buildRig(g.scene);
    await setSkin(lastSkin);
  };

  return {
    setPose, setNode, setSkin, setCamera, setModel,
    getBone, setBoneRot, setBonePos, resetBoneAxis,
    getModel, setModelRot, setModelPos, resetModelAxis,
    gizmoAttach, gizmoModel, setGizmoMode, onGizmo, pickBone,
    setFloor: (on: boolean) => { floor.visible = on; },
    setFloorTexture,
    setSecondLayer: (on: boolean) => { secondLayerOn = on; applyLayers(); },
    setSceneBg,
    setFog: (o: { on: boolean; color?: string; near?: number; far?: number }) => {
      scene.fog = o.on ? new THREE.Fog(new THREE.Color(o.color ?? '#87ceeb').getHex(), o.near ?? 10, o.far ?? 100) : null;
    },
    setBloom, setChromatic, setVignette, setSaturation, setContrast, setOutline, setInnerShadow, set3DLayers,
    setHeld, setHeldTransform, setHat, setCape, setArmor, setElytra, setLighting, setClouds, setNametag,
    exportPNG,
    dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onSnapKey); window.removeEventListener('keyup', onSnapKey); gizmo.detach(); gizmo.dispose(); controls.dispose(); renderer.dispose(); renderer.domElement.parentNode?.removeChild(renderer.domElement); },
  };
}
