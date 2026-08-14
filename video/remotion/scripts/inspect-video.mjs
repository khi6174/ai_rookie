import {stat} from "node:fs/promises";
import {resolve} from "node:path";
import {ALL_FORMATS, FilePathSource, Input} from "mediabunny";

const requestedPath = process.argv[2];
if (!requestedPath) throw new Error("Usage: node scripts/inspect-video.mjs <video-path>");

const filePath = resolve(requestedPath);
const input = new Input({
  source: new FilePathSource(filePath),
  formats: ALL_FORMATS,
});

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

  process.stdout.write(
    `${JSON.stringify(
      {
        filePath,
        sizeBytes: file.size,
        durationSeconds: duration,
        width,
        height,
        codec,
        averageFrameRate: packetStats.averagePacketRate,
        hasAudioTrack: Boolean(audioTrack),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  input.dispose();
}
