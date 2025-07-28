/**
 * Chart calculation utilities
 * Mathematical functions for chart data processing and analysis
 */

import type { ChartMetrics, Point } from "../types";

/**
 * Format price with appropriate precision based on value magnitude
 */
function formatPrice(price: number): number {
  if (price === 0) return 0;

  // For very small prices (< 0.01), use 6 significant digits
  if (Math.abs(price) < 0.01) {
    return Number(price.toPrecision(6));
  }

  // For normal prices, use 2 decimal places
  return Number(price.toFixed(2));
}

/**
 * Generate chart metrics for output
 */
export function generateChartMetrics(
  rawData: readonly Point[],
  downsampledData: readonly Point[],
  entryPrice: number,
  isBullish: boolean,
  outputPath: string,
  outputBytes: number,
  dimensions: { width: number; height: number; dpr: number },
): ChartMetrics {
  const lastPrice = rawData.length > 0 ? (rawData[rawData.length - 1]?.y ?? 0) : 0;

  return {
    pointsRaw: rawData.length,
    pointsDownsampled: downsampledData.length,
    isBullish,
    entryPrice: formatPrice(entryPrice),
    lastPrice: formatPrice(lastPrice),
    outputBytes,
    outputPath,
    size: `${dimensions.width}x${dimensions.height} @${dimensions.dpr}x`,
  };
}

/**
 * Calculate optimal downsampling width based on chart dimensions
 */
export function calculateOptimalDownsampleWidth(chartWidth: number, dpr: number, multiplier = 2): number {
  return Math.round(chartWidth * dpr * multiplier);
}

/**
 * Validate point data integrity
 */
export function validatePointData(points: readonly Point[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (points.length === 0) {
    errors.push("Data is empty");
    return { isValid: false, errors };
  }

  if (points.length < 2) {
    errors.push("Insufficient data points (minimum 2 required)");
  }

  // Check for NaN or invalid values
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) {
      errors.push(`Missing point at index ${i}`);
      continue;
    }

    if (!Number.isFinite(point.t) || !Number.isFinite(point.y)) {
      errors.push(`Invalid values at index ${i}: t=${point.t}, y=${point.y}`);
    }

    if (point.y < 0) {
      errors.push(`Negative price at index ${i}: ${point.y}`);
    }
  }

  // Check time ordering
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev && curr && curr.t <= prev.t) {
      errors.push(`Time ordering violation at index ${i}: ${curr.t} <= ${prev.t}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
