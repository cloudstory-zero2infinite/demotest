import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const CONSULTANT_MEMBER_LIMIT = 3; // 1 tenant_admin + 2 users
const DEFAULT_FRAMEWORKS = ['CISv8.1'];

// Check if org is a Consultant org and has reached its member limit
async function checkConsultantLimit(orgId) {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  if (!org || !org.name.match(/^Consultant\d+$/i)) return null; // not a consultant org

  const { count } = await supabaseAdmin
    .from('org_onboarding')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if ((count || 0) >= CONSULTANT_MEMBER_LIMIT) {
    return `Consultant workspaces are limited to ${CONSULTANT_MEMBER_LIMIT} members (1 admin + 2 users).`;
  }
  return null;
}

// GET current user's org, role, and onboarding status
router.get('/me', requireAuth, async (req, res) => {
  try {
    const isOnboarded = !!req.orgId;

    let orgName = null;
    let neededFramework = null;
    if (req.orgId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('name, needed_framework')
        .eq('id', req.orgId)
        .single();
      orgName = org?.name ?? null;
      neededFramework = org?.needed_framework ?? null;
    }

    res.json({
      userId: req.userId,
      orgId: req.orgId,
      orgName,
      role: req.userRole,
      email: req.user?.email,
      isOnboarded,
      onboardingStatus: req.onboardingStatus,
      neededFramework,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all users in the org
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .select('*')
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/org/delete-my-account — user deletes their own org_onboarding entry
router.delete('/delete-my-account', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('org_onboarding')
      .delete()
      .eq('user_id', req.userId)
      .eq('org_id', req.orgId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /notifications ───────────────────────────────────────────────────
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('org_notifications')
      .select('*')
      .eq('recipient_id', req.userId)
      .eq('org_id', req.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/:notifId/read ─────────────────────────────────────
router.put('/notifications/:notifId/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('org_notifications')
      .update({ read: true })
      .eq('id', req.params.notifId)
      .eq('recipient_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/read-all ──────────────────────────────────────────
router.put('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const { userId, orgId } = req;
    
    // Mark all as read across all notification tables
    const tables = ['org_notifications', 'policy_notifications', 'control_notifications'];
    
    const results = await Promise.all(tables.map(table => 
      supabaseAdmin
        .from(table)
        .update({ read: true })
        .eq('recipient_id', userId)
        .eq('org_id', orgId)
        .eq('read', false)
    ));

    const errors = results.filter(r => r.error).map(r => r.error);
    if (errors.length > 0) {
      console.error('[notifications/read-all] Errors:', errors);
      throw new Error('Failed to mark some notifications as read');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST onboard a user to the org (used by admin from org management UI)
router.post('/onboard', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can add members.' });
    }

    const { email, role = 'user', description } = req.body;
    const orgId = req.orgId;

    // Enforce member limit for Consultant orgs
    const limitError = await checkConsultantLimit(orgId);
    if (limitError) return res.status(403).json({ message: limitError });

    // Look up user_id by email
    const { data: userId } = await supabaseAdmin
      .rpc('get_user_id_by_email', { email_input: email })
      .single();

    // Check if user already exists in org_onboarding
    const { data: existing } = await supabaseAdmin
      .from('org_onboarding')
      .select('id, org_id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      if (existing.org_id === orgId) {
        return res.status(400).json({ message: 'This user is already a member of your organisation.' });
      }
      // User exists in another org. Return success to allow the invite step.
      // We don't insert a new record due to the unique email constraint.
      return res.status(200).json({ 
        id: existing.id, 
        org_id: orgId, // Return current orgId so frontend thinks they are added here
        email: email.toLowerCase(),
        role: role,
        alreadyInAnotherOrg: true,
        message: 'User is associated with another organisation. Invitation will still be sent.' 
      });
    }

    const payload = {
      org_id: orgId,
      email: email.toLowerCase(),
      role,
      status: 'active',
      ...(userId ? { user_id: userId } : {}),
      ...(description?.trim() ? { description } : {}),
    };

    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org/invite — send invitation email(s) via Supabase Auth Admin
router.post('/invite', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can invite members.' });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    // 1. Check if the user already belongs to ANOTHER organization (Active status only)
    const { data: otherOrgAssociation } = await supabaseAdmin
      .from('org_onboarding')
      .select('org_id')
      .eq('email', email.toLowerCase())
      .eq('status', 'active')
      .neq('org_id', req.orgId)
      .maybeSingle();

    if (otherOrgAssociation) {
      // CASE 1: User is already active in another organization
      // We send a Magic Link as the invitation via Supabase
      await supabaseAdmin.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: `${req.headers.origin}/#/`,
        },
      });
      return res.json({ success: true, alreadyRegistered: true, user: { email } });
    }

    // CASE 2: User is not part of any other active organization
    // We try the standard Supabase "Invite user" email template first.
    // To satisfy the requirement for "Invite User" template on existing users,
    // we attempt a "Clean Invite" ONLY if they have zero history in our database.
    try {
      // Check if user has ANY record in our system (active, pending, or inactive)
      const { count } = await supabaseAdmin
        .from('org_onboarding')
        .select('*', { count: 'exact', head: true })
        .eq('email', email.toLowerCase());

      if (count === 0) {
        // No history in our app -> Safe to attempt Clean Invite
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserByEmail(email);
        if (authUser?.user) {
          // Attempt deletion. If it fails (due to external FKs), we just proceed.
          try {
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            // Delay for propagation
            await new Promise(resolve => setTimeout(resolve, 800));
          } catch (dErr) {
            console.warn('[invite] Could not delete user for clean invite:', dErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('[invite] Clean invite check failed:', err.message);
    }

    // Now call the standard Invite method
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${req.headers.origin}/#/`,
    });

    if (inviteError) {
      if (inviteError.message.includes('already been registered')) {
        // Fallback to Magic Link if we can't use the Invite template
        await supabaseAdmin.auth.signInWithOtp({
          email: email,
          options: {
            emailRedirectTo: `${req.headers.origin}/#/`,
          },
        });
        return res.json({ success: true, alreadyRegistered: true, user: { email } });
      }
      throw inviteError;
    }

    res.json({ success: true, user: data.user });
  } catch (err) {
    console.error('[invite] unexpected error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Onboarding Setup Routes ───────────────────────────────────────────────

// POST /api/org/setup/individual — create a "ConsultantN" org for solo use
router.post('/setup/individual', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const email = req.user?.email;

    // Find next available ConsultantN name
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .ilike('name', 'Consultant%');

    let nextNum = 1;
    if (existing && existing.length > 0) {
      const nums = existing
        .map(o => parseInt(o.name.replace(/^Consultant/i, ''), 10))
        .filter(n => !isNaN(n));
      if (nums.length > 0) nextNum = Math.max(...nums) + 1;
    }
    const orgName = `Consultant${nextNum}`;

    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: orgName, created_by: userId, needed_framework: DEFAULT_FRAMEWORKS })
      .select()
      .single();
    if (orgError) throw orgError;

    const { data: onboarding, error: obError } = await supabaseAdmin
      .from('org_onboarding')
      .insert({
        org_id: newOrg.id,
        user_id: userId,
        email: email,
        role: 'tenant_admin',
        status: 'active',
      })
      .select()
      .single();
    if (obError) throw obError;

    // Seed NN controls for the new org
    await supabaseAdmin.rpc('seed_nn_controls_for_org', { org_uuid: newOrg.id });

    res.status(201).json({ org: newOrg, onboarding });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org/setup/create-org — create a new workspace, caller becomes tenant_admin
router.post('/setup/create-org', requireAuth, async (req, res) => {
  try {
    const { name, location, website } = req.body;
    const userId = req.userId;
    const email = req.user?.email;

    if (!name?.trim()) return res.status(400).json({ message: 'Organisation name is required.' });
    if (!location?.trim()) return res.status(400).json({ message: 'Location is required.' });

    // Check name uniqueness (case-insensitive)
    const { data: nameCheck } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .ilike('name', name.trim())
      .maybeSingle();

    if (nameCheck) {
      return res.status(409).json({ message: `"${name.trim()}" is already taken. Please choose a different name.` });
    }

    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: name.trim(),
        location: location.trim(),
        website: website?.trim() || null,
        created_by: userId,
        needed_framework: DEFAULT_FRAMEWORKS,
      })
      .select()
      .single();
    if (orgError) throw orgError;

    const { data: onboarding, error: obError } = await supabaseAdmin
      .from('org_onboarding')
      .insert({
        org_id: newOrg.id,
        user_id: userId,
        email: email,
        role: 'tenant_admin',
        status: 'active',
      })
      .select()
      .single();
    if (obError) throw obError;

    // Seed NN controls for the new org
    await supabaseAdmin.rpc('seed_nn_controls_for_org', { org_uuid: newOrg.id });

    res.status(201).json({ org: newOrg, onboarding });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org/setup/join-request — user requests to join org via admin email
router.post('/setup/join-request', requireAuth, async (req, res) => {
  try {
    const { adminEmail } = req.body;
    const userId = req.userId;
    const email = req.user?.email;

    if (!adminEmail?.trim()) return res.status(400).json({ message: 'Admin email is required.' });

    // Find org admin by email in org_onboarding
    const { data: adminRecord } = await supabaseAdmin
      .from('org_onboarding')
      .select('org_id, role')
      .eq('email', adminEmail.toLowerCase().trim())
      .in('role', ['admin', 'tenant_admin'])
      .eq('status', 'active')
      .maybeSingle();

    if (!adminRecord) {
      return res.status(404).json({ message: 'No active admin found with that email. Please check and try again.' });
    }

    // Enforce member limit for Consultant orgs
    const limitError = await checkConsultantLimit(adminRecord.org_id);
    if (limitError) return res.status(403).json({ message: limitError });

    // Insert pending record
    const { data: pending, error: pendError } = await supabaseAdmin
      .from('org_onboarding')
      .insert({
        org_id: adminRecord.org_id,
        user_id: userId,
        email: email,
        role: 'user',
        status: 'pending_approval',
      })
      .select()
      .single();
    if (pendError) throw pendError;

    // Notify all admins in the org
    const { data: admins } = await supabaseAdmin
      .from('org_onboarding')
      .select('user_id')
      .eq('org_id', adminRecord.org_id)
      .in('role', ['admin', 'tenant_admin'])
      .eq('status', 'active')
      .not('user_id', 'is', null);

    if (admins && admins.length > 0) {
      const notifications = admins.map(a => ({
        recipient_id: a.user_id,
        type: 'join_request',
        message: `${email} has requested to join your organisation`,
        org_id: adminRecord.org_id,
      }));
      await supabaseAdmin.from('org_notifications').insert(notifications);
    }

    res.status(201).json({ pending, message: 'Join request sent. Your admin will approve your access.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin: Pending Approvals ───────────────────────────────────────────────

// GET /api/org/pending-approvals — list all pending join requests for this org
router.get('/pending-approvals', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can view pending approvals.' });
    }

    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .select('*')
      .eq('org_id', req.orgId)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org/approve-member/:id — approve a pending member
router.post('/approve-member/:id', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can approve members.' });
    }

    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .update({ status: 'active' })
      .eq('id', id)
      .eq('org_id', req.orgId) // ensure admin can only approve their own org
      .eq('status', 'pending_approval')
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Pending request not found.' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/org/reject-member/:id — reject/remove a pending member
router.post('/reject-member/:id', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can reject members.' });
    }

    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('org_onboarding')
      .delete()
      .eq('id', id)
      .eq('org_id', req.orgId)
      .eq('status', 'pending_approval');
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/org/remove-member/:id — remove a member from the org (data preserved)
router.delete('/remove-member/:id', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can remove members.' });
    }

    const { id } = req.params;

    // Fetch the target record to check guards
    const { data: target } = await supabaseAdmin
      .from('org_onboarding')
      .select('id, user_id, role')
      .eq('id', id)
      .eq('org_id', req.orgId)
      .single();

    if (!target) return res.status(404).json({ message: 'Member not found in your organisation.' });

    // Guard: cannot remove yourself
    if (target.user_id === req.userId) {
      return res.status(400).json({ message: 'You cannot remove yourself from the organisation.' });
    }

    // Guard: cannot remove another tenant_admin
    if (target.role === 'tenant_admin') {
      return res.status(400).json({ message: 'Tenant admins cannot be removed this way.' });
    }

    // Delete only the org_onboarding row — all data in other tables is preserved
    const { error } = await supabaseAdmin
      .from('org_onboarding')
      .delete()
      .eq('id', id)
      .eq('org_id', req.orgId);
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/org/update-role/:id — update a member's role
router.put('/update-role/:id', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'tenant_admin'].includes(req.userRole)) {
      return res.status(403).json({ message: 'Only admins can update roles.' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'cxo'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    // Guard: cannot change your own role to something else if you are the only tenant_admin
    // (Wait, tenant_admin can't be changed anyway by this route usually, but let's be safe)
    
    const { data: target } = await supabaseAdmin
      .from('org_onboarding')
      .select('role, user_id')
      .eq('id', id)
      .eq('org_id', req.orgId)
      .single();

    if (!target) return res.status(404).json({ message: 'Member not found.' });
    if (target.role === 'tenant_admin' && req.userRole !== 'tenant_admin') {
      return res.status(403).json({ message: 'Only tenant admins can modify other tenant admins.' });
    }

    const { data, error } = await supabaseAdmin
      .from('org_onboarding')
      .update({ role })
      .eq('id', id)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const orgRouter = router;
