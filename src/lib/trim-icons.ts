/**
 * Map trim-material registry keys to the vanilla item icon used in
 * smithing to apply that material. Lets the picker UI mirror what the
 * operator sees in-game when crafting a trim — iron ingot for iron,
 * lapis lazuli for lapis, diamond for diamond, etc.
 *
 * Resin maps to the brick variant rather than the clump because the
 * smithing recipe consumes a brick; the clump is just the raw drop.
 */
export const MATERIAL_ITEM_ICON: Record<string, string> = {
  iron: '/mc/item/iron_ingot.png',
  copper: '/mc/item/copper_ingot.png',
  gold: '/mc/item/gold_ingot.png',
  lapis: '/mc/item/lapis_lazuli.png',
  emerald: '/mc/item/emerald.png',
  diamond: '/mc/item/diamond.png',
  netherite: '/mc/item/netherite_ingot.png',
  redstone: '/mc/item/redstone.png',
  amethyst: '/mc/item/amethyst_shard.png',
  quartz: '/mc/item/quartz.png',
  resin: '/mc/item/resin_brick.png',
};

export function materialIconSrc(material: string): string {
  return MATERIAL_ITEM_ICON[material] ?? '';
}

/** Pattern → smithing-template item icon. */
export function patternIconSrc(pattern: string): string {
  return `/mc/item/${pattern}_armor_trim_smithing_template.png`;
}
