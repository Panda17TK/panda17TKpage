# sasanoha-tk.github.io

My Homepage — https://sasanoha-tk.github.io/

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
  ui.js           # mobile nav toggle (focus-trap) + footer year
  devpanel.js     # ?dev parameter panel (no deps; persists to localStorage)
  app.js          # entry point (+ low-power quality tier; ?hq to force high)
test/
  render-smoke.js # headless-gl: compile shader, assert non-black + markings (landscape & portrait)
  check-uniforms.js # static check: every PARAMS/engine uniform is declared & used
  check-html.js     # static check: links resolve, local assets exist, rel=noopener
scripts/
  make-og.js        # render the scene to og-image.png (1200x630, social preview)
  make-favicon.js   # render favicon.png (64x64 night-road motif)
.github/workflows/ci.yml  # npm ci + check + lint + uniform/html checks + headless render
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
npm ci                 # eslint + headless-gl (pinned via package-lock.json)
npm run check          # node --check on js/ + scripts/
npm run lint           # eslint
npm run test:uniforms  # PARAMS <-> shader uniform sync
npm run test:html      # HTML links / local assets
npm run test:render    # compile shader + assert non-black/markings (needs xvfb on Linux)
npm run serve          # http://localhost:8000  (add ?dev to tune, ?hq for full quality)
```

CI (`.github/workflows/ci.yml`) runs these on every push to `main` / PR —
catching shader-compile regressions (the “blank background” bug), uniform
mismatches, and broken links before they ship.

## Regenerating image assets

`og-image.png` and `favicon.png` are committed binaries rendered from the
scene/motif. After changing the visuals (shader, colours, defaults),
regenerate them so the social preview / icon stay in sync:

```
xvfb-run -a npm run make:og        # og-image.png (1200x630)
npm run make:favicon               # favicon.png (64x64, no GPU needed)
```

## Performance

The fragment shader layers several effects (road, walls, lamps, distant
city, thin clouds). `js/app.js` applies a **low-power quality tier** on
coarse-pointer / narrow / few-core devices (lower `pixelRows`, fewer cloud
fbm octaves, fewer lamps). Append **`?hq`** to force full quality.

## Notes

- Renders into a low-res buffer upscaled with `image-rendering: pixelated`
  for the dot-art look (and to keep the GPU cost low).
- Pauses when the tab is hidden; freezes under `prefers-reduced-motion`;
  recovers from WebGL context loss; cleans up via `dispose()`.
- Falls back to a CSS gradient background if WebGL is unavailable.
