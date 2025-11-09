import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PortfolioReturns.css';

function HoldWinnersReturns({ selectedWeights, onWeightChange, weightConfigs }) {
  const [returns, setReturns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPeriods, setExpandedPeriods] = useState({ '5year': true });
  const [portfolioSize, setPortfolioSize] = useState(10);
  const [keepThreshold, setKeepThreshold] = useState(20);

  useEffect(() => {
    fetchReturns();
  }, [selectedWeights, portfolioSize, keepThreshold]);

  const fetchReturns = async (forceRefresh = false) => {
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
        portfolioSize: portfolioSize,
        keepThreshold: keepThreshold,
        refresh: forceRefresh ? 'true' : undefined
      };

      const response = await axios.get('/api/stocks/hold-winners', { params });

      if (response.data.success) {
        setReturns(response.data.data);
      } else {
        setError('Failed to fetch hold winners returns');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch returns');
      console.error('Error fetching hold winners returns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchReturns(true);
  };

  const togglePeriod = (period) => {
    setExpandedPeriods(prev => ({
      ...prev,
      [period]: !prev[period]
    }));
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="portfolio-returns">
        <h2>Hold Winners Strategy</h2>
        <p className="loading-text">Calculating hold winners returns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-returns">
        <h2>Hold Winners Strategy</h2>
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!returns) {
    return null;
  }

  const { summary, results } = returns;

  return (
    <div className="portfolio-returns hold-winners">
      <div className="returns-header">
        <h2>Hold Winners Strategy</h2>
        <p className="strategy-description">
          Keep stocks ranked in top {keepThreshold}, replace stocks that fall below rank #{keepThreshold}
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

      <div className="weight-selector">
        <label>Portfolio Size:</label>
        <select
          value={portfolioSize}
          onChange={(e) => setPortfolioSize(parseInt(e.target.value))}
        >
          {[5, 10, 15, 20].map(size => (
            <option key={size} value={size}>{size} stocks</option>
          ))}
        </select>
      </div>

      <div className="weight-selector">
        <label>Keep Threshold:</label>
        <select
          value={keepThreshold}
          onChange={(e) => setKeepThreshold(parseInt(e.target.value))}
        >
          {[10, 15, 20, 25, 30].map(threshold => (
            <option key={threshold} value={threshold}>Top {threshold}</option>
          ))}
        </select>
      </div>

      <table className="returns-table summary-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Annualized Return</th>
            <th>Total Return</th>
            <th>Final Value</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {['1year', '2year', '3year', '4year', '5year'].map((period, idx) => (
            <React.Fragment key={period}>
              <tr className="period-row">
                <td className="period-label">{idx + 1} Year</td>
                <td className={`return-value ${summary && summary[period] >= 0 ? 'positive' : 'negative'}`}>
                  {summary && summary[period] !== null ? formatPercent(summary[period]) : 'N/A'}
                </td>
                <td className={`return-value ${results && results[period]?.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {results && results[period] ? formatPercent(results[period].totalReturn) : 'N/A'}
                </td>
                <td className="final-value">${results && results[period]?.finalValue?.toFixed(4) || 'N/A'}</td>
                <td className="details-cell">
                  <button
                    className="expand-btn"
                    onClick={() => togglePeriod(period)}
                  >
                    {expandedPeriods[period] ? '▼ Hide' : '▶ Show'} Transactions
                  </button>
                </td>
              </tr>
              {expandedPeriods[period] && results && results[period] && (
                <tr className="expanded-row">
                  <td colSpan="5">
                    <div className="transaction-details">
                      <h4>Transaction History</h4>
                      {results[period].transactions && results[period].transactions.map((txn, idx) => (
                        <div key={idx} className="year-block">
                          <div className="year-header">
                            <span className="year-label">{txn.action}</span>
                            <span className="year-date">{txn.date}</span>
                            <span className="portfolio-value">Portfolio: ${txn.portfolioValue?.toFixed(4)}</span>
                          </div>
                          <div className="year-info">
                            {txn.action === 'BUY' && (
                              <div className="stocks-bought">
                                <strong>Initial Buy ({txn.count} stocks):</strong>
                                <div className="stock-symbols">
                                  {txn.symbols.map((symbol, i) => (
                                    <span key={i} className="stock-symbol">{symbol}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {txn.action === 'REBALANCE' && (
                              <div className="rebalance-info">
                                {txn.kept && txn.kept.length > 0 && (
                                  <div className="stocks-kept">
                                    <strong>Kept ({txn.kept.length} stocks):</strong>
                                    <div className="stock-symbols">
                                      {txn.kept.map((symbol, i) => (
                                        <span key={i} className="stock-symbol keep">{symbol}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {txn.sold && txn.sold.length > 0 && (
                                  <div className="stocks-sold">
                                    <strong>Sold ({txn.sold.length} stocks):</strong>
                                    <div className="stock-symbols">
                                      {txn.sold.map((symbol, i) => (
                                        <span key={i} className="stock-symbol sell">{symbol}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {txn.bought && txn.bought.length > 0 && (
                                  <div className="stocks-bought">
                                    <strong>Bought ({txn.bought.length} stocks):</strong>
                                    <div className="stock-symbols">
                                      {txn.bought.map((symbol, i) => (
                                        <span key={i} className="stock-symbol buy">{symbol}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {txn.action === 'HOLD' && (
                              <div className="stocks-held">
                                <strong>Held ({txn.count} stocks):</strong>
                                <div className="stock-symbols">
                                  {txn.symbols.map((symbol, i) => (
                                    <span key={i} className="stock-symbol keep">{symbol}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {txn.action === 'SELL_ALL' && (
                              <div className="stocks-sold">
                                <strong>Final Sell ({txn.count} stocks):</strong>
                                <div className="stock-symbols">
                                  {txn.symbols.map((symbol, i) => (
                                    <span key={i} className="stock-symbol sell">{symbol}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="returns-note">
        <p>
          <strong>Note:</strong> The "Hold Winners" strategy maintains {portfolioSize} stocks by keeping
          stocks that remain in the top {keepThreshold} and only replacing those that fall below that threshold.
          This reduces turnover compared to complete annual rebalancing while still capturing new opportunities.
        </p>
      </div>
    </div>
  );
}

export default HoldWinnersReturns;
