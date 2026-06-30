import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import mammoth from 'mammoth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // Limit to 10MB

const CAN_WRITE = ['admin', 'tenant_admin', 'cxo'];
const COLS = 'id, org_id, name, description, file_path, placeholders, header_text, footer_text, content_html, created_at, updated_at';

// Helper for logging to the global all_activity_log (powers the Activity Logs tab).
function logActivity(req, { action, entity_id, entity_name, event_data }) {
  supabaseAdmin.from('all_activity_log').insert({
    action,
    module: 'Policy',
    entity_id: entity_id ? String(entity_id) : null,
    entity_name: entity_name || null,
    event_data: { ...(event_data || {}), user_email: req.user?.email || null },
    severity: 'info',
    user_id: req.userId,
    org_id: req.orgId,
    user_agent: req.headers['user-agent'] || null,
  }).then(() => {}).catch(err => console.error('Error logging to all_activity_log:', err));
}

export function convertHtmlToMarkdown(html) {
  if (!html) return '';
  let md = html;

  // Remove whitespace/newlines between tags to avoid unwanted gap
  md = md.replace(/>\s+</g, '><');

  // Convert headings
  md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Convert tables
  const tableRegex = /<table>(.*?)<\/table>/gi;
  md = md.replace(tableRegex, (match, tableContent) => {
    let rows = [];
    const trRegex = /<tr>(.*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = trRegex.exec(tableContent)) !== null) {
      let cells = [];
      const tdRegex = /<(?:td|th)>(.*?)<\/(?:td|th)>/gi;
      let cellMatch;
      while ((cellMatch = tdRegex.exec(rowMatch[1])) !== null) {
        // Strip p tags inside table cells
        let cellText = cellMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1 ');
        cellText = cellText.replace(/<[^>]+>/g, '').trim(); // strip any remaining html tags in cell
        cells.push(cellText);
      }
      rows.push(cells);
    }

    if (rows.length === 0) return '';
    let markdownTable = '';
    // Format header row
    markdownTable += '| ' + rows[0].join(' | ') + ' |\n';
    // Format separator row
    markdownTable += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    // Format data rows
    for (let i = 1; i < rows.length; i++) {
      markdownTable += '| ' + rows[i].join(' | ') + ' |\n';
    }
    return '\n' + markdownTable + '\n';
  });

  // Convert lists (ul)
  const ulRegex = /<ul>(.*?)<\/ul>/gi;
  md = md.replace(ulRegex, (match, listContent) => {
    let listMd = '';
    const liRegex = /<li>(.*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      let itemText = liMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1');
      itemText = itemText.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                         .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                         .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                         .replace(/<i>(.*?)<\/i>/gi, '*$1*');
      itemText = itemText.replace(/<[^>]+>/g, '').trim();
      listMd += `* ${itemText}\n`;
    }
    return '\n' + listMd + '\n';
  });

  // Convert lists (ol)
  const olRegex = /<ol>(.*?)<\/ol>/gi;
  md = md.replace(olRegex, (match, listContent) => {
    let listMd = '';
    const liRegex = /<li>(.*?)<\/li>/gi;
    let liMatch;
    let index = 1;
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      let itemText = liMatch[1].replace(/<p>(.*?)<\/p>/gi, '$1');
      itemText = itemText.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                         .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                         .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                         .replace(/<i>(.*?)<\/i>/gi, '*$1*');
      itemText = itemText.replace(/<[^>]+>/g, '').trim();
      listMd += `${index}. ${itemText}\n`;
      index++;
    }
    return '\n' + listMd + '\n';
  });

  // Convert paragraphs
  md = md.replace(/<p>(.*?)<\/p>/gi, (match, pContent) => {
    return pContent + '\n\n';
  });

  // Convert inline styles
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode basic HTML entities
  md = md.replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'")
         .replace(/&nbsp;/g, ' ');

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

// GET /api/policy-templates — list all policy templates for this org
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('policy_templates')
      .select(COLS)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/policy-templates — create new template by uploading DOCX
router.post('/', requireAuth, upload.single('template'), async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }

    const { name, description = '', header_text = '', footer_text = '' } = req.body;
    const file = req.file;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Template name is required.' });
    }

    let contentHtml = '';
    let filePath = 'custom';

    if (file) {
      const fileExt = (file.originalname.split('.').pop() || '').toLowerCase();
      if (fileExt === 'md' || fileExt === 'markdown' || fileExt === 'txt') {
        contentHtml = file.buffer.toString('utf8');
      } else {
        // 1. Convert DOCX to HTML and then convert to Markdown for template text
        let extractedHtml = '';
        try {
          const result = await mammoth.convertToHtml({ buffer: file.buffer });
          extractedHtml = result.value || '';
        } catch (parseErr) {
          console.warn('[policy-templates] Failed to convert DOCX to HTML via mammoth:', parseErr.message);
        }

        contentHtml = convertHtmlToMarkdown(extractedHtml);
      }

      // 2. Upload file to Supabase Storage
      const storagePath = `templates/${req.orgId}/${Date.now()}-${file.originalname}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('Template-docs')
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('Template-docs')
        .getPublicUrl(storagePath);
      filePath = publicUrl;
    } else {
      contentHtml = `<h1>{{policy_title}}</h1>\n\n{{policy_content}}\n\n{{signature_block}}`;
    }

    // 3. Insert metadata into policy_templates
    const { data, error } = await supabaseAdmin
      .from('policy_templates')
      .insert({
        org_id: req.orgId,
        name: String(name).trim(),
        description: String(description).trim(),
        file_path: filePath,
        content_html: contentHtml,
        header_text: String(header_text).trim(),
        footer_text: String(footer_text).trim(),
        placeholders: {}, // Initialize as empty JSON object
      })
      .select(COLS)
      .single();

    if (error) throw error;
    logActivity(req, {
      action: 'policy_template_created',
      entity_id: data.id,
      entity_name: data.name,
      event_data: {
        description: data.description,
        file_path: data.file_path,
      }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/policy-templates/:id — update template metadata, header/footer, custom placeholders and edited HTML
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }

    const { name, description, header_text, footer_text, placeholders, content_html } = req.body;
    const patch = { updated_at: new Date().toISOString() };

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Template name cannot be empty' });
      patch.name = String(name).trim();
    }
    if (description !== undefined) patch.description = String(description).trim();
    if (header_text !== undefined) patch.header_text = String(header_text).trim();
    if (footer_text !== undefined) patch.footer_text = String(footer_text).trim();
    if (placeholders !== undefined) patch.placeholders = placeholders;
    if (content_html !== undefined) patch.content_html = content_html;

    let templateId = req.params.id;
    if (templateId === 'standard') {
      const { data: existing } = await supabaseAdmin
        .from('policy_templates')
        .select('id')
        .eq('org_id', req.orgId)
        .eq('name', 'Standard Template')
        .maybeSingle();

      if (existing) {
        templateId = existing.id;
      } else {
        const { data: newTemp, error: insertErr } = await supabaseAdmin
          .from('policy_templates')
          .insert({
            org_id: req.orgId,
            name: 'Standard Template',
            description: 'The built-in default policy template.',
            file_path: 'standard',
            placeholders: placeholders || {}
          })
          .select(COLS)
          .single();

        if (insertErr) throw insertErr;
         logActivity(req, {
          action: 'policy_template_created',
          entity_id: newTemp.id,
          entity_name: newTemp.name,
          event_data: {
            description: newTemp.description,
            file_path: newTemp.file_path,
          }
        });
        return res.json(newTemp);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('policy_templates')
      .update(patch)
      .eq('id', templateId)
      .eq('org_id', req.orgId)
      .select(COLS)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Template not found' });
    logActivity(req, {
      action: 'policy_template_updated',
      entity_id: data.id,
      entity_name: data.name,
      event_data: {
        updated_fields: Object.keys(patch).filter(k => k !== 'updated_at')
      }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// POST /api/policy-templates/upload-asset — uploads an asset (e.g. signature drawing or stamp) and returns publicUrl
router.post('/upload-asset', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }

    let buffer;
    let mimetype;
    let originalname;

    if (req.file) {
      buffer = req.file.buffer;
      mimetype = req.file.mimetype;
      originalname = req.file.originalname;
    } else if (req.body.base64) {
      const matches = req.body.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ message: 'Invalid base64 string format. Must be a valid Data URL' });
      }
      mimetype = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
      originalname = req.body.filename || `upload-${Date.now()}.png`;
    } else {
      return res.status(400).json({ message: 'No file or base64 data provided' });
    }

    const fileExt = originalname.split('.').pop() || 'png';
    const fileName = `assets/${req.orgId}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

    // Upload to Supabase Storage in the Policy-logo bucket
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('Policy-logo')
      .upload(fileName, buffer, { contentType: mimetype, upsert: true });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('Policy-logo')
      .getPublicUrl(fileName);

      logActivity(req, {
      action: 'policy_template_asset_uploaded',
      entity_name: originalname,
      event_data: {
        public_url: publicUrl,
        mimetype
      }
    });

    res.json({ publicUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/policy-templates/:id — delete template and its storage file
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }

    // 1. Fetch template to get file path
    const { data: template, error: fetchErr } = await supabaseAdmin
      .from('policy_templates')
        .select('name, file_path')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single();

    if (fetchErr || !template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // 2. Extract relative storage path from publicUrl
    // e.g. publicUrl is https://xyz.supabase.co/storage/v1/object/public/Template-docs/templates/org_id/123-file.docx
    // we want templates/org_id/123-file.docx
    const storagePrefix = '/Template-docs/';
    const idx = template.file_path.indexOf(storagePrefix);
    if (idx !== -1) {
      const storagePath = template.file_path.substring(idx + storagePrefix.length);
      // Delete from storage
      await supabaseAdmin.storage
        .from('Template-docs')
        .remove([storagePath]);
    }

    // 3. Delete DB record
    const { error: deleteErr } = await supabaseAdmin
      .from('policy_templates')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);

    if (deleteErr) throw deleteErr;

    logActivity(req, {
      action: 'policy_template_deleted',
      entity_id: req.params.id,
      entity_name: template.name || 'Standard Template',
      event_data: {
        file_path: template.file_path,
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { router as policyTemplatesRouter };
