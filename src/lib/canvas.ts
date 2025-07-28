/**
 * Simplified canvas abstraction for Skia Canvas
 * Based on skia-canvas best practices and direct API usage
 */

import { Canvas, type CanvasRenderingContext2D } from "skia-canvas";
import type { NeonStrokeConfig } from "../types";

/**
 * Create a canvas with specified dimensions
 */
export function createCanvas(width: number, height: number): Canvas {
  return new Canvas(width, height);
}

/**
 * Get 2D rendering context from canvas
 */
export function getContext(canvas: Canvas): CanvasRenderingContext2D {
  return canvas.getContext("2d");
}

/**
 * Export canvas to PNG buffer
 */
export async function exportToPNG(canvas: Canvas): Promise<Buffer> {
  return await canvas.toBuffer("png");
}

/**
 * Save canvas to file
 */
export async function saveCanvas(canvas: Canvas, outputPath: string): Promise<void> {
  await canvas.saveAs(outputPath);
}

/**
 * Convert hex color to rgba with alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Draw neon glow effect using multiple stroke layers
 */
export function drawNeonGlow(
  ctx: CanvasRenderingContext2D,
  coordinates: readonly { x: number; y: number }[],
  color: string,
  strokes: readonly NeonStrokeConfig[],
): void {
  if (coordinates.length === 0) return;

  // Draw each stroke layer from thickest to thinnest for proper layering
  for (const stroke of strokes) {
    ctx.save();

    // Set up stroke properties
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = hexToRgba(color, stroke.alpha);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Apply blur effect
    if (stroke.blur > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = stroke.blur;
    }

    // Draw the path
    ctx.beginPath();
    const first = coordinates[0];
    if (first) {
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < coordinates.length; i++) {
        const point = coordinates[i];
        if (point) {
          ctx.lineTo(point.x, point.y);
        }
      }
    }

    ctx.stroke();
    ctx.restore();
  }
}
