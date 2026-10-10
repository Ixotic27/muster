const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { randomUUID } = require('crypto');
const cookieParser = require('cookie-parser');
const { passport, configurePassport } = require('./config/passport');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');
const apiRoutes = require('./routes');

const app = express();

// Global Middlewares
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  const error = new Error('Origin is not allowed by CORS');
  error.statusCode = 403;
  return callback(error);
}, credentials: true }));
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(cookieParser());
app.use(passport.initialize());
configurePassport();
app.use((req, res, next) => { req.id = req.get('x-request-id') || randomUUID(); res.setHeader('x-request-id', req.id); next(); });
app.use(generalLimiter);
app.post('/api/v1/payments/gateway/webhook', express.raw({ type: 'application/json', limit: '256kb' }), require('./utils/helpers').asyncHandler(require('./controllers/gateway.controller').webhook));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Muster Backend API is healthy',
    timestamp: new Date().toISOString()
  });
});

// Root API Endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    name: 'Muster API',
    version: '1.0.0',
    documentation: '/docs/api'
  });
});

app.use('/api/v1', apiRoutes);

// Global 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot find ${req.originalUrl} on this server`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof require('multer').MulterError) {
    return res.status(400).json({ success: false, message: 'Invalid or oversized upload' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Malformed JSON body' });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Validation failed', details: Object.values(err.errors).map((item) => item.message) });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid ${err.path || 'identifier'}` });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ success: false, message: 'A record with these details already exists' });
  }
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message || 'Internal Server Error',
    ...(err.scanCode && { code: err.scanCode }),
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;
