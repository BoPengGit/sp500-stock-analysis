import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PortfolioReturns.css';

function AnnualRebalanceReturns({ selectedWeights, onWeightChange, weightConfigs }) {
  const [returns, setReturns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPeriods, setExpandedPeriods] = useState({ '5year': true }); // Auto-expand 5-year by default

  useEffect(() => {
    fetchReturns();
  }, [selectedWeights]);

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
        refresh: forceRefresh ? 'true' : undefined
      };

      const response = await axios.get('/api/stocks/annual-rebalance', { params });

      if (response.data.success) {
        setReturns(response.data.data);
      } else {
        setError('Failed to fetch annual rebalance returns');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch returns');
      console.error('Error fetching annual rebalance returns:', err);
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
    return `${value.toFixed(2)}%`;
  };

  const getYearlyBreakdown = (periodData) => {
    if (!periodData || !periodData.transactions) return [];

    const breakdown = [];
    const transactions = periodData.transactions;

    // Process transactions in pairs (BUY followed by SELL_ALL)
    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];

      if (txn.action === 'BUY') {
        const nextIndex = i + 1;
        let yearReturn = null;
        let portfolioChange = null;
        let endValue = null;

        // Find the corresponding SELL_ALL transaction
        if (nextIndex < transactions.length && transactions[nextIndex].action === 'SELL_ALL') {
          const sellTxn = transactions[nextIndex];
          const startValue = txn.portfolioValue;
          endValue = sellTxn.portfolioValue;
          yearReturn = ((endValue - startValue) / startValue) * 100;
          portfolioChange = endValue - startValue;
        }

        breakdown.push({
          yearsAgo: txn.yearsAgo,
          date: txn.date,
          stocks: txn.symbols,
          stockCount: txn.count,
          startValue: txn.portfolioValue,
          endValue: endValue,
          yearReturn: yearReturn,
          portfolioChange: portfolioChange,
          stockReturns: txn.stockReturns || [] // Include individual stock returns
        });
      }
    }

    return breakdown.reverse(); // Show most recent first
  };

  if (loading) {
    return (
      <div className="portfolio-returns">
        <h2>Annual Rebalance Returns - Top 10 Stocks</h2>
        <p className="loading-text">Calculating annual rebalanced returns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-returns">
        <h2>Annual Rebalance Returns - Top 10 Stocks</h2>
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!returns) {
    return null;
  }

  const { summary } = returns;

  return (
    <div className="portfolio-returns annual-rebalance">
      <div className="returns-header">
        <h2>Annual Rebalance Returns - Top 10 Stocks</h2>
        <p className="strategy-description">
          Complete portfolio turnover each year: Sell ALL holdings and buy NEW top 10 stocks (equal weight)
        </p>
      </div>

      <div className="weight-selector">
        <label>Weight Configuration:</label>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
          <button
            onClick={handleRefresh}
            className="expand-btn"
            style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
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
                <td className={`return-value ${summary[period] >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(summary[period])}
                </td>
                <td className={`return-value ${returns.results[period]?.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(returns.results[period]?.totalReturn)}
                </td>
                <td className="final-value">${returns.results[period]?.finalValue?.toFixed(4) || 'N/A'}</td>
                <td className="details-cell">
                  <button
                    className="expand-btn"
                    onClick={() => togglePeriod(period)}
                  >
                    {expandedPeriods[period] ? '▼ Hide' : '▶ Show'} Transactions
                  </button>
                </td>
              </tr>
              {expandedPeriods[period] && (
                <tr className="expanded-row">
                  <td colSpan="5">
                    <div className="transaction-details">
                      <h4>Yearly Transaction Breakdown</h4>
                      {getYearlyBreakdown(returns.results[period]).map((year, yearIdx) => (
                        <div key={yearIdx} className="year-block">
                          <div className="year-header">
                            <span className="year-label">Year {yearIdx + 1}</span>
                            <span className="year-date">{year.date}</span>
                            {year.yearReturn !== null && (
                              <span className={`year-return ${year.yearReturn >= 0 ? 'positive' : 'negative'}`}>
                                {formatPercent(year.yearReturn)}
                              </span>
                            )}
                          </div>
                          <div className="year-info">
                            <div className="portfolio-values">
                              <span>Start: ${year.startValue?.toFixed(4)}</span>
                              {year.endValue && (
                                <>
                                  <span className="arrow">→</span>
                                  <span>End: ${year.endValue?.toFixed(4)}</span>
                                  {year.portfolioChange !== null && (
                                    <span className={`change ${year.portfolioChange >= 0 ? 'positive' : 'negative'}`}>
                                      ({year.portfolioChange >= 0 ? '+' : ''}{year.portfolioChange.toFixed(4)})
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="stocks-bought">
                              <strong>Stocks Bought ({year.stockCount}):</strong>

                              {year.stockReturns && year.stockReturns.length > 0 ? (
                                <div className="stock-returns-table-container">
                                  <table className="stock-returns-table">
                                    <thead>
                                      <tr>
                                        <th>Rank</th>
                                        <th>Symbol</th>
                                        <th>Buy Price</th>
                                        <th>Sell Price</th>
                                        <th>Return</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {year.stockReturns
                                        .sort((a, b) => (b.return || -Infinity) - (a.return || -Infinity))
                                        .map((stock, idx) => (
                                          <tr key={stock.symbol}>
                                            <td className="rank-cell">{idx + 1}</td>
                                            <td className="symbol-cell">{stock.symbol}</td>
                                            <td className="value-cell">
                                              {stock.buyPrice ? `$${stock.buyPrice.toFixed(2)}` : 'N/A'}
                                            </td>
                                            <td className="value-cell">
                                              {stock.sellPrice ? `$${stock.sellPrice.toFixed(2)}` : 'N/A'}
                                            </td>
                                            <td className={`return-cell ${stock.return >= 0 ? 'positive' : 'negative'}`}>
                                              {stock.return !== null && stock.return !== undefined
                                                ? `${stock.return > 0 ? '+' : ''}${stock.return.toFixed(2)}%`
                                                : 'N/A'}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="stock-symbols">
                                  {year.stocks.map((symbol, i) => (
                                    <span key={i} className="stock-symbol">{symbol}</span>
                                  ))}
                                </div>
                              )}
                            </div>
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
          <strong>Note:</strong> Annual rebalancing means selling ALL holdings and buying the NEW top 10 stocks
          each year based on that year's fundamentals. This is different from quarterly rebalancing which
          maintains the same holdings and only adjusts weights.
        </p>
      </div>
    </div>
  );
}

export default AnnualRebalanceReturns;
