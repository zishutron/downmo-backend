const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs-extra');
const downloadRoutes = require('./routes/download');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS - Allow all
// ============================================================
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

app.options('*', cors());

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// Logging
// ============================================================
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        console.log('📦 Body:', req.body);
    }
    next();
});

// ============================================================
// Routes
// ============================================================
app.use('/api/download', downloadRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        node: process.version
    });
});

// Root
app.get('/', (req, res) => {
    res.json({
        name: 'Downmo API',
        version: '3.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            info: '/api/download/info (POST)',
            download: '/api/download/download (POST)'
        }
    });
});

// ============================================================
// Error Handling
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Downmo Backend running on port ${PORT}`);
    console.log(`📍 Health: https://downmo-backend.onrender.com/api/health`);
});
