import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import StockTable from './components/StockTable';
import FilterPanel from './components/FilterPanel';
import Statistics from './components/Statistics';
import Header from './components/Header';
import PortfolioReturns from './components/PortfolioReturns';
import PortfolioReturns15 from './components/PortfolioReturns15';
import PortfolioReturns20 from './components/PortfolioReturns20';
import AnnualRebalanceReturns from './components/AnnualRebalanceReturns';
import HoldWinnersReturns from './components/HoldWinnersReturns';
import HistoricalTopStocks from './components/HistoricalTopStocks';
import GARPStrategy from './components/GARPStrategy';

function App() {
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [sectors, setSectors] = useState([]);

  // Weight configuration state - shared between StockTable and PortfolioReturns
  const [selectedWeights, setSelectedWeights] = useState('5-30-5-50-5-0-0-0-0-5');

  // Filter states
  const [filters, setFilters] = useState({
    sector: '',
    minMarketCap: '',
    limit: 100,
    searchSymbol: ''
  });

  // Fetch sectors on mount
  useEffect(() => {
    fetchSectors();
  }, []);

  // Fetch sectors
  const fetchSectors = async () => {
    try {
      const response = await axios.get('/api/stocks/sectors');
      if (response.data.success) {
        setSectors(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching sectors:', err);
    }
  };

  // Weight configuration mapping
  const weightConfigs = {
    '5-10-10-30-5-5-15-5-10-5': {
      marketCap: 5, adtv: 10, priceToSales: 10, salesGrowth: 30, gfScore: 5,
      peRatio: 5, debtToEquity: 15, operatingMargin: 5, roic: 10, fcfYield: 5,
      label: '5-10-10-30-5-5-15-5-10-5 (Hold-Winners GA Optimized - 349.61% avg)'
    },
    '5-30-5-50-5-0-0-0-0-5': {
      marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 50, gfScore: 5,
      peRatio: 0, debtToEquity: 0, operatingMargin: 0, roic: 0, fcfYield: 5,
      label: '5-30-5-50-5-0-0-0-0-5 (Multi-Portfolio Optimized - 705.47% avg)'
    },
    '5-30-5-50-5-5-0-0-0-0': {
      marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 50, gfScore: 5,
      peRatio: 5, debtToEquity: 0, operatingMargin: 0, roic: 0, fcfYield: 0,
      label: '5-30-5-50-5-5-0-0-0-0 (GA Optimized - 726.38% 5yr)'
    },
    '5-30-5-55-5': { marketCap: 5, adtv: 30, priceToSales: 5, salesGrowth: 55, gfScore: 5, label: '5-30-5-55-5 (Annual Rebalance Optimized - 726% 5yr)' },
    '30-15-15-20-20': { marketCap: 30, adtv: 15, priceToSales: 15, salesGrowth: 20, gfScore: 20, label: '30-15-15-20-20 (Buy & Hold - 38.67% Avg)' },
    '15-15-15-40-15': { marketCap: 15, adtv: 15, priceToSales: 15, salesGrowth: 40, gfScore: 15, label: '15-15-15-40-15 (Growth Max)' },
    '35-35-15-15-0': { marketCap: 35, adtv: 35, priceToSales: 15, salesGrowth: 15, gfScore: 0, label: '35-35-15-15-0 (FANG+ Original)' },
    '20-20-20-20-20': { marketCap: 20, adtv: 20, priceToSales: 20, salesGrowth: 20, gfScore: 20, label: '20-20-20-20-20 (Equal)' },
    '30-30-15-15-10': { marketCap: 30, adtv: 30, priceToSales: 15, salesGrowth: 15, gfScore: 10, label: '30-30-15-15-10 (MC+ADTV Focus)' },
    '20-20-25-25-10': { marketCap: 20, adtv: 20, priceToSales: 25, salesGrowth: 25, gfScore: 10, label: '20-20-25-25-10 (Value+Growth)' },
    'garp-15-15-10-30-10-10-5-5': {
      marketCap: 15, adtv: 15, priceToSales: 10, salesGrowth: 30, gfScore: 10,
      peRatio: 10, debtToEquity: 5, operatingMargin: 5,
      label: 'GARP 15-15-10-30-10-10-5-5 (w/ P/E, D/E, OpMargin)'
    }
  };

  // Fetch stocks with selected weights
  const fetchStocks = async (refresh = false, weightsKey = selectedWeights) => {
    setLoading(true);
    setError(null);

    try {
      const weights = weightConfigs[weightsKey] || weightConfigs['35-35-15-15-0'];

      const params = {
        refresh: refresh,
        limit: filters.limit,
        // Add weight parameters to API call
        marketCap: weights.marketCap,
        adtv: weights.adtv,
        priceToSales: weights.priceToSales,
        salesGrowth: weights.salesGrowth,
        gfScore: weights.gfScore,
        // GARP metrics (optional, default to 0 if not specified)
        peRatio: weights.peRatio || 0,
        debtToEquity: weights.debtToEquity || 0,
        operatingMargin: weights.operatingMargin || 0,
        roic: weights.roic || 0,
        fcfYield: weights.fcfYield || 0
      };

      if (filters.sector) params.sector = filters.sector;
      if (filters.minMarketCap) params.minMarketCap = filters.minMarketCap;

      const response = await axios.get('/api/stocks/evaluate', { params });

      if (response.data.success) {
        setStocks(response.data.data);
        setFilteredStocks(response.data.data);
        setMetadata(response.data.metadata);

        // Fetch statistics
        const statsResponse = await axios.get('/api/stocks/statistics');
        if (statsResponse.data.success) {
          setStatistics(statsResponse.data.data);
        }

        // Refresh sectors list
        fetchSectors();
      } else {
        setError('Failed to fetch stocks');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch stocks');
      console.error('Error fetching stocks:', err);
    } finally {
      setLoading(false);
    }
  };

  // Apply search filter
  useEffect(() => {
    if (filters.searchSymbol) {
      const searchTerm = filters.searchSymbol.toLowerCase();
      const filtered = stocks.filter(stock =>
        stock.symbol.toLowerCase().includes(searchTerm) ||
        stock.name.toLowerCase().includes(searchTerm)
      );
      setFilteredStocks(filtered);
    } else {
      setFilteredStocks(stocks);
    }
  }, [filters.searchSymbol, stocks]);

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleApplyFilters = () => {
    fetchStocks(false);
  };

  const handleRefresh = () => {
    fetchStocks(true);
  };

  // Handle weight change from PortfolioReturns component
  const handleWeightChange = (weightsKey) => {
    // Save scroll position before updating
    const scrollPosition = window.scrollY;

    setSelectedWeights(weightsKey);
    // Re-fetch stocks with the new weights to update the stock list
    fetchStocks(false, weightsKey).then(() => {
      // Restore scroll position after fetch completes
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
      });
    });
  };

  return (
    <div className="App">
      <Header />

      <div className="container">
        <FilterPanel
          filters={filters}
          sectors={sectors}
          onFilterChange={handleFilterChange}
          onApplyFilters={handleApplyFilters}
          onRefresh={handleRefresh}
          loading={loading}
          metadata={metadata}
        />

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {statistics && !loading && (
          <Statistics stats={statistics} />
        )}

        {!loading && filteredStocks.length > 0 && (
          <>
            <GARPStrategy
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <AnnualRebalanceReturns
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <HoldWinnersReturns
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <HistoricalTopStocks
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <PortfolioReturns
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <PortfolioReturns15
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />

            <PortfolioReturns20
              selectedWeights={selectedWeights}
              onWeightChange={handleWeightChange}
              weightConfigs={weightConfigs}
            />
          </>
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading stock data... This may take a few moments.</p>
          </div>
        ) : (
          <StockTable stocks={filteredStocks} />
        )}

        {!loading && filteredStocks.length === 0 && !error && (
          <div className="empty-state">
            <h3>No stocks to display</h3>
            <p>Click "Evaluate Stocks" to fetch and analyze S&P 500 stocks.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
