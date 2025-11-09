#!/usr/bin/env node

/**
 * Database Backup and Restore Utility
 *
 * This script creates immutable backups of the stock database
 * that can be restored if data is accidentally deleted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, 'data/stocks.db');
const BACKUP_DIR = path.join(__dirname, 'data/backups');
const MASTER_BACKUP = path.join(BACKUP_DIR, 'stocks.master.db');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('Created backup directory:', BACKUP_DIR);
}

/**
 * Create a timestamped backup
 */
function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('ERROR: Database file not found at:', DB_PATH);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const backupPath = path.join(BACKUP_DIR, `stocks.${timestamp}.db`);

  // Copy database file
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('✓ Created backup:', backupPath);

  // Get database stats
  const stats = getDatabaseStats(backupPath);
  console.log('\nBackup contents:');
  console.log(`  - Stocks: ${stats.stocks}`);
  console.log(`  - GF Scores: ${stats.gfScores}`);
  console.log(`  - Portfolio Returns: ${stats.portfolioReturns}`);
  console.log(`  - Historical Backtests: ${stats.backtests}`);

  return backupPath;
}

/**
 * Create or update the master backup (read-only)
 */
function createMasterBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('ERROR: Database file not found at:', DB_PATH);
    process.exit(1);
  }

  // First create a timestamped backup
  const timestampedBackup = createBackup();

  // Copy to master backup
  fs.copyFileSync(DB_PATH, MASTER_BACKUP);

  // Make it read-only (chmod 444)
  fs.chmodSync(MASTER_BACKUP, 0o444);

  console.log('\n✓ Created MASTER backup (read-only):', MASTER_BACKUP);
  console.log('\nThis master backup is protected from accidental deletion.');
  console.log('To restore from this backup, use: node backup-database.js restore');
}

/**
 * List all available backups
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backups found. Backup directory does not exist.');
    return;
  }

  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));

  if (files.length === 0) {
    console.log('No backups found.');
    return;
  }

  console.log('\nAvailable backups:\n');

  files.forEach((file, index) => {
    const filePath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(filePath);
    const size = (stat.size / 1024).toFixed(2);
    const isMaster = file === 'stocks.master.db';
    const isReadOnly = (stat.mode & 0o200) === 0;

    const stats = getDatabaseStats(filePath);

    console.log(`${index + 1}. ${file}`);
    console.log(`   Size: ${size} KB`);
    console.log(`   Modified: ${stat.mtime.toLocaleString()}`);
    if (isMaster || isReadOnly) {
      console.log(`   Status: ${isMaster ? 'MASTER' : 'READ-ONLY'}`);
    }
    console.log(`   Stocks: ${stats.stocks} | GF Scores: ${stats.gfScores} | Returns: ${stats.portfolioReturns}`);
    console.log('');
  });
}

/**
 * Restore from a backup
 */
function restoreBackup(backupFile = 'stocks.master.db') {
  const backupPath = backupFile.includes('/') ? backupFile : path.join(BACKUP_DIR, backupFile);

  if (!fs.existsSync(backupPath)) {
    console.error('ERROR: Backup file not found:', backupPath);
    console.log('\nAvailable backups:');
    listBackups();
    process.exit(1);
  }

  // Show what we're restoring from
  console.log('\nRestoring from backup:', backupPath);
  const stats = getDatabaseStats(backupPath);
  console.log('Backup contents:');
  console.log(`  - Stocks: ${stats.stocks}`);
  console.log(`  - GF Scores: ${stats.gfScores}`);
  console.log(`  - Portfolio Returns: ${stats.portfolioReturns}`);
  console.log(`  - Historical Backtests: ${stats.backtests}\n`);

  // Create a backup of current database before restoring
  if (fs.existsSync(DB_PATH)) {
    const preRestoreBackup = path.join(BACKUP_DIR, `stocks.pre-restore-${Date.now()}.db`);
    fs.copyFileSync(DB_PATH, preRestoreBackup);
    console.log('✓ Created backup of current database:', preRestoreBackup);
  }

  // Restore the backup
  fs.copyFileSync(backupPath, DB_PATH);
  console.log('✓ Database restored from:', backupPath);

  // Verify
  const currentStats = getDatabaseStats(DB_PATH);
  console.log('\nCurrent database now contains:');
  console.log(`  - Stocks: ${currentStats.stocks}`);
  console.log(`  - GF Scores: ${currentStats.gfScores}`);
  console.log(`  - Portfolio Returns: ${currentStats.portfolioReturns}`);
  console.log(`  - Historical Backtests: ${currentStats.backtests}`);
}

/**
 * Get database statistics
 */
function getDatabaseStats(dbPath) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    return new Promise((resolve) => {
      const stats = {};

      db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        stats.stocks = err ? 0 : row.count;

        db.get('SELECT COUNT(*) as count FROM gf_scores', (err, row) => {
          stats.gfScores = err ? 0 : row.count;

          db.get('SELECT COUNT(*) as count FROM portfolio_returns', (err, row) => {
            stats.portfolioReturns = err ? 0 : row.count;

            db.get('SELECT COUNT(*) as count FROM historical_backtests', (err, row) => {
              stats.backtests = err ? 0 : row.count;

              db.close();
              resolve(stats);
            });
          });
        });
      });
    });
  } catch (err) {
    // If sqlite3 is not available, try with sqlite3 command
    try {
      const stocks = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM stocks;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
      const gfScores = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM gf_scores;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
      const portfolioReturns = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM portfolio_returns;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
      const backtests = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM historical_backtests;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();

      return {
        stocks: parseInt(stocks) || 0,
        gfScores: parseInt(gfScores) || 0,
        portfolioReturns: parseInt(portfolioReturns) || 0,
        backtests: parseInt(backtests) || 0
      };
    } catch (e) {
      return { stocks: 0, gfScores: 0, portfolioReturns: 0, backtests: 0 };
    }
  }
}

// For synchronous version
function getDatabaseStatsSync(dbPath) {
  try {
    const stocks = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM stocks;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
    const gfScores = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM gf_scores;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
    const portfolioReturns = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM portfolio_returns;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();
    const backtests = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM historical_backtests;" 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim();

    return {
      stocks: parseInt(stocks) || 0,
      gfScores: parseInt(gfScores) || 0,
      portfolioReturns: parseInt(portfolioReturns) || 0,
      backtests: parseInt(backtests) || 0
    };
  } catch (e) {
    return { stocks: 0, gfScores: 0, portfolioReturns: 0, backtests: 0 };
  }
}

function getDatabaseStats(dbPath) {
  return getDatabaseStatsSync(dbPath);
}

/**
 * Auto-backup before destructive operations
 */
function autoBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('No database to backup.');
    return;
  }

  const autoBackupPath = path.join(BACKUP_DIR, `stocks.auto-${Date.now()}.db`);
  fs.copyFileSync(DB_PATH, autoBackupPath);
  console.log('✓ Auto-backup created:', autoBackupPath);
  return autoBackupPath;
}

// CLI
const command = process.argv[2];

switch (command) {
  case 'backup':
  case 'create':
    createBackup();
    break;

  case 'master':
    createMasterBackup();
    break;

  case 'list':
  case 'ls':
    listBackups();
    break;

  case 'restore':
    const backupFile = process.argv[3];
    restoreBackup(backupFile);
    break;

  case 'auto':
    autoBackup();
    break;

  default:
    console.log('Database Backup and Restore Utility\n');
    console.log('Usage:');
    console.log('  node backup-database.js backup        - Create a timestamped backup');
    console.log('  node backup-database.js master        - Create/update read-only master backup');
    console.log('  node backup-database.js list          - List all available backups');
    console.log('  node backup-database.js restore [file] - Restore from backup (default: master)');
    console.log('  node backup-database.js auto          - Create auto-backup (used before destructive ops)');
    console.log('\nExamples:');
    console.log('  node backup-database.js master');
    console.log('  node backup-database.js restore');
    console.log('  node backup-database.js restore stocks.2025-01-15.db');
    break;
}
