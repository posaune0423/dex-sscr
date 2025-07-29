/**
 * Cloudflare R2 utilities
 * Handles image uploads, URL generation, and R2 bucket operations
 */

import { logger } from "../utils/logger";

/**
 * Upload image buffer to Cloudflare R2 and return the public URL
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  bucket: R2Bucket,
  contentType: string = "image/png",
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Upload to R2 bucket
    await bucket.put(key, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000", // Cache for 1 year
      },
    });

    // Generate public URL for R2
    // Using custom domain format, update this based on your R2 setup
    const url = `https://dex-sscr.r2.dev/${key}`;

    logger.info(`Successfully uploaded to R2: ${key} -> ${url}`);

    return {
      success: true,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown R2 upload error";
    logger.error(`Failed to upload to R2: ${message}`);

    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Generate a unique filename for R2 upload with timestamp and random suffix
 */
export function generateR2Key(tokenSymbol: string, periodHours: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `charts/${tokenSymbol.toLowerCase()}-${periodHours}h-${timestamp}-${randomSuffix}.png`;
}

// R2 bucket instance management
let r2Bucket: R2Bucket | null = null;

/**
 * Initialize R2 bucket from environment or create mock
 */
function initializeR2Bucket(bucket: R2Bucket): R2Bucket {
  // Try to use real R2 bucket from environment first
  if (bucket) {
    logger.info("Using real R2 bucket from environment");
    return bucket;
  }

  // Fallback to mock bucket for development
  logger.info("Using mock R2 bucket for development");
  return createMockR2Bucket();
}

/**
 * Get R2 bucket instance (singleton pattern)
 * Initializes on first call, returns cached instance afterwards
 */
export function getR2Bucket(bucket: R2Bucket): R2Bucket {
  if (!r2Bucket) {
    r2Bucket = initializeR2Bucket(bucket);
  }
  return r2Bucket;
}

/**
 * Reset R2 bucket instance (useful for testing)
 */
export function resetR2Bucket(): void {
  r2Bucket = null;
}

/**
 * Create a mock R2Bucket for development/testing
 * Note: In production, this would be injected from Cloudflare Workers environment
 */
function createMockR2Bucket(): R2Bucket {
  const mockBucket: R2Bucket = {
    async head() {
      return null;
    },
    async get() {
      return null;
    },
    async put(key: string, value: any, _options?: any) {
      // Mock implementation - in reality this would upload to R2
      logger.info(`Mock R2 upload: ${key} (${Buffer.isBuffer(value) ? value.length : "unknown"} bytes)`);
      return {
        key,
        version: "mock-version",
        size: Buffer.isBuffer(value) ? value.length : 0,
        etag: "mock-etag",
        httpEtag: "mock-http-etag",
        checksums: { toJSON: () => ({}) },
        uploaded: new Date(),
        storageClass: "STANDARD",
        writeHttpMetadata: () => {},
      };
    },
    async createMultipartUpload() {
      throw new Error("Not implemented");
    },
    resumeMultipartUpload() {
      throw new Error("Not implemented");
    },
    async delete() {},
    async list() {
      return { objects: [], delimitedPrefixes: [], truncated: false };
    },
  };

  return mockBucket;
}

/**
 * Validate R2 bucket configuration
 */
export function validateR2Bucket(bucket: R2Bucket | undefined): boolean {
  return bucket !== undefined;
}

/**
 * Get R2 public URL from key
 */
export function getR2PublicUrl(key: string): string {
  return `https://dex-sscr.r2.dev/${key}`;
}
