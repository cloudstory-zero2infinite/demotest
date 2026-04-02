import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import { feedbackRouter } from "./routes/feedback.js";
import { programRouter } from "./routes/program.js";
import { controlsRouter } from "./routes/controls.js";
import { assetsRouter } from "./routes/assets.js";
import { policiesRouter } from "./routes/policies.js";
import { vulnerabilitiesRouter } from "./routes/vulnerabilities.js";
import { complianceRouter } from "./routes/compliance.js";
import { contactsRouter } from "./routes/contacts.js";
import { activityRouter } from "./routes/activity.js";
import { orgRouter } from "./routes/org.js";
import { capabilitiesRouter } from "./routes/capabilities.js";
import { controlRegistryRouter } from "./routes/control-registry.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration to allow frontend to send credentials
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

/* ---------------- API ROUTES ---------------- */

app.use("/api/feedback", feedbackRouter);
app.use("/api/program", programRouter);
app.use("/api/controls", controlsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/policies", policiesRouter);
app.use("/api/vulnerabilities", vulnerabilitiesRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/activity", activityRouter);
app.use("/api/org", orgRouter);
app.use("/api/capabilities", capabilitiesRouter);
app.use("/api/control-registry", controlRegistryRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ---------------- FRONTEND STATIC ---------------- */

const distPath = path.join(process.cwd(), "dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/* ---------------- SERVER START ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
