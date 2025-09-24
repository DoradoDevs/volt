// backend/src/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const morgan = require('morgan');

const app = express();

// ---- Core middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000']),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.set('trust proxy', 1);

// Simple request logger (path + method) to debug routing quickly
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---- Routes
const routes = require('./routes');
// Mount at ROOT so frontend can call /login, /signup, /verify directly
app.use('/', routes);

// Health check
app.get('/__health', (_req, res) => {
  res.json({ ok: true, mountedAt: 'root', port: process.env.PORT || 5000 });
});

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// Global error handler (optional)
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---- DB + Server start
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/volt';

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true });
    console.log('Mongo connected');
    app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
