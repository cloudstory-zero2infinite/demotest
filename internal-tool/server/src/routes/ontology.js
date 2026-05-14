import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Local filesystem path to the ontology folder.
// In dev this points at the ai-agent ontology folder in the monorepo;
// override via ONTOLOGY_DIR in production if needed.
const ONTOLOGY_DIR =
  process.env.ONTOLOGY_DIR ||
  path.resolve(process.cwd(), '../ai-agent/ontology');

const KNOWN_FILES = ['entities.yml', 'policy.yml', 'relationships.yml'];

async function safeListDir(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.(ya?ml)$/i.test(e.name))
      .map((e) => e.name);
  } catch {
    return null;
  }
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const fromDisk = await safeListDir(ONTOLOGY_DIR);
    const names = fromDisk && fromDisk.length > 0 ? fromDisk : KNOWN_FILES;

    const out = [];
    for (const name of names) {
      let size;
      try {
        const stat = await fs.stat(path.join(ONTOLOGY_DIR, name));
        size = stat.size;
      } catch {
        size = undefined;
      }
      out.push({ name, path: `ontology/${name}`, size });
    }
    res.json(out);
  } catch (err) {
    console.error('[ontology] list error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:name', requireAuth, async (req, res) => {
  try {
    const name = req.params.name;
    // Guard against path traversal — only allow simple filenames.
    if (!/^[A-Za-z0-9._-]+\.(ya?ml)$/i.test(name)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    const filePath = path.join(ONTOLOGY_DIR, name);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      res.json({ name, content });
    } catch {
      res.json({
        name,
        content:
          `# ${name}\n# (File not available on this deployment.\n# Source of truth lives in GitHub.)\n`,
      });
    }
  } catch (err) {
    console.error('[ontology] get error:', err);
    res.status(500).json({ message: err.message });
  }
});

export const ontologyRouter = router;
