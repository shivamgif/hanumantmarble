// Run: node lib/payroll-statutory.test.mjs (also picked up by npm test)
import assert from 'node:assert/strict';
import { assertBalanced } from './accounts.mjs';
import { payrollLines, statutoryDeductions } from './payroll-statutory.mjs';

// ₹18,000 salary, full month, ₹1,000 overtime, PF and ESI both apply.
const a = statutoryDeductions({ salary: 18000, earnedBase: 18000, overtimePay: 1000, pfApplicable: true, esiApplicable: true });
assert.equal(a.gross, 19000);
assert.equal(a.pfWages, 15000);              // capped
assert.equal(a.pfEmployee, 1800);            // 12% of 15,000
assert.equal(a.eps, 1250);                   // 8.33% of 15,000 = 1,249.5 → 1,250
assert.equal(a.pfEmployerEpf, 550);          // 1,800 − 1,250
assert.equal(a.edli, 75);
assert.equal(a.pfAdmin, 75);
assert.equal(a.esiCovered, true);
assert.equal(a.esiWages, 19000);             // overtime counts for ESI
assert.equal(a.esiEmployee, 143);            // 0.75% = 142.5 → up to 143
assert.equal(a.esiEmployer, 618);            // 3.25% = 617.5 → 618
assert.equal(a.netPayable, 19000 - 1800 - 143);
assert.equal(a.employerCost, 550 + 1250 + 75 + 75 + 618);

// Above the ESI ceiling: no ESI. Half a month: PF on what was earned.
const b = statutoryDeductions({ salary: 30000, earnedBase: 12000, pfApplicable: true, esiApplicable: true, tdsMonthly: 500 });
assert.deepEqual([b.esiCovered, b.esiEmployee, b.pfWages, b.pfEmployee, b.tds, b.netPayable], [false, 0, 12000, 1440, 500, 12000 - 1440 - 500]);

// Opted out of both: pay is untouched; TDS never takes pay below zero.
const c = statutoryDeductions({ salary: 10000, earnedBase: 300, pfApplicable: false, esiApplicable: false, tdsMonthly: 1000 });
assert.deepEqual([c.pfEmployee, c.esiEmployee, c.employerCost, c.tds, c.netPayable], [0, 0, 0, 300, 0]);

// The payroll entry balances.
const ledgers = { salaries: 1, employer_pf_esi: 2, pf_payable: 3, esi_payable: 4, tds_192: 5, salaries_payable: 6 };
const lines = payrollLines([a, b, c], ledgers);
assertBalanced(lines);
assert.equal(lines.find((l) => l.ledgerId === 1).amount, 19000 + 12000 + 300);
assert.equal(lines.find((l) => l.ledgerId === 3).amount, -(1800 + 550 + 1250 + 75 + 75 + 1440 + 1440 + 0 + 60 + 60));
assert.equal(lines.find((l) => l.ledgerId === 5).amount, -800);

console.log('payroll-statutory: all checks passed');
