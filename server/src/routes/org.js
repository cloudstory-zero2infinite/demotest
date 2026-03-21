import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET current user's org, role, and onboarding status
router.get('/me', requireAuth, async (req, res) => {
  try {
    const isOnboarded = !!req.orgId;

    let orgName = null;
    if (req.orgId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', req.orgId)
        .single();
      orgName = org?.name ?? null;
    }

    res.json({
      userId: req.userId,
      orgId: req.orgId,
      orgName,
      role: req.userRole,
      email: req.user?.email,
      isOnboarded,
      onboardingStatus: req.onboardingStatus,
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

// POST onboard a user to the org (used by admin from org management UI)
router.post('/onboard', requireAuth, async (req, res) => {
  try {
    const { email, role = 'user', description } = req.body;
    const orgId = req.orgId;

    // Look up user_id by email
    const { data: userId } = await supabaseAdmin
      .rpc('get_user_id_by_email', { email_input: email })
      .single();

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
      .insert({ name: orgName, created_by: userId })
      .select()
      .single();
    if (orgError) throw orgError;

    const { data: onboarding, error: obError } = await supabaseAdmin
      .from('org_onboarding')
      .insert({
        org_id: newOrg.id,
        user_id: userId,
        email: email,
        role: 'user',
        status: 'active',
      })
      .select()
      .single();
    if (obError) throw obError;

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

export const orgRouter = router;
