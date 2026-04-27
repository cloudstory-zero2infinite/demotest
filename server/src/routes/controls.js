import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('=== CONTROLS API DEBUG ===');
    console.log('Fetching controls for org:', req.orgId);
    
    // First try internal_control_catalogue, if empty try control_registry
    let { data: catalogueData, error: catalogueError } = await supabaseAdmin
      .from('internal_control_catalogue')
      .select('*')
      .eq('org_id', req.orgId)
      .order('updated_at', { ascending: false });
    
    console.log('Internal control catalogue result:', {
      dataLength: catalogueData?.length || 0,
      error: catalogueError,
      sampleData: catalogueData?.slice(0, 2)
    });
    
    // If no data in internal_control_catalogue, try control_registry
    if (!catalogueData || catalogueData.length === 0) {
      console.log('No data in internal_control_catalogue, trying control_registry...');
      
      const { data: registryData, error: registryError } = await supabaseAdmin
        .from('control_registry')
        .select('*')
        .eq('org_id', req.orgId)
        .order('updated_at', { ascending: false });
      
      console.log('Control registry result:', {
        dataLength: registryData?.length || 0,
        error: registryError,
        sampleData: registryData?.slice(0, 2)
      });
      
      if (registryError) throw registryError;
      res.json(registryData || []);
    } else {
      if (catalogueError) throw catalogueError;
      res.json(catalogueData || []);
    }
  } catch (err) {
    console.error('Controls API error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Endpoint to check and seed controls if needed
router.post('/seed-nn', requireAuth, async (req, res) => {
  try {
    console.log('=== SEED NN CONTROLS DEBUG ===');
    console.log('Seeding NN controls for org:', req.orgId);
    
    const { data, error } = await supabaseAdmin.rpc('seed_nn_controls_for_org', { org_uuid: req.orgId });
    
    console.log('Seed NN controls result:', {
      data,
      error
    });
    
    if (error) throw error;
    res.json({ message: 'NN controls seeded successfully', data });
  } catch (err) {
    console.error('Seed NN controls error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Debug endpoint to check all control-related tables
router.get('/debug', requireAuth, async (req, res) => {
  try {
    console.log('=== CONTROLS DEBUG ENDPOINT ===');
    console.log('Checking all control tables for org:', req.orgId);
    
    const results = {};
    
    // Check internal_control_catalogue table
    const { data: catalogueData, error: catalogueError } = await supabaseAdmin
      .from('internal_control_catalogue')
      .select('ctl_id, ctl_name, org_id')
      .eq('org_id', req.orgId)
      .limit(5);
    
    results.internal_control_catalogue = {
      count: catalogueData?.length || 0,
      error: catalogueError?.message,
      sample: catalogueData
    };
    
    // Check if there's a control_registry table with data
    const { data: registryData, error: registryError } = await supabaseAdmin
      .from('control_registry')
      .select('ctl_id, ctl_status, org_id')
      .eq('org_id', req.orgId)
      .limit(5);
    
    results.control_registry = {
      count: registryData?.length || 0,
      error: registryError?.message,
      sample: registryData
    };
    
    console.log('Control tables debug results:', results);
    res.json(results);
  } catch (err) {
    console.error('Controls debug error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/compliance-tags', requireAuth, async (req, res) => {
  try {
    console.log('Fetching compliance tags for org:', req.orgId);
    const { data, error } = await supabaseAdmin
      .from('compliance')
      .select('compliance_id')
      .eq('org_id', req.orgId);
    
    if (error) {
      console.error('Compliance tags error:', error);
      throw error;
    }
    
    console.log('Compliance tags data:', data);
    res.json((data || []).map(item => item.compliance_id));
  } catch (err) {
    console.error('Error fetching compliance tags:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };
    
    // Check if control with same ctl_id already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('internal_control_catalogue')
      .select('id')
      .eq('ctl_id', payload.ctl_id)
      .eq('org_id', req.orgId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw checkError;
    }
    
    if (existing) {
      return res.status(409).json({ 
        message: 'Control with this CTL ID already exists',
        existingId: existing.id
      });
    }
    
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating control:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const payloads = req.body.map(c => ({ ...c, user_id: req.userId, org_id: req.orgId }));
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .insert(payloads)
      .select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('internal_control_catalogue')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export const controlsRouter = router;
