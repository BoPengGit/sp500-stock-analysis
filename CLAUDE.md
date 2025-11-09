# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

S&P 500 Stock Analysis Platform with historical fundamentals tracking, portfolio backtesting, and optimization. Evaluates stocks using multiple financial metrics (Market Cap, ADTV, P/S Ratio, Sales Growth, GF Score, GARP metrics) and backtests portfolio strategies over historical periods.

## Running the Application

### Development
```bash
# Start backend server (port 5000)
PORT=5000 FMP_API_KEY=your_key USE_MOCK_DATA=false node server/index.js

# Start frontend (port 3000)
cd client && PORT=3000 npm start

# Or use concurrently (if configured)
npm run dev
```

### Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Database Architecture

### Primary Database: `stock_data.db` (SQLite)

**Key Tables:**

1. **`historical_fundamentals`** - Core historical data (Years 1-6)
   - PRIMARY KEY: `(symbol, years_ago)`
   - Stores: market_cap, adtv, price_to_sales, sales_growth, gf_score, pe_ratio, debt_to_equity, operating_margin, roic, fcf_yield, fcf_growth, eps_growth, revenue_cagr, peg_ratio
   - **Years 1-6 only** (calculated by `calculate-peg-and-growth-historical.js`)
   - Year 0 is fetched live from FMP API, not stored in this table

2. **`stocks`** - Current stock evaluations and rankings
   - Cached evaluation results with weighted scores and ranks

3. **`portfolio_returns_cache`** - Backtested portfolio performance
   - Stores returns for different portfolio strategies (annual rebalance, hold-winners, rolling rebalance)

4. **`gf_scores`** - GuruFocus scores (scraped via Puppeteer)

### Database Locations
- Main database: `./stock_data.db` (root directory)
- Server database: `./data/stocks.db` (used by Express server)
- **These are separate databases** - some scripts use root, server uses data/

## Data Flow Architecture

### Historical Data Pipeline

1. **Data Collection** (Years 1-6):
   ```
   calculate-peg-and-growth-historical.js
   └─> Fetches FMP API for years 1-6
   └─> Calculates growth metrics (FCF, EPS, Revenue CAGR)
   └─> Calculates PEG Ratio = PE / EPS Growth
   └─> Saves to historical_fundamentals table
   ```

2. **Current Data** (Year 0):
   ```
   Frontend requests → /api/stocks/evaluate
   └─> Fetches live data from FMP API
   └─> Calculates growth metrics on-the-fly
   └─> Returns without storing in historical_fundamentals
   ```

3. **Missing Data Population**:
   ```
   populate-all-missing-data.js
   └─> Fills gaps in historical_fundamentals
   └─> Fetches quarter-specific data (Q1, Q2, Q3, Q4)
   └─> Rate limited: 700 calls/min
   ```

### Portfolio Backtesting Flow

```
Historical Top Stocks Component
└─> Selects top N stocks from years_ago
└─> portfolioReturnsService.calculateReturns()
    ├─> Annual Rebalance: Rebalance every 12 months
    ├─> Hold Winners: Track individual stock performance
    └─> Rolling Rebalance: Quarterly rebalancing
```

## Critical Implementation Details

### Growth Metrics Calculation

**FCF Growth, EPS Growth, Revenue CAGR** are calculated in `calculate-peg-and-growth-historical.js`:

- **FCF Growth**: `(current_fcf - previous_fcf) / abs(previous_fcf) * 100`
- **EPS Growth**: `(current_eps - previous_eps) / abs(previous_eps) * 100`
- **Revenue CAGR**: `(pow(end_revenue / start_revenue, 1/years) - 1) * 100`
- **PEG Ratio**: `pe_ratio / eps_growth` (only when eps_growth > 0)

### API Rate Limiting

Financial Modeling Prep API:
- **Free tier**: 300 requests/minute
- **Paid tier**: 700+ requests/minute
- Scripts use `DELAY_MS = (60 * 1000) / CALLS_PER_MINUTE`
- Always add delay between requests to avoid 429 errors

### GuruFocus Scraping

Uses Puppeteer (`server/services/guruFocusService.js`):
- Scrapes GF Score from GuruFocus.com/stock/{symbol}
- Extracts from page as `textContent` of specific DOM element
- Stores in separate `gf_scores` table
- **Fallback**: If Puppeteer fails, use mock data mode

### Historical Data Years

**IMPORTANT**: The codebase has different year ranges in different places:
- **Database (historical_fundamentals)**: Years 1-6 only
- **Frontend UI (HistoricalTopStocks.js)**: Selector shows Years 0-10
- **Scripts**: Most calculate Years 1-6, some attempt 0-10

When extending to Years 7-10:
1. Modify loop in `calculate-peg-and-growth-historical.js` line 323: `for (let yearsAgo = 1; yearsAgo <= 10; yearsAgo++)`
2. Ensure FMP API has data for those years (may not exist for newer companies)

## Common Scripts

### Data Population Scripts

```bash
# Calculate PEG and growth metrics for Years 1-6
node calculate-peg-and-growth-historical.js

# Fill missing data gaps (ADTV, fundamentals)
node populate-all-missing-data.js

# Recalculate specific years
node recalc-years-4-5-6.js

# Merge multiple database files
node merge-all-databases.js
```

### Optimization Scripts

```bash
# Find optimal metric weights using genetic algorithm
node optimize-comprehensive-genetic.js

# Local search optimization from best config
node optimize-local-search-from-best.js

# Test multiple portfolio strategies
node optimize-multi-portfolio.js
```

### Validation Scripts

```bash
# Validate data completeness
node validate-data.js

# Validate calculation accuracy
node validate-calculations.js

# Debug specific stock calculations
node debug-unh-ranking.js
```

## Frontend Components

### Key Components

1. **HistoricalTopStocks.js** - Main historical analysis UI
   - Selects year (0-10)
   - Filters by market cap, ADTV, P/S, sales growth, GF score
   - Displays top N stocks with all metrics + growth data
   - Shows portfolio backtest returns

2. **GARPStrategy.js** - GARP (Growth At Reasonable Price) strategy
   - Filters stocks by PEG ratio, P/E, growth metrics
   - Backtests GARP portfolios

3. **PortfolioReturns.js** - Portfolio performance visualization
   - Annual rebalance strategy
   - Displays 1Y, 3Y, 5Y returns

4. **AnnualRebalanceReturns.js** - Detailed annual rebalance tracking

5. **HoldWinnersReturns.js** - Hold-winners strategy (no rebalancing)

### API Proxy

React app proxies API requests to backend:
- `client/package.json` has `"proxy": "http://localhost:5000"`
- Frontend calls `/api/stocks/...` → proxied to `http://localhost:5000/api/stocks/...`

## Environment Variables

Required in `.env` file:
```bash
PORT=5000                    # Backend server port
FMP_API_KEY=your_key_here   # Financial Modeling Prep API key
USE_MOCK_DATA=false         # Use real API data (true for testing)
```

## Architecture Patterns

### Service Layer Pattern

Backend services (in `server/services/`):
- **stockDataService.js** - FMP API wrapper, caching
- **evaluationService.js** - Ranking algorithm, weighted scoring
- **historicalDataService.js** - Historical data fetching
- **portfolioReturnsService.js** - Backtest calculations
- **guruFocusService.js** - Puppeteer web scraping
- **garpService.js** - GARP strategy logic

### Caching Strategy

1. **In-memory cache** (node-cache): 1-hour TTL for API responses
2. **SQLite database**: Persistent storage
3. **Auto-refresh**: Data older than 1 hour triggers re-fetch

### Error Handling

FMP API errors:
- 429 (Rate Limit): Automatically retry with delay
- 401 (Auth): Check API key in `.env`
- Timeout: 10-second timeout on all requests

## Git Workflow

Repository: https://github.com/BoPengGit/sp500-stock-analysis

Files excluded in `.gitignore`:
- `*.db` - All SQLite databases
- `.env` - API keys and secrets
- `node_modules/`
- `*.log` - Log files
- Optimization result files (`*-results.txt`, `*-optimization-*.txt`)

## Data Consistency Notes

### Metric Rankings

Rankings are calculated as:
1. Sort stocks by metric value (ascending or descending based on "better" direction)
2. Assign rank 1 to best, 2 to second-best, etc.
3. Calculate weighted score: `sum(rank * weight)` for each metric
4. Overall rank based on lowest weighted score

### Missing Data Handling

- `NULL` values are skipped in ranking (not ranked)
- Growth metrics may be `NULL` if previous year data unavailable
- PEG ratio is `NULL` if `eps_growth <= 0` or `pe_ratio` is `NULL`

## Performance Considerations

### Large Data Operations

- Processing 502 S&P 500 stocks × 10 years = 5,020 database records
- Use batch inserts: `db.run()` in transaction for bulk operations
- Index on `(symbol, years_ago)` for fast lookups

### Frontend Performance

- React table rendering: Limit results with `limit` parameter
- Sort on backend, not frontend, for large datasets
- Use pagination for > 100 results

## Troubleshooting

### Port Conflicts

Both frontend and backend need separate ports:
```bash
# Kill processes on ports
lsof -ti :3000 | xargs kill
lsof -ti :5000 | xargs kill
```

### Database Locked Errors

SQLite doesn't handle concurrent writes well:
- Use `db.serialize()` for sequential operations
- Avoid multiple scripts writing to same database simultaneously

### Missing Historical Data

If Years 7-10 don't exist:
- Scripts only populate Years 1-6 by default
- Modify loop range in `calculate-peg-and-growth-historical.js`
- FMP API may not have 7-10 year old data for all stocks
