import { APIClient } from '../network/APIClient';
import 'cropperjs/dist/cropper.css';
import Cropper from 'cropperjs';
import '../styles/admin.css';

export class AdminPanel {
  private adminHeaders = new Headers();

  private cropper: Cropper | null = null;

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
              <button id="nav-logos" class="admin-nav-btn">Airdrop Logos</button>
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
            <section id="section-logos" class="admin-section">
              <div class="section-header">
                <h2>Airdrop Logos</h2>
                <button id="load-logos" class="secondary-btn small-btn">Refresh</button>
              </div>
              <div class="upload-logo-form" style="margin-bottom: 20px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                <h3>Upload New Logo</h3>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                  <input type="file" id="logo-file" accept="image/png, image/jpeg, image/webp" style="color: white;">
                  <input type="number" id="logo-width" placeholder="Width (px)" value="100" class="retro-input" style="width: 100px; padding: 5px;">
                  <input type="number" id="logo-height" placeholder="Height (px)" value="60" class="retro-input" style="width: 100px; padding: 5px;">
                  <input type="number" id="logo-hardness" placeholder="Hardness" value="10" class="retro-input" style="width: 100px; padding: 5px;">
                  <button id="upload-logo-btn" class="primary-btn small-btn" disabled>Crop & Upload</button>
                </div>
                
                <!-- Cropper UI Container (Hidden by default) -->
                <div id="cropper-container" style="display: none; margin-top: 15px; background: #222; padding: 10px; border-radius: 5px; text-align: center;">
                  <div style="max-height: 400px; max-width: 100%; overflow: hidden; margin-bottom: 10px;">
                    <img id="cropper-image" src="" style="max-width: 100%;">
                  </div>
                  <button id="confirm-crop-btn" class="primary-btn small-btn" style="background: #4CAF50;">Confirm & Upload</button>
                  <button id="cancel-crop-btn" class="secondary-btn small-btn" style="background: #f44336;">Cancel</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Size</th>
                      <th>Hardness</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="logos-list-body">
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
    document.getElementById('nav-logos')?.addEventListener('click', (e) => {
      this.switchTab('logos', e.target as HTMLElement);
      this.loadLogosData();
    });
    document.getElementById('load-logos')?.addEventListener('click', () => this.loadLogosData());
    
    // Cropper & Logo Upload Events
    const fileInput = document.getElementById('logo-file') as HTMLInputElement;
    const uploadBtn = document.getElementById('upload-logo-btn') as HTMLButtonElement;
    
    fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));
    uploadBtn?.addEventListener('click', () => this.openCropper());
    document.getElementById('confirm-crop-btn')?.addEventListener('click', () => this.confirmCropAndUpload());
    document.getElementById('cancel-crop-btn')?.addEventListener('click', () => this.closeCropper());
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
    this.adminHeaders.set('X-Admin-Password', encodeURIComponent(pass));
    
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
    tbody.innerHTML = users.map((u: any) => {
      // Supabase uses 'id' usually, but might be '_id' or something else depending on the backend implementation.
      // Let's fallback gracefully if id is missing or named differently.
      const userId = u.id || u._id || 'unknown';
      return `
      <tr>
        <td class="id-col" title="${userId}">${String(userId).substring(0, 8)}...</td>
        <td>${u.email}</td>
        <td>${u.username}</td>
        <td>
          <span class="status-badge ${u.is_active ? 'active' : 'inactive'}">
            ${u.is_active ? 'Verified' : 'Pending'}
          </span>
        </td>
        <td>
          <input type="number" class="retro-input balance-input" data-id="${userId}" value="${u.play_time_balance}" style="width: 80px;">
          <button class="secondary-btn small-btn add-time-btn" data-id="${userId}">+ Time</button>
        </td>
        <td>
          <label class="cb-container">
            <input type="checkbox" class="access-cb" data-id="${userId}" ${u.access_allowed ? 'checked' : ''}> Allow
          </label>
          <label class="cb-container">
            <input type="checkbox" class="admin-cb" data-id="${userId}" ${u.is_admin ? 'checked' : ''}> Admin
          </label>
        </td>
        <td>
          <button class="save-user-btn secondary-btn small-btn" data-id="${userId}">Save</button>
          <button class="delete-user-btn danger-btn small-btn" data-id="${userId}" style="margin-left: 5px;">Delete</button>
        </td>
      </tr>
    `}).join('');

    this.bindDynamicEvents();
  }

  private bindDynamicEvents() {
    // Bind save buttons
    document.querySelectorAll('.save-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.saveUser(e));
    });

    // Bind user delete buttons
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteUser(e));
    });

    // Bind add time buttons
    document.querySelectorAll('.add-time-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.addTime(e));
    });

    // Bind logo delete buttons
    document.querySelectorAll('.delete-logo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteLogo(e));
    });
  }

  private async addTime(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    const minutesStr = prompt('Enter minutes to add (can be negative):', '60');
    if (!minutesStr) return;

    const minutes = parseInt(minutesStr);
    if (isNaN(minutes)) {
      alert('Invalid number');
      return;
    }

    try {
      const res = await fetch(APIClient.BASE_URL + '/admin/users/time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({ id, delta_seconds: minutes * 60 })
      });
      
      if (res.ok) {
        this.loadUsersData();
      } else {
        const err = await res.json();
        alert('Failed to add time: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error');
    }
  }

  private async deleteUser(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to completely delete this user?')) return;

    try {
      const res = await fetch(APIClient.BASE_URL + `/admin/users?id=${id}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        }
      });
      if (res.ok) {
        this.loadUsersData();
      } else {
        alert('Failed to delete user');
      }
    } catch (err) {
      alert('Network error');
    }
  }

  // --- LOGOS MANAGEMENT ---

  private async loadLogosData() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/logos');
      if (!res.ok) throw new Error('Failed to fetch logos');
      
      const logos = await res.json();
      this.renderLogosTable(logos);
    } catch (e) {
      console.error(e);
      alert('Error loading logos');
    }
  }

  private renderLogosTable(logos: any[]) {
    const tbody = document.getElementById('logos-list-body');
    if (!tbody) return;

    if (logos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No logos uploaded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logos.map(logo => `
      <tr>
        <td><img src="${logo.image_data}" alt="Logo" style="max-width: 60px; max-height: 60px; object-fit: contain; background: rgba(255,255,255,0.1); border-radius: 4px; padding: 2px;"></td>
        <td>${logo.width}x${logo.height} px</td>
        <td>${logo.hardness}</td>
        <td>
          <button class="danger-btn small-btn delete-logo-btn" data-id="${logo.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    this.bindDynamicEvents();
  }

  private handleFileSelect(e: Event) {
    const fileInput = e.target as HTMLInputElement;
    const uploadBtn = document.getElementById('upload-logo-btn') as HTMLButtonElement;
    
    if (fileInput.files && fileInput.files.length > 0) {
      uploadBtn.disabled = false;
    } else {
      uploadBtn.disabled = true;
    }
  }

  private openCropper() {
    const fileInput = document.getElementById('logo-file') as HTMLInputElement;
    const cropperContainer = document.getElementById('cropper-container') as HTMLElement;
    const cropperImage = document.getElementById('cropper-image') as HTMLImageElement;
    
    const file = fileInput.files?.[0];
    if (!file) {
      alert('Please select an image file first');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      cropperImage.src = e.target?.result as string;
      cropperContainer.style.display = 'block';
      
      // Initialize Cropper.js
      if (this.cropper) {
        this.cropper.destroy();
      }
      
      // Destroy previous instance to avoid bugs
      this.cropper = new Cropper(cropperImage, {
        viewMode: 1,
        dragMode: 'crop',
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
      });
      
      // Scroll to cropper
      cropperContainer.scrollIntoView({ behavior: 'smooth' });
    };
    reader.readAsDataURL(file);
  }

  private closeCropper() {
    const cropperContainer = document.getElementById('cropper-container') as HTMLElement;
    cropperContainer.style.display = 'none';
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  private async confirmCropAndUpload() {
    if (!this.cropper) return;

    // Get cropped canvas. Important: set format to png to preserve transparency
    const canvas = this.cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!canvas) {
      alert('Could not crop the image');
      return;
    }

    const base64Data = canvas.toDataURL('image/png');
    this.uploadCroppedImage(base64Data);
  }

  private async uploadCroppedImage(base64Data: string) {
    const widthInput = document.getElementById('logo-width') as HTMLInputElement;
    const heightInput = document.getElementById('logo-height') as HTMLInputElement;
    const hardnessInput = document.getElementById('logo-hardness') as HTMLInputElement;
    
    const confirmBtn = document.getElementById('confirm-crop-btn') as HTMLButtonElement;
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = 'Uploading...';
    confirmBtn.disabled = true;

    try {
      const res = await fetch(APIClient.BASE_URL + '/admin/logos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({
          image_data: base64Data,
          width: parseInt(widthInput.value) || 100,
          height: parseInt(heightInput.value) || 60,
          hardness: parseInt(hardnessInput.value) || 10
        })
      });

      if (res.ok) {
        alert('Logo cropped and uploaded successfully!');
        const fileInput = document.getElementById('logo-file') as HTMLInputElement;
        fileInput.value = ''; // clear
        (document.getElementById('upload-logo-btn') as HTMLButtonElement).disabled = true;
        this.closeCropper();
        this.loadLogosData();
      } else {
        const err = await res.json();
        alert('Failed to upload logo: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error while uploading logo');
    } finally {
      confirmBtn.innerText = originalText;
      confirmBtn.disabled = false;
    }
  }

  private async deleteLogo(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this logo?')) return;

    try {
      const res = await fetch(APIClient.BASE_URL + `/admin/logos?id=${id}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        }
      });
      if (res.ok) {
        this.loadLogosData();
      } else {
        alert('Failed to delete logo');
      }
    } catch (err) {
      alert('Network error');
    }
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
      body: JSON.stringify({ id, access_allowed: cb.checked ? 1 : 0, is_admin: adminCb.checked ? 1 : 0 })
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
