import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // try root .env first
dotenv.config(); // then current .env

const client = new Client({
  connectionString: "postgresql://postgres:IS9oJqnV5NgU7ZUp@db.xuqtcrdwbgnqxllhjpri.supabase.co:5432/postgres",
});

async function checkSchema() {
  try {
    await client.connect();
    console.log("Connected to DB");
    
    for (const table of ['assets', 'asset_relationships', 'vulnerability_management']) {
      console.log(`\nColumns for ${table}:`);
      const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      console.table(res.rows);
    }
  } catch (err) {
    console.error("Error checking schema:", err);
  } finally {
    await client.end();
  }
}

checkSchema();
