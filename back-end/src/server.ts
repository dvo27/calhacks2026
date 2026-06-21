import express from 'express';
import { Queue } from 'bullmq';
import { URL } from 'node:url';
import { loadBackendEnv, getBackendEnv } from './config/env.js';
import { createHealthRouter } from './routes/health.js';
import { createCollectionsRouter } from './routes/collections.js';
import { createProfileRouter } from './routes/profile.js';
import { createSocialRouter } from './routes/social.js';
import { createTripsRouter } from './routes/trips.js';

loadBackendEnv();

const app = express();
const PORT = Number(getBackendEnv('PORT') ?? 5001);
const REDIS_URL = getBackendEnv('REDIS_URL') ?? 'redis://127.0.0.1:6379';

app.use(express.json({ limit: '15mb' })); // base64 image uploads ride in the JSON body
app.use((req, res, next) => { console.log(`→ ${req.method} ${req.path}`); next(); });

// 1. Initialize your BullMQ Queue to pass jobs off to your background worker
const redisUrl = new URL(REDIS_URL);

const itineraryQueue = new Queue('itinerary-processing', {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: 3, // producer should fail fast, not hang forever
  },
});

itineraryQueue.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

itineraryQueue.waitUntilReady()
  .then(() => console.log('🚀 Connected to Redis server successfully.'))
    .catch((err) => console.error('❌ Redis failed to become ready:', err.message));

app.use(createHealthRouter());
app.use('/api/trips', createTripsRouter({ itineraryQueue }));
app.use('/api/profile', createProfileRouter());
app.use('/api/collections', createCollectionsRouter());
app.use('/api', createSocialRouter());

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
