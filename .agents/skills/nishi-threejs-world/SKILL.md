---
name: nishi-threejs-world
description: Improve, debug, and QA the existing Nishi Purple Universe Three.js world. Use for 3D scene work, camera destinations, lighting, materials, visual quality, mobile GPU performance, WebGL fallback, reduced motion, and world lifecycle. Do not use to scaffold a new game or replace the site's architecture.
---

# Nishi Three.js World Skill

## Mission
Make the existing Purple Universe feel like a polished, explorable, realistic 3D fantasy game world: cinematic purple atmosphere, believable scale, intentional composition, readable landmarks, and smooth navigation. Preserve the existing site's story, interactions, bilingual content, and OT7 balance.

## Mandatory first steps
1. Read `AGENTS.md`, `js/CONTRACT.md`, `NEXT_TASK.md`, and `MASTER_WORK_INVENTORY.md` when present.
2. Inspect current `js/world.js`, its callers, CSS canvas/fallback styles, and tests before editing.
3. Verify the current main SHA and release/CI state. Do not assume old handover notes are current.
4. Write a small gap → spec → risk → acceptance checklist before changing code.
5. Work only on an isolated branch. Never commit directly to `main`, merge, or deploy without explicit approval.

## Project-specific boundaries
- This is an existing vanilla HTML/CSS/ES-module project with vendored Three.js; no bundler or replacement scaffold.
- Keep the documented `js/world.js` public API stable: `initWorld`, `startIntro`, `setDestination`, `setQuality`, `onPointerMove`, `onScroll`, `resize`, `setReducedMotion`, and `dispose`.
- Preserve all named destinations: `portal`, `ot7`, `music`, `busan`, `quest`, `violet`, `road`, `promise`.
- Do not change PIN behavior, gift letter, signature, audio policy, quest privacy, content, or deployment configuration unless the task explicitly asks.
- Do not touch the Nova-AI repository.
- Do not add paid services, API keys, analytics, external runtime requests, or new runtime dependencies without approval.
- Do not add copyrighted BTS photos, logos, music, lyrics, or generated fake human faces. Use only assets already approved in the repository.
- Keep all seven BTS members equally represented. V may have the existing Violet Corner, but must not displace OT7.
- Keep English and Bangla content working.

## Visual direction
- Realistic 3D game-world presentation, not cartoon UI or a flat poster.
- Use deep-space purple, violet glow, moonlight, restrained gold accents, atmospheric depth, strong silhouettes, and readable landmarks.
- Prioritize the castle/portal focal point, moon, bridge, floating islands, and navigable destination framing where consistent with the current scene.
- Improve composition, material response, fog, lighting, and scale before adding decorative object count.
- Avoid visual noise, excessive bloom, overbright purple wash, and procedural primitives that look like placeholders.
- Keep the existing design tokens and dark backdrop from `js/CONTRACT.md`.

## Three.js engineering rules
- Reuse the existing renderer, scene graph, animation loop, and module patterns; do not create a second render loop.
- Make animation delta-time based and pause/limit work when the page is hidden or the scene is not needed.
- Handle resize and zero-sized canvases safely.
- Cap pixel ratio at 2 desktop and 1.5 mobile; preserve existing quality presets and quality switcher.
- Reduce shadow maps, particles, post-processing, geometry detail, and draw calls on low-end/mobile quality tiers.
- Prefer shared geometries/materials and instancing for repeated objects; dispose owned geometries, materials, and textures exactly once.
- Avoid per-frame allocations, repeated DOM queries, and unbounded particle creation.
- Handle WebGL initialization failure gracefully; the CSS fallback must remain useful and the rest of the site must still work.
- Respect `prefers-reduced-motion` and the public `setReducedMotion(bool)` API. Provide a still/low-motion experience, not merely hidden animation.
- Remove event listeners, observers, animation frames, and GPU resources in `dispose()`. Ensure init/dispose can be safely repeated.
- No network asset loads at runtime. Keep assets local and respect repository asset size limits.

## Interaction and accessibility
- Camera movement must not trap scrolling, block page controls, or make touch targets hard to use.
- Pointer/touch input must degrade safely on mobile and keyboard users must still reach all meaningful site controls.
- Keep focus indicators, semantic DOM controls, meaningful labels, and non-WebGL content available.
- Avoid motion that causes nausea; use restrained camera easing and respect reduced motion.

## Verification before claiming done
1. Run the repository's documented tests and checks; inspect package scripts before choosing commands.
2. Test all eight camera destinations and intro navigation.
3. Test desktop and narrow mobile viewport behavior, resize, orientation change, and touch input.
4. Test WebGL unavailable/failure fallback and reduced-motion mode.
5. Check browser console for errors and warnings; inspect resource cleanup across init/dispose.
6. Measure a representative scene on a mobile-like quality tier; do not claim physical-device QA unless actually tested on a physical device.
7. Report exact commands, pass/fail results, changed files, known limitations, and evidence. Never call a build green without observed output.

## Scope discipline
For a focused task, change the smallest number of files. Do not redesign unrelated UI or rewrite the world from scratch. If the requested visual result needs new assets, first specify the asset, license/source, dimensions, format, and size budget; do not silently download or invent external assets.
