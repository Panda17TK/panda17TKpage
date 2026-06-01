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
  config.js       # all tunable parameters (NH.config) + dev-panel schema
  shaders.js      # GLSL (vertex + fragment) as template literals
  scene.js        # WebGL renderer: uniforms, render loop, lifecycle
  ui.js           # mobile nav toggle + footer year
  devpanel.js     # ?dev parameter panel (no dependencies)
  app.js          # entry point that wires everything together
```

The scripts are plain (non-module) and loaded in order at the end of
`index.html`, sharing a single `window.NH` namespace.

## Tuning the background

Every visual is driven by uniforms sourced from `NH.config` in
`js/config.js` — colours, camera (height / pitch / FOV), road geometry,
lamp layout, afterglow, palette steps, pixel resolution, etc. Edit the
values there; **no shader recompile or rebuild is required.**

### Live dev panel

Append `?dev` to the URL (e.g. `index.html?dev` or the live URL + `?dev`)
to open an on-screen panel with sliders/colour pickers that update the
scene in real time. Use **“Copy config JSON”** to copy your tuned values
back into `js/config.js`.

## Run locally

```
python3 -m http.server 8000
# open http://localhost:8000  (add ?dev to tune)
```

## Notes

- Renders into a low-resolution buffer that CSS upscales with
  `image-rendering: pixelated` for the dot-art look (also keeps the GPU
  cost low).
- Pauses when the tab is hidden and freezes when the OS requests
  `prefers-reduced-motion`. Recovers from WebGL context loss.
- Falls back to a CSS gradient background if WebGL is unavailable.
