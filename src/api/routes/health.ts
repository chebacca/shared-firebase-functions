import express from 'express';

const router = express.Router();

// Health check endpoint - explicitly handle CORS for public access
router.options('/', (req: express.Request, res: express.Response) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173'
    ];

    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        res.set('Access-Control-Allow-Origin', '*');
    }

    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.get('/', (req: express.Request, res: express.Response) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4003',
        'http://localhost:4010',
        'http://localhost:5173'
    ];

    // Set CORS headers explicitly
    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        res.set('Access-Control-Allow-Origin', '*');
    }

    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: ['auth', 'projects', 'datasets', 'sessions', 'licensing', 'payments', 'database', 'system', 'ai', 'team', 'debug', 'timecard-approval']
    });
});

export default router;
