import { describe, expect, it } from 'vitest';
import { TimeBalanceController } from './TimeBalanceController';

describe('TimeBalanceController', () => {
  it('shows premium', () => {
    const displayEl: any = { style: { display: 'none', color: '' }, innerText: '' };
    const profileEl: any = { innerText: '' };
    const btnAdd: any = { style: { display: 'block' } };
    const storage: any = {
      getItem: (k: string) => {
        if (k === 'premiumUntil') return (Date.now() + 60_000).toString();
        if (k === 'userSessionId') return 'u';
        if (k === 'playTimeBalance') return '0';
        return null;
      },
      setItem: () => {},
      removeItem: () => {}
    };

    const c = new TimeBalanceController({ displayEl, profileBalanceEl: profileEl, btnAddTimeEl: btnAdd, storage });
    c.update();

    expect(displayEl.innerText).toContain('Premium');
    expect(btnAdd.style.display).toBe('none');
  });
});

