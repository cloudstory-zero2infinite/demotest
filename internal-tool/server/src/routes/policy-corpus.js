import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const BUCKET = process.env.POLICY_CORPUS_BUCKET || 'policy-corpus';

// List files in the bucket root
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list('', {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const files = (data || [])
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => ({
        name: f.name,
        size: f.metadata?.size || 0,
        contentType: f.metadata?.mimetype || null,
        createdAt: f.created_at || null,
        updatedAt: f.updated_at || f.created_at || null,
      }));
    res.json(files);
  } catch (err) {
    console.error('[policy-corpus] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Upload a file
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'file field is required' });
    }
    const name = req.file.originalname;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(name, req.file.buffer, {
      contentType: req.file.mimetype || 'application/octet-stream',
      upsert: true,
    });
    if (error) throw error;
    res.status(201).json({ name });
  } catch (err) {
    console.error('[policy-corpus] upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Download (proxied stream via signed URL)
router.get('/:name/download', requireAuth, async (req, res) => {
  try {
    const name = req.params.name;
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(name);
    if (error) throw error;
    const buf = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    console.error('[policy-corpus] download error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete a file
router.delete('/:name', requireAuth, async (req, res) => {
  try {
    const name = req.params.name;
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([name]);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[policy-corpus] delete error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const policyCorpusRouter = router;
