import { supabaseAdmin } from '../src/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function fixCustomControlType() {
  try {
    console.log('Updating database constraint to allow Custom control type...');
    
    // Drop the existing constraint
    const { error: dropError } = await supabaseAdmin.rpc('exec_sql', {
      sql: 'ALTER TABLE control_registry DROP CONSTRAINT IF EXISTS control_registry_ctl_type_check'
    });
    
    if (dropError) {
      console.error('Error dropping constraint:', dropError);
      // Try alternative approach
      console.log('Trying alternative approach...');
    }
    
    // Add the updated constraint
    const { error: addError } = await supabaseAdmin.rpc('exec_sql', {
      sql: "ALTER TABLE control_registry ADD CONSTRAINT control_registry_ctl_type_check CHECK (ctl_type IN ('NN', 'Regulatory', 'Standard', 'Custom'))"
    });
    
    if (addError) {
      console.error('Error adding constraint:', addError);
      throw addError;
    }
    
    console.log('Successfully updated database constraint to allow Custom control type!');
    console.log('Custom controls can now be stored directly in the database.');
    
  } catch (error) {
    console.error('Failed to update database constraint:', error);
    console.log('\nManual SQL to run in Supabase SQL Editor:');
    console.log('ALTER TABLE control_registry DROP CONSTRAINT IF EXISTS control_registry_ctl_type_check;');
    console.log("ALTER TABLE control_registry ADD CONSTRAINT control_registry_ctl_type_check CHECK (ctl_type IN ('NN', 'Regulatory', 'Standard', 'Custom'));");
  }
}

fixCustomControlType();
