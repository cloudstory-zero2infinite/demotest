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

    // Auto-create organization for new users
    if (!onboarding) {
      try {
        // Create a default organization for the user
        const { data: newOrg } = await supabaseAdmin
          .from('organizations')
          .insert({ 
            name: `${user.email}'s Organization`,
            created_by: user.id 
          })
          .select()
          .single();

        if (newOrg) {
          // Add user to their own organization as admin
          await supabaseAdmin
            .from('org_onboarding')
            .insert({
              org_id: newOrg.id,
              user_id: user.id,
              email: user.email,
              role: 'admin'
            });

          // Update request with new org info
          req.orgId = newOrg.id;
          req.userRole = 'admin';
        }
      } catch (autoOrgError) {
        console.error('Auto-organization creation failed:', autoOrgError);
        // Continue without org - user will need to create one manually
      }
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
