// Inkadu Backend - Minimal Express Server for Agentic Document Generation
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import agentDocumentsRouter from './routes/agentDocuments.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Enable SSE (Server-Sent Events) support
app.use((req, res, next) => {
  if (req.path.includes('/stream')) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'inkadu-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount agent documents routes
app.use('/api/agent-documents', agentDocumentsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  🚀 Inkadu Backend Server');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  🌐 Server:        http://localhost:${PORT}`);
  console.log(`  🏥 Health Check:  http://localhost:${PORT}/health`);
  console.log(`  📡 API Base:      http://localhost:${PORT}/api`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
