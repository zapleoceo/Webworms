import { APIClient } from '../network/APIClient';

export class ContactController {
  private modalEl: HTMLElement;
  private messageEl: HTMLTextAreaElement;
  private btnOpen: HTMLElement | null;
  private btnClose: HTMLElement | null;
  private btnSend: HTMLButtonElement | null;
  private getToken: () => string | null;
  private alertFn: (msg: string) => void;

  constructor(
    modalEl: HTMLElement,
    messageEl: HTMLTextAreaElement,
    btnOpen: HTMLElement | null,
    btnClose: HTMLElement | null,
    btnSend: HTMLButtonElement | null,
    getToken: () => string | null,
    alertFn: (msg: string) => void = (msg) => alert(msg),
  ) {
    this.modalEl = modalEl;
    this.messageEl = messageEl;
    this.btnOpen = btnOpen;
    this.btnClose = btnClose;
    this.btnSend = btnSend;
    this.getToken = getToken;
    this.alertFn = alertFn;
  }

  init() {
    this.btnOpen?.addEventListener('click', () => {
      this.modalEl.style.display = 'flex';
    });

    this.btnClose?.addEventListener('click', () => {
      this.modalEl.style.display = 'none';
    });

    this.btnSend?.addEventListener('click', async () => {
      const msg = this.messageEl.value.trim();
      if (!msg) {
        this.alertFn('Please enter a message first!');
        return;
      }

      const btn = this.btnSend!;
      const originalText = btn.innerText;
      btn.innerText = 'SENDING...';
      btn.disabled = true;

      try {
        const token = this.getToken();
        const res = await APIClient.sendContactMessage(msg, token);
        if (res.success) {
          this.alertFn('Message sent successfully! Thank you for your feedback.');
          this.modalEl.style.display = 'none';
          this.messageEl.value = '';
        } else {
          this.alertFn('Failed to send message: ' + (res.error || 'Unknown error'));
        }
      } catch (e: any) {
        this.alertFn('Error sending message: ' + e.message);
      } finally {
        btn.innerText = originalText;
        btn.disabled = false;
      }
    });
  }
}
