import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const CAN_WRITE = ['admin', 'tenant_admin', 'cxo'];
const COLS = 'id, org_id, name, subject, body, created_at, updated_at';

// GET /api/email-templates — list this org's templates (any authed member).
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select(COLS)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/email-templates — create (admin/tenant_admin/cxo).
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }
    const { name, subject = '', body = '' } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Template name is required' });
    }
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .insert({
        org_id: req.orgId,
        user_id: req.userId,
        name: String(name).trim(),
        subject: String(subject),
        body: String(body),
      })
      .select(COLS)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/email-templates/:id — update (admin/tenant_admin/cxo).
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }
    const { name, subject, body } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Template name cannot be empty' });
      patch.name = String(name).trim();
    }
    if (subject !== undefined) patch.subject = String(subject);
    if (body !== undefined) patch.body = String(body);

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .update(patch)
      .eq('id', req.params.id)
      .eq('org_id', req.orgId) // tenant scoping
      .select(COLS)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Template not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/email-templates/:id — delete (admin/tenant_admin/cxo).
// The org_settings FK is ON DELETE SET NULL, so a deleted template that was
// selected for policy expiry falls back to the built-in default.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!CAN_WRITE.includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins, tenant_admins, and CXOs can manage templates' });
    }
    const { error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export { router as emailTemplatesRouter };
