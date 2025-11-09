import React from 'react';
import './FilterPanel.css';

function FilterPanel({
  filters,
  sectors,
  onFilterChange,
  onApplyFilters,
  onRefresh,
  loading,
  metadata
}) {
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <div className="filter-group">
          <label htmlFor="search">Search Symbol/Name</label>
          <input
            id="search"
            type="text"
            placeholder="e.g., AAPL, Apple"
            value={filters.searchSymbol}
            onChange={(e) => onFilterChange({ searchSymbol: e.target.value })}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="sector">Sector</label>
          <select
            id="sector"
            value={filters.sector}
            onChange={(e) => onFilterChange({ sector: e.target.value })}
          >
            <option value="">All Sectors</option>
            {sectors.map(sector => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="minMarketCap">Min Market Cap ($B)</label>
          <input
            id="minMarketCap"
            type="number"
            placeholder="e.g., 10"
            value={filters.minMarketCap}
            onChange={(e) => onFilterChange({ minMarketCap: e.target.value })}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="limit">Results Limit</label>
          <select
            id="limit"
            value={filters.limit}
            onChange={(e) => onFilterChange({ limit: parseInt(e.target.value) })}
          >
            <option value="10">Top 10</option>
            <option value="25">Top 25</option>
            <option value="50">Top 50</option>
            <option value="100">Top 100</option>
            <option value="250">Top 250</option>
            <option value="999">All</option>
          </select>
        </div>
      </div>

      <div className="action-buttons">
        <button
          className="btn btn-primary"
          onClick={onApplyFilters}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Evaluate Stocks'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Data'}
        </button>
      </div>

      {metadata && (
        <div className="metadata">
          <div className="metadata-item">
            <span className="label">Showing:</span>
            <span className="value">{metadata.total} stocks</span>
          </div>
          {metadata.filtered !== metadata.totalAvailable && (
            <div className="metadata-item">
              <span className="label">Filtered from:</span>
              <span className="value">{metadata.totalAvailable} total</span>
            </div>
          )}
          {metadata.lastUpdate && (
            <div className="metadata-item">
              <span className="label">Last updated:</span>
              <span className="value">
                {new Date(metadata.lastUpdate).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterPanel;
