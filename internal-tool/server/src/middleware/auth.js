import { supabaseAdmin } from '../supabase.js';

// Validate the Supabase Google-OAuth JWT. No org_onboarding lookup — anyone
// with a valid Google-signed-in Supabase session can use this tool.
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.substring(7);

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.userId = user.id;
    req.userEmail = user.email || null;
    req.user = user;
    next();
  } catch (err) {
    console.error('[internal-tool] auth error:', err);
    res.status(500).json({ message: 'Authentication error' });
  }
};
