/**
 * Application constants
 */

// Chart generation defaults
export const CHART_DEFAULTS = {
  WIDTH: 800,
  HEIGHT: 360,
  DPR: 1.5,
  PERIOD_HOURS: 24,
  MIN_DATA_POINTS: 100,
  INTERVAL_MINUTES: 1,
  OUTPUT_DIR: "./data",
} as const;

// Chart styling constants
export const CHART_STYLE = {
  COLORS: {
    BULLISH: "#00ffa2",
    BEARISH: "#ff5f6d",
    BACKGROUND_START: "#050607",
    BACKGROUND_END: "#0b0f10",
    GRID: "rgba(255,255,255,0.08)",
  },
  PADDING: {
    LEFT_RATIO: 0.04, // 32px at 800px width
    RIGHT_RATIO: 0.025, // 20px at 800px width
    TOP_RATIO: 0.05, // 18px at 360px height
    BOTTOM_RATIO: 0.078, // 28px at 360px height
  },
  GRID_LINES: 4,
  Y_MARGIN_RATIO: 0.06,
} as const;

// Neon glow effect configuration
export const NEON_STROKES = [
  { width: 6, alpha: 0.25, blur: 18 }, // Base glow (thick, very transparent)
  { width: 4, alpha: 0.6, blur: 8 }, // Middle glow
  { width: 2, alpha: 1.0, blur: 0 }, // Core line (sharp, opaque)
] as const;

// Database configuration
export const DB_CONFIG = {
  MAX_QUERY_LIMIT: 10000,
  DEFAULT_ORDER_LIMIT: 1000,
} as const;

// Known token addresses for testing
export const KNOWN_TOKENS = {
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
} as const;

// File operations
export const FILE_CONFIG = {
  OUTPUT_DIR: "./data",
  IMAGE_QUALITY: 90,
  PNG_COMPRESSION_LEVEL: 6,
} as const;
