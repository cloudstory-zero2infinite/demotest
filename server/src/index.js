// import express from "express";

// import cors from "cors";

// import dotenv from "dotenv";

// import path from "path";

// import cron from "node-cron";



// import { feedbackRouter } from "./routes/feedback.js";

// import { programRouter } from "./routes/program.js";

// import { controlsRouter } from "./routes/controls.js";

// import { assetsRouter } from "./routes/assets.js";

// import { policiesRouter } from "./routes/policies.js";

// import { vulnerabilitiesRouter } from "./routes/vulnerabilities.js";

// import { complianceRouter } from "./routes/compliance.js";

// import { contactsRouter } from "./routes/contacts.js";

// import { activityRouter } from "./routes/activity.js";

// import { orgRouter } from "./routes/org.js";

// import { capabilitiesRouter } from "./routes/capabilities.js";

// import { controlRegistryRouter } from "./routes/control-registry.js";

// import { orgSettingsRouter } from "./routes/org-settings.js";

// import { orgContactsRouter } from "./routes/org-contacts.js";

// import assetCustomFieldsRouter from "./routes/asset-custom-fields.js";

// import { customFieldsRouter } from "./routes/custom-fields.js";

// import { checkAllExpiredPolicies } from "./jobs/policy-expiry.js";



// dotenv.config();



// const app = express();

// const PORT = process.env.PORT || 3001;



// // CORS configuration to allow frontend to send credentials

// const corsOptions = {

//   origin: process.env.FRONTEND_URL || 'http://localhost:5173',

//   credentials: true,

//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

//   allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],

// };



// app.use(cors(corsOptions));

// app.use(express.json({ limit: '50mb' }));

// app.use(express.urlencoded({ limit: '50mb', extended: true }));



// /* ---------------- API ROUTES ---------------- */



// app.use("/api/feedback", feedbackRouter);

// app.use("/api/program", programRouter);

// app.use("/api/controls", controlsRouter);

// app.use("/api/assets", assetsRouter);

// app.use("/api/asset-custom-fields", assetCustomFieldsRouter);

// app.use("/api/custom-fields", customFieldsRouter);

// app.use("/api/policies", policiesRouter);

// app.use("/api/vulnerabilities", vulnerabilitiesRouter);

// app.use("/api/compliance", complianceRouter);

// app.use("/api/contacts", contactsRouter);

// app.use("/api/activity", activityRouter);

// app.use("/api/org", orgRouter);

// app.use("/api/capabilities", capabilitiesRouter);

// app.use("/api/control-registry", controlRegistryRouter);

// app.use("/api/org-settings", orgSettingsRouter);

// app.use("/api/org-contacts", orgContactsRouter);



// app.get("/api/health", (_req, res) => {

//   res.json({ status: "ok", timestamp: new Date().toISOString() });

// });



// /* ---------------- FRONTEND STATIC ---------------- */



// const distPath = path.join(process.cwd(), "dist");



// app.use(express.static(distPath));



// app.get("*", (req, res) => {

//   res.sendFile(path.join(distPath, "index.html"));

// });



// /* ---------------- SERVER START ---------------- */



// /* ---------------- SCHEDULED JOBS ---------------- */



// // Check for expired policies every 6 hours

// cron.schedule('0 */6 * * *', () => {

//   console.log('[cron] Running policy expiry check...');

//   checkAllExpiredPolicies();

// });



// app.listen(PORT, () => {

//   console.log(`Server running on port ${PORT}`);

// });



import express from "express";

import cors from "cors";

import dotenv from "dotenv";

import path from "path";

import cron from "node-cron";



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

import { orgSettingsRouter } from "./routes/org-settings.js";
import { emailTemplatesRouter } from "./routes/email-templates.js";

import { orgContactsRouter } from "./routes/org-contacts.js";

import assetCustomFieldsRouter from "./routes/asset-custom-fields.js";

import { customFieldsRouter } from "./routes/custom-fields.js";

import { assetTypesRouter } from "./routes/asset-types.js";

import { checkAllExpiredPolicies, sendExpiryReminders } from "./jobs/policy-expiry.js";
import { scoringRouter } from "./routes/scoring.js";
import { mapperRouter } from "./routes/mapper.js";
import { fwcrRouter } from "./routes/fwcr.js";
import { scfFrameworksRouter } from "./routes/scf-frameworks.js";
import { ddRouter } from "./routes/dd.js";
import { riskRouter } from "./routes/risk.js";
import { ztiHubRouter } from "./routes/zti-hub.js";
import { vulnScanRouter } from "./routes/vuln-scan.js";





dotenv.config();



const app = express();

const PORT = process.env.PORT || 3001;



// CORS configuration to allow frontend to send credentials

const corsOptions = {

  origin: process.env.FRONTEND_URL || 'http://localhost:5173',

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],

};



app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));

app.use(express.urlencoded({ limit: '50mb', extended: true }));



/* ---------------- API ROUTES ---------------- */



app.use("/api/feedback", feedbackRouter);

app.use("/api/program", programRouter);

app.use("/api/controls", controlsRouter);

app.use("/api/assets", assetsRouter);

app.use("/api/asset-custom-fields", assetCustomFieldsRouter);

app.use("/api/custom-fields", customFieldsRouter);

app.use("/api/asset-types", assetTypesRouter);

app.use("/api/policies", policiesRouter);

app.use("/api/vulnerabilities", vulnerabilitiesRouter);

app.use("/api/compliance", complianceRouter);
app.use("/api/compliance", scoringRouter);


app.use("/api/contacts", contactsRouter);

app.use("/api/activity", activityRouter);

app.use("/api/org", orgRouter);

app.use("/api/capabilities", capabilitiesRouter);

app.use("/api/control-registry", controlRegistryRouter);

app.use("/api/org-settings", orgSettingsRouter);
app.use("/api/email-templates", emailTemplatesRouter);

app.use("/api/org-contacts", orgContactsRouter);

app.use("/api/mapper", mapperRouter);

app.use("/api/fwcr", fwcrRouter);

app.use("/api/scf/frameworks", scfFrameworksRouter);

app.use("/api/dd", ddRouter);

app.use("/api/risk", riskRouter);

app.use("/api/zti-hub", ztiHubRouter);
app.use("/api/vuln-scan", vulnScanRouter);



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



/* ---------------- SCHEDULED JOBS ---------------- */



// Check for expired policies + send expiry reminders every 6 hours.
// Reminder sends are idempotent (reminder_*_sent_at flags), so the 6h cadence
// is safe — each of the 14d/7d/1d reminders goes out at most once per cycle.
cron.schedule('0 */6 * * *', () => {
  console.log('[cron] Running policy expiry check + reminders...');
  checkAllExpiredPolicies();
  sendExpiryReminders();
});






app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);

});

