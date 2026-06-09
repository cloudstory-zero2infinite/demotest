import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { policyCorpusRouter } from './routes/policy-corpus.js';
import { ontologyRouter } from './routes/ontology.js';
import { complianceRouter } from './routes/compliance.js';
import { nnControlsRouter } from './routes/nn-controls.js';
import { controlFrameworkRouter } from './routes/control-framework.js';
import { platformAnalyticsRouter } from './routes/platform-analytics.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5175',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'internal-tool', timestamp: new Date().toISOString() });
});

app.use('/api/internal/policy-corpus', policyCorpusRouter);
app.use('/api/internal/ontology', ontologyRouter);
app.use('/api/internal/compliance', complianceRouter);
app.use('/api/internal/nn-controls', nnControlsRouter);
app.use('/api/internal/control-framework', controlFrameworkRouter);
app.use('/api/internal/platform-analytics', platformAnalyticsRouter);

// Serve the built frontend (production). In dev the Vite server handles this.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not built. Run `npm run build` first.');
  });
});

app.listen(PORT, () => {
  console.log(`[internal-tool] server listening on port ${PORT}`);
});
