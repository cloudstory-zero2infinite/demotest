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

    // Attach org_id and role — prefer 'active' row; fall back to any row
    const { data: rows } = await supabaseAdmin
      .from('org_onboarding')
      .select('org_id, role, status')
      .eq('user_id', user.id)
      .order('status', { ascending: true }); // 'active' sorts before 'pending_approval'

    const onboarding = rows?.find(r => r.status === 'active') || rows?.[0] || null;

    console.log('[auth] user_id:', user.id, 'email:', user.email, 'onboarding rows:', rows?.length, 'matched:', onboarding?.org_id, onboarding?.status);

    req.orgId = onboarding?.org_id || null;
    req.userRole = onboarding?.role || null;
    req.onboardingStatus = onboarding?.status || null;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
