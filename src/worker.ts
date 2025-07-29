/**
 * Cloudflare Worker for chart generation
 */

import { generateChart } from "./chart-generator";
import { CHART_DEFAULTS } from "./constants";
import type { ChartGenerationConfig } from "./types";
import { logger } from "./utils/logger";

interface ChartRequest {
  tokenAddress: string;
  entryPrice: number;
  isBullish: boolean;
  periodHours?: number;
  width?: number;
  height?: number;
  dpr?: number;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Health check endpoint
      if (url.pathname === "/health") {
        return new Response("OK", { status: 200 });
      }

      // Chart generation endpoint
      if (url.pathname === "/generate-chart" && request.method === "POST") {
        return await handleGenerateChart(request);
      }

      // Not found
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Worker error: ${message}`);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/**
 * Handle chart generation request
 */
async function handleGenerateChart(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ChartRequest;
    const { tokenAddress, entryPrice, isBullish, periodHours, width, height, dpr } = body;

    // Validate required parameters
    if (!tokenAddress || typeof tokenAddress !== "string") {
      return new Response(JSON.stringify({ error: "tokenAddress is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof entryPrice !== "number") {
      return new Response(JSON.stringify({ error: "entryPrice is required and must be a number" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof isBullish !== "boolean") {
      return new Response(JSON.stringify({ error: "isBullish is required and must be a boolean" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create configuration with defaults
    const config: ChartGenerationConfig = {
      tokenAddress,
      entryPrice,
      isBullish,
      periodHours: periodHours || CHART_DEFAULTS.PERIOD_HOURS,
      width: width || CHART_DEFAULTS.WIDTH,
      height: height || CHART_DEFAULTS.HEIGHT,
      dpr: dpr || CHART_DEFAULTS.DPR,
      outputPath: `./data/chart-${Date.now()}.png`,
    };

    // Generate chart
    await generateChart(config);

    return new Response(
      JSON.stringify({
        success: true,
        outputPath: config.outputPath,
        config,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Chart generation failed: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
