import { supabaseAdmin } from '../supabase.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = user.id;
    req.user = user;

    // Attach org_id and role
    const { data: onboarding } = await supabaseAdmin
      .from('org_onboarding')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    req.orgId = onboarding?.org_id || null;
    req.userRole = onboarding?.role || null;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
