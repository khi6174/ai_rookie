# Timeline and design rules

## Timeline model

- Use one fps value for the composition and all frame conversions.
- Represent clip ranges as half-open intervals: `[startFrame, endFrame)`.
- Derive `durationInFrames` as `endFrame - startFrame`.
- Allow overlap only for an intentional transition or overlay.
- Use `premountFor` for assets that must be ready before their visible frame.
- For a 30 fps source, 0.25 seconds equals about 8 frames.

## Caption design

- Put narration captions near the bottom center only when they do not cover navigation or controls.
- Recommended background alpha: 0.55–0.72 for bright UI footage.
- Use high-contrast white text, Korean system fonts, and a short fade at both ends.
- Keep one logical sentence per caption card. Split only when reading speed or length requires it.
- Verify the longest real Korean sentence, not a placeholder.

## Role label design

- Prefer negative space beside portrait mobile footage.
- Use compact labels at roughly 12–18% of frame width.
- Use a dark neutral background with a subtle border and small shadow.
- Use context above and identity below, for example `지원이 필요한 기사` / `임세훈 기사 화면`.
- Use a pill and arrow for a short app-switch interval.
- Remove colored side rails or accent shadows when neutrality is requested.

## Technical animation design

- Stage 1: reveal the compute/source card, move data tokens toward the model, then reveal the first sentence.
- Stage 2: dim stage 1, connect the verified result to the hosted model or service, reveal audience icons, then reveal the second sentence.
- Use `interpolate()` with clamped values and a gentle bezier curve.
- Avoid subtitle-style full-width bars when the user requests no captions. Use the sentence as a scene heading with a short underline or other minimal emphasis.
- Keep provider names, quantities, and responsibilities exactly aligned with verified project evidence.

## Opening and ending

- Keep opening and ending visually quieter than the demo body.
- Do not add legal or performance claims the user has removed.
- Preserve required synthetic/mock disclosures in the product UI or approved end card when applicable.

## Accessibility

- Do not communicate role changes by color alone; always include text.
- Maintain sufficient text contrast.
- Avoid fast flashing, excessive scale jumps, and distracting motion.
