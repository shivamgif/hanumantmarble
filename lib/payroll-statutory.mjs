// PF, ESI and salary TDS on a month's pay. Pure — no db/session imports — so
// lib/payroll-statutory.test.mjs pins it.
//
// Rates and ceilings in one block for the CA to check. The whole salary is
// treated as PF wages (payroll has no basic/allowance split); overtime is
// not PF wages but is ESI wages, as the Acts define them.
export const STATUTORY = {
  pfWageCeiling: 15000,     // EPF/EPS wage ceiling per month
  pfEmployeeRate: 0.12,     // employee EPF
  pfEmployerRate: 0.12,     // employer total: EPS 8.33% (on wages up to the ceiling) + EPF the rest
  epsRate: 0.0833,
  edliRate: 0.005,          // employer, on wages up to the ceiling
  pfAdminRate: 0.005,       // employer EPF admin charges
  esiWageCeiling: 21000,    // covered while the monthly salary is at most this
  esiEmployeeRate: 0.0075,
  esiEmployerRate: 0.0325,
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const rupee = (n) => Math.round(Number(n) || 0);          // EPFO rounds to the rupee
const rupeeUp = (n) => Math.ceil(r2(Number(n) || 0));     // ESIC rounds up to the next rupee

/**
 * salary: contracted monthly salary; earnedBase/overtimePay: this month's
 * (monthlyPay in lib/attendance.mjs). Returns the deductions, the employer's
 * share, and what reaches the employee.
 */
export function statutoryDeductions({ salary, earnedBase, overtimePay = 0, pfApplicable, esiApplicable, tdsMonthly = 0, rates = STATUTORY }) {
  const gross = r2(Number(earnedBase) + Number(overtimePay));
  const pfWages = pfApplicable ? Math.min(Number(earnedBase) || 0, rates.pfWageCeiling) : 0;
  const pfEmployee = rupee(pfWages * rates.pfEmployeeRate);
  const eps = rupee(pfWages * rates.epsRate);
  const pfEmployerEpf = rupee(pfWages * rates.pfEmployerRate) - eps;
  const edli = rupee(pfWages * rates.edliRate);
  const pfAdmin = rupee(pfWages * rates.pfAdminRate);

  const esiCovered = Boolean(esiApplicable) && Number(salary) > 0 && Number(salary) <= rates.esiWageCeiling;
  const esiWages = esiCovered ? gross : 0;
  const esiEmployee = esiCovered ? rupeeUp(esiWages * rates.esiEmployeeRate) : 0;
  const esiEmployer = esiCovered ? rupeeUp(esiWages * rates.esiEmployerRate) : 0;

  const tds = Math.min(r2(tdsMonthly), Math.max(0, r2(gross - pfEmployee - esiEmployee)));
  return {
    gross,
    pfWages: r2(pfWages),
    pfEmployee,
    eps,
    pfEmployerEpf,
    edli,
    pfAdmin,
    esiCovered,
    esiWages,
    esiEmployee,
    esiEmployer,
    tds,
    employerCost: pfEmployerEpf + eps + edli + pfAdmin + esiEmployer,
    netPayable: r2(gross - pfEmployee - esiEmployee - tds),
  };
}

/**
 * The month's payroll entry (lines in the books' signs, debit +). rows are
 * statutoryDeductions() results. Accounts: salaries (gross), employer's
 * PF/ESI (expense), PF and ESI payable (both shares), salary TDS payable,
 * salaries payable (net).
 */
export function payrollLines(rows, ledgers) {
  const total = (key) => r2(rows.reduce((acc, row) => acc + Number(row[key] || 0), 0));
  const pfPayable = total('pfEmployee') + total('pfEmployerEpf') + total('eps') + total('edli') + total('pfAdmin');
  const lines = [
    { ledgerId: ledgers.salaries, amount: total('gross') },
    { ledgerId: ledgers.employer_pf_esi, amount: total('employerCost') },
    { ledgerId: ledgers.pf_payable, amount: -r2(pfPayable) },
    { ledgerId: ledgers.esi_payable, amount: -r2(total('esiEmployee') + total('esiEmployer')) },
    { ledgerId: ledgers.tds_192, amount: -total('tds') },
    { ledgerId: ledgers.salaries_payable, amount: -total('netPayable') },
  ];
  return lines.filter((line) => r2(line.amount) !== 0);
}
