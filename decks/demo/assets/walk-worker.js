// Worker: the distribution of the end point of many random walks. Seeded, so a result depends only on the request.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

self.onmessage = ({ data: { revision, steps, walkers, seed, bins, half } }) => {
  const random = mulberry32(seed), counts = new Float64Array(bins), width = 2 * half / bins;
  let sum = 0, sumSquares = 0;
  for (let w = 0; w < walkers; w++) {
    let x = 0;
    for (let s = 0; s < steps; s++) x += random() < 0.5 ? -1 : 1;
    sum += x;
    sumSquares += x * x;
    const bin = Math.floor((x + half) / width);
    if (bin >= 0 && bin < bins) counts[bin] += 1;
  }
  const mean = sum / walkers;
  self.postMessage({ revision, counts, mean, sd: Math.sqrt(sumSquares / walkers - mean * mean) });
};
