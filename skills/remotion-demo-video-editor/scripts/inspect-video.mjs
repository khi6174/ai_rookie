import {stat} from "node:fs/promises";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const projectRequire = createRequire(resolve(process.cwd(), "package.json"));
const mediabunnyEntry = projectRequire.resolve("mediabunny");
const importedMediabunny = await import(pathToFileURL(mediabunnyEntry).href);
const mediabunny = importedMediabunny.default ?? importedMediabunny;
const {ALL_FORMATS, FilePathSource, Input} = mediabunny;

const requestedPath = process.argv[2];
if (!requestedPath) throw new Error("Usage: node inspect-video.mjs <video-path>");

const filePath = resolve(requestedPath);
const input = new Input({source: new FilePathSource(filePath), formats: ALL_FORMATS});

try {
  const [file, duration, videoTrack, audioTrack] = await Promise.all([
    stat(filePath),
    input.getDurationFromMetadata(),
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);
  if (!videoTrack) throw new Error("The file has no video track");
  const [width, height, codec, packetStats] = await Promise.all([
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    videoTrack.getCodec(),
    videoTrack.computePacketStats(120),
  ]);
  process.stdout.write(`${JSON.stringify({
    filePath,
    sizeBytes: file.size,
    durationSeconds: duration,
    width,
    height,
    codec,
    averageFrameRate: packetStats.averagePacketRate,
    hasAudioTrack: Boolean(audioTrack),
  }, null, 2)}\n`);
} finally {
  input.dispose();
}
