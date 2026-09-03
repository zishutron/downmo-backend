const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs-extra');
const downloadRoutes = require('./routes/download');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS - FIXED (Allow all for now)
// ============================================================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// LOGGING MIDDLEWARE
// ============================================================
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    console.log('📦 Body:', req.body);
    next();
});

// ============================================================
// TEMP DIRECTORY
// ============================================================
const tempDir = path.join(__dirname, 'temp');
fs.ensureDirSync(tempDir);

// ============================================================
// ROUTES
// ============================================================
app.use('/api/download', downloadRoutes);

// ============================================================
// HEALTH CHECK - IMPROVED
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version,
        env: process.env.NODE_ENV || 'development'
    });
});

// ============================================================
// ROOT ROUTE
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'Downmo API',
        version: '3.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            info: '/api/download/info (POST)',
            download: '/api/download/download (POST)',
            platforms: '/api/download/platforms (GET)'
        }
    });
});

// ============================================================
// ERROR HANDLING
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.message);
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Downmo Backend running on port ${PORT}`);
    console.log(`📍 Health: https://downmo-backend.onrender.com/api/health`);
    console.log(`📍 CORS: Enabled for all origins`);
});
