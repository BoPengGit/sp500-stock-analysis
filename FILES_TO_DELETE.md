# Files Safe to Delete

This document lists all files identified as safe to delete with their absolute paths.

## Migration Scripts (4 files) - ONE-TIME database migrations
```
/Users/bo/Documents/untitled folder/migrate-add-2-4-year-returns.js
/Users/bo/Documents/untitled folder/migrate-add-2-4-year-returns-n10.js
/Users/bo/Documents/untitled folder/migrate-add-2-4-year-returns-n15.js
/Users/bo/Documents/untitled folder/migrate-add-2-4-year-returns-n20.js
```

## Debug Scripts (6 files) - Development debugging
```
/Users/bo/Documents/untitled folder/debug-bac.js
/Users/bo/Documents/untitled folder/debug-calculation-mismatch.js
/Users/bo/Documents/untitled folder/debug-gf-ranks.js
/Users/bo/Documents/untitled folder/debug-hold-winners.js
/Users/bo/Documents/untitled folder/debug-single-metric-bug.js
/Users/bo/Documents/untitled folder/debug-unh-ranking.js
```

## Test Scripts (5 files) - Component testing
```
/Users/bo/Documents/untitled folder/test-brk-bf.js
/Users/bo/Documents/untitled folder/test-gurufocus.js
/Users/bo/Documents/untitled folder/test-historical-gf-extraction.js
/Users/bo/Documents/untitled folder/test-scraper-incremental.js
/Users/bo/Documents/untitled folder/test-all-weight-configs.js
```

## Experiment Scripts (3 files) - Research/analysis (results in App.js)
```
/Users/bo/Documents/untitled folder/experiment-max-4year.js
/Users/bo/Documents/untitled folder/experiment-max-5year.js
/Users/bo/Documents/untitled folder/experiment-optimal-weights.js
```

## Data Population Scripts (7 files) - ONE-TIME database population
```
/Users/bo/Documents/untitled folder/populate-all-missing-data.js
/Users/bo/Documents/untitled folder/prepopulate-portfolio-data.js
/Users/bo/Documents/untitled folder/prepopulate-database.js
/Users/bo/Documents/untitled folder/prepopulate-missing-stocks.js
/Users/bo/Documents/untitled folder/precalculate-all-weights.js
/Users/bo/Documents/untitled folder/recalc-years-4-5-6.js
/Users/bo/Documents/untitled folder/recalculate-years-1-6.js
```

## Duplicate GF Score Fetch Scripts (3 files)
```
/Users/bo/Documents/untitled folder/scrape-all-gf-scores.js
/Users/bo/Documents/untitled folder/fetch-all-historical-gf-scores.js
/Users/bo/Documents/untitled folder/fetch-missing-gf-scores.js
```

## Older/Redundant Optimization Scripts (4 files)
```
/Users/bo/Documents/untitled folder/optimize-comprehensive-genetic.js
/Users/bo/Documents/untitled folder/optimize-local-search.js
/Users/bo/Documents/untitled folder/optimize-multi-portfolio.js
/Users/bo/Documents/untitled folder/optimize-garp-genetic.js
```

## Validation & Utility Scripts (8 files) - Research/validation complete
```
/Users/bo/Documents/untitled folder/validate-calculations.js
/Users/bo/Documents/untitled folder/validate-data.js
/Users/bo/Documents/untitled folder/fetch-special-tickers.js
/Users/bo/Documents/untitled folder/intelligent-optimizer.js
/Users/bo/Documents/untitled folder/merge-all-databases.js
/Users/bo/Documents/untitled folder/sync-garp-to-stocks.js
/Users/bo/Documents/untitled folder/find-optimal-weights.js
/Users/bo/Documents/untitled folder/calculate-peg-and-growth-historical.js
```

## Backup Utility (1 file) - OPTIONAL (only if not needed)
```
/Users/bo/Documents/untitled folder/backup-database.js
```

## Test Output Files (28 files) - Build artifacts
```
/Users/bo/Documents/untitled folder/comprehensive-NEW-RUN.txt
/Users/bo/Documents/untitled folder/comprehensive-optimization-FINAL.txt
/Users/bo/Documents/untitled folder/comprehensive-optimization-FIXED-results.txt
/Users/bo/Documents/untitled folder/comprehensive-optimization-results.txt
/Users/bo/Documents/untitled folder/comprehensive-test-results.txt
/Users/bo/Documents/untitled folder/garp-genetic-10metrics.txt
/Users/bo/Documents/untitled folder/garp-genetic-fixed.txt
/Users/bo/Documents/untitled folder/garp-genetic-results-final.txt
/Users/bo/Documents/untitled folder/garp-genetic-results.txt
/Users/bo/Documents/untitled folder/garp-genetic-results2.txt
/Users/bo/Documents/untitled folder/garp-genetic-with-ranks.txt
/Users/bo/Documents/untitled folder/garp-optimization-results.txt
/Users/bo/Documents/untitled folder/gf-scrape-log.txt
/Users/bo/Documents/untitled folder/gurufocus-page.html
/Users/bo/Documents/untitled folder/gurufocus-test.png
/Users/bo/Documents/untitled folder/local-search-from-best.txt
/Users/bo/Documents/untitled folder/local-search-results.txt
/Users/bo/Documents/untitled folder/multi-portfolio-results-fixed.txt
/Users/bo/Documents/untitled folder/multi-portfolio-results.txt
/Users/bo/Documents/untitled folder/optimization-results.txt
/Users/bo/Documents/untitled folder/peg-calculation-full.log
/Users/bo/Documents/untitled folder/peg-complete-fill.log
/Users/bo/Documents/untitled folder/peg-fill-missing.log
/Users/bo/Documents/untitled folder/peg-growth-calculation.log
/Users/bo/Documents/untitled folder/peg-recalc-fixed.log
/Users/bo/Documents/untitled folder/peg-recalculation.log
/Users/bo/Documents/untitled folder/populate-all-missing-data.log
/Users/bo/Documents/untitled folder/populate-years-6-10.log
/Users/bo/Documents/untitled folder/weight-optimization-results.json
/Users/bo/Documents/untitled folder/year0-calculation.log
/Users/bo/Documents/untitled folder/years-1-6-recalculation.log
```

## Total Files: 50 files (can be deleted immediately)
## Optional: +1 file (backup-database.js if not needed)
## Build Artifacts: 28 files (safe to delete anytime)

---

## Bash Command to Delete All (in phases for safety)

```bash
# Phase 1: Delete build artifacts (28 files)
cd "/Users/bo/Documents/untitled folder"
rm -f *.txt *.log gurufocus-page.html gurufocus-test.png weight-optimization-results.json

# Phase 2: Delete migration scripts (4 files)
rm -f migrate-add-2-4-year-returns*.js

# Phase 3: Delete debug and test scripts (11 files)
rm -f debug-*.js test-*.js experiment-*.js

# Phase 4: Delete redundant scripts (15 files)
rm -f scrape-all-gf-scores.js fetch-all-historical-gf-scores.js fetch-missing-gf-scores.js
rm -f optimize-comprehensive-genetic.js optimize-local-search.js optimize-multi-portfolio.js optimize-garp-genetic.js
rm -f validate-calculations.js validate-data.js fetch-special-tickers.js intelligent-optimizer.js
rm -f merge-all-databases.js sync-garp-to-stocks.js find-optimal-weights.js calculate-peg-and-growth-historical.js

# Phase 5: Delete data population scripts (7 files)
rm -f populate-all-missing-data.js prepopulate-*.js precalculate-all-weights.js recalc*.js

# Optional: Delete backup utility (1 file)
# rm -f backup-database.js

# Commit changes
git add -A
git commit -m "chore: remove unused dev/test/migration scripts and build artifacts"
```
