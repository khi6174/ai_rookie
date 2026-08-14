# Render and QA

## Windows-safe media handling

- Use `-LiteralPath` for PowerShell paths containing spaces or Korean characters.
- Quote every input and output path.
- Copy user media into `public/` for Remotion, but never overwrite the source.
- Before destructive cleanup, resolve and verify the exact workspace-contained path.

## Common commands

Inspect a source from a Remotion project with Mediabunny installed:

```powershell
node <skill-dir>\scripts\inspect-video.mjs "C:\path\video.mp4"
```

Validate a timeline:

```powershell
node <skill-dir>\scripts\timeline-to-frames.mjs timeline.json 30
```

Render a still:

```powershell
npx remotion still CompositionId "C:\output\preview.png" --frame=2700
```

Render the video:

```powershell
npx remotion render CompositionId "C:\output\final.mp4" --codec=h264 --audio-codec=aac --crf=16
```

Calculate a hash:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "C:\output\final.mp4"
```

On Windows systems that block local `.ps1` files, invoke the frame extractor explicitly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <skill-dir>\scripts\extract-frames.ps1 -Ffmpeg <ffmpeg.exe> -InputVideo <video.mp4> -OutputDirectory <frames-dir> -Times 00:01:30,00:01:48
```

## Acceptance checks

- The file opens and has a video track.
- Duration matches the intended composition within normal container rounding.
- Width, height, and fps match the requested delivery.
- An audio track exists when the source had audio.
- Every added label begins and ends at the requested times.
- No overlay hides an existing subtitle, control, person, or core UI state.
- The first and last frames outside each changed range are free of the overlay.
- Technical sentences appear in the intended order and do not overlap unexpectedly.
- Korean text is not clipped, corrupted, or substituted with tofu glyphs.
- The final MP4 frames, not only Remotion stills, were visually inspected.

## Quality notes

- Remotion re-encodes video and usually audio. Preserve content and synchronization, but do not claim byte-identical audio.
- CRF is a quality target, not a bitrate guarantee. Inspect the result for small UI text.
- If the output is much smaller than the source, verify fine text and gradients at original resolution.
- Keep the previous output until the new file passes QA.
