export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export class TimeBalanceController {
  private displayEl: HTMLElement | null;
  private profileBalanceEl: HTMLElement | null;
  private btnAddTimeEl: HTMLElement | null;
  private storage: StorageLike;

  constructor(params: {
    displayEl: HTMLElement | null;
    profileBalanceEl: HTMLElement | null;
    btnAddTimeEl: HTMLElement | null;
    storage: StorageLike;
  }) {
    this.displayEl = params.displayEl;
    this.profileBalanceEl = params.profileBalanceEl;
    this.btnAddTimeEl = params.btnAddTimeEl;
    this.storage = params.storage;
  }

  update() {
    const balanceStr = this.storage.getItem('playTimeBalance') || this.storage.getItem('userBalanceSeconds');
    const premiumStr = this.storage.getItem('premiumUntil');

    let hasPremium = false;
    if (premiumStr) {
      const premiumUntil = parseInt(premiumStr);
      if (premiumUntil > Date.now()) {
        hasPremium = true;
        if (this.displayEl) {
          this.displayEl.style.display = 'block';
          this.displayEl.innerText = 'Time: ∞ (Premium)';
          this.displayEl.style.color = '#ffeb3b';
        }
        if (this.profileBalanceEl) {
          this.profileBalanceEl.innerText = 'Play Time: ∞ (Premium)';
        }
        if (this.btnAddTimeEl) this.btnAddTimeEl.style.display = 'none';
      }
    }

    if (hasPremium) return;

    if (this.btnAddTimeEl && this.storage.getItem('userSessionId')) {
      this.btnAddTimeEl.style.display = 'block';
    } else if (this.btnAddTimeEl) {
      this.btnAddTimeEl.style.display = 'none';
    }

    if (balanceStr) {
      const seconds = parseInt(balanceStr);
      const hrs = Math.floor(Math.max(0, seconds) / 3600);
      const mins = Math.floor((Math.max(0, seconds) % 3600) / 60);

      const hh = hrs.toString().padStart(2, '0');
      const mm = mins.toString().padStart(2, '0');

      if (this.displayEl) {
        this.displayEl.style.display = 'block';
        this.displayEl.innerText = `Time: ${hh}:${mm}`;
        this.displayEl.style.color = 'white';
      }

      if (this.profileBalanceEl) {
        this.profileBalanceEl.innerText = `Play Time Balance: ${hh}:${mm}`;
      }
    } else if (this.displayEl) {
      this.displayEl.style.display = 'none';
    }
  }
}

