# Scripts Directory

This directory contains all maintenance and utility scripts for the S&P 500 Stock Analysis Platform.

## Directory Structure

```
scripts/
├── data-fetching/      # Scripts to fetch historical data from APIs
├── optimization/       # Portfolio weight optimization algorithms
└── utilities/          # General utility scripts
```

## Data Fetching Scripts

Located in `scripts/data-fetching/`

### Historical Data Fetchers

- **fetch-all-historical-data.js** - Fetch all historical stock price data (10 years)
- **fetch-historical-data.js** - Fetch historical fundamentals for a specific year
- **fetch-historical-growth-metrics.js** - Fetch FCF Growth, EPS Growth, Revenue CAGR
- **fetch-missing-growth-metrics.js** - Fill gaps in growth metrics data

### GARP Metrics Fetchers

- **fetch-garp-metrics.js** - Fetch current GARP metrics (PEG, P/E, growth rates)
- **fetch-historical-garp-metrics.js** - Fetch historical GARP data

### GuruFocus Score Scrapers

- **fetch-all-historical-gf-scores-optimized.js** - Fetch all historical GF scores (optimized, rate limited)
- **scrape-missing-gf-scores.js** - Incrementally scrape missing GF scores using Puppeteer

**Note**: GuruFocus scripts use web scraping. Run with caution and respect rate limits.

## Optimization Scripts

Located in `scripts/optimization/`

These scripts use genetic algorithms and local search to find optimal portfolio metric weights.

- **optimize-comprehensive-genetic-FIXED.js** - Latest comprehensive genetic algorithm
  - Optimizes across multiple metrics and portfolio sizes
  - Results used in production frontend weights

- **optimize-garp-weights.js** - Optimize GARP-specific weights
  - Focuses on PEG ratio, P/E, growth metrics

- **optimize-local-search-from-best.js** - Local search from best known configuration
  - Fine-tunes existing optimal weights
  - Faster than genetic algorithm

- **optimize-weights.js** - General purpose weight optimization

### Usage

Optimization scripts typically:
1. Load historical data from database
2. Test different weight combinations
3. Backtest portfolio performance
4. Output best configurations to `.txt` files

Results are manually reviewed and hardcoded into `client/src/App.js`.

## Utility Scripts

Located in `scripts/utilities/`

- **backup-database.js** - Create timestamped database backups
- **comprehensive-test.js** - Run full test suite on historical data

## Running Scripts

### Prerequisites

Ensure environment variables are set:
```bash
export FMP_API_KEY=your_api_key_here
```

### Example Usage

```bash
# Fetch missing growth metrics
node scripts/data-fetching/fetch-missing-growth-metrics.js

# Run genetic optimization
node scripts/optimization/optimize-comprehensive-genetic-FIXED.js

# Backup database
node scripts/utilities/backup-database.js
```

## API Rate Limits

**Financial Modeling Prep**:
- Free tier: 300 requests/minute
- Paid tier: 700+ requests/minute

All data fetching scripts include rate limiting. Check console output for current API call rate.

## Important Notes

1. **Run scripts from project root**, not from scripts directory
2. **Database location**: Scripts use `./stock_data.db` in project root
3. **GuruFocus scraping**: Requires Puppeteer, may break if website changes
4. **Optimization scripts**: Can run for hours; monitor CPU usage
5. **Always backup database** before running scripts that modify data
