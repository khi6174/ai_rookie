import {readFile} from "node:fs/promises";

const [timelinePath, fpsText = "30"] = process.argv.slice(2);
if (!timelinePath) throw new Error("Usage: node timeline-to-frames.mjs <timeline.json> [fps]");
const fps = Number(fpsText);
if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid fps: ${fpsText}`);

const raw = JSON.parse(await readFile(timelinePath, "utf8"));
if (!Array.isArray(raw)) throw new Error("Timeline must be a JSON array");

const entries = raw.map((entry, index) => {
  const id = String(entry.id ?? `entry-${index + 1}`);
  const startSeconds = Number(entry.startSeconds);
  const endSeconds = Number(entry.endSeconds);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) throw new Error(`${id}: startSeconds and endSeconds must be finite numbers`);
  if (startSeconds < 0 || endSeconds <= startSeconds) throw new Error(`${id}: invalid range ${startSeconds}..${endSeconds}`);
  const startFrame = Math.round(startSeconds * fps);
  const endFrame = Math.round(endSeconds * fps);
  return {...entry, id, startFrame, endFrame, durationInFrames: endFrame - startFrame};
});

const overlaps = [];
const sorted = [...entries].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
for (let index = 1; index < sorted.length; index += 1) {
  const previous = sorted[index - 1];
  const current = sorted[index];
  if (current.startFrame < previous.endFrame && !previous.allowOverlap && !current.allowOverlap) overlaps.push(`${previous.id} overlaps ${current.id}`);
}
process.stdout.write(`${JSON.stringify({fps, entries, overlaps}, null, 2)}\n`);
if (overlaps.length > 0) process.exitCode = 2;
