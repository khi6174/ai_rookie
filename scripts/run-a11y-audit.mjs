import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const styles = await readFile(resolve(root, "src/ui/styles.css"), "utf8");

const tokenValues = new Map(
  [...styles.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
    ([, name, value]) => [name, value.toLowerCase()],
  ),
);

function token(name) {
  const value = tokenValues.get(name);
  if (!value) throw new Error(`Missing color token ${name}`);
  return value;
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const checks = [
  ["text on canvas", "--color-text", "--color-canvas", 4.5],
  ["muted text on canvas", "--color-text-muted", "--color-canvas", 4.5],
  ["disabled text on canvas", "--color-text-disabled", "--color-canvas", 4],
  ["text on navy 950 pastel", "--color-text", "--color-navy-950", 4.5],
  ["text on navy 900 pastel", "--color-text", "--color-navy-900", 4.5],
  ["text on navy 800 pastel", "--color-text", "--color-navy-800", 4.5],
  ["surface on primary blue", "--color-surface", "--color-blue-700", 4.5],
  ["surface on danger red", "--color-surface", "--color-red-700", 4.5],
  ["surface on safe green", "--color-surface", "--color-teal-700", 3],
];

const failures = checks.flatMap(([label, foreground, background, minimum]) => {
  const ratio = contrast(token(foreground), token(background));
  return ratio >= minimum
    ? []
    : [`${label}: ${ratio.toFixed(2)}:1, expected at least ${minimum}:1`];
});

if (!/--font-sans:[^;]*Pretendard[^;]*system-ui[^;]*sans-serif/i.test(styles)) {
  failures.push("Korean-capable local/system font fallback stack is missing");
}

if (/color:\s*var\(--color-navy-(?:950|900|800)\)/.test(styles)) {
  failures.push("Pastel navy surface tokens are still used as text colors");
}

if (failures.length) {
  throw new Error(`A11Y_TOKEN_CONTRAST_FAILED\n${failures.join("\n")}`);
}

console.log(`A11Y_TOKEN_CONTRAST_PASS checks=${checks.length + 2}`);

["amber chip", "--color-amber-600", "--color-amber-100", 4.5]
["safe chip",  "--color-teal-700",  "--color-teal-100",  4.5]