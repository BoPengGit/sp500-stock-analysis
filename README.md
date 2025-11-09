# S&P 500 Stock Evaluator

A full-stack application that evaluates and ranks all S&P 500 stocks based on four key financial metrics with weighted scoring, similar to the methodology used in the NYFANG+ Index rebalancing.

## Evaluation Methodology

Stocks are ranked using the following metrics with specified weights:

- **Market Cap** (35% weight) - Full company market capitalization
- **ADTV** (35% weight) - Average Daily Trading Volume on the specific share class
- **P/S Ratio** (15% weight) - Price-to-Sales ratio (LTM)
- **Sales Growth** (15% weight) - 1-year net sales growth (LTM)

Each stock receives individual ranks for each metric (1 = best performer), then a weighted score is calculated. Lower weighted scores indicate better overall performance.

## Features

- **Comprehensive Stock Evaluation**: Analyzes all S&P 500 stocks
- **Real-time Data**: Fetches live market data via Financial Modeling Prep API
- **Advanced Filtering**: Filter by sector, market cap, and more
- **Interactive Sorting**: Sort by any metric or rank
- **Statistics Dashboard**: View market-wide statistics
- **Responsive Design**: Works on desktop and mobile devices
- **SQLite Caching**: Stores data locally to minimize API calls

## Tech Stack

### Backend
- Node.js + Express
- SQLite3 database
- Axios for API calls
- Node-cache for in-memory caching
- Financial Modeling Prep API

### Frontend
- React 18
- Axios for API calls
- CSS3 with gradients and animations

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Internet connection for API calls

## Installation

1. **Clone or navigate to the project directory**

2. **Install dependencies**
   ```bash
   npm run install-all
   ```
   This will install dependencies for both server and client.

3. **Configure API Key (Optional but Recommended)**

   The app works with mock data by default. For real stock data:

   a. Get a free API key from [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs/)
      - Free tier: 250 API calls/day
      - No credit card required

   b. Create a `.env` file in the root directory:
      ```bash
      cp .env.example .env
      ```

   c. Edit `.env` and add your API key:
      ```
      FMP_API_KEY=your_api_key_here
      USE_MOCK_DATA=false
      ```

## Running the Application

### Development Mode (Recommended)

Run both server and client concurrently:
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:5000
- Frontend React app on http://localhost:3000

### Production Mode

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm run server
   ```

3. Access the app at http://localhost:5000

## Usage

1. **Initial Load**: Click "Evaluate Stocks" to fetch and analyze all S&P 500 stocks
   - First run takes 2-5 minutes with real API (depends on rate limits)
   - Mock data loads instantly for testing

2. **Filter Stocks**:
   - Search by symbol or company name
   - Filter by sector
   - Set minimum market cap threshold
   - Limit results (Top 10, 25, 50, 100, etc.)

3. **Sort Data**: Click any column header to sort by that metric

4. **Refresh Data**: Click "Refresh Data" to fetch latest market data

5. **View Statistics**: Market-wide statistics appear above the table

## API Endpoints

### GET `/api/stocks/evaluate`
Fetch and evaluate all S&P 500 stocks

**Query Parameters:**
- `refresh` (boolean) - Force fresh data fetch
- `limit` (number) - Limit number of results
- `sector` (string) - Filter by sector
- `minMarketCap` (number) - Minimum market cap in billions

**Response:**
```json
{
  "success": true,
  "data": [/* array of evaluated stocks */],
  "metadata": {
    "total": 100,
    "filtered": 100,
    "totalAvailable": 503,
    "lastUpdate": "2024-11-07T...",
    "filters": { /* applied filters */ }
  }
}
```

### GET `/api/stocks/top/:n`
Get top N ranked stocks

### GET `/api/stocks/statistics`
Get market-wide statistics

### GET `/api/stocks/search/:symbol`
Search for specific stock by symbol

### GET `/api/stocks/sectors`
Get list of all sectors

## Project Structure

```
.
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   └── stocks.js         # API routes
│   ├── services/
│   │   ├── stockDataService.js    # Data fetching
│   │   └── evaluationService.js   # Ranking algorithm
│   ├── database/
│   │   └── db.js             # SQLite operations
│   └── config/
│       └── sp500-tickers.js  # S&P 500 ticker list
├── client/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── components/
│       │   ├── Header.js
│       │   ├── FilterPanel.js
│       │   ├── StockTable.js
│       │   └── Statistics.js
│       ├── App.js
│       └── index.js
├── data/
│   └── stocks.db             # SQLite database (auto-created)
├── .env                      # Environment variables
├── .env.example              # Example environment file
├── package.json
└── README.md
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 5000)
- `FMP_API_KEY` - Financial Modeling Prep API key
- `USE_MOCK_DATA` - Use mock data instead of API (true/false)

### Evaluation Weights

To modify the scoring weights, edit [server/services/evaluationService.js:12-17](server/services/evaluationService.js#L12-L17):

```javascript
this.weights = {
  marketCap: 0.35,      // 35%
  adtv: 0.35,          // 35%
  priceToSales: 0.15,  // 15%
  salesGrowth: 0.15    // 15%
};
```

## Mock Data Mode

By default, the application uses mock data for testing without API limits:
- Instant results
- No API key required
- Realistic random data
- Perfect for development and testing

Set `USE_MOCK_DATA=false` in `.env` to use real market data.

## API Rate Limits

**Financial Modeling Prep (Free Tier):**
- 250 API calls per day
- No per-minute limits
- Each stock evaluation uses 4 API calls
- Can evaluate ~60 stocks per day on free tier

**Recommendations:**
- Use mock data for development
- Use cached data when possible (automatic)
- Consider upgrading API plan for production use

## Caching Strategy

1. **In-Memory Cache**: 1-hour TTL for API responses
2. **SQLite Database**: Persistent storage of evaluated stocks
3. **Auto-Refresh**: Data older than 1 hour triggers refresh

## Troubleshooting

### "Failed to fetch stocks"
- Check your internet connection
- Verify API key in `.env` file
- Check if you've exceeded API rate limits
- Try using mock data mode

### Port already in use
- Change port in `.env` file
- Kill process using the port: `lsof -ti:5000 | xargs kill`

### Database errors
- Delete `data/stocks.db` and restart the server
- Check write permissions in the `data/` directory

## Future Enhancements

- [ ] Export to CSV/Excel
- [ ] Historical trend analysis
- [ ] Email alerts for ranking changes
- [ ] More API provider options
- [ ] Docker containerization
- [ ] Advanced charting and visualizations
- [ ] Custom scoring weights via UI
- [ ] Sector comparison tools

## License

MIT License - Feel free to use this project for any purpose.

## Credits

Evaluation methodology inspired by the NYFANG+ Index rebalancing process.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the API documentation
3. Ensure all dependencies are installed correctly

---

**Note**: This application is for educational and research purposes only. Not financial advice.
