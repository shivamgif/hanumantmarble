// Checks that CSV exports walk every server page instead of just the visible one.
import assert from 'node:assert';
import { fetchAllPages } from '../app/stock/lib/stock-utils.js';

const makeServer = (total) => async ({ page, pageSize }) => ({
  dispatches: Array.from(
    { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
    (_, i) => ({ id: (page - 1) * pageSize + i })
  ),
  total,
});

assert.strictEqual((await fetchAllPages(makeServer(0), 'dispatches')).length, 0);
assert.strictEqual((await fetchAllPages(makeServer(25), 'dispatches')).length, 25);
assert.strictEqual((await fetchAllPages(makeServer(200), 'dispatches')).length, 200);
assert.strictEqual((await fetchAllPages(makeServer(503), 'dispatches')).length, 503);

// No `total` in the response must still terminate on the first short page.
const rows = await fetchAllPages(async ({ page }) => ({
  dispatches: page === 1 ? Array.from({ length: 200 }, (_, i) => ({ id: i })) : [{ id: 200 }],
}), 'dispatches');
assert.strictEqual(rows.length, 201);

console.log('export paging OK');
