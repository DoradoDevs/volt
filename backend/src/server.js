// backend/src/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connect, close } = require('./db');
const routes = require('./routes');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // 1) Ensure DB is up before serving requests
    await connect();

    // 2) App + middleware
    const app = express();
    app.set('trust proxy', true); // Trust nginx proxy
    app.use(helmet());
    app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
    app.use(express.json({ limit: '1mb' }));
    app.use(morgan('dev'));

    // 3) Routes - all under /api prefix
    app.use('/api', routes);

    // Health check
    app.get('/api/health', (_req, res) => {
      res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
    });

    // 404
    app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.originalUrl }));

    // Error handler
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ error: 'Server error', detail: err.message });
    });

    // 4) Start server
    const server = app.listen(PORT, () => {
      console.log(`🚀 VolT backend listening on http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (sig) => {
      console.log(`\n${sig} received. Shutting down...`);
      server.close(async () => {
        try { await close(); } catch {}
        process.exit(0);
      });
      // force-exit if something hangs
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    console.error('Hint: ensure MongoDB is running and MONGO_URI is correct in .env');
    process.exit(1);
  }
})();
