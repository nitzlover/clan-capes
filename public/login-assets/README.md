# Login asset slots

These files are referenced by **V6** of the login redesign preview
(`/login-preview/v6`). Drop any PNG (or JPG / WEBP — but PNG with transparency
is what reads best) at the paths below and the page will pick it up on the
next refresh. If a slot is empty the page renders a built-in B&W isometric
SVG block as fallback, so it never looks broken.

## Slots

```
/public/login-assets/
├── cubes/
│   ├── 01.png    ← top-left floating block
│   ├── 02.png    ← bottom-left floating block
│   ├── 03.png    ← top-right floating block
│   └── 04.png    ← bottom-right floating block
└── (the character is fetched live from mc-heads.net — see below)
```

## What to put in there

Any Minecraft-shaped prop works:

- Isometric block renders from **Blender** (recommended — full control,
  pixel-snappable, you can bake the exact lighting you want).
- Voxel renders of items / banners / capes.
- Pre-rendered PNG textures of vanilla blocks (e.g. diamond, emerald,
  netherite, end crystal).
- Anything else you want floating in the hero — a sword, a totem,
  a glowing pearl…

### Sizing recommendation

- Square canvas, 256×256 or 512×512.
- Transparent background.
- Centre the block inside the canvas with ~10% breathing room — the page
  positions / floats the entire image, so any padding becomes part of the
  prop.

### Colour

V6 forces grayscale via `filter: grayscale(1)` on the rendered cube, so even
a colourful render will read as B&W on this page. That's intentional — the
clan-capes admin panel rule is B&W chrome. Use whatever you want, the page
will desaturate it.

## Character render

The big standing character in the hero is fetched **live** from
[mc-heads.net](https://mc-heads.net/):

```
https://mc-heads.net/body/{username}/320
```

- Default: `MHF_Steve` (vanilla Steve fallback).
- Type any valid Minecraft name in the **Username** field on the form and
  the character preview updates live (debounced ~320 ms).
- If mc-heads.net is unreachable the page falls back to a B&W silhouette
  rendered inline.

If you'd rather pin a single static character render (e.g. a custom skin
exported from Blender), drop it at:

```
/public/login-assets/character.png
```

…and ping me — I'll wire it in as an additional override that beats the
mc-heads.net fetch. (Not auto-wired yet — keeping the slot list small until
you confirm V6 is the direction we're shipping.)

## How to swap

```
# windows / git bash
copy "C:\path\to\your\diamond_block_iso.png" "public\login-assets\cubes\01.png"
```

…or just drag-and-drop in your file explorer. Next.js dev server hot-reloads;
refresh the page and the new asset appears.

## Skin & character generation references

- mcskins.top avatar maker (your original ref):
  <https://mcskins.top/avatar-maker> — POST a skin / nickname, get back six
  3D PFP renders. Good for one-off hero shots.
- mc-heads.net (currently wired into V6):
  <https://mc-heads.net> — REST-style image endpoints, CORS-friendly.
- NameMC: <https://namemc.com> — browse named skins for inspiration.
