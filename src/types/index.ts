/**
 * Centralized type definitions
 */

// Basic point structure for chart data
export interface Point {
  readonly t: number; // timestamp in milliseconds
  readonly y: number; // value (price, volume, etc.)
}

// Canvas coordinate after scaling
export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

// Chart layout and spacing
export interface ChartPadding {
  readonly l: number; // left
  readonly r: number; // right
  readonly t: number; // top
  readonly b: number; // bottom
}

export interface ChartDimensions {
  readonly width: number;
  readonly height: number;
  readonly dpr: number; // device pixel ratio
}

// Chart visual styling
export interface ChartStyle {
  readonly lineColor: string;
  readonly backgroundColor: {
    readonly start: string;
    readonly end: string;
  };
  readonly gridColor: string;
  readonly entryLineColor: string;
}

// Chart data and configuration
export interface ChartData {
  readonly points: readonly Point[];
  readonly entryPrice: number;
  readonly isBullish: boolean;
}

export interface ChartConfig {
  readonly dimensions: ChartDimensions;
  readonly padding: ChartPadding;
  readonly style: ChartStyle;
  readonly downsampleWidth: number;
}

// Neon glow effect configuration
export interface NeonStrokeConfig {
  readonly width: number;
  readonly alpha: number;
  readonly blur: number;
}

// Chart generation metrics
export interface ChartMetrics {
  readonly pointsRaw: number;
  readonly pointsDownsampled: number;
  readonly isBullish: boolean;
  readonly entryPrice: number;
  readonly lastPrice: number;
  readonly outputBytes: number;
  readonly outputPath: string;
  readonly size: string;
}

// Configuration for chart generation
export interface ChartGenerationConfig {
  readonly tokenAddress: string;
  readonly periodHours: number;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly outputPath: string;
  readonly entryPrice: number;
  readonly isBullish: boolean;
}

// Database query parameters
export interface OHLCVDataParams {
  readonly tokenAddress: string;
  readonly periodHours: number;
  readonly intervalMinutes: number;
}

// Database query result
export interface OHLCVDataResult {
  readonly points: readonly Point[];
  readonly tokenAddress: string;
  readonly periodHours: number;
}
