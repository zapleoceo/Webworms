import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './AuthController';
import { TimeBalanceController } from './TimeBalanceController';

function makeEl() {
  return { style: { display: '' }, classList: { add: vi.fn(), remove: vi.fn() }, addEventListener: vi.fn(), innerText: '' } as any;
}

describe('AuthController', () => {
  it('logs in and stores session', async () => {
    const storageData: Record<string, string> = {};
    const storage: any = {
      getItem: (k: string) => storageData[k] ?? null,
      setItem: (k: string, v: string) => { storageData[k] = v; },
      removeItem: (k: string) => { delete storageData[k]; }
    };

    const timeBalance = new TimeBalanceController({ displayEl: null, profileBalanceEl: null, btnAddTimeEl: null, storage });
    vi.spyOn(timeBalance, 'update').mockImplementation(() => {});

    const api: any = {
      getProfile: vi.fn(),
      login: vi.fn(async () => ({ success: true, token: 't', user: { username: 'bob', play_time_balance: 3600, premium_until: 0 } })),
      register: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn()
    };

    const authScreen = makeEl();
    const profileScreen = makeEl();
    const btnOpenAuth = makeEl();
    const btnUserProfile = makeEl();
    const btnCloseAuth = makeEl();
    const btnCloseProfile = makeEl();
    const btnLogout = makeEl();
    const btnSaveProfile = makeEl();

    const profileUsernameInput: any = { value: '' };
    const profilePasswordInput: any = { value: '' };
    const authEmailInput: any = { value: 'a@b.c' };
    const authUsernameInput: any = { value: '' , style: { display: '' } };
    const authPasswordInput: any = { value: 'p' };
    const authToggleText = makeEl();
    const authTitle = makeEl();
    const btnSubmitAuth: any = { innerText: 'ENTER THE ARENA', disabled: false, addEventListener: vi.fn() };

    let submitCb: any;
    btnSubmitAuth.addEventListener.mockImplementation((_ev: string, cb: any) => { submitCb = cb; });

    const onSessionChanged = vi.fn();
    const alertFn = vi.fn();

    const c = new AuthController({
      authScreen,
      profileScreen,
      btnOpenAuth,
      btnUserProfile,
      btnCloseAuth,
      btnCloseProfile,
      btnLogout,
      btnSaveProfile,
      profileUsernameInput,
      profilePasswordInput,
      authEmailInput,
      authUsernameInput,
      authPasswordInput,
      authToggleText,
      authTitle,
      btnSubmitAuth,
      timeBalance,
      storage,
      api,
      alertFn,
      onSessionChanged
    });
    c.init();

    await submitCb();

    expect(storage.getItem('userSessionId')).toBe('t');
    expect(storage.getItem('userSessionName')).toBe('bob');
    expect(onSessionChanged).toHaveBeenCalledWith('t', 'bob', 3600);
  });

  it('clears invalid stored session on profile refresh', async () => {
    const storageData: Record<string, string> = {
      userSessionId: 'bad_token',
      userSessionName: 'bob',
      userBalanceSeconds: '3600'
    };
    const storage: any = {
      getItem: (k: string) => storageData[k] ?? null,
      setItem: (k: string, v: string) => { storageData[k] = v; },
      removeItem: (k: string) => { delete storageData[k]; }
    };

    const timeBalance = new TimeBalanceController({ displayEl: null, profileBalanceEl: null, btnAddTimeEl: null, storage });
    vi.spyOn(timeBalance, 'update').mockImplementation(() => {});

    const api: any = {
      getProfile: vi.fn(async () => ({ success: false, error: 'Invalid session' })),
      login: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn()
    };

    const authScreen = makeEl();
    const profileScreen = makeEl();
    const btnOpenAuth = makeEl();
    const btnUserProfile = makeEl();
    const btnCloseAuth = makeEl();
    const btnCloseProfile = makeEl();
    const btnLogout = makeEl();
    const btnSaveProfile = makeEl();

    const profileUsernameInput: any = { value: '' };
    const profilePasswordInput: any = { value: '' };
    const authEmailInput: any = { value: '' };
    const authUsernameInput: any = { value: '', style: { display: '' } };
    const authPasswordInput: any = { value: '' };
    const authToggleText = makeEl();
    const authTitle = makeEl();
    const btnSubmitAuth: any = { innerText: 'ENTER THE ARENA', disabled: false, addEventListener: vi.fn() };

    const onSessionChanged = vi.fn();

    const c = new AuthController({
      authScreen,
      profileScreen,
      btnOpenAuth,
      btnUserProfile,
      btnCloseAuth,
      btnCloseProfile,
      btnLogout,
      btnSaveProfile,
      profileUsernameInput,
      profilePasswordInput,
      authEmailInput,
      authUsernameInput,
      authPasswordInput,
      authToggleText,
      authTitle,
      btnSubmitAuth,
      timeBalance,
      storage,
      api,
      onSessionChanged
    });
    c.init();

    await c.refreshProfileIfLoggedIn();

    expect(storage.getItem('userSessionId')).toBe(null);
    expect(btnOpenAuth.style.display).toBe('block');
    expect(btnUserProfile.style.display).toBe('none');
  });
});
