import { Router } from 'express';

import { supabaseAdmin } from '../supabase.js';

import { requireAuth } from '../middleware/auth.js';



const router = Router();



router.get('/', requireAuth, async (req, res) => {

  try {

    const { data, error } = await supabaseAdmin

      .from('capability_register')

      .select('*')

      .eq('org_id', req.orgId)

      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);

  } catch (err) {

    res.status(500).json({ message: err.message });

  }

});



router.post('/', requireAuth, async (req, res) => {

  try {

    const payload = { ...req.body, user_id: req.userId, org_id: req.orgId };

    const { data, error } = await supabaseAdmin

      .from('capability_register')

      .insert(payload)

      .select()

      .single();

    if (error) throw error;

    res.status(201).json(data);

  } catch (err) {

    res.status(500).json({ message: err.message });

  }

});



// Bulk create capabilities - optimized for 1000+ records with progress tracking

router.post('/bulk', requireAuth, async (req, res) => {

  try {

    const capabilities = req.body;

    

    if (!Array.isArray(capabilities) || capabilities.length === 0) {

      return res.status(400).json({ message: 'Invalid capabilities data provided' });

    }



    console.log(`=== BULK CAPABILITY UPLOAD ===`);

    console.log(`Processing ${capabilities.length} capabilities`);



    // If payload is small, use direct insertion

    if (capabilities.length <= 100) {

      const payloads = capabilities.map(c => ({

        ...c,

        user_id: req.userId,

        org_id: req.orgId,

        created_at: new Date().toISOString()

      }));



      const { data, error } = await supabaseAdmin.from('capability_register').insert(payloads).select();

      if (error) throw error;

      

      res.status(201).json({

        success: true,

        inserted: data?.length || 0,

        total: capabilities.length,

        data: data || []

      });

      return;

    }



    // For large payloads, use individual inserts to avoid any timeout issues

    const results = [];

    const errors = [];

    let processedCount = 0;

    

    console.log(`Processing ${capabilities.length} capabilities individually to prevent timeouts`);

    

    // Process each capability individually for maximum reliability

    for (let i = 0; i < capabilities.length; i++) {

      const capability = capabilities[i];

      

      try {

        console.log(`Processing capability ${i + 1}/${capabilities.length}: ${capability.capab_name}`);

        

        // Prepare individual capability data

        const capabilityData = {

          ...capability,

          user_id: req.userId,

          org_id: req.orgId,

          created_at: new Date().toISOString()

        };

        

        // Insert individual capability

        const { data: insertData, error } = await supabaseAdmin

          .from('capability_register')

          .insert(capabilityData)

          .select();

        

        if (error) throw error;

        

        if (insertData && insertData.length > 0) {

          results.push(insertData[0]);

          processedCount++;

        }

        

        // Add delay between inserts to prevent database overload

        if (i < capabilities.length - 1) {

          await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay for faster processing

        }

        

      } catch (capabilityError) {

        console.error(`Error processing capability ${i + 1} (${capability.capab_name}):`, capabilityError);

        errors.push({

          index: i + 1,

          name: capability.capab_name,

          error: capabilityError.message

        });

      }

      

      // Log progress every 50 items

      if ((i + 1) % 50 === 0) {

        const progressPercent = Math.round(((i + 1) / capabilities.length) * 100);

        console.log(`Progress: ${i + 1}/${capabilities.length} (${progressPercent}%) - ${processedCount} inserted, ${errors.length} errors`);

      }

    }



    // Calculate and log final progress

    const progressPercent = Math.round((processedCount / capabilities.length) * 100);

    console.log(`Bulk upload completed: ${processedCount}/${capabilities.length} (${progressPercent}%) - ${errors.length} errors`);



    res.status(201).json({

      success: true,

      inserted: results.length,

      total: capabilities.length,

      errors: errors.length,

      errorDetails: errors,

      data: results

    });



  } catch (err) {

    console.error('Bulk capability upload error:', err);

    res.status(500).json({ message: err.message });

  }

});



router.put('/:id', requireAuth, async (req, res) => {

  try {

    const { data, error } = await supabaseAdmin

      .from('capability_register')

      .update(req.body)

      .eq('id', req.params.id)

      .eq('org_id', req.orgId)

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

      .from('capability_register')

      .delete()

      .eq('id', req.params.id)

      .eq('org_id', req.orgId);

    if (error) throw error;

    res.status(204).send();

  } catch (err) {

    res.status(500).json({ message: err.message });

  }

});



// Bulk delete capabilities - optimized for performance

router.post('/bulk-delete', requireAuth, async (req, res) => {

  try {

    const { ids } = req.body;

    

    if (!Array.isArray(ids) || ids.length === 0) {

      return res.status(400).json({ message: 'Invalid IDs provided' });

    }



    console.log(`=== BULK CAPABILITY DELETE ===`);

    console.log(`Deleting ${ids.length} capabilities`);



    // If payload is small, use direct deletion

    if (ids.length <= 100) {

      const { error } = await supabaseAdmin

        .from('capability_register')

        .delete()

        .in('id', ids)

        .eq('org_id', req.orgId);

      

      if (error) throw error;

      

      res.json({

        success: true,

        deleted: ids.length,

        total: ids.length

      });

      return;

    }



    // For large payloads, process in optimized batches

    const BATCH_SIZE = 500;

    let deletedCount = 0;

    let errors = [];

    

    console.log(`Processing ${ids.length} capabilities in batches of ${BATCH_SIZE}`);

    

    // Process in batches to avoid payload size issues

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {

      const batch = ids.slice(i, i + BATCH_SIZE);

      

      try {

        console.log(`Deleting batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} capabilities`);

        

        const { error } = await supabaseAdmin

          .from('capability_register')

          .delete()

          .in('id', batch)

          .eq('org_id', req.orgId);

        

        if (error) throw error;

        

        deletedCount += batch.length;

        console.log(`Batch completed: ${batch.length} capabilities deleted`);

        

      } catch (batchError) {

        console.error(`Error deleting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);

        errors.push({

          batch: Math.floor(i / BATCH_SIZE) + 1,

          error: batchError.message,

          batchSize: batch.length

        });

      }

    }



    console.log(`Bulk delete completed: ${deletedCount}/${ids.length} capabilities deleted`);



    res.json({

      success: errors.length === 0,

      deleted: deletedCount,

      total: ids.length,

      errors: errors.length,

      errorDetails: errors

    });



  } catch (err) {

    console.error('Bulk capability delete error:', err);

    res.status(500).json({ message: err.message });

  }

});



export const capabilitiesRouter = router;

