import { APIClient } from '../network/APIClient';

export class PaymentController {
  private hasRendered = false;
  private onPaymentUpdated?: () => void;
  private selectedPlanId: 'premium_7d_1' | 'premium_30d_5' = 'premium_7d_1';
  private boundUI = false;

  constructor(onPaymentUpdated?: () => void) {
    this.onPaymentUpdated = onPaymentUpdated;
  }

  openPaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'flex';
    this.ensureDonateUIBound();
    this.applyPlanSelection(this.selectedPlanId, false);
    this.renderPayPalButton();
  }

  closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'none';
  }

  private renderPayPalButton() {
    const buttonContainer = document.getElementById('payment-container');
    if (!buttonContainer) return;

    buttonContainer.innerHTML = '';
    this.hasRendered = false;

    const paypalAny = (globalThis as any).paypal;
    if (!paypalAny) {
      buttonContainer.innerHTML = `
      <div style="text-align: center; color: #ff3333; padding: 20px;">
        <h3 class="comic-text">Payment Gateway Blocked</h3>
        <p>Your browser or AdBlocker is blocking the secure payment window.</p>
        <p style="margin-top: 10px; color: #000;">Please temporarily pause your AdBlocker on this site and reload the page to purchase extra time.</p>
      </div>
    `;
      return;
    }

    if (this.hasRendered) return;

    try {
      const onPaymentUpdated = this.onPaymentUpdated;
      const planId = this.selectedPlanId;
      paypalAny.Buttons({
        createOrder: async function() {
          const sessionId = localStorage.getItem('userSessionId') || '';
          const res = await APIClient.createPayPalOrder(sessionId, planId);
          if (!res?.success || !res?.orderID) {
            throw new Error(res?.error || 'Failed to create order');
          }
          return res.orderID;
        },
        onApprove: async function(data: any) {
          const sessionId = localStorage.getItem('userSessionId') || '';
          const res = await APIClient.capturePayPalOrder(sessionId, data.orderID, planId);
          if (res?.success) {
            alert('Thank you! Premium activated.');
            if (res.premium_until) localStorage.setItem('premiumUntil', res.premium_until.toString());
            if (onPaymentUpdated) onPaymentUpdated();
            const modal = document.getElementById('payment-modal');
            if (modal) modal.style.display = 'none';
            return;
          }
          alert(res?.error ? `Payment failed: ${res.error}` : 'Payment failed');
        }
      }).render('#payment-container');

      this.hasRendered = true;
    } catch(e) {
      console.error("PayPal failed to load", e);
    }
  }

  private ensureDonateUIBound() {
    if (this.boundUI) return;
    this.boundUI = true;

    const closeBtn = document.getElementById('btn-close-payment');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closePaymentModal());

    const plansWrap = document.getElementById('donate-plans');
    const plans: HTMLButtonElement[] = plansWrap?.querySelectorAll
      ? Array.from(plansWrap.querySelectorAll<HTMLButtonElement>('.donate-plan'))
      : [];
    plans.forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = (btn.dataset.plan || 'premium_7d_1') as any;
        this.applyPlanSelection(plan, true);
        this.renderPayPalButton();
      });
    });
  }

  private applyPlanSelection(planId: 'premium_7d_1' | 'premium_30d_5', persist: boolean) {
    this.selectedPlanId = planId;
    if (persist) {
      try {
        localStorage.setItem('ww_donate_plan', planId);
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem('ww_donate_plan') as any;
        if (saved === 'premium_7d_1' || saved === 'premium_30d_5') this.selectedPlanId = saved;
      } catch {}
    }

    const plansWrap = document.getElementById('donate-plans');
    const plans: HTMLButtonElement[] = plansWrap?.querySelectorAll
      ? Array.from(plansWrap.querySelectorAll<HTMLButtonElement>('.donate-plan'))
      : [];
    plans.forEach((btn) => btn.classList.toggle('is-selected', btn.dataset.plan === this.selectedPlanId));
  }
}
