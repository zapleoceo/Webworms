import { APIClient } from '../network/APIClient';
import type { StorageLike } from './TimeBalanceController';
import type { TimeBalanceController } from './TimeBalanceController';

type API = {
  getProfile: typeof APIClient.getProfile;
  login: typeof APIClient.login;
  register: typeof APIClient.register;
  updateProfile: typeof APIClient.updateProfile;
  updatePassword: typeof APIClient.updatePassword;
};

export class AuthController {
  private authScreen: HTMLElement;
  private profileScreen: HTMLElement;
  private btnOpenAuth: HTMLElement;
  private btnUserProfile: HTMLElement;
  private btnCloseAuth: HTMLElement;
  private btnCloseProfile: HTMLElement;
  private btnLogout: HTMLElement;
  private btnSaveProfile: HTMLElement;

  private profileUsernameInput: HTMLInputElement;
  private profilePasswordInput: HTMLInputElement;
  private authEmailInput: HTMLInputElement;
  private authUsernameInput: HTMLInputElement;
  private authPasswordInput: HTMLInputElement;
  private authToggleText: HTMLElement;
  private authTitle: HTMLElement;
  private btnSubmitAuth: HTMLButtonElement;

  private timeBalance: TimeBalanceController;
  private storage: StorageLike;
  private api: API;
  private alertFn: (msg: string) => void;
  private getRef: () => string | undefined;
  private onSessionChanged: (sessionId: string | null, sessionName: string | null, balanceSeconds: number) => void;

  private isLoginMode = true;

  constructor(params: {
    authScreen: HTMLElement;
    profileScreen: HTMLElement;
    btnOpenAuth: HTMLElement;
    btnUserProfile: HTMLElement;
    btnCloseAuth: HTMLElement;
    btnCloseProfile: HTMLElement;
    btnLogout: HTMLElement;
    btnSaveProfile: HTMLElement;
    profileUsernameInput: HTMLInputElement;
    profilePasswordInput: HTMLInputElement;
    authEmailInput: HTMLInputElement;
    authUsernameInput: HTMLInputElement;
    authPasswordInput: HTMLInputElement;
    authToggleText: HTMLElement;
    authTitle: HTMLElement;
    btnSubmitAuth: HTMLButtonElement;
    timeBalance: TimeBalanceController;
    storage: StorageLike;
    api?: API;
    alertFn?: (msg: string) => void;
    getRef?: () => string | undefined;
    onSessionChanged: (sessionId: string | null, sessionName: string | null, balanceSeconds: number) => void;
  }) {
    this.authScreen = params.authScreen;
    this.profileScreen = params.profileScreen;
    this.btnOpenAuth = params.btnOpenAuth;
    this.btnUserProfile = params.btnUserProfile;
    this.btnCloseAuth = params.btnCloseAuth;
    this.btnCloseProfile = params.btnCloseProfile;
    this.btnLogout = params.btnLogout;
    this.btnSaveProfile = params.btnSaveProfile;

    this.profileUsernameInput = params.profileUsernameInput;
    this.profilePasswordInput = params.profilePasswordInput;
    this.authEmailInput = params.authEmailInput;
    this.authUsernameInput = params.authUsernameInput;
    this.authPasswordInput = params.authPasswordInput;
    this.authToggleText = params.authToggleText;
    this.authTitle = params.authTitle;
    this.btnSubmitAuth = params.btnSubmitAuth;

    this.timeBalance = params.timeBalance;
    this.storage = params.storage;
    this.api = params.api || APIClient;
    this.alertFn = params.alertFn || ((msg) => alert(msg));
    this.getRef = params.getRef || (() => undefined);
    this.onSessionChanged = params.onSessionChanged;
  }

  init() {
    this.btnCloseAuth.addEventListener('click', () => {
      this.authScreen.classList.remove('active');
      this.authScreen.style.display = 'none';
    });

    this.btnCloseProfile.addEventListener('click', () => {
      this.profileScreen.classList.remove('active');
      this.profileScreen.style.display = 'none';
    });

    this.btnOpenAuth.addEventListener('click', () => {
      this.authScreen.style.display = '';
      this.authScreen.classList.add('active');
    });

    this.btnUserProfile.addEventListener('click', () => {
      this.profileScreen.style.display = '';
      this.profileScreen.classList.add('active');
      this.profileUsernameInput.value = this.storage.getItem('userSessionName') || '';
      this.timeBalance.update();
    });

    this.btnLogout.addEventListener('click', () => this.logout());
    this.btnSaveProfile.addEventListener('click', () => this.saveProfile());
    this.authToggleText.addEventListener('click', () => this.toggleAuthMode());
    this.btnSubmitAuth.addEventListener('click', () => this.submitAuth());

    this.restoreSessionUI();
    this.refreshProfileIfLoggedIn();
  }

  logout() {
    this.storage.removeItem('userSessionId');
    this.storage.removeItem('userSessionName');
    this.storage.removeItem('userBalanceSeconds');
    this.storage.removeItem('playTimeBalance');
    this.storage.removeItem('premiumUntil');

    this.btnUserProfile.style.display = 'none';
    this.btnOpenAuth.style.display = 'block';
    this.profileScreen.style.display = 'none';

    this.onSessionChanged(null, null, 0);
    this.timeBalance.update();
  }

  async refreshProfileIfLoggedIn() {
    const sessionId = this.storage.getItem('userSessionId');
    if (!sessionId) return;
    const res = await this.api.getProfile(sessionId);
    if (!res.success || !res.user) return;

    this.storage.setItem('userSessionName', res.user.username || res.user.email.split('@')[0]);
    this.storage.setItem('userBalanceSeconds', res.user.play_time_balance.toString());
    this.storage.setItem('playTimeBalance', res.user.play_time_balance.toString());
    if (res.user.premium_until) {
      this.storage.setItem('premiumUntil', res.user.premium_until.toString());
    } else {
      this.storage.removeItem('premiumUntil');
    }

    const name = this.storage.getItem('userSessionName');
    const bal = parseInt(this.storage.getItem('userBalanceSeconds') || '0');
    this.onSessionChanged(sessionId, name, bal);
    this.applyLoggedInUI(name);
    this.timeBalance.update();
  }

  private restoreSessionUI() {
    const sessionId = this.storage.getItem('userSessionId');
    const sessionName = this.storage.getItem('userSessionName');
    const bal = parseInt(this.storage.getItem('userBalanceSeconds') || '3600');

    this.onSessionChanged(sessionId, sessionName, bal);

    if (sessionId && sessionName) {
      this.applyLoggedInUI(sessionName);
      this.timeBalance.update();
      return;
    }

    this.btnUserProfile.style.display = 'none';
    this.btnOpenAuth.style.display = 'block';
  }

  private applyLoggedInUI(name: string | null) {
    this.btnOpenAuth.style.display = 'none';
    this.btnUserProfile.style.display = 'block';
    this.btnUserProfile.innerText = (name || 'USER').toUpperCase();
  }

  private toggleAuthMode() {
    this.isLoginMode = !this.isLoginMode;
    this.authTitle.innerText = this.isLoginMode ? 'LOGIN' : 'REGISTER';
    this.authUsernameInput.style.display = this.isLoginMode ? 'none' : 'block';
    this.btnSubmitAuth.innerText = this.isLoginMode ? 'ENTER THE ARENA' : 'REGISTER NOW';
    this.authToggleText.innerText = this.isLoginMode
      ? 'Need an account? Register here.'
      : 'Already have an account? Login here.';
  }

  private async saveProfile() {
    const newName = this.profileUsernameInput.value.trim();
    const newPassword = this.profilePasswordInput ? this.profilePasswordInput.value : '';

    if (!newName && !newPassword) {
      this.profileScreen.classList.remove('active');
      return;
    }

    const sessionId = this.storage.getItem('userSessionId');
    if (!sessionId) return;

    if (newName) {
      const res = await this.api.updateProfile(sessionId, newName);
      if (res.success) {
        const sessionName = res.username;
        this.storage.setItem('userSessionName', sessionName || '');
        this.btnUserProfile.innerText = (sessionName || 'USER').toUpperCase();
        const bal = parseInt(this.storage.getItem('userBalanceSeconds') || '0');
        this.onSessionChanged(sessionId, sessionName, bal);
      } else {
        this.alertFn(res.error || 'Failed to update username');
      }
    }

    if (newPassword) {
      const res = await this.api.updatePassword(sessionId, newPassword);
      if (res.success) {
        this.alertFn('Password updated successfully.');
      } else {
        this.alertFn(res.error || 'Failed to update password');
      }
      this.profilePasswordInput.value = '';
    }

    this.profileScreen.classList.remove('active');
  }

  private async submitAuth() {
    const email = this.authEmailInput.value;
    const username = this.authUsernameInput.value;
    const password = this.authPasswordInput.value;

    if (!email || !password || (!this.isLoginMode && !username)) {
      this.alertFn('Please fill in all required fields!');
      return;
    }

    const originalText = this.btnSubmitAuth.innerText;
    this.btnSubmitAuth.innerText = 'CONNECTING...';
    this.btnSubmitAuth.disabled = true;

    try {
      const ref = this.getRef();
      const res = this.isLoginMode
        ? await this.api.login(email, password)
        : await this.api.register(email, username, password, ref);

      if (!res.success) {
        this.alertFn('Authentication failed: ' + (res.error || 'Unknown error'));
        return;
      }

      if (!this.isLoginMode) {
        this.alertFn('Registration successful! Please login.');
        this.toggleAuthMode();
        return;
      }

      const sessionId = res.token;
      const sessionName = res.user.username;
      const balanceSeconds = res.user.play_time_balance || 3600;

      this.storage.setItem('userSessionId', sessionId || '');
      this.storage.setItem('userSessionName', sessionName || '');
      this.storage.setItem('playTimeBalance', balanceSeconds.toString());
      this.storage.setItem('userBalanceSeconds', balanceSeconds.toString());
      this.storage.setItem('premiumUntil', res.user.premium_until?.toString() || '0');

      this.authScreen.style.display = 'none';
      this.applyLoggedInUI(sessionName);
      this.onSessionChanged(sessionId, sessionName, balanceSeconds);
      this.timeBalance.update();
    } catch {
      this.alertFn('Network error during authentication');
    } finally {
      this.btnSubmitAuth.innerText = originalText;
      this.btnSubmitAuth.disabled = false;
    }
  }
}

