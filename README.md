# panda17TKpage

My Homepage — https://panda17tk.github.io/panda17TKpage/

A single static page with an animated, dot-art **night-highway** background
rendered in dependency-free WebGL (a fragment shader using a real pinhole
camera + ground-plane raycast).

## Structure

```
index.html        # markup (nav / hero / footer) + <canvas id="bg">
style.css         # styling + CSS gradient fallback background
js/
  config.js       # NH.PARAMS — single source of truth for every parameter
  shaders.js      # GLSL; uniform declarations are generated from NH.PARAMS
  scene.js        # WebGL renderer: lifecycle, render loop, uniform plumbing
  ui.js           # mobile nav toggle + footer year
  devpanel.js     # ?dev parameter panel (no dependencies)
  app.js          # entry point
test/
  render-smoke.js # headless-gl: compiles the shader and asserts a non-black frame
.github/workflows/ci.yml  # node --check + eslint + headless render test
```

Scripts are plain (non-module), `defer`-loaded in order, sharing `window.NH`.

## Tuning — one place

**`NH.PARAMS` in `js/config.js` is the single source of truth.** Each entry
describes a parameter (default, GLSL `uniform`, type, optional `map`, and
`?dev` UI). From it we auto-generate:

- the shader's `uniform` declarations,
- the uniform value uploads,
- the dev-panel controls.

Adding a parameter = add one descriptor (then reference its `uniform` in the
shader body). Values are validated/clamped on load, so a bad edit can't blank
the page.

To **persist tuned values**, paste them into `NH.OVERRIDES` in `config.js`.

### Live dev panel

Append `?dev` to the URL (e.g. the live URL + `?dev`) for sliders / colour
pickers that update in real time. **“Copy config JSON”** copies the current
values to paste into `NH.OVERRIDES`.

## Develop & verify

```
npm install            # eslint + headless-gl (for the render test)
npm run check          # node --check on all js/
npm run lint           # eslint
npm run test:render    # compile shader + assert a non-black frame (needs xvfb on Linux)
npm run serve          # http://localhost:8000  (add ?dev to tune)
```

CI (`.github/workflows/ci.yml`) runs syntax check, lint, and the headless
render smoke test on every push/PR — this catches shader-compile regressions
(the “blank background” class of bug) before they ship.

## Notes

- Renders into a low-res buffer upscaled with `image-rendering: pixelated`
  for the dot-art look (and to keep the GPU cost low).
- Pauses when the tab is hidden; freezes under `prefers-reduced-motion`;
  recovers from WebGL context loss; cleans up via `dispose()`.
- Falls back to a CSS gradient background if WebGL is unavailable.
