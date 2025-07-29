/**
 * Database operations and OHLCV data processing
 * Simplified with direct skia-canvas usage
 */

import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { CHART_DEFAULTS, DB_CONFIG } from "../constants";
import { getDB } from "../db";
import { tokenOHLCV, tokens } from "../db/schema";
import type { OHLCVDataParams, OHLCVDataResult, Point } from "../types";
import { logger } from "./logger";

/**
 * Get all available token addresses from the database
 */
export async function getAvailableTokens(): Promise<string[]> {
  try {
    const db = getDB();
    const results = await db.selectDistinct({ token: tokenOHLCV.token }).from(tokenOHLCV);

    const tokenAddresses = results.map((row) => row.token);
    logger.debug(`Found ${tokenAddresses.length} tokens with OHLCV data`);
    return tokenAddresses;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to get available tokens: ${message}`);
    return [];
  }
}

/**
 * Get token information by symbol
 */
export async function getTokenBySymbol(
  symbol: string,
): Promise<{ address: string; name: string; symbol: string } | null> {
  try {
    const db = getDB();
    const result = await db
      .select({
        address: tokens.address,
        name: tokens.name,
        symbol: tokens.symbol,
      })
      .from(tokens)
      .where(eq(tokens.symbol, symbol.toUpperCase()))
      .limit(1);

    if (result.length === 0) {
      logger.debug(`Token with symbol ${symbol} not found`);
      return null;
    }

    const token = result[0];
    if (!token) {
      logger.debug(`Token with symbol ${symbol} not found`);
      return null;
    }

    logger.debug(`Found token ${symbol}: ${token.address}`);
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to get token by symbol ${symbol}: ${message}`);
    return null;
  }
}

/**
 * Get all tokens with their details that have OHLCV data
 */
export async function getAvailableTokensWithDetails(): Promise<
  Array<{ address: string; name: string; symbol: string }>
> {
  try {
    const db = getDB();

    // Get tokens that have OHLCV data
    const availableAddresses = await getAvailableTokens();

    if (availableAddresses.length === 0) {
      return [];
    }

    // Get token details for available addresses using a loop approach
    const tokenDetails: Array<{ address: string; name: string; symbol: string }> = [];

    for (const address of availableAddresses) {
      if (!address) continue; // Skip undefined addresses

      const tokenResult = await db
        .select({
          address: tokens.address,
          name: tokens.name,
          symbol: tokens.symbol,
        })
        .from(tokens)
        .where(eq(tokens.address, address))
        .limit(1);

      if (tokenResult.length > 0) {
        const token = tokenResult[0];
        if (token) {
          tokenDetails.push(token);
        }
      }
    }

    logger.debug(`Found ${tokenDetails.length} tokens with details and OHLCV data`);
    return tokenDetails;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to get available tokens with details: ${message}`);
    return [];
  }
}

/**
 * Resolve token address from symbol or address string
 */
export async function resolveTokenAddress(input: string): Promise<string | null> {
  try {
    // If input looks like an address (long string), return as is
    if (input.length > 20) {
      logger.debug(`Input appears to be an address: ${input}`);
      return input;
    }

    // Try to resolve as symbol
    const tokenInfo = await getTokenBySymbol(input);
    if (tokenInfo) {
      logger.debug(`Resolved symbol ${input} to address: ${tokenInfo.address}`);
      return tokenInfo.address;
    }

    logger.warn(`Could not resolve token: ${input}`);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to resolve token ${input}: ${message}`);
    return null;
  }
}

/**
 * Validate that a token has sufficient OHLCV data for chart generation
 */
export async function validateTokenForCharting(
  tokenAddress: string,
  minimumDataPoints = CHART_DEFAULTS.MIN_DATA_POINTS,
): Promise<{ isValid: boolean; dataCount: number; latestTimestamp?: Date }> {
  try {
    const db = getDB();

    // Run count and latest data queries in parallel
    const [countResult, latestData] = await Promise.all([
      // Count available data points for the token
      db
        .select({ count: count(tokenOHLCV.timestamp) })
        .from(tokenOHLCV)
        .where(eq(tokenOHLCV.token, tokenAddress)),

      // Get latest data point
      db
        .select()
        .from(tokenOHLCV)
        .where(eq(tokenOHLCV.token, tokenAddress))
        .orderBy(desc(tokenOHLCV.timestamp))
        .limit(1),
    ]);

    const dataCount = countResult[0]?.count || 0;
    const isValid = dataCount >= minimumDataPoints;

    logger.debug(`Token ${tokenAddress} validation: ${dataCount} data points, valid: ${isValid}`);

    return {
      isValid,
      dataCount,
      latestTimestamp: latestData[0] ? new Date(latestData[0].timestamp * 1000) : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`Failed to validate token ${tokenAddress}: ${message}`);
    return { isValid: false, dataCount: 0 };
  }
}

/**
 * Fetch OHLCV data from database
 */
export async function fetchOHLCVData(params: OHLCVDataParams): Promise<OHLCVDataResult> {
  try {
    const db = getDB();
    const { tokenAddress, periodHours } = params;

    logger.info(`Fetching OHLCV data for token: ${tokenAddress}, period: ${periodHours}h`);

    // First, get the latest available timestamp for this token
    const latestDataResult = await db
      .select()
      .from(tokenOHLCV)
      .where(eq(tokenOHLCV.token, tokenAddress))
      .orderBy(desc(tokenOHLCV.timestamp))
      .limit(1);

    if (latestDataResult.length === 0) {
      throw new Error(`No data found for token ${tokenAddress}`);
    }

    const latestTimestamp = latestDataResult[0]?.timestamp;

    if (!latestTimestamp) {
      throw new Error(`No valid timestamp found for token ${tokenAddress}`);
    }
    const endTime = latestTimestamp;
    const startTime = endTime - periodHours * 60 * 60;

    logger.info(`Using latest available data from: ${new Date(latestTimestamp * 1000).toISOString()}`);

    // Query with time range based on latest available data
    const results = await db
      .select()
      .from(tokenOHLCV)
      .where(
        and(
          eq(tokenOHLCV.token, tokenAddress),
          gte(tokenOHLCV.timestamp, startTime),
          lte(tokenOHLCV.timestamp, endTime),
        ),
      )
      .orderBy(tokenOHLCV.timestamp)
      .limit(DB_CONFIG.MAX_QUERY_LIMIT);

    // Convert to Point format with proper number conversion
    const points: Point[] = results.map((row) => ({
      t: row.timestamp * 1000, // Convert to milliseconds
      y: Number(row.close), // Ensure number type for price
    }));

    logger.info(`Successfully fetched ${points.length} OHLCV data points for ${tokenAddress}`);

    return {
      points,
      tokenAddress,
      periodHours,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to fetch OHLCV data: ${message}`);
    throw new Error(`Failed to fetch OHLCV data: ${message}`);
  }
}

/**
 * Downsample data using min-max algorithm - refactored to reduce complexity
 */
export function downsampleMinMax(points: readonly Point[], targetWidth: number): readonly Point[] {
  if (points.length <= targetWidth * 2) {
    return points;
  }

  const binSize = Math.ceil(points.length / targetWidth);
  return processBins(points, binSize);
}

/**
 * Process bins for downsampling - extracted to reduce complexity
 */
function processBins(points: readonly Point[], binSize: number): readonly Point[] {
  const downsampled: Point[] = [];

  for (let i = 0; i < points.length; i += binSize) {
    const bin = points.slice(i, Math.min(i + binSize, points.length));
    const minMaxPair = extractMinMaxFromBin(bin);

    if (minMaxPair) {
      downsampled.push(...minMaxPair);
    }
  }

  logger.debug(`Downsampled ${points.length} points to ${downsampled.length} points`);
  return downsampled;
}

/**
 * Extract min and max points from a bin - extracted to reduce complexity
 */
function extractMinMaxFromBin(bin: readonly Point[]): readonly Point[] | null {
  if (bin.length === 0) return null;

  let minPoint = bin[0];
  let maxPoint = bin[0];

  if (!minPoint || !maxPoint) return null;

  for (const point of bin) {
    if (point.y < minPoint.y) minPoint = point;
    if (point.y > maxPoint.y) maxPoint = point;
  }

  // Return points in temporal order
  return minPoint.t < maxPoint.t ? [minPoint, maxPoint] : [maxPoint, minPoint];
}

// generateChart function has been moved to src/chart-generator.ts for better responsibility separation
