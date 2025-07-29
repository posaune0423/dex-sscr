/**
 * Test script for generating charts from OHLCV data
 * Usage: tsx --env-file .dev.vars scripts/gen-chart.ts [token_symbol] [period_hours]
 */

import { generateChart } from "../src/chart-generator";
import { CHART_DEFAULTS } from "../src/constants";
import type { ChartGenerationConfig, Point } from "../src/types";
import { fetchOHLCVData, getAvailableTokensWithDetails, resolveTokenAddress, validateTokenForCharting } from "../src/utils/db";
import { logger } from "../src/utils/logger";

interface ScriptArgs {
  tokenSymbol?: string;
  periodHours?: number;
  outputPath?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ScriptArgs {
  const [, , tokenSymbol, periodStr, outputPath] = process.argv;

  return {
    tokenSymbol,
    periodHours: periodStr ? parseInt(periodStr, 10) : undefined,
    outputPath,
  };
}

/**
 * Get token address from symbol or address using database
 */
async function getTokenAddress(tokenInput: string): Promise<string> {
  const resolvedAddress = await resolveTokenAddress(tokenInput);

  if (!resolvedAddress) {
    // Get available tokens to show in error
    const availableTokens = await getAvailableTokensWithDetails();
    const symbolsList = availableTokens.map(t => t.symbol).join(", ");
    throw new Error(`Unknown token: ${tokenInput}. Available tokens: ${symbolsList}`);
  }

  return resolvedAddress;
}

/**
 * Calculate mock entry price based on actual data range
 */
function calculateMockEntryPrice(points: readonly Point[]): { entryPrice: number; isBullish: boolean } {
  if (points.length === 0) {
    return { entryPrice: 1.0, isBullish: true };
  }

  // Find price range
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.y < minPrice) minPrice = point.y;
    if (point.y > maxPrice) maxPrice = point.y;
  }

  // Calculate entry price as somewhere between 25%-75% of the range
  const priceRange = maxPrice - minPrice;
  const entryRatio = 0.3 + Math.random() * 0.4; // Random between 30% and 70%
  const entryPrice = minPrice + (priceRange * entryRatio);

  // Determine if position should be bullish based on current vs entry price
  const currentPrice = points[points.length - 1]?.y ?? entryPrice;
  const isBullish = currentPrice > entryPrice;

  logger.debug(`Calculated mock entry price: ${entryPrice.toFixed(6)} (range: ${minPrice.toFixed(6)} - ${maxPrice.toFixed(6)})`);

  return {
    entryPrice: Number(entryPrice.toFixed(6)),
    isBullish,
  };
}

/**
 * List available tokens with data count
 */
async function listAvailableTokens(): Promise<void> {
  try {
    const tokensWithDetails = await getAvailableTokensWithDetails();
    logger.info("\n🪙 Available tokens:");

    if (tokensWithDetails.length === 0) {
      logger.info("  No tokens found with OHLCV data");
      return;
    }

    // Show all tokens with their symbols and data count
    for (const token of tokensWithDetails) {
      try {
        const validation = await validateTokenForCharting(token.address);
        const status = validation.isValid ? "✅" : "❌";
        logger.info(`  ${token.symbol} - ${token.name} (${status} ${validation.dataCount} points)`);
      } catch {
        logger.info(`  ${token.symbol} - ${token.name} (❌ error)`);
      }
    }

    logger.info(`\nTotal: ${tokensWithDetails.length} tokens available`);
  } catch (error) {
    logger.error(`Failed to fetch available tokens: ${error}`);
  }
}

/**
 * Main script function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  logger.info("📊 Chart Generation Script Started");

  // If no token specified, list available tokens
  if (!args.tokenSymbol) {
    await listAvailableTokens();
    logger.info("\n💡 Please specify a token symbol to generate a chart");
    return;
  }

  // Generate chart for specified token
  try {
    const tokenAddress = await getTokenAddress(args.tokenSymbol);

    logger.info(`🎯 Selected token: ${args.tokenSymbol} (${tokenAddress})`);

    // Validate token first
    const validation = await validateTokenForCharting(tokenAddress);
    if (!validation.isValid) {
      logger.error(`❌ Token ${args.tokenSymbol} does not have sufficient data (${validation.dataCount} points)`);

      logger.info("\n💡 Try one of these tokens instead:");
      await listAvailableTokens();
      return;
    }

    logger.info(`✅ Token validation passed: ${validation.dataCount} data points`);

    // Fetch OHLCV data to calculate appropriate entry price
    const periodHours = args.periodHours || 24;
    const ohlcvResult = await fetchOHLCVData({
      tokenAddress,
      periodHours,
      intervalMinutes: CHART_DEFAULTS.INTERVAL_MINUTES,
    });

    if (ohlcvResult.points.length === 0) {
      logger.error(`❌ No OHLCV data retrieved for token ${args.tokenSymbol}`);
      return;
    }

    // Calculate mock entry price based on actual data range
    const userPosition = calculateMockEntryPrice(ohlcvResult.points);
    logger.info(`💰 Using mock entry price: $${userPosition.entryPrice}, position: ${userPosition.isBullish ? 'Long' : 'Short'}`);

    const config: ChartGenerationConfig = {
      tokenAddress,
      periodHours,
      width: 800,
      height: 360,
      dpr: 1.5,
      outputPath: args.outputPath || `./data/chart-${args.tokenSymbol.toLowerCase()}.png`,
      entryPrice: userPosition.entryPrice,
      isBullish: userPosition.isBullish,
    };

    await generateChart(config);
    logger.info(`✅ Chart generated: ${config.outputPath}`);
  } catch (error) {
    logger.error(`❌ Script failed: ${error}`);

    if (error instanceof Error && error.message.includes("Unknown token")) {
      logger.info("\n💡 To see available tokens, run the script without arguments");
    }

    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
📊 Chart Generation Script

Usage:
  tsx --env-file .dev.vars scripts/gen-chart.ts [token] [hours] [output]

Examples:
  tsx --env-file .dev.vars scripts/gen-chart.ts                    # List available tokens
  tsx --env-file .dev.vars scripts/gen-chart.ts SOL               # SOL token, 24h
  tsx --env-file .dev.vars scripts/gen-chart.ts USDC 12           # USDC token, 12h
  tsx --env-file .dev.vars scripts/gen-chart.ts JUP 48 ./data/jup.png  # JUP token, 48h, custom output

Available tokens: Run without arguments to see current list from database

Options:
  token   Token symbol (SOL, USDC, etc.) or address
  hours   Period in hours (default: 24)
  output  Output file path (default: ./data/chart-{token}.png)
`);
  process.exit(0);
}

// Execute main function
main().catch((error) => {
  logger.error(`💥 Unhandled error: ${error}`);
  process.exit(1);
});
