export function debitLocalPlayTimeForMatch(mode: string): void {
  if (mode === 'training' || mode === 'aivai') return;
  const premiumStr = localStorage.getItem('premiumUntil');
  let isPremium = false;
  if (premiumStr) {
    const premiumUntil = parseInt(premiumStr);
    if (premiumUntil > Date.now()) isPremium = true;
  }
  if (isPremium) return;
  let balance = parseInt(localStorage.getItem('playTimeBalance') || '0');
  balance = Math.max(0, balance - 1);
  localStorage.setItem('playTimeBalance', balance.toString());
}

