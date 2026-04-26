/**
 * One-time fix: bag/adhesive stock items that were created before the inbound-shipments
 * route bug-fix had division_id = NULL. This script sets their division_id to "Adhesive"
 * (or whatever division name matches their type category) where possible.
 *
 * Safe to re-run — uses ON CONFLICT / WHERE conditions.
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  // Find the Adhesive division id
  const [adhesiveDiv] = await sql`SELECT id FROM stock_divisions WHERE name = 'Adhesive' LIMIT 1`;
  if (!adhesiveDiv) {
    console.error('No "Adhesive" division found. Run the multi-division migration first.');
    process.exit(1);
  }
  const adhesiveDivId = adhesiveDiv.id;
  console.log(`Adhesive division id: ${adhesiveDivId}`);

  // Update bag-type stock items (unit_of_measure = 'bag') that have no division
  const updated = await sql`
    UPDATE stock_items
    SET division_id = ${adhesiveDivId}
    WHERE unit_of_measure = 'bag'
      AND division_id IS NULL
    RETURNING id, name
  `;

  if (updated.length === 0) {
    console.log('No bag items with null division found. Nothing to do.');
  } else {
    console.log(`Fixed ${updated.length} bag item(s):`);
    updated.forEach((r) => console.log(`  id=${r.id}  name=${r.name}`));
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
