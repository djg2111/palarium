#!/usr/bin/env node
// Build the spawn-density ramp for the map overlay.
//
// Rules being followed (dataviz skill, references/color-formula.md):
//   - sequential encoding is ONE hue with monotone lightness, never a rainbow
//     and never a hue shift; the previous ramp slid amber -> red, which is two
//     hues doing the job of one
//   - on a dark surface the anchor flips: the low end recedes toward the
//     surface and the high end is the brightest step
//   - discrete steps, not a continuous gradient. ARK's spawn maps bucket theirs
//     too, and a reader can name "which bucket" but not "which shade".
//
// Hue is taken from the documented orange slot (#d95926 dark) rather than
// eyeballed. Orange because the surface here is a satellite map: blue is ocean
// and green is forest, so the documented blue sequential default would read as
// terrain rather than data.
const ANCHOR = '#d95926';
const STEPS = 5;

// --- sRGB <-> OKLab/OKLCH (Björn Ottosson) ---
const f = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const g = v => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function rgbToOklab([r, gr, b]) {
  r = f(r); gr = f(gr); b = f(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gr + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gr + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gr + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    g(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    g(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
const toHex = rgb => '#' + rgb.map(v =>
  Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
// pull chroma in until the colour is inside sRGB, so no step silently clips
function clampToGamut(L, C, H) {
  for (let c = C; c > 0; c -= 0.002) {
    const rgb = oklabToRgb([L, c * Math.cos(H), c * Math.sin(H)]);
    if (rgb.every(v => v >= -0.001 && v <= 1.001)) return {rgb, C: c};
  }
  return {rgb: oklabToRgb([L, 0, 0]), C: 0};
}

const [aL, aA, aB] = rgbToOklab(hexToRgb(ANCHOR));
const H = Math.atan2(aB, aA);
console.log(`anchor ${ANCHOR}  ->  L ${aL.toFixed(3)}  C ${Math.hypot(aA, aB).toFixed(3)}  ` +
  `H ${(H * 180 / Math.PI).toFixed(1)}deg\n`);

// L climbs monotonically; chroma peaks in the middle and eases off at the top so
// the brightest step doesn't go neon
const out = [];
for (let i = 0; i < STEPS; i++) {
  const t = i / (STEPS - 1);
  // The surface here is photographic terrain of middling luminance, not a flat
  // dark chart background, so the darkest step is lifted off 0.52 — at 0.52 the
  // low bucket read as a mud blanket over forest rather than as a weak signal.
  const L = 0.58 + 0.28 * t;
  const C = 0.11 + 0.075 * Math.sin(Math.PI * (0.25 + 0.6 * t));
  const {rgb, C: cUsed} = clampToGamut(L, C, H);
  const hex = toHex(rgb);
  out.push(hex);
  console.log(`step ${i + 1}/${STEPS}  L ${L.toFixed(3)}  C ${cUsed.toFixed(3)}  ${hex}`);
}
console.log(`\nramp: ${out.join(',')}`);

// Alpha climbs with lightness rather than sitting flat. Over imagery a constant
// alpha turns the low end into a blanket; monotone alpha in the same direction
// as lightness keeps the encoding single-meaning (weak recedes, strong
// dominates) while letting terrain read through the weak end.
const alphas = out.map((_, i) => +(0.26 + 0.34 * (i / (STEPS - 1))).toFixed(2));
console.log('alpha: ' + alphas.join(','));

// relative luminance contrast against a few things the ramp actually sits on
const lum = hex => {
  const [r, gr, b] = hexToRgb(hex).map(f);
  return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
console.log('\ncontrast against terrain the overlay lands on:');
for (const [name, bg] of [['deep ocean', '#0d3b4d'], ['forest', '#3f5c33'],
                          ['sand', '#c9bda4'], ['snow', '#e8eef2'], ['volcano rock', '#2b2733']]) {
  console.log('  ' + name.padEnd(13) + out.map(h => ratio(h, bg).toFixed(1).padStart(5)).join(''));
}
console.log('\nMonotone lightness is the check that matters for a sequential ramp;');
console.log('contrast varies by terrain, which is why the union also carries a hard edge.');
