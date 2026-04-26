import { APIClient } from '../network/APIClient';
import '../styles/admin.css';

export class AdminPanel {
  private adminHeaders = new Headers();

  constructor() {
    this.renderInitialUI();
    this.bindEvents();
    this.checkSavedSession();
  }

  private checkSavedSession() {
    const savedEmail = localStorage.getItem('adminEmail');
    const savedPass = localStorage.getItem('adminPassword');
    
    if (savedEmail && savedPass) {
      (document.getElementById('admin-email') as HTMLInputElement).value = savedEmail;
      (document.getElementById('admin-password') as HTMLInputElement).value = savedPass;
      this.handleLogin();
    }
  }

  private renderInitialUI() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="admin-container">
        <div id="admin-auth" class="admin-auth-card">
          <h1>Worms Admin</h1>
          <input type="email" id="admin-email" class="retro-input" placeholder="Admin Email">
          <input type="password" id="admin-password" class="retro-input" placeholder="Admin Password">
          <button id="admin-login-btn" class="primary-btn">Login</button>
        </div>

        <div id="admin-dashboard" class="admin-dashboard-layout" style="display: none;">
          <aside class="admin-sidebar">
            <h2>Worms Admin</h2>
            <nav>
              <button id="nav-dashboard" class="admin-nav-btn active">Dashboard</button>
              <button id="nav-users" class="admin-nav-btn">Users Management</button>
              <button id="admin-logout-btn" class="admin-nav-btn danger">Logout</button>
            </nav>
          </aside>
          
          <main class="admin-main-content">
            <section id="section-dashboard" class="admin-section active">
              <h2>Dashboard Statistics</h2>
              <div class="stats-grid">
                <div class="stat-card">
                  <h3>Total Users</h3>
                  <p id="stat-total-users">Loading...</p>
                </div>
                <div class="stat-card">
                  <h3>Active Users</h3>
                  <p id="stat-active-users">Loading...</p>
                </div>
                <div class="stat-card">
                  <h3>Admins</h3>
                  <p id="stat-admins">Loading...</p>
                </div>
              </div>
            </section>

            <section id="section-users" class="admin-section">
              <div class="section-header">
                <h2>Users Management</h2>
                <button id="load-users" class="secondary-btn small-btn">Refresh</button>
              </div>
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Username</th>
                      <th>Active</th>
                      <th>Balance</th>
                      <th>Permissions</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="users-list-body">
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    `;
  }

  private bindEvents() {
    document.getElementById('admin-login-btn')?.addEventListener('click', () => this.handleLogin());
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => this.handleLogout());
    document.getElementById('load-users')?.addEventListener('click', () => this.loadUsersData());
    
    // Navigation
    document.getElementById('nav-dashboard')?.addEventListener('click', (e) => this.switchTab('dashboard', e.target as HTMLElement));
    document.getElementById('nav-users')?.addEventListener('click', (e) => {
      this.switchTab('users', e.target as HTMLElement);
      this.loadUsersData();
    });
  }

  private switchTab(tabId: string, btnElement: HTMLElement) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`section-${tabId}`)?.classList.add('active');
    btnElement.classList.add('active');
  }

  private handleLogin() {
    const email = (document.getElementById('admin-email') as HTMLInputElement).value;
    const pass = (document.getElementById('admin-password') as HTMLInputElement).value;
    
    if (!email || !pass) {
      alert("Please enter credentials");
      return;
    }
    
    this.adminHeaders.set('X-Admin-Email', email);
    this.adminHeaders.set('X-Admin-Password', pass);
    
    // Attempt to load stats/users to verify credentials
    this.loadUsersData().then(success => {
      if (success) {
        localStorage.setItem('adminEmail', email);
        localStorage.setItem('adminPassword', pass);
        document.getElementById('admin-auth')!.style.display = 'none';
        document.getElementById('admin-dashboard')!.style.display = 'flex';
      } else {
        localStorage.removeItem('adminEmail');
        localStorage.removeItem('adminPassword');
      }
    });
  }

  private handleLogout() {
    this.adminHeaders = new Headers();
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('adminPassword');
    document.getElementById('admin-dashboard')!.style.display = 'none';
    document.getElementById('admin-auth')!.style.display = 'block';
    (document.getElementById('admin-password') as HTMLInputElement).value = '';
  }

  private async loadUsersData(): Promise<boolean> {
    try {
      const res = await fetch(APIClient.BASE_URL + '/admin/users', { headers: this.adminHeaders });
      
      if (!res.ok) {
        if (res.status === 401) {
          alert("Unauthorized! Incorrect admin credentials or user is not an admin.");
          this.handleLogout();
        } else {
          alert(`Error loading users: ${res.statusText}`);
        }
        return false;
      }
      
      const users = await res.json();
      this.renderUsersTable(users);
      this.updateStatistics(users);
      return true;
      
    } catch (e) {
      alert('Network error while loading admin data.');
      return false;
    }
  }

  private updateStatistics(users: any[]) {
    const total = users.length;
    const active = users.filter(u => u.is_active).length;
    const admins = users.filter(u => u.is_admin).length;
    
    document.getElementById('stat-total-users')!.innerText = total.toString();
    document.getElementById('stat-active-users')!.innerText = active.toString();
    document.getElementById('stat-admins')!.innerText = admins.toString();
  }

  private renderUsersTable(users: any[]) {
    const tbody = document.getElementById('users-list-body')!;
    tbody.innerHTML = users.map((u: any) => `
      <tr>
        <td class="id-col" title="${u.id}">${u.id.substring(0, 8)}...</td>
        <td>${u.email}</td>
        <td>${u.username}</td>
        <td>
          <span class="status-badge ${u.is_active ? 'active' : 'inactive'}">
            ${u.is_active ? 'Verified' : 'Pending'}
          </span>
        </td>
        <td>${Math.floor(u.play_time_balance / 60)}m</td>
        <td>
          <label class="cb-container">
            <input type="checkbox" class="access-cb" data-id="${u.id}" ${u.access_allowed ? 'checked' : ''}> Allow
          </label>
          <label class="cb-container">
            <input type="checkbox" class="admin-cb" data-id="${u.id}" ${u.is_admin ? 'checked' : ''}> Admin
          </label>
        </td>
        <td>
          <button class="save-user-btn secondary-btn small-btn" data-id="${u.id}">Save</button>
        </td>
      </tr>
    `).join('');

    // Bind save buttons
    document.querySelectorAll('.save-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.saveUser(e));
    });
  }

  private async saveUser(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    const cb = document.querySelector(`.access-cb[data-id="${id}"]`) as HTMLInputElement;
    const adminCb = document.querySelector(`.admin-cb[data-id="${id}"]`) as HTMLInputElement;
    
    const saveRes = await fetch(APIClient.BASE_URL + '/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      },
      body: JSON.stringify({ id, access_allowed: cb.checked, is_admin: adminCb.checked })
    });
    
    if (!saveRes.ok) {
      alert('Failed to save! Unauthorized.');
    } else {
      const btn = e.target as HTMLButtonElement;
      const originalText = btn.innerText;
      btn.innerText = 'Saved!';
      btn.style.backgroundColor = '#4CAF50';
      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.backgroundColor = '';
      }, 2000);
    }
  }
}
