import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PortfolioReturns.css';

/**
 * GARP (Growth at Reasonable Price) Strategy Component
 *
 * Displays stocks ranked by GARP metrics:
 * - P/E Ratio (lower is better)
 * - Debt-to-Equity (lower is better)
 * - Operating Margin (higher is better)
 * - ROIC (higher is better)
 * - FCF Yield (higher is better)
 * - Sales Growth (higher is better, carried over from main metrics)
 */
function GARPStrategy({ selectedWeights, onWeightChange, weightConfigs }) {
  const [garpStocks, setGarpStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    maxPE: 30,
    maxDebtToEquity: 2,
    minOperatingMargin: 10,
    minROIC: 10,
    minFCFYield: 2,
    minSalesGrowth: 10,
    limit: 50
  });

  useEffect(() => {
    fetchGARPStocks();
  }, [selectedWeights, filters]);

  const fetchGARPStocks = async () => {
    setLoading(true);
    setError(null);

    try {
      const weights = weightConfigs[selectedWeights];
      const params = {
        marketCap: weights.marketCap,
        adtv: weights.adtv,
        priceToSales: weights.priceToSales,
        salesGrowth: weights.salesGrowth,
        gfScore: weights.gfScore,
        ...filters
      };

      const response = await axios.get('/api/stocks/garp', { params });

      if (response.data.success) {
        setGarpStocks(response.data.data);
      } else {
        setError('Failed to fetch GARP stocks');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch GARP stocks');
      console.error('Error fetching GARP stocks:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(decimals);
  };

  const formatLargeNumber = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="portfolio-returns">
        <h2>GARP Strategy - Growth at Reasonable Price</h2>
        <p className="loading-text">Loading GARP stocks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-returns">
        <h2>GARP Strategy - Growth at Reasonable Price</h2>
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-returns garp-strategy">
      <div className="returns-header">
        <h2>GARP Strategy - Growth at Reasonable Price</h2>
        <p className="strategy-description">
          Screens for stocks with strong growth metrics at reasonable valuations
        </p>
      </div>

      <div className="weight-selector">
        <label>Weight Configuration:</label>
        <select
          value={selectedWeights}
          onChange={(e) => onWeightChange(e.target.value)}
        >
          {Object.entries(weightConfigs).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      <div className="garp-filters">
        <h3>GARP Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div>
            <label>Max P/E Ratio:</label>
            <input
              type="number"
              value={filters.maxPE}
              onChange={(e) => setFilters({ ...filters, maxPE: parseFloat(e.target.value) })}
              step="5"
            />
          </div>
          <div>
            <label>Max Debt/Equity:</label>
            <input
              type="number"
              value={filters.maxDebtToEquity}
              onChange={(e) => setFilters({ ...filters, maxDebtToEquity: parseFloat(e.target.value) })}
              step="0.5"
            />
          </div>
          <div>
            <label>Min Op. Margin %:</label>
            <input
              type="number"
              value={filters.minOperatingMargin}
              onChange={(e) => setFilters({ ...filters, minOperatingMargin: parseFloat(e.target.value) })}
              step="5"
            />
          </div>
          <div>
            <label>Min ROIC %:</label>
            <input
              type="number"
              value={filters.minROIC}
              onChange={(e) => setFilters({ ...filters, minROIC: parseFloat(e.target.value) })}
              step="5"
            />
          </div>
          <div>
            <label>Min FCF Yield %:</label>
            <input
              type="number"
              value={filters.minFCFYield}
              onChange={(e) => setFilters({ ...filters, minFCFYield: parseFloat(e.target.value) })}
              step="1"
            />
          </div>
          <div>
            <label>Min Sales Growth %:</label>
            <input
              type="number"
              value={filters.minSalesGrowth}
              onChange={(e) => setFilters({ ...filters, minSalesGrowth: parseFloat(e.target.value) })}
              step="5"
            />
          </div>
          <div>
            <label>Limit Results:</label>
            <input
              type="number"
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
              step="10"
            />
          </div>
        </div>
      </div>

      {garpStocks.length > 0 ? (
        <div className="garp-results">
          <h3>GARP Stocks ({garpStocks.length} found)</h3>
          <table className="returns-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Symbol</th>
                <th>Name</th>
                <th>Market Cap</th>
                <th>P/E</th>
                <th>D/E</th>
                <th>Op. Margin</th>
                <th>ROIC</th>
                <th>FCF Yield</th>
                <th>Sales Growth</th>
                <th>GARP Score</th>
              </tr>
            </thead>
            <tbody>
              {garpStocks.map((stock, index) => (
                <tr key={stock.symbol}>
                  <td>{index + 1}</td>
                  <td className="symbol-cell">{stock.symbol}</td>
                  <td className="name-cell">{stock.name}</td>
                  <td className="value-cell">{formatLargeNumber(stock.marketCap)}</td>
                  <td className="value-cell">{formatNumber(stock.peRatio)}</td>
                  <td className="value-cell">{formatNumber(stock.debtToEquity)}</td>
                  <td className={`value-cell ${stock.operatingMargin >= 20 ? 'positive' : ''}`}>
                    {formatPercent(stock.operatingMargin)}
                  </td>
                  <td className={`value-cell ${stock.roic >= 15 ? 'positive' : ''}`}>
                    {formatPercent(stock.roic)}
                  </td>
                  <td className={`value-cell ${stock.fcfYield >= 5 ? 'positive' : ''}`}>
                    {formatPercent(stock.fcfYield)}
                  </td>
                  <td className={`value-cell ${stock.salesGrowth >= 20 ? 'positive' : ''}`}>
                    {formatPercent(stock.salesGrowth)}
                  </td>
                  <td className="value-cell">{formatNumber(stock.garpScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No stocks match the current GARP criteria. Try adjusting the filters.</p>
        </div>
      )}

      <div className="returns-note">
        <p>
          <strong>GARP Strategy:</strong> Identifies stocks with strong growth (sales growth, ROIC, operating margin)
          at reasonable valuations (low P/E ratio) and solid financial health (low debt, positive FCF).
        </p>
        <p>
          <strong>Note:</strong> GARP metrics data is being fetched in the background. Some stocks may not have
          complete data yet.
        </p>
      </div>
    </div>
  );
}

export default GARPStrategy;
