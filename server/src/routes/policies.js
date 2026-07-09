import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { marked } from 'marked';
marked.setOptions({ gfm: true, breaks: true });
import puppeteer from 'puppeteer';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import http from 'http';
import https from 'https';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { convertHtmlToMarkdown } from './policy-templates.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function fetchImageBase64(url) {
  if (!url) return '';
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve('');
        return;
      }
      const mimeType = res.headers['content-type'] || 'image/png';
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
      });
    }).on('error', (err) => {
      console.error('[fetchImageBase64] Error fetching image:', err);
      resolve('');
    });
  });
}

const router = Router();

// ── Utility: log to all_activity_log (fire-and-forget) ─────────────────────
function logActivity(payload) {
  supabaseAdmin.from('all_activity_log').insert(payload).then(() => {});
}

async function notifyAdmins(orgId, excludeUserId, notificationData) {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from('org_onboarding')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role', ['admin', 'tenant_admin'])
      .not('user_id', 'is', null);

    if (error) {
      console.error('[notifyAdmins] Error fetching admins:', error);
      return;
    }

    console.log(`[notifyAdmins] Found ${admins?.length || 0} admins in org ${orgId}`);

    if (admins && admins.length > 0) {
      const notifications = admins
        .filter(a => a.user_id !== excludeUserId)
        .map(a => ({
          ...notificationData,
          recipient_id: a.user_id,
          org_id: orgId,
        }));
      
      if (notifications.length > 0) {
        console.log(`[notifyAdmins] Inserting ${notifications.length} notifications`);
        console.log(`[notifyAdmins] Payload:`, JSON.stringify(notifications));
        const { error: insError } = await supabaseAdmin.from('policy_notifications').insert(notifications);
        if (insError) console.error('[notifyAdmins] Error inserting notifications:', insError);
      } else {
        console.log('[notifyAdmins] No recipients after filtering excluded user');
      }
    }
  } catch (err) {
    console.error('[notifyAdmins] Catch-all error:', err);
  }
}

// ── Utility: extract metadata from markdown ────────────────────────────────
function extractMetadata(markdown) {
  if (!markdown) return {};
  const lines = markdown.split('\n');
  let name = null, policy_ref = null, version = null, owner_name = null,
      document_type = null, refresh_date = null;

  for (const line of lines) {
    if (!name && line.startsWith('# ')) {
      name = line.replace(/^#\s+/, '').trim();
    }
    const docIdMatch = line.match(/\*\*Document\s*ID:\*\*\s*(.+)/i);
    if (docIdMatch) policy_ref = docIdMatch[1].trim();

    const versionMatch = line.match(/\*\*Version:\*\*\s*(.+)/i);
    if (versionMatch) version = versionMatch[1].trim();

    const docTypeMatch = line.match(/\*\*Document\s*Type:\*\*\s*(.+)/i);
    if (docTypeMatch) document_type = docTypeMatch[1].trim();

    const createdMatch = line.match(/\|\s*\*\*Created\*\*\s*\|\s*([^|]+)\s*\|/i);
    if (createdMatch) owner_name = createdMatch[1].trim();

    const reviewDateMatch = line.match(/next[_\s-]*review[_\s-]*date[:\s]+(\d{4}-\d{2}-\d{2})/i);
    if (reviewDateMatch) refresh_date = reviewDateMatch[1];

      // Support tables with horizontal/vertical headers: | Key | Value |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const key = parts[0].replace(/\*\*/g, '').toLowerCase();
        const val = parts[1].trim();
        if (key.includes('document id')) policy_ref = val;
        if (key.includes('owner')) owner_name = val;
        if (key.includes('document type')) document_type = val;
        if (key.includes('version')) version = val;
      }
      for (const part of parts) {
        const docIdTbl = part.match(/Document\s*ID:\s*(.+)/i);
        if (docIdTbl) policy_ref = docIdTbl[1].replace(/\*\*/g, '').trim();

        const ownerTbl = part.match(/Owner:\s*(.+)/i);
        if (ownerTbl) owner_name = ownerTbl[1].replace(/\*\*/g, '').trim();

        const typeTbl = part.match(/Document\s*Type:\s*(.+)/i);
        if (typeTbl) document_type = typeTbl[1].replace(/\*\*/g, '').trim();

        const verTbl = part.match(/Version:\s*(.+)/i);
        if (verTbl) version = verTbl[1].replace(/\*\*/g, '').trim();
      }
    }
  }

  // Sanity check: clean any lingering double asterisks from matches
  if (policy_ref) policy_ref = policy_ref.replace(/\*\*/g, '').trim();
  if (version) version = version.replace(/\*\*/g, '').trim();
  if (owner_name) owner_name = owner_name.replace(/\*\*/g, '').trim();
  if (document_type) document_type = document_type.replace(/\*\*/g, '').trim();

  return { name, policy_ref, version, owner_name, document_type, refresh_date };
}

// ── Utility: convert Markdown to DocLang JSON ──────────────────────────────
export function convertMarkdownToDocLang(markdown, policy) {
  if (!markdown) return null;
  const sections = parseMarkdownIntoSections(markdown);
  const metadata = {
    owner_name: policy?.owner_name || getDocumentMetadata(markdown, policy).match(/\*\*Owner:\*\*\s*(.+)/i)?.[1]?.trim() || '',
    refresh_date: policy?.refresh_date || null
  };
  
  const doclangSections = sections.map((s, index) => ({
    id: s.id || s.cleanTitle.replace(/\s+/g, '_').toLowerCase() || `section_${index}`,
    title: s.title,
    content: s.content
  }));

  return {
    document_type: policy?.document_type || 'policy',
    document_id: policy?.policy_id || 'IT-ISMS-POL-001',
    title: policy?.name || 'Policy Title',
    version: policy?.version || '1.0',
    status: policy?.policy_status || 'Draft',
    metadata: metadata,
    approval_matrix: getApprovalMatrix(markdown) ? [getApprovalMatrix(markdown)] : [],
    revision_history: getRevisionHistory(markdown) ? [getRevisionHistory(markdown)] : [],
    references: getStandardReferences(markdown) ? [getStandardReferences(markdown)] : [],
    applicability: getApplicability(markdown) ? [getApplicability(markdown)] : [],
    sections: doclangSections,
    tables: extractTables(markdown) || [],
    images: [],
    signatures: [],
    attachments: []
  };
}

// ── Utility: convert DocLang JSON to Markdown ──────────────────────────────
export function convertDocLangToMarkdown(dl) {
  if (!dl) return '';
  let md = `# ${dl.title || 'Untitled Policy'}\n\n`;
  
  if (dl.metadata) {
    md += `| Metadata | Value |\n| --- | --- |\n`;
    if (dl.document_id) md += `| **Document ID:** | ${dl.document_id} |\n`;
    if (dl.metadata.owner_name) md += `| **Owner:** | ${dl.metadata.owner_name} |\n`;
    if (dl.document_type) md += `| **Document Type:** | ${dl.document_type} |\n`;
    if (dl.version) md += `| **Version:** | ${dl.version} |\n`;
    if (dl.status) md += `| **Status:** | ${dl.status} |\n`;
    if (dl.metadata.refresh_date) md += `| **Next Review Date:** | ${dl.metadata.refresh_date} |\n`;
    md += `\n`;
  }
  
  if (dl.sections && Array.isArray(dl.sections)) {
    for (const sec of dl.sections) {
      md += `## ${sec.title}\n\n${sec.content}\n\n`;
    }
  }
  
  return md.trim();
}

// ── Utility: generate sequential human-readable policy ID ──────────────────
async function generatePolicyId(orgId) {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const orgPrefix = (org?.name || 'ORG')
    .slice(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  // Search GLOBALLY (not per-org) because policy_id is a global primary key.
  // Two orgs with the same 4-char prefix (e.g. Consultant1, Consultant2 → "CONS")
  // would collide if we only checked within the current org.
  const prefix = `IT-POL-${orgPrefix}-`;
  const { data: existing } = await supabaseAdmin
    .from('policy_documents')
    .select('policy_id')
    .like('policy_id', `${prefix}%`)
    .order('policy_id', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (existing && existing.length > 0) {
    const lastId = existing[0].policy_id;
    const lastSeqStr = lastId.replace(prefix, '');
    const lastSeq = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

// ── Utility: check and expire policies for an org ─────────────────────────
async function checkAndExpirePolicies(orgId) {
  const now = new Date().toISOString().split('T')[0];
  const { data: expired } = await supabaseAdmin
    .select('policy_id, name, user_id, policy_status')
    .eq('org_id', orgId)
    .in('policy_status', ['approved', 'reviewed'])
    .lt('refresh_date', now);

  if (!expired || expired.length === 0) return;

  for (const policy of expired) {
    const { count } = await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'to_review', updated_at: new Date().toISOString() })
      .eq('policy_id', policy.policy_id)
      .in('policy_status', ['approved', 'reviewed']); // idempotency guard

    // Only log & notify if the row was actually transitioned
    if (count === 0) continue;

    logActivity({
      action: 'policy_expired',
      module: 'Policy',
      entity_id: policy.policy_id,
      entity_name: policy.name,
      user_id: null,
      org_id: orgId,
      severity: 'warning',
      event_data: {
        message: `Policy "${policy.name}" has expired and moved to In Review`,
        from_status: policy.policy_status,
        to_status: 'to_review',
        user_email: 'System',
      },
    });

    if (policy.user_id) {
      supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policy.policy_id,
        policy_name: policy.name,
        type: 'policy_expired',
        message: `Policy "${policy.name}" has expired and requires review`,
        org_id: orgId,
      }).then(() => {});
    }
  }
}

// ── GET /  ─ list all policies ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    // Fire-and-forget expiry check on every list fetch
    checkAndExpirePolicies(req.orgId).catch(() => {});

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id,name,policy_ref,policy_status,refresh_date,version,document_type,owner_name,is_master,org_id,user_id,created_at,updated_at,markdown,doc_lang')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    
        const enriched = (data || []).map(policy => {
      if (!policy.doc_lang && policy.markdown) {
        const parsedDocLang = convertMarkdownToDocLang(policy.markdown, policy);
        if (parsedDocLang) {
          policy.doc_lang = parsedDocLang;
          supabaseAdmin.from('policy_documents').update({ doc_lang: parsedDocLang }).eq('policy_id', policy.policy_id).then(() => {});
        }
      }
      return policy;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /notifications  ─ MUST be before /:id ─────────────────────────────
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    console.log(`[DEBUG] GET /notifications for user: ${req.userId}, org: ${req.orgId}`);
    const { data, error } = await supabaseAdmin
      .from('policy_notifications')
      .select('*')
      .eq('recipient_id', req.userId)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[DEBUG] Error fetching notifications:', error);
      throw error;
    }
    
    console.log(`[DEBUG] Found ${data?.length || 0} notifications for user ${req.userId}`);
    if (data && data.length > 0) {
      console.log(`[DEBUG] Notifications content:`, JSON.stringify(data.slice(0, 5)));
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Debug endpoint to see ALL notifications for the org
router.get('/notifications-all-debug', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_notifications')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/:notifId/read ──────────────────────────────────────
router.put('/notifications/:notifId/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('policy_notifications')
      .update({ read: true })
      .eq('id', req.params.notifId)
      .eq('recipient_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /master  ─ return the org's master policy (if any) ────────────────
// Used by the Mapper Agent run modal to detect "no master set" state.
// MUST be declared before /:id so Express doesn't route "master" as an id.
router.get('/master', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id,name,policy_ref,policy_status,owner_name,document_type,is_master,updated_at')
      .eq('org_id', req.orgId)
      .eq('is_master', true)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /:id/master  ─ mark a policy as the org's master ────────────────
// Atomically clears any existing master before setting the new one so the
// partial-unique-index constraint (one master per org) never gets violated.
router.patch('/:id/master', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found for user.' });
    }
    const setMaster = req.body && typeof req.body.is_master === 'boolean'
      ? req.body.is_master
      : true;

    if (setMaster) {
      const { error: clearErr } = await supabaseAdmin
        .from('policy_documents')
        .update({ is_master: false })
        .eq('org_id', req.orgId)
        .eq('is_master', true)
        .neq('policy_id', req.params.id);
      if (clearErr) throw clearErr;
    }

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .update({ is_master: setMaster })
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .select('policy_id,name,is_master')
      .single();
    if (error) throw error;

    logActivity({
      action: setMaster ? 'policy_master_set' : 'policy_master_cleared',
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: data?.name || null,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: { actor_name: req.user?.email || req.userId },
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/history  ─ reads from all_activity_log ───────────────────────
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('all_activity_log')
      .select('*')
      .eq('module', 'Policy')
      .eq('entity_id', req.params.id)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /:id/approval  ─ pending approval record ──────────────────────────
router.get('/:id/approval', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_approvals')
      .select('*')
      .eq('policy_id', req.params.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Markdown Parsing Helpers for Policy Documents ──────────────────────────

function parseMarkdownIntoSections(markdown) {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let currentSection = {
    level: 0,
    title: 'Root',
    cleanTitle: 'root',
    number: null,
    lines: []
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (currentSection.level > 0 || currentSection.lines.length > 0) {
        sections.push({
          level: currentSection.level,
          title: currentSection.title,
          cleanTitle: currentSection.cleanTitle,
          number: currentSection.number,
          content: currentSection.lines.join('\n').trim()
        });
      }
      
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      
      const numMatch = title.match(/^(\d+)[\s._.-]*(.*)$/);
      let number = null;
      let cleanTitle = title.toLowerCase();
      if (numMatch) {
        number = parseInt(numMatch[1], 10);
        cleanTitle = numMatch[2].toLowerCase();
      }
      
      currentSection = {
        level,
        title,
        cleanTitle,
        number,
        lines: []
      };
    } else {
      currentSection.lines.push(line);
    }
  }

  if (currentSection.level > 0 || currentSection.lines.length > 0) {
    sections.push({
      level: currentSection.level,
      title: currentSection.title,
      cleanTitle: currentSection.cleanTitle,
      number: currentSection.number,
      content: currentSection.lines.join('\n').trim()
    });
  }

  return sections;
}

function stripStandardTemplateElements(markdown) {
  if (!markdown) return '';
  let lines = markdown.split(/\r?\n/);
  let cleanedLines = [];
  let inTable = false;
  let skippedTitle = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!skippedTitle && trimmed.startsWith('# ')) {
      skippedTitle = true;
      continue;
    }
    
    // Detect table block start/end
    const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');
    
    if (isTableLine) {
      if (!inTable) {
        // We are entering a table. Let's look ahead to see what table this is.
        let tableLines = [];
        let j = i;
        while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
          tableLines.push(lines[j].trim());
          j++;
        }
        const tableContent = tableLines.join('\n').toLowerCase();
        const isMetadata = tableContent.includes('metadata') || tableContent.includes('document info') || tableContent.includes('document id:') || tableContent.includes('owner:');
        const isApproval = tableContent.includes('role') && (tableContent.includes('name') || tableContent.includes('function') || tableContent.includes('approved') || tableContent.includes('created') || tableContent.includes('status:'));
        const isHistory = tableContent.includes('version') && (tableContent.includes('revision') || tableContent.includes('changes') || tableContent.includes('description') || tableContent.includes('date'));
        const isRef = tableContent.includes('clause') || tableContent.includes('reference') || tableContent.includes('standard') || tableContent.includes('control');
        
        if (isMetadata || isApproval || isHistory || isRef) {
          // Skip this entire table block
          i = j - 1;
          continue;
        } else {
          inTable = true;
        }
      }
    } else {
      inTable = false;
    }
    
    const lowerTrimmed = trimmed.toLowerCase();
    
    if (
      lowerTrimmed.startsWith('**document id:**') ||
      lowerTrimmed.startsWith('**owner:**') ||
      lowerTrimmed.startsWith('**document type:**') ||
      lowerTrimmed.startsWith('**integrity hash:**') ||
      lowerTrimmed.startsWith('**version:**') ||
      lowerTrimmed.startsWith('**title:**') ||
      lowerTrimmed.startsWith('**status:**') ||
      lowerTrimmed.startsWith('applicability:') ||
      lowerTrimmed.startsWith('**applicability:**') ||
      lowerTrimmed.startsWith('integrity hash:') ||
      lowerTrimmed.startsWith('**integrity hash:**') ||
      lowerTrimmed === 'revision history' ||
      lowerTrimmed === '## revision history' ||
      lowerTrimmed === '### revision history' ||
      lowerTrimmed === 'standard reference' ||
      lowerTrimmed === '## standard reference' ||
      lowerTrimmed === '### standard reference' ||
      lowerTrimmed === 'standard reference:' ||
      lowerTrimmed === '## standard reference:' ||
      lowerTrimmed === '### standard reference:' ||
      lowerTrimmed === 'applicability' ||
      lowerTrimmed === '## applicability' ||
      lowerTrimmed === '### applicability'
    ) {
      continue;
    }
    
    if (trimmed.startsWith('●') && (lowerTrimmed.includes('standard reference') || lowerTrimmed.includes('applicability'))) {
      continue;
    }
    
    cleanedLines.push(line);
  }
  
  return cleanedLines.join('\n').trim();
}

function extractSectionContent(sections, keywords, number) {
  if (number !== undefined && number !== null) {
    const match = sections.find(s => s.number === number && keywords.every(kw => s.cleanTitle.includes(kw)));
    if (match) return match.content;
  }
  const match = sections.find(s => keywords.every(kw => s.cleanTitle.includes(kw)));
  if (match) return match.content;
  
  if (number !== undefined && number !== null) {
    const match = sections.find(s => s.number === number);
    if (match) return match.content;
  }

  return '';
}

function extractTables(markdown) {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let currentTable = null;

  for (const line of lines) {
    const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|');
    if (isTableLine) {
      if (!currentTable) {
        currentTable = [];
      }
      currentTable.push(line.trim());
    } else {
      if (currentTable) {
        tables.push(currentTable.join('\n'));
        currentTable = null;
      }
    }
  }
  if (currentTable) {
    tables.push(currentTable.join('\n'));
  }
  return tables;
}

function getApprovalMatrix(markdown) {
  const tables = extractTables(markdown);
  for (const table of tables) {
    const headerLine = table.split('\n')[0].toLowerCase();
    if (headerLine.includes('role') && (headerLine.includes('name') || headerLine.includes('function') || headerLine.includes('approved') || headerLine.includes('created'))) {
      return table;
    }
  }
  return '';
}

function getRevisionHistory(markdown) {
  const tables = extractTables(markdown);
  for (const table of tables) {
    const headerLine = table.split('\n')[0].toLowerCase();
    if (headerLine.includes('version') && (headerLine.includes('revision') || headerLine.includes('changes') || headerLine.includes('description'))) {
      return table;
    }
  }
  return '';
}

function getStandardReferences(markdown) {
  const tables = extractTables(markdown);
  for (const table of tables) {
    const headerLine = table.split('\n')[0].toLowerCase();
    if (headerLine.includes('clause') || headerLine.includes('reference') || headerLine.includes('standard') || headerLine.includes('control')) {
      return table;
    }
  }
  return '';
}

function getApplicability(markdown) {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    if (line.toLowerCase().includes('applicability:')) {
      return line.replace(/^\*\*applicability:\*\*\s*/i, '').trim();
    }
  }
  return '';
}

function getDocumentMetadata(markdown, policy) {
  const tables = extractTables(markdown);
  for (const table of tables) {
    const headerLine = table.split('\n')[0].toLowerCase();
    if (headerLine.includes('metadata') || headerLine.includes('document info')) {
      return table;
    }
  }

  const lines = markdown.split(/\r?\n/);
  const metadataLines = [];
  for (const line of lines) {
    if (line.trim().startsWith('#') || line.trim().startsWith('##')) {
      break;
    }
    if (line.includes('**') && line.includes(':')) {
      metadataLines.push(line.trim());
    }
  }

  if (metadataLines.length > 0) {
    return metadataLines.join('\n');
  }

  return `**Document ID:** ${policy.policy_id || 'N/A'}\n` +
         `**Title:** ${policy.name || 'N/A'}\n` +
         `**Version:** ${policy.version || 'V1.0'}\n` +
         `**Status:** ${policy.policy_status || 'Draft'}\n` +
         `**Owner:** ${policy.owner_name || 'N/A'}`;
}

function generateTOC(markdown) {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const tocLines = [];
  let headingCount = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      headingCount++;
      const level = match[1].length;
      const text = match[2].trim();
      if (level === 1 && headingCount === 1) {
        continue;
      }
      const indent = '  '.repeat(level - 1);
      tocLines.push(`${indent}* ${text}`);
    }
  }
  return tocLines.join('\n');
}

// GET /api/policies/:id/download — generate final PDF or DOCX using the selected template
router.get('/:id/download', requireAuth, async (req, res) => {
  const policyId = req.params.id;
  const { format = 'pdf', templateId } = req.query;

  try {
    // 1. Fetch policy document
    const { data: policy, error: policyErr } = await supabaseAdmin
      .from('policy_documents')
      .select('*')
      .eq('policy_id', policyId)
      .eq('org_id', req.orgId)
      .single();

    if (policyErr || !policy) {
      return res.status(404).json({ message: 'Policy not found.' });
    }

    // 2. Fetch organization and settings
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', req.orgId)
      .single();

    if (orgErr || !org) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('org_settings')
      .select('*')
      .eq('org_id', req.orgId)
      .maybeSingle();

    // 3. Fetch template
    const isAdmin = ['admin', 'tenant_admin', 'cxo'].includes(req.userRole);
    let selectedTemplateId;
    if (isAdmin) {
      selectedTemplateId = templateId || settings?.selected_template_id;
    } else {
      selectedTemplateId = settings?.selected_template_id;
    }
    let template = null;
    let standardTemplate = null;

    if (selectedTemplateId && selectedTemplateId !== 'standard') {
      const { data: tData } = await supabaseAdmin
        .from('policy_templates')
        .select('*')
        .eq('id', selectedTemplateId)
        .eq('org_id', req.orgId)
        .maybeSingle();
      template = tData;
      
      if (template && template.name === 'Standard Template') {
        template = null;
        selectedTemplateId = 'standard';
      }
    }

    if (selectedTemplateId === 'standard') {
      const { data: stdTempData } = await supabaseAdmin
        .from('policy_templates')
        .select('*')
        .eq('org_id', req.orgId)
        .eq('name', 'Standard Template')
        .maybeSingle();
      standardTemplate = stdTempData;
    }

    // 4. Compile placeholders
    const logoUrl = settings?.logo_url || '';
    const signatureUrl = settings?.signature_url || '';

    const includeLogo = selectedTemplateId === 'standard'
      ? !!(standardTemplate?.placeholders?.include_logo)
      : true;

    const includeSignature = selectedTemplateId === 'standard'
      ? (standardTemplate?.placeholders?.include_signature !== false)
      : true;

    // Convert logoUrl to base64 for reliable rendering in Puppeteer context
    let logoBase64 = '';
    if (logoUrl && includeLogo) {
      logoBase64 = await fetchImageBase64(logoUrl);
    }

    const logoHtml = logoBase64 
      ? `<img src="${logoBase64}" alt="Company Logo" class="policy-logo" style="max-height: 60px; max-width: 200px; object-fit: contain;" />` 
      : '';

    const signatureHtml = includeSignature
      ? (signatureUrl
        ? `<div class="signature-block" style="margin-top: 30px; page-break-inside: avoid;">
             <p style="margin-bottom: 5px; font-weight: 600;">Authorized Signature:</p>
             <img src="${signatureUrl}" alt="Signature" style="max-height: 60px; max-width: 150px; object-fit: contain; margin-bottom: 5px;" />
             <div style="border-top: 1px solid #ccc; width: 200px; margin-top: 2px;"></div>
             <p style="font-size: 11px; color: #666; margin: 2px 0;">Signed on behalf of: ${org.name}</p>
             <p style="font-size: 11px; color: #666; margin: 2px 0;">Date: ${new Date().toLocaleDateString()}</p>
           </div>`
        : `<div class="signature-block" style="margin-top: 30px; page-break-inside: avoid;">
             <p style="margin-bottom: 40px; font-weight: 600;">Authorized Signature:</p>
             <div style="border-top: 1px solid #ccc; width: 200px; margin-top: 2px;"></div>
             <p style="font-size: 11px; color: #666; margin: 2px 0;">Signed on behalf of: ${org.name}</p>
             <p style="font-size: 11px; color: #666; margin: 2px 0;">Date: ________________________</p>
           </div>`)
      : '';

    // Fetch review and approval details from activity logs & onboarding roles
    let createdName = policy.owner_name || 'N/A';
    let createdRole = 'Author';
    let createdDate = policy.created_at ? new Date(policy.created_at).toLocaleDateString() : 'N/A';

    let reviewedName = 'N/A';
    let reviewedRole = 'Reviewer';
    let reviewedDate = 'N/A';

    let approvedName = 'N/A';
    let approvedRole = 'Approver';
    let approvedDate = 'N/A';

    const formatRole = (role) => {
      if (!role) return '';
      if (role === 'cxo') return 'CXO';
      if (role === 'admin' || role === 'tenant_admin') return 'Administrator';
      return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    try {
      if (policy.user_id) {
        const { data: creatorOnboarding } = await supabaseAdmin
          .from('org_onboarding')
          .select('role, email')
          .eq('user_id', policy.user_id)
          .eq('org_id', req.orgId)
          .maybeSingle();
        
        if (creatorOnboarding) {
          if (creatorOnboarding.role) {
            createdRole = formatRole(creatorOnboarding.role);
          }
          if (creatorOnboarding.email) {
            createdName = creatorOnboarding.email;
          }
        }
      }

      const { data: creationLogs } = await supabaseAdmin
        .from('all_activity_log')
        .select('*')
        .eq('module', 'Policy')
        .eq('entity_id', policyId)
        .eq('org_id', req.orgId)
        .eq('action', 'policy_created')
        .limit(1);

      if (creationLogs && creationLogs.length > 0) {
        const cLog = creationLogs[0];
        createdName = cLog.event_data?.actor_name || cLog.event_data?.user_email || cLog.email || createdName;
      }

      const { data: reviewLogs } = await supabaseAdmin
        .from('all_activity_log')
        .select('*')
        .eq('module', 'Policy')
        .eq('entity_id', policyId)
        .eq('org_id', req.orgId)
        .eq('action', 'policy_reviewed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (reviewLogs && reviewLogs.length > 0) {
        const rLog = reviewLogs[0];
        reviewedName = rLog.event_data?.actor_name || rLog.event_data?.user_email || 'N/A';
        reviewedDate = new Date(rLog.created_at).toLocaleDateString();
        
        if (rLog.user_id) {
          const { data: revOnb } = await supabaseAdmin
            .from('org_onboarding')
            .select('role')
            .eq('user_id', rLog.user_id)
            .eq('org_id', req.orgId)
            .maybeSingle();
          if (revOnb?.role) {
            reviewedRole = formatRole(revOnb.role);
          }
        }
      }

      const { data: approvalLogs } = await supabaseAdmin
        .from('all_activity_log')
        .select('*')
        .eq('module', 'Policy')
        .eq('entity_id', policyId)
        .eq('org_id', req.orgId)
        .eq('action', 'policy_approved')
        .order('created_at', { ascending: false })
        .limit(1);

      if (approvalLogs && approvalLogs.length > 0) {
        const aLog = approvalLogs[0];
        approvedName = aLog.event_data?.actor_name || aLog.event_data?.user_email || 'N/A';
        approvedDate = new Date(aLog.created_at).toLocaleDateString();
        
        if (aLog.user_id) {
          const { data: appOnb } = await supabaseAdmin
            .from('org_onboarding')
            .select('role')
            .eq('user_id', aLog.user_id)
            .eq('org_id', req.orgId)
            .maybeSingle();
          if (appOnb?.role) {
            approvedRole = formatRole(appOnb.role);
          }
        }
      }
    } catch (logErr) {
      console.error('[download] Failed to fetch sign-off details:', logErr.message);
    }

    // Extract review date and format it
    const reviewDate = policy.refresh_date ? new Date(policy.refresh_date).toLocaleDateString() : 'N/A';
    const publishedDate = policy.published_date ? new Date(policy.published_date).toLocaleDateString() : new Date().toLocaleDateString();

    // Parse metadata live from markdown as fallbacks
    const liveMeta = extractMetadata(policy.markdown || '');
    const currentOwner = (createdName && createdName !== 'N/A') ? createdName : (liveMeta.owner_name || policy.owner_name || 'N/A');
    const currentPolicyRef = liveMeta.policy_ref || policy.policy_id;
    const currentVersion = liveMeta.version || policy.version || 'V1.0';
    const currentDocumentType = liveMeta.document_type || policy.document_type || 'Policy';

    // Create base metadata values map for pre-replacement in policy content
    const metadataValues = {
      company_name: org.name,
      organization_name: org.name,
      company_location: org.location || '',
      company_website: org.website || '',
      policy_title: policy.name,
      policy_id: currentPolicyRef,
      document_id: currentPolicyRef,
      policy_ref: currentPolicyRef,
      policy_version: currentVersion,
      version: currentVersion,
      policy_status: policy.policy_status || 'draft',
      status: policy.policy_status || 'draft',
      policy_owner: currentOwner,
      owner_name: currentOwner,
      policy_refresh_date: reviewDate,
      policy_published_date: publishedDate,
      created_name: createdName,
      created_role: createdRole,
      created_date: createdDate,
      reviewed_name: reviewedName,
      reviewed_role: reviewedRole,
      reviewed_date: reviewedDate,
      approved_name: approvedName,
      approved_role: approvedRole,
      approved_date: approvedDate,
      document_type: policy.document_type || 'Policy',
      role: createdRole, // Fallback for single generic role placeholder
      created_at: createdDate,
      next_review_date: reviewDate,
      published_date: publishedDate,
      updated_at: new Date(policy.updated_at).toLocaleDateString(),
      description: policy.description || 'Initial Release',
      org_name: org.name,
      integrity_hash: `${policy.policy_id}.hash`,
      approver_name: approvedName, // Fallback for single generic approver name placeholder
    };

    // Pre-replace organization and policy metadata placeholders inside the policy markdown content
        let policyMarkdown = replacePlaceholders(policy.markdown || '', metadataValues);

    // Resolve DocLang image references for private files in PDF export
    if (policy.doc_lang?.images && Array.isArray(policy.doc_lang.images)) {
      const signedUrlsMap = {};
      for (const img of policy.doc_lang.images) {
        if (img.file_path) {
          try {
            const { data } = await supabaseAdmin.storage
              .from('policy-images')
              .createSignedUrl(img.file_path, 3600);
            if (data?.signedUrl) {
              signedUrlsMap[img.name] = data.signedUrl;
              const nameWithoutExt = img.name.replace(/\.[^/.]+$/, "");
              signedUrlsMap[nameWithoutExt] = data.signedUrl;
            }
          } catch (err) {
            console.error('[PDF Export] Failed to sign image URL:', err);
          }
        }
      }

      // Replace [Image: Name]
      const imageRegex = /\[Image:\s*(.+?)\]/g;
      policyMarkdown = policyMarkdown.replace(imageRegex, (match, name) => {
        const signedUrl = signedUrlsMap[name.trim()];
        if (signedUrl) {
          return `<img src="${signedUrl}" alt="${name}" style="margin: 15px 0; max-height: 400px; max-width: 100%; display: block; border-radius: 4px;" />`;
        }
        return match;
      });

      // Replace standard markdown image tags ![Alt](images/filename.png)
      const markdownImageRegex = /!\[(.*?)\]\((.*?)\)/g;
      policyMarkdown = policyMarkdown.replace(markdownImageRegex, (match, alt, url) => {
        const filename = url.split('/').pop() || '';
        const signedUrl = signedUrlsMap[filename.trim()];
        if (signedUrl) {
          return `<img src="${signedUrl}" alt="${alt || filename}" style="margin: 15px 0; max-height: 400px; max-width: 100%; display: block; border-radius: 4px;" />`;
        }
        return match;
      });
    }

    const cleanPolicyMarkdown = selectedTemplateId === 'standard'
      ? stripStandardTemplateElements(policyMarkdown)
      : policyMarkdown;

    // Compile markdown policy content to HTML using the pre-replaced markdown
    const policyContentHtml = marked.parse(cleanPolicyMarkdown || '# ' + policy.name + '\n\nNo content.');

    // Custom template variables (user defined)
    const customVars = template?.placeholders || {};

    // ── Parse Policy Markdown into Sections & Tables ─────────────────────────
    const sections = parseMarkdownIntoSections(policyMarkdown);

    const docMetadataMd = getDocumentMetadata(policyMarkdown, policy);
    const appMatrixMd = getApprovalMatrix(policyMarkdown);
    const revHistoryMd = getRevisionHistory(policyMarkdown);
    const stdRefMd = getStandardReferences(policyMarkdown);
    let applicabilityMd = getApplicability(policyMarkdown);
    if (applicabilityMd) {
      applicabilityMd = applicabilityMd
        .replace(/Simplify3X Software Pvt\. Ltd\./gi, org.name)
        .replace(/Simplify3X/gi, org.name);
    } else {
      applicabilityMd = `This document is applicable to ${org.name} and all associated Business Units, Third parties, Employees and all stakeholders of ${org.name}.`;
    }
    const tocMd = generateTOC(policyMarkdown);

    // Extract content for numbered sections 1 to 9
    const purposeMd = extractSectionContent(sections, ['purpose'], 1);
    const scopeMd = extractSectionContent(sections, ['scope'], 2);
    const termsMd = extractSectionContent(sections, ['term', 'definition'], 3);
    const assessMd = extractSectionContent(sections, ['assessment', 'model'], 4);
    const buWeightMd = extractSectionContent(sections, ['business', 'unit', 'weightage'], 5);
    const scoreCalcMd = extractSectionContent(sections, ['final', 'score', 'calculation'], 6);
    const scoreInterpMd = extractSectionContent(sections, ['score', 'interpretation'], 7);
    const governanceMd = extractSectionContent(sections, ['governance', 'review'], 8);
    const auditJustMd = extractSectionContent(sections, ['audit', 'justification'], 9);

    // Helper to format html values
    const parseToHtml = (md) => md ? marked.parse(md) : '';

    // Values for DOCX (mail-merge: clean text/markdown)
    const placeholderValues = {
      company_name: org.name,
      organization_name: org.name,
      company_location: org.location || '',
      company_website: org.website || '',
      policy_title: policy.name,
      policy_id: currentPolicyRef,
      document_id: currentPolicyRef,
      policy_ref: currentPolicyRef,
      policy_version: currentVersion,
      version: currentVersion,
      policy_status: policy.policy_status || 'draft',
      status: policy.policy_status || 'draft',
      policy_owner: currentOwner,
      owner_name: currentOwner,
      policy_refresh_date: reviewDate,
      policy_published_date: publishedDate,
      company_logo: logoUrl || 'Logo Placeholder',
      header_content: template?.header_text || '',
      footer_content: template?.footer_text || '',
      signature_block: signatureUrl || 'Signature Placeholder',
      policy_content: policyMarkdown,
      
      created_name: createdName,
      created_role: createdRole,
      created_date: createdDate,
      reviewed_name: reviewedName,
      reviewed_role: reviewedRole,
      reviewed_date: reviewedDate,
      approved_name: approvedName,
      approved_role: approvedRole,
      approved_date: approvedDate,

      document_type: policy.document_type || 'Policy',
      role: createdRole, // Fallback for single generic role placeholder
      created_at: createdDate,
      next_review_date: reviewDate,
      published_date: publishedDate,
      updated_at: new Date(policy.updated_at).toLocaleDateString(),
      description: policy.description || 'Initial Release',
      org_name: org.name,
      integrity_hash: `${policy.policy_id}.hash`,
      approver_name: approvedName, // Fallback for single generic approver name placeholder

      document_metadata: docMetadataMd,
      approval_matrix: appMatrixMd,
      revision_history: revHistoryMd,
      standard_references: stdRefMd,
      applicability: applicabilityMd,
      table_of_contents: tocMd,

      '1._purpose': purposeMd,
      '2._scope': scopeMd,
      '3._terms_and_definitions': termsMd,
      '4._assessment_model': assessMd,
      '5._business_unit_weightage': buWeightMd,
      '6._final_score_calculation': scoreCalcMd,
      '7._score_interpretation': scoreInterpMd,
      '8._governance_and_review': governanceMd,
      '9._audit_justification_statement': auditJustMd,

      digital_signature_block: includeSignature
        ? (signatureUrl
          ? `Authorized Signature:\nSigned on behalf of: ${org.name}\nDate: ${new Date().toLocaleDateString()}\nSignature Image URL: ${signatureUrl}`
          : `Authorized Signature:\nSigned on behalf of: ${org.name}\nDate: ________________________`)
        : '',
      ...customVars
    };

    // Values for PDF (HTML template: fully parsed HTML tags)
    const htmlValues = {
      company_name: org.name,
      organization_name: org.name,
      company_location: org.location || '',
      company_website: org.website || '',
      policy_title: policy.name,
      policy_id: currentPolicyRef,
      document_id: currentPolicyRef,
      policy_ref: currentPolicyRef,
      policy_version: currentVersion,
      version: currentVersion,
      policy_status: policy.policy_status || 'draft',
      status: policy.policy_status || 'draft',
      policy_owner: currentOwner,
      owner_name: currentOwner,
      policy_refresh_date: reviewDate,
      policy_published_date: publishedDate,
      company_logo: logoHtml,
      header_content: template?.header_text || '',
      footer_content: template?.footer_text || '',
      signature_block: signatureHtml,
      policy_content: policyContentHtml,

      created_name: createdName,
      created_role: createdRole,
      created_date: createdDate,
      reviewed_name: reviewedName,
      reviewed_role: reviewedRole,
      reviewed_date: reviewedDate,
      approved_name: approvedName,
      approved_role: approvedRole,
      approved_date: approvedDate,

      document_type: policy.document_type || 'Policy',
      role: createdRole, // Fallback for single generic role placeholder
      created_at: createdDate,
      next_review_date: reviewDate,
      published_date: publishedDate,
      updated_at: new Date(policy.updated_at).toLocaleDateString(),
      description: policy.description || 'Initial Release',
      org_name: org.name,
      integrity_hash: `${policy.policy_id}.hash`,
      approver_name: approvedName, // Fallback for single generic approver name placeholder

      document_metadata: parseToHtml(docMetadataMd),
      approval_matrix: parseToHtml(appMatrixMd),
      revision_history: parseToHtml(revHistoryMd),
      standard_references: parseToHtml(stdRefMd),
      applicability: parseToHtml(applicabilityMd),
      table_of_contents: parseToHtml(tocMd),

      '1._purpose': parseToHtml(purposeMd),
      '2._scope': parseToHtml(scopeMd),
      '3._terms_and_definitions': parseToHtml(termsMd),
      '4._assessment_model': parseToHtml(assessMd),
      '5._business_unit_weightage': parseToHtml(buWeightMd),
      '6._final_score_calculation': parseToHtml(scoreCalcMd),
      '7._score_interpretation': parseToHtml(scoreInterpMd),
      '8._governance_and_review': parseToHtml(governanceMd),
      '9._audit_justification_statement': parseToHtml(auditJustMd),
      
      digital_signature_block: signatureHtml,
      ...customVars
    };

    // If format is DOCX
    if (format.toLowerCase() === 'docx') {
      if (template && template.file_path) {
        // A DOCX template was uploaded! Download it and do mail-merge.
        const storagePrefix = '/Template-docs/';
        const idx = template.file_path.indexOf(storagePrefix);
        if (idx === -1) {
          throw new Error('Invalid template file path format.');
        }
        const storagePath = template.file_path.substring(idx + storagePrefix.length);

        // Download from Supabase
        const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
          .from('Template-docs')
          .download(storagePath);

        if (downloadErr) throw downloadErr;

        // Load into Pizzip & Docxtemplater
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const zip = new PizZip(buffer);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        // Run render
        doc.render(placeholderValues);
        const outBuffer = doc.getZip().generate({ type: 'nodebuffer' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${policy.policy_id}.docx"`);
        return res.send(outBuffer);
      } else {
        // Fallback: Generate a clean DOCX programmatically using existing `docx` library
        const docxLib = await import('docx');
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } = docxLib;

        const docChildren = [];
        const isStandard = selectedTemplateId === 'standard';

        if (isStandard) {
          // Title
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: policy.name, bold: true, size: 36, color: "1e3a8a" })
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 }
          }));

          // Metadata Table
          docChildren.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Document ID: ", bold: true }), new TextRun(policy.policy_id)] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Owner: ", bold: true }), new TextRun(policy.owner_name || "N/A")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Document Type: ", bold: true }), new TextRun(policy.document_type || "Policy")] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Integrity HASH: ", bold: true }), new TextRun(`${policy.policy_id}.hash`)] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Version: ", bold: true }), new TextRun(policy.version || "V1.0")] })] }),
                ]
              })
            ],
            width: { size: 100, type: docxLib.WidthType.PERCENTAGE }
          }));
          
          docChildren.push(new Paragraph({ text: "", spacing: { after: 120 } }));

          // Sign-off Table
          docChildren.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name & Role", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Created" })] }),
                  new TableCell({ children: [new Paragraph({ text: `${createdName} (${createdRole})` })] }),
                  new TableCell({ children: [new Paragraph({ text: createdDate })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Reviewed" })] }),
                  new TableCell({ children: [new Paragraph({ text: `${reviewedName} (${reviewedRole})` })] }),
                  new TableCell({ children: [new Paragraph({ text: reviewedDate })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Approved" })] }),
                  new TableCell({ children: [new Paragraph({ text: `${approvedName} (${approvedRole})` })] }),
                  new TableCell({ children: [new Paragraph({ text: approvedDate })] }),
                ]
              })
            ],
            width: { size: 100, type: docxLib.WidthType.PERCENTAGE }
          }));

          docChildren.push(new Paragraph({ text: "", spacing: { after: 240 } }));

          // REVISION HISTORY
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "REVISION HISTORY", bold: true, size: 24 })],
            spacing: { before: 120, after: 120 }
          }));
          docChildren.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Version", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Created By", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description of Changes", bold: true })] })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: policy.version || "V1.0" })] }),
                  new TableCell({ children: [new Paragraph({ text: new Date(policy.updated_at).toLocaleDateString() })] }),
                  new TableCell({ children: [new Paragraph({ text: createdName })] }),
                  new TableCell({ children: [new Paragraph({ text: policy.description || "Initial Release" })] }),
                ]
              })
            ],
            width: { size: 100, type: docxLib.WidthType.PERCENTAGE }
          }));

          docChildren.push(new Paragraph({ text: "", spacing: { after: 240 } }));

          // Standard Reference
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Standard Reference:", bold: true, size: 24 })],
            spacing: { before: 120, after: 120 }
          }));
          docChildren.push(new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "ISO 27001 Clause Ref", bold: true })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: stdRefMd || "N/A" })] })
                ]
              })
            ],
            width: { size: 100, type: docxLib.WidthType.PERCENTAGE }
          }));

          docChildren.push(new Paragraph({ text: "", spacing: { after: 240 } }));

          // Applicability
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Applicability:", bold: true, size: 24 })],
            spacing: { before: 120, after: 120 }
          }));
          docChildren.push(new Paragraph({
            text: applicabilityMd || `This document is applicable to ${org.name} and all associated Business Units, Third parties, Employees and all stakeholders of ${org.name}.`,
            spacing: { after: 240 }
          }));

          // Integrity Hash
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: "Integrity Hash: ", bold: true }),
              new TextRun({ text: `ISMS Hash Repository - ${policy.policy_id}.hash` })
            ],
            spacing: { after: 240 }
          }));
        }

        // Split policy markdown by lines and add paragraphs
        const lines = (cleanPolicyMarkdown || '').split('\n');
        for (const line of lines) {
          if (line.startsWith('# ')) {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: line.replace('# ', ''), bold: true, size: 28 })],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 }
            }));
          } else if (line.startsWith('## ')) {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: line.replace('## ', ''), bold: true, size: 24 })],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 180, after: 100 }
            }));
          } else if (line.trim() !== '') {
            docChildren.push(new Paragraph({
              text: line,
              spacing: { after: 120 }
            }));
          }
        }

        if (isStandard && includeSignature) {
          // Signature text
          docChildren.push(new Paragraph({ text: "", spacing: { before: 240 } }));
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Authorized Signature:", bold: true })],
            spacing: { after: 120 }
          }));
          if (signatureUrl) {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: `Signature image available at: ${signatureUrl}`, italic: true })],
              spacing: { after: 120 }
            }));
          }
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: `Signed on behalf of: ${org.name}` }),
            ]
          }));
        }

        const wordDoc = new Document({
          sections: [{
            properties: {},
            children: docChildren
          }]
        });

        const docxBuffer = await Packer.toBuffer(wordDoc);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${policy.policy_id}.docx"`);
        return res.send(docxBuffer);
      }
    }

    // Default to PDF Format
    // Construct HTML template
    let htmlTemplate = '';
    let hasOverlayFields = false;
    let overlayHtml = '';

    if (template && template.placeholders && Array.isArray(template.placeholders.fields) && template.placeholders.fields.length > 0) {
      hasOverlayFields = true;
      const fields = template.placeholders.fields;
      for (const field of fields) {
        let content = '';
        if (field.type === 'signature') {
          const sigSrc = field.image_url || signatureUrl;
          if (sigSrc) {
            content = `<img src="${sigSrc}" style="width: 100%; height: 100%; object-fit: contain;" />`;
          } else {
            content = `<div style="width: 100%; height: 100%; border-bottom: 1px solid #1f2937; display: flex; align-items: flex-end; justify-content: center; font-size: 10px; color: #9ca3af; padding-bottom: 2px;">(Signature)</div>`;
          }
        } else if (field.type === 'stamp') {
          if (field.image_url) {
            content = `<img src="${field.image_url}" style="width: 100%; height: 100%; object-fit: contain;" />`;
          } else {
            content = `<div style="width: 100%; height: 100%; border: 2px dashed #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #9ca3af;">Stamp</div>`;
          }
        } else if (field.type === 'logo') {
          const logoSrc = field.mapping === 'default_logo' ? logoUrl : (field.image_url || logoUrl);
          if (logoSrc) {
            content = `<img src="${logoSrc}" style="width: 100%; height: 100%; object-fit: contain;" />`;
          } else {
            content = `<div style="width: 100%; height: 100%; border: 2px dashed #9ca3af; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #9ca3af;">Logo</div>`;
          }
        } else {
          let textVal = '';
          if (field.value) {
            textVal = field.value;
          } else if (field.mapping === 'company_name') {
            textVal = org.name;
          } else if (field.mapping === 'policy_owner') {
            textVal = policy.owner_name || '';
          } else if (field.mapping === 'current_user') {
            textVal = req.user?.email || '';
          } else {
            if (field.type === 'fullname') textVal = policy.owner_name || '';
            else if (field.type === 'signdate') textVal = new Date().toLocaleDateString();
            else if (field.type === 'email') textVal = req.user?.email || '';
            else if (field.type === 'company') textVal = org.name;
            else if (field.type === 'jobtitle') textVal = 'Authorized Signatory';
            else textVal = field.value || '';
          }
          content = `<span style="font-family: inherit; font-size: 13px; color: #1f2937; white-space: pre-wrap; word-break: break-all;">${textVal}</span>`;
        }

        overlayHtml += `
          <div style="position: absolute; left: ${field.x}%; top: ${field.y}%; width: ${field.width}px; height: ${field.height}px; box-sizing: border-box; overflow: hidden; pointer-events: none; display: flex; align-items: center; justify-content: flex-start; z-index: 10;">
            ${content}
          </div>
        `;
      }
    }

    if (template && template.content_html) {
      // Use the edited template layout (supporting both Markdown and legacy HTML)
      let baseHtml = template.content_html;
      
      // If it's Markdown/text (doesn't contain typical HTML paragraph/table/heading tags), compile it
      if (!/<p>|<table|<h[1-6]/i.test(baseHtml)) {
        baseHtml = marked.parse(baseHtml);
      }
      
      const hasPolicyContentPlaceholder = baseHtml.includes('policy_content') || 
                                          baseHtml.includes('_purpose') || 
                                          baseHtml.includes('_scope') || 
                                          baseHtml.includes('document_metadata');
      
      baseHtml = replacePlaceholders(baseHtml, htmlValues);

      // Make sure there is policy_content in template, if not append it
      if (!hasPolicyContentPlaceholder) {
        baseHtml = `<div class="template-wrapper">${baseHtml}</div><hr/><div class="policy-wrapper">${policyContentHtml}</div><div class="signature-wrapper">${signatureHtml}</div>`;
      }

      htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
            .a4-wrapper {
              position: relative;
              width: 794px;
              min-height: 1123px;
              margin: 0 auto;
              background: #ffffff;
              padding: 40px;
              box-sizing: border-box;
              color: #1f2937;
              line-height: 1.6;
            }
            .policy-preview-content {
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="a4-wrapper">
            ${overlayHtml}
            <div class="policy-preview-content">
              ${baseHtml}
            </div>
          </div>
        </body>
        </html>
      `;
    } else if (selectedTemplateId === 'standard') {
      const defaultLayout = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; font-size: 13px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 25px; }
            .company-name { font-size: 20px; font-weight: 700; color: #1e3a8a; margin: 0; }
            .header-text { font-size: 10px; color: #6b7280; margin-top: 3px; }
            
            table.workflow-table, table.history-table, .standard-reference-content table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 11px;
            }
            table.workflow-table th, table.workflow-table td,
            table.history-table th, table.history-table td,
            .standard-reference-content table th, .standard-reference-content table td {
              border: 1px solid #e5e7eb;
              padding: 8px 10px;
              text-align: left;
            }
            table.workflow-table th, table.history-table th, .standard-reference-content table th {
              background: #f3f4f6;
              font-weight: 600;
              color: #374151;
            }
            
            .policy-content { margin-top: 25px; }
            .policy-content h1 { font-size: 20px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 0; }
            .policy-content h2 { font-size: 15px; font-weight: 600; color: #1e40af; margin-top: 20px; }
            .policy-content h3 { font-size: 13px; font-weight: 600; color: #1f2937; margin-top: 15px; }
            .policy-content p { margin: 8px 0; }
            .policy-content table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 11px; }
            .policy-content th, .policy-content td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
            .policy-content th { background: #f3f4f6; font-weight: 600; }
            .policy-content blockquote { border-left: 4px solid #3b82f6; padding: 8px 16px; background: #f0f7ff; margin: 10px 0; font-style: italic; }
            .policy-content ul, .policy-content ol { padding-left: 20px; margin: 10px 0; }
            .policy-content li { margin-bottom: 4px; }
            .footer { border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 50px; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; page-break-inside: avoid; }
            @media print {
              body { padding: 20px; }
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company-name">{{company_name}}</h1>
              <div class="header-text">{{header_content}}</div>
            </div>
            {{company_logo}}
          </div>

          <h1 class="policy-title" style="font-size: 20px; font-weight: 700; color: #1e3a8a; margin-top: 0; margin-bottom: 20px;">{{policy_title}}</h1>
          
          <!-- Metadata Block -->
          <div class="metadata-block" style="margin-bottom: 25px; font-size: 13px; line-height: 1.8; color: #1f2937;">
            <div><strong>Document ID:</strong> {{policy_id}}</div>
            <div><strong>Owner:</strong> {{policy_owner}}</div>
            <div><strong>Document Type:</strong> {{document_type}}</div>
            <div><strong>Integrity HASH:</strong> {{integrity_hash}}</div>
            <div><strong>Version:</strong> {{policy_version}}</div>
          </div>

          <!-- Sign-off Workflow Table -->
          <table class="workflow-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th>Function</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Created</strong></td>
                <td>{{created_name}}</td>
                <td>{{created_role}}</td>
                <td>{{created_date}}</td>
              </tr>
              <tr>
                <td><strong>Reviewed</strong></td>
                <td>{{reviewed_name}}</td>
                <td>{{reviewed_role}}</td>
                <td>{{reviewed_date}}</td>
              </tr>
              <tr>
                <td><strong>Approved</strong></td>
                <td>{{approved_name}}</td>
                <td>{{approved_role}}</td>
                <td>{{approved_date}}</td>
              </tr>
            </tbody>
          </table>

          <!-- Revision History Section -->
          <h3 style="margin-top: 25px; margin-bottom: 10px; color: #1e3a8a; font-size: 15px; font-weight: 600;">REVISION HISTORY</h3>
          <table class="history-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>DATE</th>
                <th>CREATED BY</th>
                <th>DESCRIPTION OF CHANGES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{policy_version}}</td>
                <td>{{updated_at}}</td>
                <td>{{created_name}}</td>
                <td>{{description}}</td>
              </tr>
            </tbody>
          </table>

          <!-- Standard Reference Section -->
          <h3 style="margin-top: 25px; margin-bottom: 10px; color: #1e3a8a; font-size: 15px; font-weight: 600;">Standard Reference</h3>
          <div class="standard-reference-content" style="margin-bottom: 20px;">
            {{standard_references}}
          </div>

          <!-- Applicability & Integrity Hash Section -->
          <p style="margin-top: 20px; margin-bottom: 10px; font-size: 13px; color: #1f2937;"><strong>Applicability:</strong> {{applicability}}</p>
          <p style="margin-bottom: 25px; font-size: 13px; color: #1f2937;"><strong>Integrity Hash:</strong> ISMS Hash Repository - {{integrity_hash}}</p>
          
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

          <div class="policy-content">
            {{policy_content}}
          </div>

          {{signature_block}}

          <div class="footer">
            <span>{{footer_content}}</span>
            <span>Generated securely by ZeroTo1 GRC</span>
          </div>
        </body>
        </html>
      `;
      htmlTemplate = replacePlaceholders(defaultLayout, htmlValues);
    } else {
      // No template configured - download policy exactly as it appears in the Preview
      htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; font-size: 13px; }
            h1 { font-size: 20px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 0; }
            h2 { font-size: 15px; font-weight: 600; color: #1e40af; margin-top: 20px; }
            h3 { font-size: 13px; font-weight: 600; color: #1f2937; margin-top: 15px; }
            p { margin: 8px 0; }
            table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 11px; }
            th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
            th { background: #f3f4f6; font-weight: 600; }
            blockquote { border-left: 4px solid #3b82f6; padding: 8px 16px; background: #f0f7ff; margin: 10px 0; font-style: italic; }
            ul, ol { padding-left: 20px; margin: 10px 0; }
            li { margin-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="policy-content">
            ${policyContentHtml}
          </div>
        </body>
        </html>
      `;
    }

    // If client requested preview HTML, return it directly
    if (req.query.preview === 'true') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlTemplate);
    }

    // 5. Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
    
    const pdfOptions = {
      format: 'A4',
      margin: hasOverlayFields 
        ? { top: '0', bottom: '0', left: '0', right: '0' }
        : { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      printBackground: true
    };

    if (selectedTemplateId === 'standard' && includeLogo && logoBase64) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.margin = { top: '25mm', bottom: '18mm', left: '15mm', right: '15mm' };
      pdfOptions.headerTemplate = `
        <div style="font-size: 8px; width: 100%; display: flex; justify-content: flex-end; align-items: center; padding: 5px 20px 0 20px; font-family: 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box;">
          <img src="${logoBase64}" style="max-height: 25px; max-width: 100px; object-fit: contain;" />
        </div>
      `;
      pdfOptions.footerTemplate = `
        <div style="font-size: 8px; width: 100%; display: flex; justify-content: space-between; padding: 0 20px 5px 20px; font-family: 'Helvetica Neue', Arial, sans-serif; color: #9ca3af; box-sizing: border-box;">
          <span></span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `;
    }

    const pdfBuffer = await page.pdf(pdfOptions);

    await browser.close();

    // 6. Record in rendered_documents and log activity
    try {
      await supabaseAdmin.from('rendered_documents').insert({
        org_id: req.orgId,
        policy_id: policyId,
        policy_version: parseInt(policy.version?.replace(/[^0-9]/g, '') || '1'),
        format: 'pdf',
        status: 'completed',
        file_name: `${policy.policy_id}.pdf`,
        file_size_bytes: pdfBuffer.length,
        file_hash: '',
        storage_path: `rendered/${req.orgId}/${policyId}-${Date.now()}.pdf`
      });

      logActivity({
        action: 'policy_downloaded',
        module: 'Policy',
        entity_id: policyId,
        entity_name: policy.name,
        user_id: req.userId,
        org_id: req.orgId,
        severity: 'info',
        event_data: {
          actor_name: req.user?.email || req.userId,
          format: 'pdf',
          template_name: template?.name || 'Default Template'
        }
      });
    } catch (dbErr) {
      console.error('[download] Failed to record rendered document or log activity:', dbErr.message);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${policy.policy_id}.pdf"`);
    res.send(Buffer.from(pdfBuffer));

  } catch (err) {
    console.error('[download] Error generating document:', err);
    res.status(500).json({ message: err.message });
  }
});

// Helper function to replace placeholders case-insensitively
function replacePlaceholders(html, values) {
  let result = html;
  for (const [key, val] of Object.entries(values)) {
    const escapedKey = key.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'gi');
    result = result.replace(regex, () => val ?? '');
  }
  return result;
}

// ── GET /:id ──────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .select('*')
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .single();
    if (error) throw error;

    if (data && !data.doc_lang && data.markdown) {
      const parsedDocLang = convertMarkdownToDocLang(data.markdown, data);
      if (parsedDocLang) {
        data.doc_lang = parsedDocLang;
        supabaseAdmin.from('policy_documents').update({ doc_lang: parsedDocLang }).eq('policy_id', data.policy_id).then(() => {});
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /  ─ create policy ───────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.orgId) {
      return res.status(400).json({ message: 'No organisation found. Please complete onboarding first.' });
    }
    const { markdown, doc_lang, policy_status = 'draft' } = req.body;
    const policyId = await generatePolicyId(req.orgId);

    let finalMarkdown = markdown || '';
    let finalDocLang = doc_lang || null;
    const meta = markdown ? extractMetadata(markdown) : {};

    if (doc_lang && !markdown) {
      finalMarkdown = convertDocLangToMarkdown(doc_lang);
    } else if (markdown && !doc_lang) {
      finalDocLang = convertMarkdownToDocLang(markdown, { policy_id: policyId, name: meta.name });
    }

    const docName = doc_lang?.title || meta.name || 'Untitled Policy';
    const docRef = doc_lang?.document_id || meta.policy_ref || policyId;
    const docVersion = doc_lang?.version || meta.version || '1.0';
    const docType = doc_lang?.document_type || meta.document_type || 'policy';
    const docOwner = doc_lang?.metadata?.owner_name || meta.owner_name || null;
    const docRefresh = doc_lang?.metadata?.refresh_date || meta.refresh_date || null;

    if (finalDocLang) {
      finalDocLang.document_id = docRef;
      finalDocLang.version = docVersion;
      finalDocLang.document_type = docType;
      if (finalDocLang.metadata) {
        finalDocLang.metadata.owner_name = docOwner;
      }
      finalMarkdown = convertDocLangToMarkdown(finalDocLang);
    }

    const actorName = req.user?.email || req.userId;
    const today = new Date().toISOString().split('T')[0];

    const payload = {
      policy_id: policyId,
      name: docName,
      markdown: finalMarkdown,
      doc_lang: finalDocLang,
      policy_ref: docRef,
      policy_status,
      version: docVersion,
      document_type: docType,
      owner_name: docOwner,
      refresh_date: docRefresh,
      user_id: req.userId,
      org_id: req.orgId,
      document_content: 0,
      grc_contact: '',
      policy_reviewer_contact: '',
      published_date: today,
      next_review_date: docRefresh || today,
      status: 0,
    };

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    logActivity({
      action: 'policy_created',
      module: 'Policy',
      entity_id: policyId,
      entity_name: docName,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: null,
        to_status: policy_status,
      },
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /:id  ─ update policy ─────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { markdown, doc_lang, policy_status } = req.body;
    let finalMarkdown = markdown;
    let finalDocLang = doc_lang;

    if (doc_lang !== undefined) {
      finalMarkdown = convertDocLangToMarkdown(doc_lang);
    }

    const meta = finalMarkdown !== undefined ? extractMetadata(finalMarkdown) : {};
    const actorName = req.user?.email || req.userId;

    const { data: current, error: currentError } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_status, name, next_review_date')
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .single();

    if (currentError) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const updatePayload = {
      ...(finalMarkdown !== undefined || finalDocLang !== undefined ? {
        markdown: finalMarkdown,
        doc_lang: finalDocLang,
        name: doc_lang?.title || meta.name || current?.name || 'Untitled Policy',
        policy_ref: doc_lang?.document_id || meta.policy_ref || null,
        version: doc_lang?.version || meta.version || 'V1.0',
        document_type: doc_lang?.document_type || meta.document_type || null,
        owner_name: doc_lang?.metadata?.owner_name || meta.owner_name || null,

        // NOTE: refresh_date (the renewal/due date) is intentionally NOT set here.
        // It is owned solely by the approval flow (POST /:id/approve) — editing a
        // policy must never create or change a due date. next_review_date is kept
        // for display only and must not feed refresh_date.
        next_review_date: doc_lang?.metadata?.refresh_date || meta.refresh_date || current?.next_review_date || new Date().toISOString().split('T')[0],
      } : {}),
      ...(policy_status ? { policy_status } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('policy_documents')
      .update(updatePayload)
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId)
      .select()
      .single();
    
    if (error) {
      console.error('[PUT /api/policies/:id] Update error:', error);
      throw error;
    }

    const action = (policy_status && current?.policy_status !== policy_status)
      ? 'policy_status_changed'
      : 'policy_content_updated';

    logActivity({
      action,
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: data.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: current?.policy_status,
        to_status: policy_status || current?.policy_status,
      },
    });

    res.json(data);
  } catch (err) {
    console.error('[PUT /api/policies/:id] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name')
      .eq('policy_id', req.params.id)
      .single();

    const { error } = await supabaseAdmin
      .from('policy_documents')
      .delete()
      .eq('policy_id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;

    logActivity({
      action: 'policy_deleted',
      module: 'Policy',
      entity_id: req.params.id,
      entity_name: policy?.name || req.params.id,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'warning',
      event_data: { 
        actor_name: req.user?.email || req.userId,
        user_email: req.user?.email || req.userId,
      },
    });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/submit-approval ─────────────────────────────────────────────
router.post('/:id/submit-approval', requireAuth, async (req, res) => {
  try {
    const { approver_id, approver_name, approver_email } = req.body;
    const policyId = req.params.id;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: 'Superseded by new submission' })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin.from('policy_approvals').insert({
      policy_id: policyId,
      requested_by: req.userId,
      approver_id: approver_id || null,
      approver_name,
      approver_email,
      status: 'pending',
      org_id: req.orgId,
    });

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'in_approval', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (approver_id) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: approver_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approval_requested',
        message: `${actorName} has requested your approval for policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'policy_submitted_for_approval',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'in_approval',
        comment: `Sent to ${approver_name} (${approver_email}) for approval`,
        approver_name,
        approver_email,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/submit-review ───────────────────────────────────────────────
router.post('/:id/submit-review', requireAuth, async (req, res) => {
  try {
    const { reviewer_id, reviewer_name, reviewer_email } = req.body;
    const policyId = req.params.id;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: 'Superseded by new review submission' })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin.from('policy_approvals').insert({
      policy_id: policyId,
      requested_by: req.userId,
      approver_id: reviewer_id || null,
      approver_name: reviewer_name,
      approver_email: reviewer_email,
      status: 'pending',
      org_id: req.orgId,
    });

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'to_review', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (reviewer_id) {
      console.log(`[DEBUG] Submitting notification for reviewer: ${reviewer_id}`);
      const { data: notifData, error: notifError } = await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: reviewer_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approval_requested', // Use allowed type for DB constraint
        message: `${actorName} has requested you to review policy "${policy.name}"`,
        org_id: req.orgId,
      }).select();
      
      if (notifError) {
        console.error('[DEBUG] Error inserting review notification:', notifError);
      } else {
        console.log('[DEBUG] Review notification inserted successfully:', notifData);
      }
    }

    logActivity({
      action: 'policy_submitted_for_review',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'to_review',
        comment: `Sent to ${reviewer_name} (${reviewer_email}) for review`,
        approver_name: reviewer_name,
        approver_email: reviewer_email,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/approve ─────────────────────────────────────────────────────
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    // Calculate refresh_date from org settings
    const { data: settings } = await supabaseAdmin
      .from('org_settings')
      .select('policy_refresh_months')
      .eq('org_id', req.orgId)
      .maybeSingle();
    const months = settings?.policy_refresh_months || 3;
    const refreshDate = new Date();
    refreshDate.setMonth(refreshDate.getMonth() + months);
    const refreshDateStr = refreshDate.toISOString().split('T')[0];

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'approved', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('policy_documents')
      .update({
        policy_status: 'approved',
        refresh_date: refreshDateStr,
        // New approval cycle → clear any reminders sent for the previous cycle.
        reminder_14d_sent_at: null,
        reminder_7d_sent_at: null,
        reminder_1d_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('policy_id', policyId);

    if (updateError) {
      console.error('[POST /api/policies/:id/approve] Update error:', updateError);
      throw updateError;
    }

    if (policy.user_id && policy.user_id !== req.userId) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved',
        message: `${actorName} approved policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify other admins
    notifyAdmins(req.orgId, req.userId, {
      policy_id: policyId,
      policy_name: policy.name,
      type: 'approved',
      message: `Policy "${policy.name}" has been fully approved by ${actorName}`,
    }).catch(() => {});

    logActivity({
      action: 'policy_approved',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'approved',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/policies/:id/approve] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/review ──────────────────────────────────────────────────────
router.post('/:id/review', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    // NOTE: a completed review does NOT set a due date. Only full approval
    // (POST /:id/approve) computes refresh_date; 'reviewed' is an intermediate
    // "ready for approval" state and never expires.

    // Find who requested this review before we update the record
    const { data: pendingApproval } = await supabaseAdmin
      .from('policy_approvals')
      .select('requested_by')
      .eq('policy_id', policyId)
      .eq('status', 'pending')
      .maybeSingle();

    console.log('[DEBUG] Found pending review record:', pendingApproval);

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'approved', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'reviewed', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);
    
    if (updateError) {
      console.error('[POST /api/policies/:id/review] Update error:', updateError);
      throw updateError;
    }

    if (policy.user_id && policy.user_id !== req.userId) {
      console.log(`[DEBUG] Notifying owner: ${policy.user_id}`);
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved', // Use allowed type for DB constraint
        message: `${actorName} reviewed policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify the person who requested the review
    if (pendingApproval?.requested_by && pendingApproval.requested_by !== req.userId && pendingApproval.requested_by !== policy.user_id) {
      console.log(`[DEBUG] Notifying requester: ${pendingApproval.requested_by}`);
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: pendingApproval.requested_by,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'approved', // Use allowed type for DB constraint
        message: `${actorName} has completed the review you requested for policy "${policy.name}"`,
        org_id: req.orgId,
      });
    }

    // Notify admins that a policy is ready for approval
    notifyAdmins(req.orgId, req.userId, {
      policy_id: policyId,
      policy_name: policy.name,
      type: 'approved', // Use allowed type for DB constraint
      message: `Policy "${policy.name}" has been reviewed by ${actorName} and is ready for approval`,
    }).catch(() => {});

    logActivity({
      action: 'policy_reviewed',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'info',
      event_data: {
        actor_name: actorName,
        user_email: req.user?.email || actorName,
        from_status: prevStatus,
        to_status: 'reviewed',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/policies/:id/review] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /:id/reject ──────────────────────────────────────────────────────
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const policyId = req.params.id;
    const { comment } = req.body;
    const actorName = req.user?.email || req.userId;

    const { data: policy } = await supabaseAdmin
      .from('policy_documents')
      .select('name, policy_status, user_id')
      .eq('policy_id', policyId)
      .single();

    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    const prevStatus = policy.policy_status;

    await supabaseAdmin
      .from('policy_approvals')
      .update({ status: 'rejected', comment: comment || null, updated_at: new Date().toISOString() })
      .eq('policy_id', policyId)
      .eq('status', 'pending');

    await supabaseAdmin
      .from('policy_documents')
      .update({ policy_status: 'draft', updated_at: new Date().toISOString() })
      .eq('policy_id', policyId);

    if (policy.user_id && policy.user_id !== req.userId) {
      await supabaseAdmin.from('policy_notifications').insert({
        recipient_id: policy.user_id,
        policy_id: policyId,
        policy_name: policy.name,
        type: 'rejected',
        message: `${actorName} rejected policy "${policy.name}". ${comment ? `Reason: ${comment}` : ''}`,
        org_id: req.orgId,
      });
    }

    logActivity({
      action: 'policy_rejected',
      module: 'Policy',
      entity_id: policyId,
      entity_name: policy.name,
      user_id: req.userId,
      org_id: req.orgId,
      severity: 'warning',
      event_data: {
        actor_name: actorName,
        from_status: prevStatus,
        to_status: 'draft',
        comment: comment || null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/policies/parse-file — parse PDF, DOCX, or Markdown document files and return extracted text
router.post('/parse-file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file was uploaded.' });
    }

    const fileExt = (file.originalname.split('.').pop() || '').toLowerCase();
    let textContent = '';

    if (fileExt === 'md' || fileExt === 'markdown' || fileExt === 'txt') {
      textContent = file.buffer.toString('utf8');
    } else if (fileExt === 'docx') {
      try {
        const result = await mammoth.convertToHtml({ buffer: file.buffer });
        const html = result.value || '';
        textContent = convertHtmlToMarkdown(html);
      } catch (parseErr) {
        console.error('[policies/parse-file] Mammoth DOCX conversion error:', parseErr);
        return res.status(400).json({ message: `Failed to parse DOCX file: ${parseErr.message}` });
      }
    } else if (fileExt === 'pdf') {
      try {
        const parser = new PDFParse({ data: file.buffer });
        const parsed = await parser.getText();
        textContent = parsed.text || '';
      } catch (parseErr) {
        console.error('[policies/parse-file] pdf-parse conversion error:', parseErr);
        return res.status(400).json({ message: `Failed to parse PDF file: ${parseErr.message}` });
      }
    } else {
      return res.status(400).json({ message: `Unsupported file type: .${fileExt}. Supported formats are .md, .pdf, .docx, and .txt` });
    }

    res.json({ text: textContent });
  } catch (err) {
    console.error('[policies/parse-file] Catch-all error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { checkAndExpirePolicies };
export const policiesRouter = router;
