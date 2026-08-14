---
name: remotion-demo-video-editor
description: Create and revise presentation/demo videos with Remotion, including MP4 clip assembly, opening and ending scenes, JSON-timed Korean captions, caption opacity and timing changes, compact role/screen labels, app-switch transition labels, two-step infographic animations, voiceover scripts, final-video overlays, still previews, H.264/AAC rendering, metadata inspection, frame extraction, and SHA-256 verification. Use for requests to edit one or more MP4 files, add or remove timed explanatory text, distinguish speakers or app screens, animate technical explanations, preserve an existing final cut while adding overlays, or deliver a verified final video.
---

# Remotion Demo Video Editor

Build or revise a demo video while preserving the source, timing, audio content, and factual boundaries.

## Select the edit path

1. Inspect the source video(s), repository instructions, and current Remotion project.
2. Use **overlay mode** when the user supplies an already-finished MP4 and asks only for labels, annotations, or a small visual addition. Wrap the MP4 in a new composition; do not reconstruct its edit.
3. Use **assembly mode** when the user supplies several clips or asks to change opening, ending, clip order, scenario captions, or a dedicated animated scene.
4. Use existing Remotion compositions and dependencies where possible. Do not create a second project unless no suitable project exists.
5. Load the applicable Remotion skills before writing markup or rendering.

## Establish the timeline

- Inspect duration, dimensions, fps, codec, and audio before editing. Use `scripts/inspect-video.mjs` inside a project that has `mediabunny` available.
- Convert seconds to frames with `round(seconds * fps)`. Run `scripts/timeline-to-frames.mjs` on a timeline JSON to catch negative ranges and unintended overlaps.
- Treat user-provided ranges as exact unless the visible source transition proves a small correction is required.
- Keep captions, role labels, switch labels, technical scenes, and voiceover lines as separate timeline layers.
- Preserve an untouched copy of every user-supplied MP4. Write a newly named output unless the user explicitly requests replacement.

Read [references/timeline-and-design.md](references/timeline-and-design.md) when choosing timing, placement, opacity, or animation style.

## Build the edit

### Assemble clips

- Put media consumed by Remotion under `public/` with stable, Unicode-safe names.
- Use `<Video>` from `@remotion/media`, `staticFile()`, explicit `from`, and explicit `durationInFrames`.
- Keep one authoritative table for clip start frames and durations. Do not duplicate timing arithmetic across components.
- Preserve the natural aspect ratio unless the user explicitly requests cropping.

### Add scenario captions

- Store editable caption copy in JSON with `text`, `startMs`, `endMs`, `timestampMs`, and `confidence` where compatible with `@remotion/captions`.
- Use the template [TimedCaptionTrack.tsx](assets/remotion-overlay-kit/TimedCaptionTrack.tsx).
- Apply fades with `useCurrentFrame()` and `interpolate()`; never use CSS transitions or keyframe animations.
- Keep the caption background translucent and place it above mobile navigation or other important UI.
- When changing only one caption's timing, edit only that entry and verify the neighboring boundaries.

### Add compact role or screen labels

- Use [RoleOverlayTrack.tsx](assets/remotion-overlay-kit/RoleOverlayTrack.tsx).
- Place role labels in low-information negative space, usually upper-left or upper-right, away from existing subtitles.
- Use a two-level label: small role context and larger screen/person name.
- Use a pill label for a short screen/app switch.
- Avoid decorative colored rails, accents, or shadows when the user asks for a neutral label.

### Add a two-step technical animation

- Use [TwoStepTechScene.tsx](assets/remotion-overlay-kit/TwoStepTechScene.tsx) as a structural starting point.
- Show one idea at a time: source/data → processing/model, then verified result → downstream audiences.
- Display the two narration sentences sequentially as scene headings, not subtitle bars, when the user requests no captions.
- Use simple diagrams, cards, paths, pulses, and icons. Keep the scene readable at the delivery resolution.
- Separate verified facts from claims. Do not imply real-world performance, live deployment, or AI decision authority without evidence.

### Manage narration

- Keep the final voiceover text in a separate UTF-8 Markdown or text file.
- Match on-screen wording to narration but avoid showing every spoken word as a subtitle when the user requests an infographic.
- Do not synthesize or replace voice audio unless the user explicitly requests it.

## Preview before the full render

1. Run lint and TypeScript checks.
2. Render stills at the midpoint of every changed segment.
3. Inspect the stills visually at original detail.
4. Check entrance and exit boundary frames for overlaps, abrupt cuts, or one-frame flashes.
5. Iterate before rendering the full video.

Use these preview targets at minimum:

- one representative caption frame;
- every role label state and switch state;
- both steps of a two-step technical animation;
- opening/ending if changed.

## Render and verify

- Render H.264 with AAC audio unless the user requests another format.
- Start with CRF 16–20. Match source width, height, and fps for overlay mode.
- Verify the rendered file rather than only the composition preview.
- Check duration, dimensions, fps, codec, and audio track.
- Extract frames from the actual MP4 at every changed segment using `scripts/extract-frames.ps1` or equivalent FFmpeg commands.
- Calculate a SHA-256 hash.
- Report any re-encoding or duration rounding honestly; do not claim bit-exact audio preservation after a Remotion render.

Read [references/render-and-qa.md](references/render-and-qa.md) for commands, acceptance checks, and Windows path handling.

## Delivery requirements

- Lead with the output file link.
- List changed time ranges and concise labels.
- State that the original was preserved when true.
- Report duration, resolution, fps, codec, and presence of audio.
- Mention skipped or failed verification explicitly.

## Bundled resources

- `assets/remotion-overlay-kit/TimedCaptionTrack.tsx`: JSON-driven translucent captions.
- `assets/remotion-overlay-kit/RoleOverlayTrack.tsx`: neutral role and switch labels.
- `assets/remotion-overlay-kit/TwoStepTechScene.tsx`: sequential infographic scene.
- `scripts/inspect-video.mjs`: Mediabunny metadata inspection.
- `scripts/timeline-to-frames.mjs`: timeline validation and frame conversion.
- `scripts/extract-frames.ps1`: deterministic FFmpeg still extraction.
- `references/timeline-and-design.md`: layout and timing rules.
- `references/render-and-qa.md`: render and verification workflow.
