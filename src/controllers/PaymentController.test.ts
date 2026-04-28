import { describe, expect, it } from 'vitest';
import { PaymentController } from './PaymentController';

describe('PaymentController', () => {
  it('shows fallback when paypal is missing', () => {
    const elements: Record<string, any> = {
      'payment-modal': { style: { display: 'none' } },
      'payment-container': { innerHTML: '' }
    };
    (globalThis as any).document = {
      getElementById: (id: string) => elements[id] ?? null
    };
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {}
    };
    (globalThis as any).paypal = undefined;

    const controller = new PaymentController();
    controller.openPaymentModal();

    expect(elements['payment-modal'].style.display).toBe('flex');
    expect(elements['payment-container'].innerHTML).toContain('Payment Gateway Blocked');
  });
});
