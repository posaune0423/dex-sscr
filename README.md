# dex-sscr

A **DEX Screenshot Service** that generates beautiful trading charts from OHLCV data. Built as a Cloudflare Worker API with local testing capabilities.

## 🚀 Features

- **Beautiful Chart Generation**: Create neon-styled trading charts with entry price indicators
- **Professional Axes**: Y-axis (price) and X-axis (time/date) labels with intelligent formatting
- **RESTful API**: Cloudflare Worker-powered chart generation endpoint
- **Multiple Token Support**: SOL, USDC, TRUMP, JUP, WIF, BONK, and more
- **Local Testing**: CLI tool for development and testing
- **High Performance**: Built with Bun runtime and skia-canvas rendering
- **Database Integration**: Neon PostgreSQL with Drizzle ORM
- **Clean Architecture**: Proper separation of concerns between data operations and chart rendering

## 📋 Prerequisites

- **Bun** v1.2.19+ ([Install Bun](https://bun.sh))
- **Node.js** v22+
- Access to Neon Database for OHLCV data storage

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dex-sscr
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Environment Setup**
   ```bash
   # Copy environment variables template
   cp .env.example .dev.vars
   
   # Edit .dev.vars with your database credentials
   # DATABASE_URL=postgresql://...
   ```

## 🏃‍♂️ Usage

### Local Development

**Start the worker locally:**
```bash
bun run dev
# Worker will be available at http://localhost:8787
```

**Generate test charts:**
```bash
# List available tokens
bun run gen-chart

# Generate chart for SOL (24 hours)
bun run gen-chart SOL

# Generate chart for USDC (12 hours)
bun run gen-chart USDC 12

# Custom output path
bun run gen-chart JUP 48 ./data/jup-custom.png
```

**Available chart generation options:**
- `token`: Token symbol (SOL, USDC, JUP, etc.) or contract address
- `hours`: Period in hours (default: 24)
- `output`: Output file path (default: `./data/chart-{token}.png`)

### API Usage

**Health Check:**
```bash
curl http://localhost:8787/health
```

**Generate Chart:**
```bash
curl -X POST http://localhost:8787/generate-chart \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "So11111111111111111111111111111111111111112",
    "entryPrice": 0.5,
    "isBullish": true,
    "periodHours": 24,
    "width": 800,
    "height": 360
  }'
```

**API Request Parameters:**
- `tokenAddress` (required): Token contract address
- `entryPrice` (required): User's entry price for position
- `isBullish` (required): Position direction (true for long, false for short)
- `periodHours` (optional): Chart period in hours (default: 24)
- `width` (optional): Chart width in pixels (default: 800)
- `height` (optional): Chart height in pixels (default: 360)
- `dpr` (optional): Device pixel ratio (default: 1.5)

## 🏗️ Development

**Available Scripts:**
```bash
# Development with hot reload
bun run dev

# Start production build
bun run start

# Generate test charts
bun run gen-chart [token] [hours] [output]

# Clean generated data
bun run clean

# Build for production
bun run build

# Code quality
bun run lint      # Check and fix with Biome
bun run format    # Format code
bun run ci        # Run all quality checks

# Generate Cloudflare types
bun run cf-typegen
```

## 📁 Project Structure

```
dex-sscr/
├── 📄 Configuration
│   ├── biome.json           # Code quality config
│   ├── drizzle.config.ts    # Database config
│   ├── package.json         # Dependencies & scripts
│   ├── tsconfig.json        # TypeScript config
│   └── wrangler.jsonc       # Cloudflare Worker config
│
├── 🗃️ data/                 # Generated charts output
│
├── 🛠️ scripts/
│   └── gen-chart.ts         # Local chart generation CLI
│
└── 📦 src/
    ├── chart-generator.ts   # Core chart rendering logic & orchestration
    ├── constants.ts         # App-wide constants
    ├── worker.ts            # Cloudflare Worker entry point
    │
    ├── 🗄️ db/
    │   ├── index.ts         # Database connection
    │   └── schema/          # Drizzle ORM schemas
    │       ├── index.ts
    │       ├── token-ohlcv.ts
    │       └── tokens.ts
    │
    ├── 🎨 lib/
    │   └── canvas.ts        # Canvas utilities & neon effects
    │
    ├── 🏷️ types/
    │   ├── index.ts         # TypeScript type definitions
    │   └── worker-configuration.d.ts
    │
    └── 🔧 utils/
        ├── chart-calculations.ts  # Chart math & scaling
        ├── db.ts                  # Database operations only
        ├── file-operations.ts     # File I/O utilities
        └── logger.ts              # Logging utilities
```

## 🪙 Supported Tokens

The service comes with pre-configured support for popular tokens:

| Symbol | Contract Address |
|--------|------------------|
| SOL    | `So11111111111111111111111111111111111111112` |
| USDC   | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| TRUMP  | `HaP8r3ksG76PhQLTqR8FYBeNiQpejcFbQmiHbg787Ut1` |
| JUP    | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| WIF    | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| BONK   | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |

*Additional tokens can be added by providing their contract addresses directly.*

## ⚙️ Configuration

**Default Chart Settings:**
- **Dimensions**: 800×360px @ 1.5x DPR
- **Period**: 24 hours
- **Minimum Data Points**: 100
- **Data Interval**: 1 minute
- **Output Format**: PNG with 90% quality

**Chart Styling:**
- **Bullish Color**: `#00ffa2` (neon green)
- **Bearish Color**: `#ff5f6d` (neon red)
- **Background**: Dark gradient (`#050607` → `#0b0f10`)
- **Neon Effects**: Multi-layer glow with blur
- **Axes**: Smart price formatting (K, decimal places) and time formatting (hours, dates)
- **Labels**: Professional typography with proper spacing and contrast

## 🚀 Deployment

**Deploy to Cloudflare Workers:**
```bash
# Deploy to production
wrangler deploy

# Deploy to staging
wrangler deploy --env staging
```

**Required Environment Variables:**
- `DATABASE_URL`: Neon PostgreSQL connection string
- `DEX_SSCR_BUCKET`: Cloudflare R2 bucket binding (configured in wrangler.jsonc)

## 🧪 Testing

**Generate test charts locally:**
```bash
# Test all supported tokens
for token in SOL USDC TRUMP JUP WIF BONK; do
  bun run gen-chart $token 24 "./data/test-$token.png"
done

# Test different time periods
bun run gen-chart SOL 1   # 1 hour
bun run gen-chart SOL 6   # 6 hours  
bun run gen-chart SOL 24  # 24 hours
bun run gen-chart SOL 168 # 1 week
```

## 🤝 Contributing

1. Follow the TypeScript coding standards outlined in the project
2. Use **Bun** as the runtime and package manager
3. Run `bun run ci` before committing to ensure code quality
4. All file comments and documentation should be in English
5. Use early returns to avoid deep nesting
6. Prefer functional programming patterns over classes when state is not required

## 📄 License

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
