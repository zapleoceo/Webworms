import { expect, test } from 'vitest';
import { runAivaiKpi } from './aivai_kpi';

test('aivai KPI (node harness)', { timeout: 60000 }, () => {
  const r = runAivaiKpi();
  console.log(JSON.stringify(r));
  expect(r.dmgRate).toBeGreaterThanOrEqual(0.5);
  expect(r.goalRate).toBeGreaterThanOrEqual(0.8);
});
