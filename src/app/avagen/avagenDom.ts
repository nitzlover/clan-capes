/**
 * Verbatim avatar-maker DOM, lifted from mcskins.top's `/avatar-maker` page
 * (the markup the `skinava.bundle.3.js` bundle wires itself onto at load).
 *
 * Kept as a raw HTML string and injected with dangerouslySetInnerHTML so every
 * id / class / data-attr matches the bundle's getElementById calls exactly —
 * we are running THEIR system unchanged, not re-deriving it. The only edits vs
 * the original:
 *   - `#skinbyname` src points at our same-origin vendored skin
 *     (`/avagen/skin-admin.png`) so the bundle can read its pixels without a
 *     CORS failure.
 *   - The server-POST <form> wrapper is dropped (we boot client-side); the
 *     inputs it contained are kept because the bundle queries them by id.
 *   - Ad / comment blocks removed.
 */
export const AVAGEN_HTML = /* html */ `
<div class="avagen-widget">
  <div class="avagen-optrow">
    <div class="optblock">
      <label for="username-field">Minecraft username</label>
      <input id="username-field" type="text" name="username" placeholder="username" value="" />
      <button type="button" id="form_submit">Get</button>
    </div>
    <img id="skinbyname" src="/avagen/skin-admin.png" alt="skin" crossorigin="anonymous" />
    <div class="imgupload">
      <label for="load_skin">or upload a skin (PNG, max 200 kB)</label>
      <input type="file" accept="image/png" id="load_skin" name="load_skin" />
    </div>
    <div class="optblock smallboxopt">
      <label for="quality">Quality</label>
      <select id="quality" name="quality">
        <option value="0">Low</option>
        <option value="1" selected>Medium</option>
        <option value="2">High</option>
      </select>
    </div>
    <div class="optblock smallboxopt">
      <label for="shadowsbox">Shadows</label>
      <input type="checkbox" id="shadowsbox" name="shadowsbox" checked />
    </div>
  </div>

  <div id="output" class="center"><div><p>The result will be here.</p></div></div>

  <div id="model-ava" class="section">
    <span class="meta">Custom
      <span id="edit-pose" class="edit-tabs active">pose</span> /
      <span id="edit-scene" class="edit-tabs">scene</span> /
      <span id="edit-items" class="edit-tabs">items</span>
    </span>

    <div class="model-controls-wrap">
      <div id="model-controls" class="active">
        <div class="switcher-controls">
          <div>Head only</div>
          <div><span id="head-switcher" class="switcher"></span></div>
        </div>

        ${limbRows([
          { key: 'skin', label: 'Model', e: false },
          { key: 'head', label: 'Head', e: false },
          { key: 'body', label: 'Body', e: false },
          { key: 'leftarm', label: 'Left arm', e: true },
          { key: 'rightarm', label: 'Right arm', e: true },
          { key: 'leftleg', label: 'Left leg', e: true },
          { key: 'rightleg', label: 'Right leg', e: true },
        ])}
      </div>

      <div id="scene-controls">
        <div>
          <div>Light intensity (set 30 / 0 for no shadows)</div>
          <div>
            <input type="range" min="0" max="100" value="20" class="slider" id="range-input-alight" />
            <input type="number" min="0" max="100" value="20" id="text-input-alight" />
          </div>
          <div>
            <input type="range" min="0" max="100" value="30" class="slider" id="range-input-dlight" />
            <input type="number" min="0" max="100" value="30" id="text-input-dlight" />
          </div>
          <div><div id="dlight-color" class="color" data-color="#ffffff"></div></div>
        </div>
        <div>
          <div>Sun position (drag the circle)</div>
          <div>
            <div id="light-area">
              <div class="light-steve"></div>
              <div id="light-point"></div>
            </div>
          </div>
        </div>
        <div class="switcher-controls">
          <div>Floor</div>
          <div><span id="floor-switcher" class="switcher"></span></div>
          <div id="floor-color" class="color" data-color="#ffffff"></div>
        </div>
        <div class="switcher-controls">
          <div>Background</div>
          <div><span id="bg-switcher" class="switcher"></span></div>
          <div id="bg-color" class="color" data-color="#ffffff"></div>
          <div id="bg-color2" class="color" data-color="#ffffff"></div>
        </div>
      </div>

      <div id="m-items">
        <div>
          <div id="m-item-left-arm" class="m-item-arms active" data-item="0">Left arm</div>
          <div class="m-item">
            <label for="m-item-left-arm-img"><input type="file" accept="image/png,image/gif,image/jpeg" id="m-item-left-arm-img" name="m-item-left-arm-img" /></label>
          </div>
          <div class="m-item"><div id="m-item-left-arm-visible" class="img"></div></div>
          <div class="m-item"><div id="m-item-left-arm-grip" class="img grip"></div></div>
        </div>
        <div>
          <div id="m-item-right-arm" class="m-item-arms" data-item="0">Right arm</div>
          <div class="m-item">
            <label for="m-item-right-arm-img"><input type="file" accept="image/png,image/gif,image/jpeg" id="m-item-right-arm-img" name="m-item-right-arm-img" /></label>
          </div>
          <div class="m-item"><div id="m-item-right-arm-visible" class="img"></div></div>
          <div class="m-item"><div id="m-item-right-arm-grip" class="img grip"></div></div>
        </div>
      </div>
    </div>

    <div id="canvas"></div>

    <div class="howto">drag to rotate · right-drag to move · wheel to zoom</div>
    <div class="share-pose"><button type="button" id="download-ava" class="download">Download</button></div>
    <span class="meta">Share custom pose settings</span>
    <div class="share-pose">
      <input type="text" id="pose-settings" placeholder="Paste settings, then Load" />
      <button type="button" id="copy-pose-button">Copy</button>
      <button type="button" id="load-pose-button">Load</button>
    </div>
  </div>
</div>
`;

function limbRows(
  limbs: { key: string; label: string; e: boolean }[],
): string {
  return limbs
    .map(
      (l) => /* html */ `
      <div class="limb-row">
        <div>${l.label}</div>
        ${axisInput(l.key, 'x')}
        ${axisInput(l.key, 'y')}
        ${axisInput(l.key, 'z')}
        ${l.e ? axisInput(l.key, 'e', 0, 200) : ''}
      </div>`,
    )
    .join('');
}

function axisInput(limb: string, axis: string, min = -360, max = 360): string {
  return /* html */ `
        <div>
          <input type="range" min="${min}" max="${max}" value="0" class="slider" id="range-input-${limb}-${axis}" />
          <input type="number" min="${min}" max="${max}" value="0" id="text-input-${limb}-${axis}" />
        </div>`;
}
