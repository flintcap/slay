/**
 * Colour-vision maths for the accessibility checker.
 *
 * Simulates the three dichromacies with the Machado, Oliveira & Fernandes
 * (2009) matrices at full severity, applied in linear RGB, and measures how
 * far apart two colours look in CIELAB (Euclidean ΔE*ab). Two swatches under
 * about 10 read as "the same colour" at a glance; 20+ is comfortably distinct.
 */
export const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function linear(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => toLin(v / 255));
}

export function simulate(lin, matrix) {
  if (!matrix) return lin;
  return matrix.map((r) => Math.min(1, Math.max(0, r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2])));
}

export function lab(lin) {
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Relative luminance contrast ratio (WCAG) between two hex colours. */
export function contrast(a, b) {
  const L = (h) => {
    const l = linear(h);
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * For every vision type, the closest pair in a palette: `{ vision: { min, pair } }`.
 * `typical` is ordinary colour vision.
 */
export function closestPairs(palette) {
  const names = Object.keys(palette);
  const out = {};
  for (const [vision, m] of Object.entries({ typical: null, ...CVD })) {
    let min = Infinity;
    let pair = '';
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const d = deltaE(lab(simulate(linear(palette[names[i]]), m)), lab(simulate(linear(palette[names[j]]), m)));
        if (d < min) {
          min = d;
          pair = `${names[i]}/${names[j]}`;
        }
      }
    }
    out[vision] = { min, pair };
  }
  return out;
}
