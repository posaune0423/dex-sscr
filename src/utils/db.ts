/**
 * Database operations and OHLCV data processing
 * Simplified with direct skia-canvas usage
 */

import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { createDefaultChartConfig, renderChart, setupChartCanvas } from "../chart-generator";
import { CHART_DEFAULTS, DB_CONFIG, KNOWN_TOKENS } from "../constants";
import { getDB } from "../db";
import { tokenOHLCV } from "../db/schema";
import type { ChartGenerationConfig, OHLCVDataParams, OHLCVDataResult, Point } from "../types";
import { generateChartMetrics, validatePointData } from "./chart-calculations";
import { ensureOutputDirectory, optimizeImageWithSharp } from "./file-operations";
import { logger } from "./logger";

// Re-export known tokens from constants
export { KNOWN_TOKENS };

/**
 * Get all available token addresses from the database
 */
export async function getAvailableTokens(): Promise<string[]> {
  try {
    const db = getDB();
    const results = await db.selectDistinct({ token: tokenOHLCV.token }).from(tokenOHLCV);

    const tokens = results.map((row) => row.token);
    logger.debug(`Found ${tokens.length} tokens with OHLCV data`);
    return tokens;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to get available tokens: ${message}`);
    return [];
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

    const latestTimestamp = latestDataResult[0]!.timestamp;
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

/**
 * Generate a chart from OHLCV data
 * Simplified implementation using direct skia-canvas API
 */
export async function generateChart(config: ChartGenerationConfig): Promise<void> {
  logger.info(`Starting chart generation for token: ${config.tokenAddress}`);

  try {
    // Step 1: Validate token has sufficient data
    const validation = await validateTokenForCharting(config.tokenAddress);
    if (!validation.isValid) {
      throw new Error(
        `Token ${config.tokenAddress} does not have sufficient data for charting (${validation.dataCount} points)`,
      );
    }

    // Step 2: Fetch OHLCV data from database
    const ohlcvParams: OHLCVDataParams = {
      tokenAddress: config.tokenAddress,
      periodHours: config.periodHours,
      intervalMinutes: CHART_DEFAULTS.INTERVAL_MINUTES,
    };

    const ohlcvResult = await fetchOHLCVData(ohlcvParams);

    if (ohlcvResult.points.length === 0) {
      throw new Error(`No OHLCV data retrieved for token ${config.tokenAddress}`);
    }

    // Step 3: Validate data integrity
    const dataValidation = validatePointData(ohlcvResult.points);
    if (!dataValidation.isValid) {
      throw new Error(`Invalid OHLCV data: ${dataValidation.errors.join(", ")}`);
    }

    // Step 4: Calculate optimal downsampling width
    const downsampleWidth = Math.round(config.width * 2);

    // Step 5: Downsample data for rendering optimization
    const downsampledData = downsampleMinMax(ohlcvResult.points, downsampleWidth);

    // Step 6: Create chart configuration
    const chartConfig = createDefaultChartConfig(config.width, config.height, config.dpr);

    // Step 7: Prepare chart data with user's entry price and position direction
    const chartData = {
      points: downsampledData,
      entryPrice: config.entryPrice,
      isBullish: config.isBullish,
    };

    // Step 8: Setup canvas and render chart
    const { canvas, ctx } = setupChartCanvas(config.width, config.height, config.dpr);
    renderChart(ctx, chartData, chartConfig);

    // Step 9: Export chart directly using skia-canvas built-in methods
    const imageBuffer = await canvas.toBuffer("png");

    // Step 10: Ensure output directory exists
    await ensureOutputDirectory(config.outputPath);

    // Step 11: Optimize and save image using Sharp
    const optimizedBuffer = await optimizeImageWithSharp(imageBuffer);
    await canvas.saveAs(config.outputPath);

    // Step 12: Generate and log metrics
    const metrics = generateChartMetrics(
      ohlcvResult.points,
      downsampledData,
      config.entryPrice,
      config.isBullish,
      config.outputPath,
      optimizedBuffer.byteLength,
      { width: config.width, height: config.height, dpr: config.dpr },
    );

    logger.info("Chart generation completed successfully!");
    logger.info(`Chart metrics: ${JSON.stringify(metrics, null, 2)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Chart generation failed: ${message}`);
    throw new Error(`Chart generation failed: ${message}`);
  }
}
