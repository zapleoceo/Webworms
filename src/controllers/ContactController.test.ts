import { describe, expect, it, vi } from 'vitest';
import { ContactController } from './ContactController';
import { APIClient } from '../network/APIClient';

describe('ContactController', () => {
  it('validates empty message', async () => {
    const modalEl: any = { style: { display: 'none' } };
    const messageEl: any = { value: '   ' };
    const btnSend: any = { innerText: 'SEND', disabled: false, addEventListener: (_: string, cb: any) => { btnSend._cb = cb; } };
    const alertFn = vi.fn();

    const c = new ContactController(modalEl, messageEl, null, null, btnSend, () => null, alertFn);
    c.init();

    await btnSend._cb();
    expect(alertFn).toHaveBeenCalled();
  });

  it('sends message and clears input on success', async () => {
    const modalEl: any = { style: { display: 'flex' } };
    const messageEl: any = { value: 'hi' };
    const btnSend: any = { innerText: 'SEND', disabled: false, addEventListener: (_: string, cb: any) => { btnSend._cb = cb; } };
    const alertFn = vi.fn();

    vi.spyOn(APIClient, 'sendContactMessage').mockResolvedValueOnce({ success: true } as any);

    const c = new ContactController(modalEl, messageEl, null, null, btnSend, () => 't', alertFn);
    c.init();

    await btnSend._cb();
    expect(messageEl.value).toBe('');
    expect(modalEl.style.display).toBe('none');
  });
});

