'use client';

/**
 * /avagen — proof harness.
 *
 * Boots mcskins.top's actual `skinava.bundle.3.js` (vendored to
 * /public/avagen/js/) inside our app, against a verbatim copy of its DOM
 * (avagenDom.ts). This is the real pose-generator running 1:1 — three.js box
 * model from the skin PNG, limb sliders, items, pose copy/load — not a
 * re-implementation.
 *
 * Boot order matters:
 *   1. The bundle reads bare globals (`skinimg`, `readyMsg`, …) at eval time
 *      and throws ReferenceError if they're absent → set them on `window`
 *      FIRST.
 *   2. The DOM must exist before the bundle runs (it wires listeners by id at
 *      eval) → DOM is server-rendered via dangerouslySetInnerHTML, the script
 *      is injected in useEffect after mount.
 *   3. The original page's edit-tab switching lived in an inline <script>, not
 *      the bundle → reproduced here.
 *
 * This page is intentionally unstyled chrome (just enough dark CSS to see the
 * controls). Once it's confirmed working, the viewer gets embedded into the
 * B&W login with the cosmetic chrome stripped.
 */

import { useEffect, useRef } from 'react';
import { AVAGEN_HTML } from './avagenDom';

export default function AvagenPage() {
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // 1. Globals the bundle expects (original page declared these as top-level
    //    consts in a sibling classic <script>; we put them on window so the
    //    bundle's bare-identifier reads resolve).
    const w = window as unknown as Record<string, unknown>;
    // The bundle builds its three.js scene from El(skinimg) at the very end of
    // eval: `null !== skinimg && El(skinimg)`. On the original page this was a
    // safety net (skinimg=null there) and the scene actually built from the
    // window.onload → El(#skinbyname.src) path. But window.onload already fired
    // long before we inject the bundle client-side, so that path is dead here.
    // Setting skinimg to the skin URL makes the eval-time path build the scene.
    w.skinimg = '/avagen/skin-admin.png';
    w.readyMsg = 'Click the image to download, or right-click → Save image as…';
    w.sizeErrMsg = 'File size exceeds 200 kB';
    w.copyText = 'Copy';
    w.copyErrMsg = 'Error';
    w.copySuccess = 'Copied!';
    w.loadErrMsg = 'Loading error';

    // 2. Edit-tab switching (pose / scene / items) — was page inline script.
    const editBtn: Record<string, HTMLElement | null> = {
      pose: document.getElementById('edit-pose'),
      scene: document.getElementById('edit-scene'),
      items: document.getElementById('edit-items'),
    };
    const controls: Record<string, HTMLElement | null> = {
      pose: document.getElementById('model-controls'),
      scene: document.getElementById('scene-controls'),
      items: document.getElementById('m-items'),
    };
    const tabHandlers: Array<[HTMLElement, () => void]> = [];
    for (const key of Object.keys(editBtn)) {
      const btn = editBtn[key];
      if (!btn) continue;
      const handler = () => {
        if (btn.classList.contains('active')) return;
        for (const k of Object.keys(editBtn)) {
          controls[k]?.classList.remove('active');
          editBtn[k]?.classList.remove('active');
        }
        controls[key]?.classList.add('active');
        btn.classList.add('active');
      };
      btn.addEventListener('click', handler);
      tabHandlers.push([btn, handler]);
    }

    // 3. Inject the vendored bundle. It's a UMD module that runs immediately
    //    on eval, builds the three.js scene in #canvas, and reads #skinbyname
    //    for the skin.
    //
    //    NOT removed on cleanup: React 19 StrictMode double-invokes effects in
    //    dev (mount → cleanup → mount). Removing the <script> in cleanup tore
    //    it out before its async network load finished, so it never executed
    //    and #canvas stayed empty. We inject once, keyed by id, and leave it —
    //    the bundle is a one-shot global, re-running it would double-build.
    const SCRIPT_ID = 'skinava-bundle';
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = '/avagen/js/skinava.bundle.3.js';
      script.async = false;
      document.body.appendChild(script);
    }

    return () => {
      tabHandlers.forEach(([btn, h]) => btn.removeEventListener('click', h));
    };
  }, []);

  return (
    <main className="avagen-page">
      <header>
        <h1>avagen · mcskins pose generator (vendored)</h1>
        <a href="/login-preview">← variants</a>
      </header>

      {/* The bundle owns everything inside this node. */}
      <div dangerouslySetInnerHTML={{ __html: AVAGEN_HTML }} />

      <style jsx global>{`
        .avagen-page {
          min-height: 100dvh;
          background: #0a0a0a;
          color: #ededed;
          font-family: var(--font-sans);
          padding: 24px;
        }
        .avagen-page header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .avagen-page header h1 {
          font-family: var(--font-mono);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #fff;
        }
        .avagen-page header a {
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.55);
        }

        /*
         * The bundle's three.js canvas (#canvas, 900×900 internally) lives
         * deep inside #model-ava. Rather than fight the original DOM order, we
         * lift it out of flow and pin it to the right of the controls so it's
         * always visible while you pose. Controls scroll on the left.
         */
        .avagen-widget {
          position: relative;
          padding-right: 480px;
        }
        @media (max-width: 1100px) {
          .avagen-widget {
            padding-right: 0;
          }
        }

        #canvas {
          position: absolute;
          top: 0;
          right: 0;
          width: 440px;
          height: 440px;
          background: #050505;
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        @media (max-width: 1100px) {
          #canvas {
            position: relative;
            width: 100%;
            max-width: 440px;
            margin: 20px auto 0;
          }
        }
        #canvas canvas {
          display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          width: 420px !important;
          height: 420px !important;
        }

        /* controls column */
        #model-ava {
          order: 2;
        }
        .avagen-widget > div:first-child,
        .avagen-optrow {
          order: 1;
        }
        .avagen-optrow {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .avagen-optrow #skinbyname {
          width: 64px;
          height: 64px;
          image-rendering: pixelated;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #050505;
        }
        .avagen-optrow label {
          display: block;
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 6px;
        }
        .avagen-optrow input[type='text'],
        .avagen-optrow select {
          height: 38px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #fff;
          padding: 0 10px;
          font-family: var(--font-sans);
        }
        #form_submit,
        .share-pose button {
          height: 34px;
          padding: 0 14px;
          background: #fff;
          color: #000;
          border: 1px solid #fff;
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          cursor: pointer;
        }

        .edit-tabs {
          cursor: pointer;
          color: rgba(255, 255, 255, 0.45);
          text-transform: uppercase;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.16em;
        }
        .edit-tabs.active {
          color: #fff;
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .meta {
          display: block;
          margin: 14px 0 10px;
          color: rgba(255, 255, 255, 0.5);
        }

        #model-controls,
        #scene-controls,
        #m-items {
          display: none;
        }
        #model-controls.active,
        #scene-controls.active,
        #m-items.active {
          display: block;
        }

        .limb-row {
          display: grid;
          grid-template-columns: 70px repeat(4, 1fr);
          gap: 8px;
          align-items: center;
          padding: 6px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }
        .limb-row > div:first-child {
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.6);
        }
        .limb-row input[type='number'] {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #fff;
          font-size: 12px;
          padding: 2px 4px;
        }
        .slider {
          width: 100%;
          accent-color: #ffffff;
        }

        .switcher-controls {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.6);
        }
        .switcher {
          display: inline-block;
          width: 34px;
          height: 18px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 999px;
          position: relative;
          cursor: pointer;
        }
        .color {
          width: 20px;
          height: 20px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          cursor: pointer;
        }
        #light-area {
          width: 120px;
          height: 120px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          position: relative;
          background: #050505;
        }
        #light-point {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #ffd34d;
          position: absolute;
          left: 50%;
          top: 20%;
          cursor: grab;
        }

        #m-items {
          display: none;
        }
        #m-items.active {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .m-item-arms {
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          padding: 6px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          cursor: pointer;
          color: rgba(255, 255, 255, 0.6);
        }
        .m-item-arms.active {
          color: #000;
          background: #fff;
        }
        .m-item .img {
          width: 48px;
          height: 48px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #050505;
          image-rendering: pixelated;
        }

        .share-pose {
          display: flex;
          gap: 8px;
          margin: 10px 0;
        }
        #pose-settings {
          flex: 1;
          height: 34px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #fff;
          padding: 0 10px;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .howto {
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(255, 255, 255, 0.4);
          margin: 10px 0;
        }
        #output {
          display: none;
        }
      `}</style>
    </main>
  );
}
