/**
 * Chart generation and rendering
 * Simplified implementation using direct skia-canvas API
 */

import type { Canvas, CanvasRenderingContext2D } from "skia-canvas";
import { CHART_STYLE, NEON_STROKES } from "./constants";
import { createCanvas, drawNeonGlow, getContext, hexToRgba } from "./lib/canvas";
import { generateR2Key, uploadToR2 } from "./lib/r2";
import type {
  ChartConfig,
  ChartData,
  ChartGenerationConfig,
  ChartGenerationResult,
  ChartGenerationWithR2Config,
  ChartPadding,
  ChartStyle,
  Coordinate,
  NeonStrokeConfig,
  OHLCVDataParams,
  Point,
  R2UploadResult,
} from "./types";
import { generateChartMetrics, validatePointData } from "./utils/chart-calculations";
import { downsampleMinMax, fetchOHLCVData, validateTokenForCharting } from "./utils/db";
import { ensureOutputDirectory, optimizeImageWithSharp } from "./utils/file-operations";
import { logger } from "./utils/logger";

interface ScalingParams {
  readonly points: readonly Point[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly padding: ChartPadding;
}

interface ScaledChartData {
  readonly coordinates: readonly Coordinate[];
  readonly yScale: (value: number) => number;
  readonly xScale: (timestamp: number) => number;
  readonly yMin: number;
  readonly yMax: number;
}

/**
 * Scale chart points to canvas coordinates
 */
function scalePointsToCanvas(params: ScalingParams): ScaledChartData {
  const { points, canvasWidth, canvasHeight, padding } = params;

  if (points.length === 0) {
    throw new Error("Cannot scale empty points array");
  }

  const innerWidth = canvasWidth - padding.l - padding.r;
  const innerHeight = canvasHeight - padding.t - padding.b;

  // Find data bounds
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (!firstPoint || !lastPoint) {
    throw new Error("Invalid points data for scaling");
  }

  const timeMin = firstPoint.t;
  const timeMax = lastPoint.t;

  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.y < yMin) yMin = point.y;
    if (point.y > yMax) yMax = point.y;
  }

  // Add visual margin for better appearance
  const yMargin = (yMax - yMin) * CHART_STYLE.Y_MARGIN_RATIO || 1;
  yMin -= yMargin;
  yMax += yMargin;

  // Create scaling functions
  const xScale = (timestamp: number): number => padding.l + ((timestamp - timeMin) / (timeMax - timeMin)) * innerWidth;

  const yScale = (value: number): number => padding.t + (1 - (value - yMin) / (yMax - yMin)) * innerHeight;

  // Scale all points
  const coordinates: Coordinate[] = points.map((point) => ({
    x: xScale(point.t),
    y: yScale(point.y),
  }));

  logger.debug(`Scaled ${points.length} points to canvas coordinates`);

  return {
    coordinates,
    yScale,
    xScale,
    yMin,
    yMax,
  };
}

/**
 * Format price value for display
 */
function formatPrice(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }
  return `$${value.toFixed(6)}`;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number, timeRange: number): string {
  const date = new Date(timestamp);

  // For periods > 7 days, show date
  if (timeRange > 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // For periods > 1 day, show date and time
  if (timeRange > 24 * 60 * 60 * 1000) {
    return (
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      "\n" +
      date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
  }

  // For shorter periods, show time only
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Draw Y-axis (price) labels
 */
function drawYAxis(
  ctx: CanvasRenderingContext2D,
  yMin: number,
  yMax: number,
  yScale: (value: number) => number,
  padding: ChartPadding,
  width: number,
  dpr: number,
): void {
  const tickCount = 5;
  const fontSize = width * CHART_STYLE.AXIS.FONT_SIZE_RATIO * dpr;

  ctx.save();
  ctx.fillStyle = CHART_STYLE.COLORS.AXIS_LABELS;
  ctx.strokeStyle = CHART_STYLE.COLORS.AXIS_LABELS;
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  for (let i = 0; i <= tickCount; i++) {
    const value = yMin + (yMax - yMin) * (i / tickCount);
    const y = yScale(value);
    const text = formatPrice(value);

    // Draw price label with better positioning
    const labelX = width - padding.r + CHART_STYLE.AXIS.LABEL_PADDING * dpr;
    ctx.fillText(text, labelX, y);

    // Draw tick mark
    ctx.beginPath();
    ctx.moveTo(width - padding.r, y);
    ctx.lineTo(width - padding.r + CHART_STYLE.AXIS.TICK_LENGTH * dpr, y);
    ctx.stroke();
  }

  ctx.restore();
  logger.debug("Drew Y-axis price labels");
}

/**
 * Draw X-axis (time) labels
 */
function drawXAxis(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  xScale: (timestamp: number) => number,
  padding: ChartPadding,
  height: number,
  width: number,
  dpr: number,
): void {
  if (points.length === 0) return;

  const tickCount = 5;
  const fontSize = width * CHART_STYLE.AXIS.FONT_SIZE_RATIO * dpr;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (!firstPoint || !lastPoint) {
    logger.warn("Invalid points data for X-axis rendering");
    return;
  }

  const timeRange = lastPoint.t - firstPoint.t;

  ctx.save();
  ctx.fillStyle = CHART_STYLE.COLORS.AXIS_LABELS;
  ctx.strokeStyle = CHART_STYLE.COLORS.AXIS_LABELS;
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 1;

  for (let i = 0; i <= tickCount; i++) {
    const timestamp = firstPoint.t + (timeRange * i) / tickCount;
    const x = xScale(timestamp);
    const text = formatTime(timestamp, timeRange);

    // Handle multi-line text for date + time format
    const lines = text.split("\n");
    const lineHeight = fontSize * 1.3;

    lines.forEach((line, lineIndex) => {
      const y = height - padding.b + CHART_STYLE.AXIS.LABEL_PADDING * dpr + lineIndex * lineHeight;
      ctx.fillText(line, x, y);
    });

    // Draw tick mark
    ctx.beginPath();
    ctx.moveTo(x, height - padding.b);
    ctx.lineTo(x, height - padding.b + CHART_STYLE.AXIS.TICK_LENGTH * dpr);
    ctx.stroke();
  }

  ctx.restore();
  logger.debug("Drew X-axis time labels");
}

/**
 * Draw background with gradient
 */
function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, style: ChartStyle): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, style.backgroundColor.start);
  gradient.addColorStop(1, style.backgroundColor.end);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw horizontal and vertical grid lines
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: ChartPadding,
  style: ChartStyle,
  gridLines = CHART_STYLE.GRID_LINES,
): void {
  ctx.strokeStyle = style.gridColor;
  ctx.lineWidth = 1;

  const innerWidth = width - padding.l - padding.r;
  const innerHeight = height - padding.t - padding.b;

  // Draw horizontal grid lines
  for (let i = 0; i <= gridLines; i++) {
    const y = Math.round(padding.t + (i / gridLines) * innerHeight) + 0.5;

    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(width - padding.r, y);
    ctx.stroke();
  }

  // Draw vertical grid lines
  const verticalLines = 5; // Number of vertical grid lines
  for (let i = 0; i <= verticalLines; i++) {
    const x = Math.round(padding.l + (i / verticalLines) * innerWidth) + 0.5;

    ctx.beginPath();
    ctx.moveTo(x, padding.t);
    ctx.lineTo(x, height - padding.b);
    ctx.stroke();
  }

  logger.debug(`Drew ${gridLines + 1} horizontal and ${verticalLines + 1} vertical grid lines`);
}

/**
 * Draw entry price line with dashed style
 */
function drawEntryLine(
  ctx: CanvasRenderingContext2D,
  entryPrice: number,
  width: number,
  padding: ChartPadding,
  yScale: (value: number) => number,
  style: ChartStyle,
  dpr: number,
): void {
  const y = yScale(entryPrice);

  ctx.save();
  ctx.setLineDash([8 * dpr, 8 * dpr]);
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = hexToRgba(style.entryLineColor, 0.6);

  ctx.beginPath();
  ctx.moveTo(padding.l, y);
  ctx.lineTo(width - padding.r, y);
  ctx.stroke();

  ctx.restore();

  logger.debug(`Drew entry line at price: ${entryPrice.toFixed(2)}`);
}

/**
 * Draw subtle area fill under the chart line
 */
function drawAreaFill(
  ctx: CanvasRenderingContext2D,
  coordinates: readonly Coordinate[],
  height: number,
  padding: ChartPadding,
  color: string,
): void {
  if (coordinates.length === 0) return;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, hexToRgba(color, 0.12));
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = gradient;

  ctx.beginPath();
  const first = coordinates[0];
  if (!first) return;

  ctx.moveTo(first.x, first.y);

  // Draw line path
  for (let i = 1; i < coordinates.length; i++) {
    const coord = coordinates[i];
    if (coord) {
      ctx.lineTo(coord.x, coord.y);
    }
  }

  // Close to bottom
  const last = coordinates[coordinates.length - 1];
  if (last) {
    const bottomY = height - padding.b;
    ctx.lineTo(last.x, bottomY);
    ctx.lineTo(first.x, bottomY);
  }

  ctx.closePath();
  ctx.fill();

  logger.debug("Drew area fill under chart line");
}

/**
 * Draw main chart line with neon glow effect
 */
function drawChartLine(
  ctx: CanvasRenderingContext2D,
  coordinates: readonly Coordinate[],
  color: string,
  strokes: readonly NeonStrokeConfig[] = NEON_STROKES,
): void {
  if (coordinates.length === 0) return;

  drawNeonGlow(ctx, coordinates, color, strokes);
  logger.debug(`Drew chart line with ${strokes.length} neon stroke layers`);
}

/**
 * Determine chart style based on market sentiment
 */
function getChartStyle(isBullish: boolean): ChartStyle {
  const lineColor = isBullish ? CHART_STYLE.COLORS.BULLISH : CHART_STYLE.COLORS.BEARISH;

  return {
    lineColor,
    backgroundColor: {
      start: CHART_STYLE.COLORS.BACKGROUND_START,
      end: CHART_STYLE.COLORS.BACKGROUND_END,
    },
    gridColor: CHART_STYLE.COLORS.GRID,
    entryLineColor: lineColor,
  };
}

/**
 * Create default chart configuration
 */
export function createDefaultChartConfig(width: number, height: number, dpr: number): ChartConfig {
  return {
    dimensions: {
      width,
      height,
      dpr,
    },
    padding: {
      l: Math.round(width * CHART_STYLE.PADDING.LEFT_RATIO),
      r: Math.round(width * CHART_STYLE.PADDING.RIGHT_RATIO),
      t: Math.round(height * CHART_STYLE.PADDING.TOP_RATIO),
      b: Math.round(height * CHART_STYLE.PADDING.BOTTOM_RATIO),
    },
    style: getChartStyle(true), // Will be overridden based on actual data
    downsampleWidth: Math.round(width * 2),
  };
}

/**
 * Create and setup canvas for chart rendering
 */
export function setupChartCanvas(
  width: number,
  height: number,
  dpr: number,
): { canvas: Canvas; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(Math.round(width * dpr), Math.round(height * dpr));
  const ctx = getContext(canvas);

  // Set up high-DPI rendering
  ctx.scale(dpr, dpr);

  return { canvas, ctx };
}

/**
 * Main chart rendering function - with axes support
 */
export function renderChart(ctx: CanvasRenderingContext2D, chartData: ChartData, config: ChartConfig): void {
  const { dimensions, padding } = config;

  // Use logical dimensions for coordinate calculations (not scaled by DPR)
  const canvasWidth = dimensions.width;
  const canvasHeight = dimensions.height;

  // Update style based on market sentiment
  const style = getChartStyle(chartData.isBullish);

  // Scale points to canvas coordinates using logical dimensions
  const scaledData = scalePointsToCanvas({
    points: chartData.points,
    canvasWidth,
    canvasHeight,
    padding,
  });

  // Render all chart elements in order
  drawBackground(ctx, canvasWidth, canvasHeight, style);
  drawGrid(ctx, canvasWidth, canvasHeight, padding, style);

  // Draw axes
  drawYAxis(ctx, scaledData.yMin, scaledData.yMax, scaledData.yScale, padding, canvasWidth, dimensions.dpr);
  drawXAxis(ctx, chartData.points, scaledData.xScale, padding, canvasHeight, canvasWidth, dimensions.dpr);

  drawEntryLine(ctx, chartData.entryPrice, canvasWidth, padding, scaledData.yScale, style, dimensions.dpr);
  drawAreaFill(ctx, scaledData.coordinates, canvasHeight, padding, style.lineColor);
  drawChartLine(ctx, scaledData.coordinates, style.lineColor);

  logger.info(`Rendered chart with ${chartData.points.length} points, bullish: ${chartData.isBullish}`);
}

/**
 * Generate a chart from OHLCV data with optional R2 upload
 * Enhanced chart generation orchestration function
 */
export async function generateChartWithR2(config: ChartGenerationWithR2Config): Promise<ChartGenerationResult> {
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
      intervalMinutes: 1, // Default interval
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

    // Step 10: Optimize image using Sharp
    const optimizedBuffer = await optimizeImageWithSharp(imageBuffer);

    let localPath: string | undefined;
    let r2Upload: R2UploadResult | undefined;

    // Step 11: Handle local saving if outputPath is provided
    if (config.outputPath) {
      await ensureOutputDirectory(config.outputPath);
      await canvas.saveAs(config.outputPath);
      localPath = config.outputPath;
      logger.info(`Chart saved locally: ${config.outputPath}`);
    }

    // Step 12: Handle R2 upload if bucket is provided
    if (config.r2Bucket) {
      const r2Key = generateR2Key(
        ohlcvResult.tokenAddress.slice(-8), // Use last 8 chars of token address as symbol
        config.periodHours,
      );

      r2Upload = await uploadToR2(optimizedBuffer, r2Key, config.r2Bucket, "image/png");

      if (r2Upload.success) {
        logger.info(`Chart uploaded to R2: ${r2Upload.url}`);
      } else {
        logger.error(`R2 upload failed: ${r2Upload.error}`);
      }
    }

    // Step 13: Generate and log metrics
    const metricsOutputPath = localPath || (r2Upload?.success ? (r2Upload.url ?? "memory") : "memory");
    const metrics = generateChartMetrics(
      ohlcvResult.points,
      downsampledData,
      config.entryPrice,
      config.isBullish,
      metricsOutputPath,
      optimizedBuffer.byteLength,
      { width: config.width, height: config.height, dpr: config.dpr },
    );

    logger.info("Chart generation completed successfully!");
    logger.info(`Chart metrics: ${JSON.stringify(metrics, null, 2)}`);

    return {
      metrics,
      localPath,
      r2Upload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Chart generation failed: ${message}`);
    throw new Error(`Chart generation failed: ${message}`);
  }
}

/**
 * Generate a chart from OHLCV data (backward compatible)
 * Main chart generation orchestration function
 */
export async function generateChart(config: ChartGenerationConfig): Promise<void> {
  const result = await generateChartWithR2({
    ...config,
    outputPath: config.outputPath,
  });

  // Just log the metrics for backward compatibility
  logger.info("Chart generation completed successfully!");
  logger.info(`Chart metrics: ${JSON.stringify(result.metrics, null, 2)}`);
}
