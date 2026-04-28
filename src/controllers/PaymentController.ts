import { APIClient } from '../network/APIClient';

export class PaymentController {
  private hasRendered = false;
  private onPaymentUpdated?: () => void;

  constructor(onPaymentUpdated?: () => void) {
    this.onPaymentUpdated = onPaymentUpdated;
  }

  openPaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'flex';
    this.renderPayPalButton();
  }

  closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'none';
  }

  private renderPayPalButton() {
    const buttonContainer = document.getElementById('payment-container');
    if (!buttonContainer) return;

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
    if (buttonContainer.innerHTML !== '') return;

    try {
      const onPaymentUpdated = this.onPaymentUpdated;
      paypalAny.Buttons({
        createOrder: function(_data: any, actions: any) {
          return actions.order.create({
            purchase_units: [{
              amount: { value: '1.00', currency_code: 'USD' },
              description: '7 Days Unlimited Play Time'
            }]
          });
        },
        onApprove: function(data: any, actions: any) {
          return actions.order.capture().then(function(_details: any) {
            const sessionId = localStorage.getItem('userSessionId');
            return fetch(APIClient.BASE_URL + '/payment/paypal/capture', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
              },
              body: JSON.stringify({ orderID: data.orderID })
            }).then(res => res.json()).then((res: any) => {
              if (res.success) {
                alert('Payment successful! You now have 7 Days of Unlimited Play Time.');
                localStorage.setItem('premiumUntil', res.premium_until.toString());
                if (onPaymentUpdated) onPaymentUpdated();
                document.getElementById('payment-modal')!.style.display = 'none';
              } else {
                alert('Verification failed: ' + res.error);
              }
            });
          });
        }
      }).render('#payment-container');

      this.hasRendered = true;
    } catch(e) {
      console.error("PayPal failed to load", e);
    }
  }
}
