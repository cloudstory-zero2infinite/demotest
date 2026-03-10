import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { feedbackRouter } from './routes/feedback.js';
import { programRouter } from './routes/program.js';
import { controlsRouter } from './routes/controls.js';
import { assetsRouter } from './routes/assets.js';
import { policiesRouter } from './routes/policies.js';
import { vulnerabilitiesRouter } from './routes/vulnerabilities.js';
import { complianceRouter } from './routes/compliance.js';
import { contactsRouter } from './routes/contacts.js';
import { activityRouter } from './routes/activity.js';
import { orgRouter } from './routes/org.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/feedback', feedbackRouter);
app.use('/api/program', programRouter);
app.use('/api/controls', controlsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/vulnerabilities', vulnerabilitiesRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/org', orgRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
