# Database Backup System

This directory contains protected backups of the stock database.

## Backup Files

- **stocks.master.db** - Read-only master backup (protected from deletion)
- **stocks.YYYY-MM-DDTHH-MM-SS.db** - Timestamped backups

## Usage

### Create a Backup

```bash
# Create a timestamped backup
node backup-database.js backup

# Create/update the master backup (read-only)
node backup-database.js master
```

### List All Backups

```bash
node backup-database.js list
```

### Restore from Backup

```bash
# Restore from master backup (default)
node backup-database.js restore

# Restore from specific backup
node backup-database.js restore stocks.2025-11-07T23-46-40.db
```

## Protection

The master backup file is set to read-only (chmod 444) to prevent accidental deletion or modification. This ensures you always have a stable version to restore from.

## What's Backed Up

Each backup contains:
- Stock data (fundamental metrics from FMP API)
- GF Scores (from GuruFocus)
- Portfolio returns cache
- Historical backtest cache

## Important Notes

1. **Always create a master backup after successfully populating the database**
2. **The restore command automatically creates a backup before restoring** (safety net)
3. **Master backup is READ-ONLY** - you cannot accidentally delete or modify it
4. **Timestamped backups provide a history** of database states

## Example Workflow

```bash
# After populating database with fresh data
node backup-database.js master

# If you accidentally delete data
node backup-database.js restore

# List all available backups
node backup-database.js list
```
