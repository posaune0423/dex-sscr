/**
 * Chart generation and rendering
 * Simplified implementation using direct skia-canvas API
 */

import type { Canvas, CanvasRenderingContext2D } from "skia-canvas";
import { CHART_STYLE, NEON_STROKES } from "./constants";
import { createCanvas, drawNeonGlow, getContext, hexToRgba } from "./lib/canvas";
import type { ChartConfig, ChartData, ChartPadding, ChartStyle, Coordinate, NeonStrokeConfig, Point } from "./types";
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
 * Draw horizontal grid lines
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

  const innerHeight = height - padding.t - padding.b;

  for (let i = 0; i <= gridLines; i++) {
    const y = Math.round(padding.t + (i / gridLines) * innerHeight) + 0.5;

    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(width - padding.r, y);
    ctx.stroke();
  }

  logger.debug(`Drew ${gridLines + 1} grid lines`);
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
      // Padding should be in logical pixels, not scaled by DPR
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
 * Main chart rendering function - simplified and direct
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
  drawEntryLine(ctx, chartData.entryPrice, canvasWidth, padding, scaledData.yScale, style, dimensions.dpr);
  drawAreaFill(ctx, scaledData.coordinates, canvasHeight, padding, style.lineColor);
  drawChartLine(ctx, scaledData.coordinates, style.lineColor);

  logger.info(`Rendered chart with ${chartData.points.length} points, bullish: ${chartData.isBullish}`);
}
