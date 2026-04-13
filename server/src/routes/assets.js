import { Router } from 'express';



import { supabaseAdmin } from '../supabase.js';



import { requireAuth } from '../middleware/auth.js';







const router = Router();







router.get('/', requireAuth, async (req, res) => {
  try {
    console.log(`=== FETCHING ALL ASSETS ===`);
    let allAssets = [];
    let hasMore = true;
    let offset = 0;
    const pageSize = 1000; // Use Supabase's max page size efficiently
    
    while (hasMore) {
      console.log(`Fetching batch: offset ${offset}, limit ${pageSize}`);
      
      const { data, error } = await supabaseAdmin
        .from('assets')
        .select('*')
        .eq('org_id', req.orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1); // Use range instead of limit for better control
        
      if (error) {
        console.error('Error fetching batch:', error);
        throw error;
      }
      
      if (data && data.length > 0) {
        allAssets.push(...data);
        console.log(`Fetched ${data.length} assets, total so far: ${allAssets.length}`);
        
        // If we got less than pageSize, we're done
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`=== FETCH COMPLETE ===`);
    console.log(`Total assets fetched: ${allAssets.length}`);
    
    res.json(allAssets);
  } catch (err) {
    console.error('Error in assets endpoint:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST endpoint to create a new asset
router.post('/', requireAuth, async (req, res) => {

  try {



    // governed_status and nn_controls are auto-computed by DB triggers — strip them



    const { governed_status, nn_controls, ...body } = req.body;



    const payload = { ...body, user_id: req.userId, org_id: req.orgId };



    



    // Log to ensure physical_location is being received



    console.log('Creating asset with payload:', {



      ...payload,



      physical_location: payload.physical_location || 'NOT_PROVIDED'



    });



    



    const { data, error } = await supabaseAdmin.from('assets').insert(payload).select().single();



    if (error) {



      console.error('Error creating asset:', error);



      throw error;



    }



    console.log('Asset created successfully:', data);



    res.status(201).json(data);



  } catch (err) {



    console.error('Asset creation error:', err);



    res.status(500).json({ message: err.message });



  }



});







router.post('/bulk', requireAuth, async (req, res) => {



  try {



    const assets = req.body;



    



    // If payload is small, use direct insertion



    if (assets.length <= 200) {



      const payloads = assets.map(({ governed_status, nn_controls, ...a }) => ({ ...a, user_id: req.userId, org_id: req.orgId }));



      const { data, error } = await supabaseAdmin.from('assets').insert(payloads).select();



      if (error) throw error;



      res.status(201).json(data || []);



      return;



    }



    



    // For large payloads, process in optimized chunks with parallel processing
    const CHUNK_SIZE = 500; // Increased chunk size for better performance
    const MAX_PARALLEL_CHUNKS = 3; // Process up to 3 chunks in parallel
    const results = [];
    const errors = [];
    
    console.log(`=== OPTIMIZED BULK INSERT ===`);
    console.log(`Processing ${assets.length} assets in chunks of ${CHUNK_SIZE}`);
    console.log(`Max parallel chunks: ${MAX_PARALLEL_CHUNKS}`);
    
    // Process chunks in parallel batches for better performance
    for (let i = 0; i < assets.length; i += CHUNK_SIZE * MAX_PARALLEL_CHUNKS) {
      const parallelChunks = [];
      
      // Prepare parallel chunks
      for (let j = 0; j < MAX_PARALLEL_CHUNKS && (i + j * CHUNK_SIZE) < assets.length; j++) {
        const chunkStart = i + j * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, assets.length);
        const chunk = assets.slice(chunkStart, chunkEnd);
        
        parallelChunks.push({
          chunkIndex: Math.floor(chunkStart / CHUNK_SIZE) + 1,
          startIndex: chunkStart,
          endIndex: chunkEnd - 1,
          data: chunk.map(({ governed_status, nn_controls, ...a }) => ({ 
            ...a, 
            user_id: req.userId, 
            org_id: req.orgId 
          }))
        });
      }
      
      // Process chunks in parallel
      const chunkPromises = parallelChunks.map(async ({ chunkIndex, startIndex, endIndex, data }) => {
        try {
          console.log(`Processing chunk ${chunkIndex}: items ${startIndex}-${endIndex}`);
          const { data: insertData, error } = await supabaseAdmin.from('assets').insert(data).select();
          if (error) throw error;
          console.log(`Chunk ${chunkIndex} completed: ${insertData?.length || 0} items inserted`);
          return { success: true, chunkIndex, data: insertData || [], count: insertData?.length || 0 };
        } catch (chunkError) {
          console.error(`Error processing chunk ${chunkIndex}:`, chunkError);
          return { 
            success: false, 
            chunkIndex, 
            error: chunkError.message,
            startIndex, 
            endIndex 
          };
        }
      });
      
      // Wait for all parallel chunks to complete
      const chunkResults = await Promise.all(chunkPromises);
      
      // Process results
      chunkResults.forEach(result => {
        if (result.success) {
          results.push(...result.data);
        } else {
          errors.push({
            chunk: result.chunkIndex,
            error: result.error,
            startIndex: result.startIndex,
            endIndex: result.endIndex
          });
        }
      });
      
      console.log(`Parallel batch completed: ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks successful`);
    } 



    res.status(201).json({
      success: true,



      inserted: results.length,



      total: assets.length,



      errors: errors.length,



      errorDetails: errors,



      data: results



    });



  } catch (err) {



    console.error('Bulk upload error:', err);



    res.status(500).json({ message: err.message });



  }



});







router.put('/:id', requireAuth, async (req, res) => {



  try {



    // governed_status and nn_controls are auto-computed by DB triggers — strip them



    const { governed_status, nn_controls, ...body } = req.body;



    console.log('Updating asset with ID:', req.params.id, 'Payload:', body);







    const { data, error } = await supabaseAdmin



      .from('assets')



      .update(body)



      .eq('id', req.params.id)



      .select()



      .single();



    



    if (error) {



      console.error('Error updating asset:', error);



      throw error;



    }



    



    console.log('Asset updated successfully:', data);



    res.json(data);



  } catch (err) {



    console.error('Asset update error:', err);



    res.status(500).json({ message: err.message });



  }



});







// Bulk delete assets



router.delete('/bulk', requireAuth, async (req, res) => {



  try {



    const { ids } = req.body;



    



    if (!ids || !Array.isArray(ids) || ids.length === 0) {



      return res.status(400).json({ message: 'Invalid asset IDs provided' });



    }







    console.log(`Starting bulk delete of ${ids.length} assets`);







    // Process in chunks to avoid HTTP header overflow



    const CHUNK_SIZE = 50; // Safe chunk size to avoid header limits



    let totalDeleted = 0;



    let errors = [];







    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {



      const chunkIds = ids.slice(i, i + CHUNK_SIZE);



      const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;



      



      try {



        console.log(`Processing chunk ${chunkIndex}: ${chunkIds.length} assets`);







        // First, get assets in this chunk to collect their asset_ids



        const { data: assets, error: fetchError } = await supabaseAdmin



          .from('assets')



          .select('id, asset_id')



          .in('id', chunkIds)



          .eq('org_id', req.orgId);







        if (fetchError) throw fetchError;



        



        if (!assets || assets.length === 0) {



          console.log(`No assets found in chunk ${chunkIndex}`);



          continue;



        }







        const assetIds = assets.map(asset => asset.asset_id);



        console.log(`Found ${assets.length} assets to delete in chunk ${chunkIndex}`);







        // Delete relationships for this chunk



        if (assetIds.length > 0) {



          const relationshipQuery = assetIds.map(id => `'${id}'`).join(',');



          const { error: relationshipError } = await supabaseAdmin



            .from('asset_relationships')



            .delete()



            .or(`source_asset_id.in.(${relationshipQuery}),target_asset_id.in.(${relationshipQuery})`);







          if (relationshipError) {



            console.error(`Error deleting relationships in chunk ${chunkIndex}:`, relationshipError);



            throw new Error(`Failed to delete asset relationships: ${relationshipError.message}`);



          }



        }







        // Delete vulnerabilities for this chunk



        if (assetIds.length > 0) {



          const { error: vulnerabilityError } = await supabaseAdmin



            .from('vulnerability_management')



            .delete()



            .in('asset_id', assetIds);







          if (vulnerabilityError) {



            console.error(`Error deleting vulnerabilities in chunk ${chunkIndex}:`, vulnerabilityError);



            console.log(`Warning: Could not delete vulnerabilities in chunk ${chunkIndex}, continuing with asset deletion`);



          }



        }







        // Delete assets in this chunk



        const { error: deleteError } = await supabaseAdmin



          .from('assets')



          .delete()



          .in('id', chunkIds);







        if (deleteError) {



          console.error(`Error deleting assets in chunk ${chunkIndex}:`, deleteError);



          throw new Error(`Failed to delete assets: ${deleteError.message}`);



        }







        totalDeleted += assets.length;



        console.log(`Successfully deleted ${assets.length} assets in chunk ${chunkIndex}`);







      } catch (chunkError) {



        console.error(`Error processing chunk ${chunkIndex}:`, chunkError);



        errors.push({



          chunk: chunkIndex,



          error: chunkError.message,



          startIndex: i,



          endIndex: Math.min(i + CHUNK_SIZE - 1, ids.length - 1)



        });



      }



    }







    if (errors.length > 0) {



      console.error(`Bulk delete completed with ${errors.length} chunk errors. ${totalDeleted}/${ids.length} assets deleted.`);



      return res.status(207).json({ 



        message: `Partial success: ${totalDeleted}/${ids.length} assets deleted. ${errors.length} chunks failed.`,



        deleted: totalDeleted,



        total: ids.length,



        errors: errors



      });



    }







    console.log(`Successfully deleted all ${totalDeleted} assets`);



    res.status(204).send();



  } catch (err) {



    console.error('Error in bulk delete assets:', err);



    res.status(500).json({ message: err.message });



  }



});







router.delete('/:id', requireAuth, async (req, res) => {



  try {



    const assetId = req.params.id;



    console.log('Attempting to delete asset with ID:', assetId);



    



    // First, get the asset to check if it exists and get its asset_id



    const { data: asset, error: fetchError } = await supabaseAdmin



      .from('assets')



      .select('id, asset_id')



      .eq('id', assetId)



      .single();



    



    if (fetchError) {



      console.error('Error fetching asset:', fetchError);



      throw fetchError;



    }



    



    if (!asset) {



      return res.status(404).json({ message: 'Asset not found' });



    }



    



    console.log('Found asset:', asset);



    



    // Delete all relationships where this asset is either source or target (using asset_id)



    const { data: deletedRelationships, error: relationshipError } = await supabaseAdmin



      .from('asset_relationships')



      .delete()



      .or(`source_asset_id.eq.${asset.asset_id},target_asset_id.eq.${asset.asset_id}`)



      .select();



    



    if (relationshipError) {



      console.error('Error deleting asset relationships:', relationshipError);



      throw new Error(`Failed to delete asset relationships: ${relationshipError.message}`);



    } else {



      console.log('Successfully deleted asset relationships:', deletedRelationships?.length || 0, 'relationships');



    }



    



    // Delete vulnerabilities that reference this asset (using asset_id)



    const { data: deletedVulnerabilities, error: vulnerabilityError } = await supabaseAdmin



      .from('vulnerability_management')



      .delete()



      .eq('asset_id', asset.asset_id)



      .select();



    



    if (vulnerabilityError) {



      console.error('Error deleting associated vulnerabilities:', vulnerabilityError);



      // Continue with asset deletion even if vulnerability deletion fails



      console.log('Warning: Could not delete vulnerabilities, continuing with asset deletion');



    } else {



      console.log('Successfully deleted associated vulnerabilities:', deletedVulnerabilities?.length || 0, 'vulnerabilities');



    }



    



    // Finally, delete the asset itself (using id)



    const { error } = await supabaseAdmin



      .from('assets')



      .delete()



      .eq('id', assetId);



    



    if (error) {



      console.error('Error deleting asset:', error);



      throw new Error(`Failed to delete asset: ${error.message}`);



    }



    



    console.log('Successfully deleted asset');



    res.status(204).send();



  } catch (err) {



    console.error('Error deleting asset:', err);



    res.status(500).json({ message: err.message });



  }



});







// Get asset relationships for diagram



router.get('/relationships', requireAuth, async (req, res) => {



  try {



    const { data, error } = await supabaseAdmin



      .from('asset_relationships')



      .select('*')



      .eq('org_id', req.orgId)



      .order('created_at', { ascending: false });



    if (error) throw error;



    res.json(data || []);



  } catch (err) {



    console.error('Error fetching relationships:', err);



    res.status(500).json({ message: err.message });



  }



});







// Create asset relationship



router.post('/relationships', requireAuth, async (req, res) => {



  try {



    const payload = {



      ...req.body,



      org_id: req.orgId,



      user_id: req.userId,



      created_at: new Date().toISOString(),



    };



    const { data, error } = await supabaseAdmin



      .from('asset_relationships')



      .insert(payload)



      .select()



      .single();



    if (error) throw error;



    res.status(201).json(data);



  } catch (err) {



    res.status(500).json({ message: err.message });



  }



});







// Update asset relationship



router.put('/relationships/:id', requireAuth, async (req, res) => {



  try {



    const { data, error } = await supabaseAdmin



      .from('asset_relationships')



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







// Bulk delete asset relationships - optimized for performance with parallel processing and progress tracking
router.delete('/relationships/bulk', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Invalid relationship IDs provided' });
    }

    console.log(`=== OPTIMIZED BULK RELATIONSHIP DELETE ===`);
    console.log(`Starting bulk delete of ${ids.length} asset relationships`);

    // For small payloads, use direct deletion
    if (ids.length <= 50) {
      console.log(`Small payload (${ids.length} items), using direct deletion`);
      const { error } = await supabaseAdmin
        .from('asset_relationships')
        .delete()
        .in('id', ids)
        .eq('org_id', req.orgId);

      if (error) throw error;
      console.log(`Successfully deleted all ${ids.length} relationships`);
      return res.status(204).send();
    }

    // For large payloads, process in optimized chunks with parallel processing
    const CHUNK_SIZE = 200; // Increased chunk size for better performance
    const MAX_PARALLEL_CHUNKS = 5; // Process up to 5 chunks in parallel
    let totalDeleted = 0;
    let errors = [];
    
    console.log(`Processing ${ids.length} relationships in chunks of ${CHUNK_SIZE}`);
    console.log(`Max parallel chunks: ${MAX_PARALLEL_CHUNKS}`);
    
    // Process chunks in parallel batches for better performance
    for (let i = 0; i < ids.length; i += CHUNK_SIZE * MAX_PARALLEL_CHUNKS) {
      const parallelChunks = [];
      
      // Prepare parallel chunks
      for (let j = 0; j < MAX_PARALLEL_CHUNKS && (i + j * CHUNK_SIZE) < ids.length; j++) {
        const chunkStart = i + j * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, ids.length);
        const chunkIds = ids.slice(chunkStart, chunkEnd);
        
        parallelChunks.push({
          chunkIndex: Math.floor(chunkStart / CHUNK_SIZE) + 1,
          startIndex: chunkStart,
          endIndex: chunkEnd - 1,
          ids: chunkIds
        });
      }
      
      // Process chunks in parallel
      const chunkPromises = parallelChunks.map(async ({ chunkIndex, startIndex, endIndex, ids: chunkIds }) => {
        try {
          console.log(`Processing relationship chunk ${chunkIndex}: items ${startIndex}-${endIndex} (${chunkIds.length} relationships)`);
          
          const { error } = await supabaseAdmin
            .from('asset_relationships')
            .delete()
            .in('id', chunkIds)
            .eq('org_id', req.orgId);

          if (error) throw error;
          
          console.log(`Relationship chunk ${chunkIndex} completed: ${chunkIds.length} items deleted`);
          return { 
            success: true, 
            chunkIndex, 
            deleted: chunkIds.length,
            progress: Math.round((totalDeleted + chunkIds.length) / ids.length * 100)
          };
        } catch (chunkError) {
          console.error(`Error processing relationship chunk ${chunkIndex}:`, chunkError);
          return { 
            success: false, 
            chunkIndex, 
            error: chunkError.message,
            startIndex, 
            endIndex 
          };
        }
      });
      
      // Wait for all parallel chunks to complete
      const chunkResults = await Promise.all(chunkPromises);
      
      // Process results and update progress
      chunkResults.forEach(result => {
        if (result.success) {
          totalDeleted += result.deleted;
        } else {
          errors.push({
            chunk: result.chunkIndex,
            error: result.error,
            startIndex: result.startIndex,
            endIndex: result.endIndex
          });
        }
      });
      
      // Calculate and log progress percentage
      const progressPercent = Math.round((totalDeleted / ids.length) * 100);
      console.log(`Progress: ${totalDeleted}/${ids.length} (${progressPercent}%) - ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks successful`);
    }

    if (errors.length > 0) {
      console.error(`Bulk relationship delete completed with ${errors.length} chunk errors. ${totalDeleted}/${ids.length} relationships deleted.`);
      return res.status(207).json({ 
        message: `Partial success: ${totalDeleted}/${ids.length} relationships deleted. ${errors.length} chunks failed.`,
        deleted: totalDeleted,
        total: ids.length,
        errors: errors
      });
    }

    console.log(`Successfully deleted all ${totalDeleted} relationships`);
    res.status(204).send();

  } catch (err) {
    console.error('Error in bulk delete relationships:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete asset relationship
router.delete('/relationships/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('asset_relationships')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);

    if (error) throw error;

    res.status(204).send();

  } catch (err) {
    console.error('Error deleting asset relationship:', err);
    res.status(500).json({ message: err.message });
  }
});

// Bulk create asset relationships - optimized for 1000+ records with progress tracking
router.post('/relationships/bulk', requireAuth, async (req, res) => {
  try {
    const relationships = req.body;
    
    if (!Array.isArray(relationships) || relationships.length === 0) {
      return res.status(400).json({ message: 'Invalid relationships data provided' });
    }

    console.log(`=== BULK RELATIONSHIP UPLOAD ===`);
    console.log(`Processing ${relationships.length} relationships`);

    // If payload is small, use direct insertion
    if (relationships.length <= 100) {
      const payloads = relationships.map(rel => ({
        ...rel,
        org_id: req.orgId,
        user_id: req.userId,
        created_at: new Date().toISOString()
      }));

      const { data, error } = await supabaseAdmin.from('asset_relationships').insert(payloads).select();
      if (error) throw error;
      
      res.status(201).json({
        success: true,
        inserted: data?.length || 0,
        total: relationships.length,
        data: data || []
      });
      return;
    }

    // For large payloads, process in optimized chunks with parallel processing
    const CHUNK_SIZE = 300; // Optimized for relationships (smaller than assets)
    const MAX_PARALLEL_CHUNKS = 4; // Can process more chunks in parallel for relationships
    const results = [];
    const errors = [];
    let processedCount = 0;
    
    console.log(`Processing ${relationships.length} relationships in chunks of ${CHUNK_SIZE}`);
    console.log(`Max parallel chunks: ${MAX_PARALLEL_CHUNKS}`);
    
    // Process chunks in parallel batches for better performance
    for (let i = 0; i < relationships.length; i += CHUNK_SIZE * MAX_PARALLEL_CHUNKS) {
      const parallelChunks = [];
      
      // Prepare parallel chunks
      for (let j = 0; j < MAX_PARALLEL_CHUNKS && (i + j * CHUNK_SIZE) < relationships.length; j++) {
        const chunkStart = i + j * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, relationships.length);
        const chunk = relationships.slice(chunkStart, chunkEnd);
        
        parallelChunks.push({
          chunkIndex: Math.floor(chunkStart / CHUNK_SIZE) + 1,
          startIndex: chunkStart,
          endIndex: chunkEnd - 1,
          data: chunk.map(rel => ({
            ...rel,
            org_id: req.orgId,
            user_id: req.userId,
            created_at: new Date().toISOString()
          }))
        });
      }
      
      // Process chunks in parallel
      const chunkPromises = parallelChunks.map(async ({ chunkIndex, startIndex, endIndex, data }) => {
        try {
          console.log(`Processing relationship chunk ${chunkIndex}: items ${startIndex}-${endIndex}`);
          const { data: insertData, error } = await supabaseAdmin.from('asset_relationships').insert(data).select();
          if (error) throw error;
          console.log(`Relationship chunk ${chunkIndex} completed: ${insertData?.length || 0} items inserted`);
          return { success: true, chunkIndex, data: insertData || [], count: insertData?.length || 0 };
        } catch (chunkError) {
          console.error(`Error processing relationship chunk ${chunkIndex}:`, chunkError);
          return { 
            success: false, 
            chunkIndex, 
            error: chunkError.message,
            startIndex, 
            endIndex 
          };
        }
      });
      
      // Wait for all parallel chunks to complete
      const chunkResults = await Promise.all(chunkPromises);
      
      // Process results and update progress
      chunkResults.forEach(result => {
        if (result.success) {
          results.push(...result.data);
          processedCount += result.count;
        } else {
          errors.push({
            chunk: result.chunkIndex,
            error: result.error,
            startIndex: result.startIndex,
            endIndex: result.endIndex
          });
        }
      });
      
      // Calculate and log progress percentage
      const progressPercent = Math.round((processedCount / relationships.length) * 100);
      console.log(`Progress: ${processedCount}/${relationships.length} (${progressPercent}%) - ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks successful`);
      
      console.log(`Parallel batch completed: ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks successful`);
    }

    res.status(201).json({
      success: true,
      inserted: results.length,
      total: relationships.length,
      errors: errors.length,
      errorDetails: errors,
      data: results
    });

  } catch (err) {
    console.error('Bulk relationship upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Bulk delete asset relationships - optimized for performance with parallel processing and progress tracking
router.delete('/relationships/bulk', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Invalid relationship IDs provided' });
    }

    console.log(`=== OPTIMIZED BULK RELATIONSHIP DELETE ===`);
    console.log(`Starting bulk delete of ${ids.length} asset relationships`);

    // For small payloads, use direct deletion
    if (ids.length <= 50) {
      console.log(`Small payload (${ids.length} items), using direct deletion`);
      const { error } = await supabaseAdmin
        .from('asset_relationships')
        .delete()
        .in('id', ids)
        .eq('org_id', req.orgId);

      if (error) throw error;
      console.log(`Successfully deleted all ${ids.length} relationships`);
      return res.status(204).send();
    }

    // For large payloads, process in optimized chunks with parallel processing
    const CHUNK_SIZE = 200; // Increased chunk size for better performance
    const MAX_PARALLEL_CHUNKS = 5; // Process up to 5 chunks in parallel
    let totalDeleted = 0;
    let errors = [];
    
    console.log(`Processing ${ids.length} relationships in chunks of ${CHUNK_SIZE}`);
    console.log(`Max parallel chunks: ${MAX_PARALLEL_CHUNKS}`);
    
    // Process chunks in parallel batches for better performance
    for (let i = 0; i < ids.length; i += CHUNK_SIZE * MAX_PARALLEL_CHUNKS) {
      const parallelChunks = [];
      
      // Prepare parallel chunks
      for (let j = 0; j < MAX_PARALLEL_CHUNKS && (i + j * CHUNK_SIZE) < ids.length; j++) {
        const chunkStart = i + j * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, ids.length);
        const chunkIds = ids.slice(chunkStart, chunkEnd);
        
        parallelChunks.push({
          chunkIndex: Math.floor(chunkStart / CHUNK_SIZE) + 1,
          startIndex: chunkStart,
          endIndex: chunkEnd - 1,
          ids: chunkIds
        });
      }
      
      // Process chunks in parallel
      const chunkPromises = parallelChunks.map(async ({ chunkIndex, startIndex, endIndex, ids: chunkIds }) => {
        try {
          console.log(`Processing relationship chunk ${chunkIndex}: items ${startIndex}-${endIndex} (${chunkIds.length} relationships)`);
          
          const { error } = await supabaseAdmin
            .from('asset_relationships')
            .delete()
            .in('id', chunkIds)
            .eq('org_id', req.orgId);

          if (error) throw error;
          
          console.log(`Relationship chunk ${chunkIndex} completed: ${chunkIds.length} items deleted`);
          return { 
            success: true, 
            chunkIndex, 
            deleted: chunkIds.length,
            progress: Math.round((totalDeleted + chunkIds.length) / ids.length * 100)
          };
        } catch (chunkError) {
          console.error(`Error processing relationship chunk ${chunkIndex}:`, chunkError);
          return { 
            success: false, 
            chunkIndex, 
            error: chunkError.message,
            startIndex, 
            endIndex 
          };
        }
      });
      
      // Wait for all parallel chunks to complete
      const chunkResults = await Promise.all(chunkPromises);
      
      // Process results and update progress
      chunkResults.forEach(result => {
        if (result.success) {
          totalDeleted += result.deleted;
        } else {
          errors.push({
            chunk: result.chunkIndex,
            error: result.error,
            startIndex: result.startIndex,
            endIndex: result.endIndex
          });
        }
      });
      
      // Calculate and log progress percentage
      const progressPercent = Math.round((totalDeleted / ids.length) * 100);
      console.log(`Progress: ${totalDeleted}/${ids.length} (${progressPercent}%) - ${chunkResults.filter(r => r.success).length}/${chunkResults.length} chunks successful`);
    }

    if (errors.length > 0) {
      console.error(`Bulk relationship delete completed with ${errors.length} chunk errors. ${totalDeleted}/${ids.length} relationships deleted.`);
      return res.status(207).json({ 
        message: `Partial success: ${totalDeleted}/${ids.length} relationships deleted. ${errors.length} chunks failed.`,
        deleted: totalDeleted,
        total: ids.length,
        errors: errors
      });
    }

    console.log(`Successfully deleted all ${totalDeleted} relationships`);
    res.status(204).send();

  } catch (err) {
    console.error('Error in bulk delete relationships:', err);
    res.status(500).json({ message: err.message });
  }
});

export const assetsRouter = router;
