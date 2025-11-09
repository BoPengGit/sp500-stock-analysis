const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const stockRoutes = require('./routes/stocks');
const { initializeDatabase } = require('./database/db');

dotenv.config();

// Debug: Log environment variables
console.log('Environment check:');
console.log('FMP_API_KEY:', process.env.FMP_API_KEY ? 'SET' : 'NOT SET');
console.log('USE_MOCK_DATA:', process.env.USE_MOCK_DATA);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Routes
app.use('/api/stocks', stockRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
