// Area and centroid of one detection, from its mask raster or, failing that, its box.

export interface Bounds {
  left: number;
  top: number;
  right: number; // half-open
  bottom: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface Footprint {
  areaFraction: number;
  centroid: { x: number; y: number };
}

/**
 * The raster is row-major, `maskWidth * maskHeight` entries of 0/1, and covers `bounds` in the frame.
 * SAM sizes it to the box, but scaling keeps this right if a mask ever comes back at another resolution.
 */
export function maskFootprint(
  raster: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  bounds: Bounds,
  frame: FrameSize,
): Footprint {
  const scaleX = (bounds.right - bounds.left) / maskWidth;
  const scaleY = (bounds.bottom - bounds.top) / maskHeight;
  let count = 0;
  let sumCol = 0;
  let sumRow = 0;
  for (let row = 0; row < maskHeight; row++) {
    for (let col = 0; col < maskWidth; col++) {
      if (raster[row * maskWidth + col] !== 1) continue;
      count++;
      sumCol += col;
      sumRow += row;
    }
  }
  // An empty mask means nothing visible: zero area, centroid at the box centre so it stays defined.
  if (count === 0) return { areaFraction: 0, centroid: boxCentroid(bounds, frame) };
  const area = count * scaleX * scaleY;
  return {
    areaFraction: clamp01(area / (frame.width * frame.height)),
    centroid: {
      x: clamp01((bounds.left + (sumCol / count + 0.5) * scaleX) / frame.width),
      y: clamp01((bounds.top + (sumRow / count + 0.5) * scaleY) / frame.height),
    },
  };
}

export function boxFootprint(bounds: Bounds, frame: FrameSize): Footprint {
  const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  return { areaFraction: clamp01(area / (frame.width * frame.height)), centroid: boxCentroid(bounds, frame) };
}

function boxCentroid(bounds: Bounds, frame: FrameSize): { x: number; y: number } {
  return {
    x: clamp01((bounds.left + bounds.right) / 2 / frame.width),
    y: clamp01((bounds.top + bounds.bottom) / 2 / frame.height),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
