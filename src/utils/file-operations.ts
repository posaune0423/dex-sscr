/**
 * File operations utilities
 * Simplified with Sharp integration and direct skia-canvas API usage
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
// R2Bucket type is available globally from worker types
import sharp from "sharp";
import { FILE_CONFIG } from "../constants";
import { logger } from "./logger";

/**
 * Ensure output directory exists
 */
export async function ensureOutputDirectory(outputPath: string): Promise<void> {
  try {
    const dir = dirname(outputPath);
    await mkdir(dir, { recursive: true });
    logger.debug(`Ensured directory exists: ${dir}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to create directory: ${message}`);
    throw new Error(`Failed to create directory: ${message}`);
  }
}

/**
 * Optimize image using Sharp - leveraging its built-in optimization
 */
export async function optimizeImageWithSharp(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Use Sharp's built-in PNG optimization
    const optimizedBuffer = await sharp(imageBuffer)
      .png({
        quality: FILE_CONFIG.IMAGE_QUALITY,
        compressionLevel: FILE_CONFIG.PNG_COMPRESSION_LEVEL,
        progressive: true,
        // Enable optimal compression
        effort: 10, // Maximum compression effort
      })
      .toBuffer();

    const originalSize = imageBuffer.length;
    const optimizedSize = optimizedBuffer.length;
    const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(1);

    logger.debug(`Image optimized: ${originalSize} → ${optimizedSize} bytes (${savings}% savings)`);

    return optimizedBuffer;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`Image optimization failed, using original: ${message}`);
    return imageBuffer;
  }
}

/**
 * Write image buffer to file
 */
export async function writeImageFile(outputPath: string, imageBuffer: Buffer): Promise<void> {
  try {
    await writeFile(outputPath, imageBuffer);
    logger.debug(`Successfully wrote image to ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to write image file: ${message}`);
    throw new Error(`Failed to write image file: ${message}`);
  }
}

/**
 * Generate chart filename with timestamp
 */
export function generateChartFilename(tokenSymbol?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const token = tokenSymbol ? `${tokenSymbol.toLowerCase()}-` : "";
  return `${FILE_CONFIG.OUTPUT_DIR}/chart-${token}${timestamp}.png`;
}

/**
 * Legacy optimize function for backward compatibility
 */
export async function optimizeImage(imageBuffer: Buffer): Promise<Buffer> {
  return await optimizeImageWithSharp(imageBuffer);
}
