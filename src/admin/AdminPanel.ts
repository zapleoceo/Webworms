import { APIClient } from '../network/APIClient';
import 'cropperjs/dist/cropper.css';
import Cropper from 'cropperjs';
import '../styles/admin.css';

export class AdminPanel {
  private adminHeaders = new Headers();

  private cropper: Cropper | null = null;
  private editingLogoId: string | null = null;

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
              <button id="nav-maps" class="admin-nav-btn active">Custom Maps</button>
              <button id="nav-dashboard" class="admin-nav-btn">Dashboard</button>
              <button id="nav-users" class="admin-nav-btn">Users Management</button>
              <button id="nav-logos" class="admin-nav-btn">Airdrop Logos</button>
              <button id="nav-spritesets" class="admin-nav-btn">Sprite Sets</button>
              <button id="nav-weapons" class="admin-nav-btn">Weapons</button>
              <button id="admin-logout-btn" class="admin-nav-btn danger">Logout</button>
            </nav>
          </aside>
          
          <main class="admin-main-content">
            <section id="section-maps" class="admin-section active">
              <div class="section-header">
                <h2>Custom Maps</h2>
                <button id="load-maps" class="secondary-btn small-btn">Refresh</button>
              </div>
              <div class="upload-map-form" style="margin-bottom: 20px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                <h3>Upload New Map</h3>
                <p style="font-size: 12px; color: #ccc; margin-bottom: 10px;">Upload a PNG image (ideal size: 1500x800). Transparent areas become air, colored areas become terrain, black (#000000) becomes indestructible alloy.</p>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; align-items: center;">
                  <input type="text" id="map-name" placeholder="Map Name" class="retro-input">
                  <input type="file" id="map-file" accept="image/png" style="color: white;">
                  <button id="upload-map-btn" class="primary-btn small-btn" disabled>Upload Map</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Preview</th>
                      <th>Name</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="maps-list-body">
                  </tbody>
                </table>
              </div>
            </section>

            <section id="section-dashboard" class="admin-section">
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
                  <label style="display:flex; align-items:center; color:#ccc;">W: <input type="number" id="logo-width" placeholder="Width" value="100" class="retro-input" style="width: 70px; padding: 5px; margin-left: 5px;"></label>
                  <label style="display:flex; align-items:center; color:#ccc;">H: <input type="number" id="logo-height" placeholder="Height" value="60" class="retro-input" style="width: 70px; padding: 5px; margin-left: 5px;"></label>
                  <label style="display:flex; align-items:center; color:#ccc;">Hardness: <input type="number" id="logo-hardness" placeholder="Hardness" value="10" class="retro-input" style="width: 60px; padding: 5px; margin-left: 5px;"></label>
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

            <section id="section-spritesets" class="admin-section">
              <div class="section-header">
                <h2>Worm Sprite Sets</h2>
                <button id="load-spritesets" class="secondary-btn small-btn">Refresh</button>
              </div>
              <div class="upload-form" style="margin-bottom: 20px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                <h3>Add New Sprite Set</h3>
                <p style="font-size: 12px; color: #ccc; margin-bottom: 10px;">Select files to encode to base64. Ensure they are PNGs with transparent backgrounds.</p>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-direction: column;">
                  <input type="text" id="sprite-name" placeholder="Skin Name (e.g. Soldier)" class="retro-input" style="max-width: 300px;">
                  <label>Idle Sprite: <input type="file" id="sprite-idle" accept="image/png"></label>
                  <label>Walk Sprite: <input type="file" id="sprite-walk" accept="image/png"></label>
                  <label>Jump Sprite: <input type="file" id="sprite-jump" accept="image/png"></label>
                  <label>Grave Sprite: <input type="file" id="sprite-grave" accept="image/png"></label>
                  <label>Aim Bazooka (Optional): <input type="file" id="sprite-aim-bazooka" accept="image/png"></label>
                  <button id="create-spriteset-btn" class="primary-btn small-btn" style="max-width: 200px; margin-top: 10px;">Create Sprite Set</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Idle Preview</th>
                      <th>Walk Preview</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="spritesets-list-body">
                  </tbody>
                </table>
              </div>
            </section>

            <section id="section-weapons" class="admin-section">
              <div class="section-header">
                <h2>Weapons</h2>
                <button id="load-weapons" class="secondary-btn small-btn">Refresh</button>
              </div>
              <div class="upload-form" style="margin-bottom: 20px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                <h3>Add New Weapon</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                  <input type="text" id="wpn-name" placeholder="Weapon Name" class="retro-input">
                  <input type="color" id="wpn-color" value="#ff0000" class="retro-input" style="height: 50px;">
                  <input type="number" id="wpn-damage" placeholder="Damage (e.g. 45)" class="retro-input">
                  <input type="number" id="wpn-radius" placeholder="Explosion Radius (e.g. 60)" class="retro-input">
                  <input type="number" id="wpn-knockback" placeholder="Knockback (e.g. 15)" class="retro-input">
                  <input type="number" id="wpn-wind" placeholder="Wind Multiplier (e.g. 1.0)" class="retro-input" step="0.1">
                  <input type="number" id="wpn-spread" placeholder="Spread (e.g. 0)" class="retro-input" step="0.1">
                  <input type="number" id="wpn-projectiles" placeholder="Projectiles Per Shot (e.g. 1)" class="retro-input">
                  <input type="number" id="wpn-cooldown" placeholder="Cooldown (e.g. 1)" class="retro-input">
                  <input type="number" id="wpn-chargespeed" placeholder="Charge Speed (e.g. 0.05)" class="retro-input" step="0.01">
                  <input type="number" id="wpn-speedmod" placeholder="Speed Modifier (e.g. 1.0)" class="retro-input" step="0.1">
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-direction: column;">
                  <label>Icon Sprite (Optional): <input type="file" id="wpn-icon" accept="image/png"></label>
                  <label>Projectile Sprite (Optional): <input type="file" id="wpn-projectile" accept="image/png"></label>
                  <button id="create-weapon-btn" class="primary-btn small-btn" style="max-width: 200px; margin-top: 10px;">Create Weapon</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Icon</th>
                      <th>Name</th>
                      <th>Damage</th>
                      <th>Radius</th>
                      <th>Projectiles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="weapons-list-body">
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
    document.getElementById('nav-maps')?.addEventListener('click', (e) => {
      this.switchTab('maps', e.target as HTMLElement);
      this.loadMapsData();
    });
    document.getElementById('nav-users')?.addEventListener('click', (e) => {
      this.switchTab('users', e.target as HTMLElement);
      this.loadUsersData();
    });
    document.getElementById('nav-logos')?.addEventListener('click', (e) => {
      this.switchTab('logos', e.target as HTMLElement);
      this.loadLogosData();
    });
    document.getElementById('nav-spritesets')?.addEventListener('click', (e) => {
      this.switchTab('spritesets', e.target as HTMLElement);
      this.loadSpriteSetsData();
    });
    document.getElementById('nav-weapons')?.addEventListener('click', (e) => {
      this.switchTab('weapons', e.target as HTMLElement);
      this.loadWeaponsData();
    });

    document.getElementById('load-logos')?.addEventListener('click', () => this.loadLogosData());
    document.getElementById('load-maps')?.addEventListener('click', () => this.loadMapsData());
    document.getElementById('load-spritesets')?.addEventListener('click', () => this.loadSpriteSetsData());
    document.getElementById('load-weapons')?.addEventListener('click', () => this.loadWeaponsData());
    
    // Maps Upload Events
    const mapFileInput = document.getElementById('map-file') as HTMLInputElement;
    const mapUploadBtn = document.getElementById('upload-map-btn') as HTMLButtonElement;
    let selectedMapFile: File | null = null;
    
    mapFileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        selectedMapFile = file;
        mapUploadBtn.disabled = false;
      }
    });
    
    mapUploadBtn?.addEventListener('click', async () => {
      if (!selectedMapFile) return;
      const name = (document.getElementById('map-name') as HTMLInputElement).value || 'Unnamed Map';
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        // Get dimensions
        const img = new Image();
        img.onload = async () => {
          try {
            const res = await fetch(APIClient.BASE_URL + '/admin/maps', {
              method: 'POST',
              headers: { ...Object.fromEntries(this.adminHeaders), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                image_data: base64,
                width: img.width,
                height: img.height
              })
            });
            if (res.ok) {
              alert('Map uploaded successfully!');
              this.loadMapsData();
              (document.getElementById('map-name') as HTMLInputElement).value = '';
              mapFileInput.value = '';
              mapUploadBtn.disabled = true;
            } else {
              alert('Failed to upload map');
            }
          } catch(e) {
            alert('Error uploading map');
          }
        };
        img.src = base64;
      };
      reader.readAsDataURL(selectedMapFile);
    });

    // Cropper & Logo Upload Events
    const fileInput = document.getElementById('logo-file') as HTMLInputElement;
    const uploadBtn = document.getElementById('upload-logo-btn') as HTMLButtonElement;
    
    fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));
    uploadBtn?.addEventListener('click', () => this.openCropper());
    document.getElementById('confirm-crop-btn')?.addEventListener('click', () => this.confirmCropAndUpload());
    document.getElementById('cancel-crop-btn')?.addEventListener('click', () => this.closeCropper());

    // SpriteSets & Weapons Creation
    document.getElementById('create-spriteset-btn')?.addEventListener('click', () => this.handleCreateSpriteSet());
    document.getElementById('create-weapon-btn')?.addEventListener('click', () => this.handleCreateWeapon());
  }

  private switchTab(tabId: string, btnElement: HTMLElement) {
    document.querySelectorAll('.admin-section').forEach(el => {
      (el as HTMLElement).style.display = 'none';
      el.classList.remove('active');
    });
    document.querySelectorAll('.admin-nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetSection = document.getElementById(`section-${tabId}`);
    if (targetSection) {
      targetSection.style.display = 'block';
      targetSection.classList.add('active');
    }
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
        
        // Ensure Custom Maps is loaded initially since it's the active tab
        this.loadMapsData();
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

    document.querySelectorAll('.save-logo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.saveLogo(e));
    });

    document.querySelectorAll('.edit-logo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.startEditLogo(e));
    });

    // Bind spriteset delete buttons
    document.querySelectorAll('.delete-spriteset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteSpriteSet(e));
    });

    // Bind weapon delete buttons
    document.querySelectorAll('.delete-weapon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteWeapon(e));
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

  // --- MAPS MANAGEMENT ---

  private async loadMapsData() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/maps');
      if (!res.ok) throw new Error('Failed to fetch maps');
      
      const maps = await res.json();
      this.renderMapsTable(maps);
    } catch (e) {
      console.error(e);
      alert('Error loading maps');
    }
  }

  private renderMapsTable(maps: any[]) {
    const tbody = document.getElementById('maps-list-body');
    if (!tbody) return;

    if (maps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No maps uploaded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = maps.map(map => `
      <tr>
        <td><img src="${map.image_data}" alt="${map.name}" style="max-width: 150px; max-height: 100px; object-fit: contain; background: rgba(0,0,0,0.5); border-radius: 4px; padding: 2px;"></td>
        <td>${map.name}</td>
        <td>${map.width} x ${map.height}</td>
        <td style="white-space: nowrap;">
          <button class="secondary-btn small-btn delete-map-btn" data-id="${map.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.delete-map-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteMap(e));
    });
  }

  private async deleteMap(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this map?')) return;

    try {
      const res = await fetch(APIClient.BASE_URL + `/admin/maps/${id}`, {
        method: 'DELETE',
        headers: this.adminHeaders
      });
      if (res.ok) {
        this.loadMapsData();
      } else {
        alert('Failed to delete map');
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
        <td style="white-space: nowrap;">
          <input type="number" class="retro-input logo-width-input" data-id="${logo.id}" value="${logo.width}" style="width: 70px; padding: 5px; margin-bottom: 0;">
          x
          <input type="number" class="retro-input logo-height-input" data-id="${logo.id}" value="${logo.height}" style="width: 70px; padding: 5px; margin-bottom: 0;">
        </td>
        <td>
          <input type="number" class="retro-input logo-hardness-input" data-id="${logo.id}" value="${logo.hardness}" style="width: 70px; padding: 5px; margin-bottom: 0;">
        </td>
        <td style="white-space: nowrap;">
          <button class="secondary-btn small-btn save-logo-btn" data-id="${logo.id}">Save</button>
          <button class="secondary-btn small-btn edit-logo-btn" data-id="${logo.id}" style="margin-left: 5px;">Edit Image</button>
          <button class="danger-btn small-btn delete-logo-btn" data-id="${logo.id}" style="margin-left: 5px;">Delete</button>
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
      
      // Automatically update Width and Height fields based on the crop box ratio
      const widthInput = document.getElementById('logo-width') as HTMLInputElement;
      const heightInput = document.getElementById('logo-height') as HTMLInputElement;

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
        crop: (event) => {
          // When user drags crop box, calculate ratio and set height dynamically
          // Let's assume standard width is 100px. We scale height based on the crop box aspect ratio.
          const ratio = event.detail.height / event.detail.width;
          const currentWidth = parseInt(widthInput.value) || 100;
          heightInput.value = Math.round(currentWidth * ratio).toString();
        }
      });

      // Also listen to width input changes to keep height in sync with the current crop box
      widthInput.addEventListener('input', () => {
        if (this.cropper) {
          const data = this.cropper.getData();
          const ratio = data.height / data.width;
          const currentWidth = parseInt(widthInput.value) || 100;
          heightInput.value = Math.round(currentWidth * ratio).toString();
        }
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

    // Trim transparent edges so the physical bounds exactly match the visible pixels
    const trimmedInfo = this.trimCanvasTransparency(canvas);
    if (!trimmedInfo) {
      alert('Image is completely transparent.');
      return;
    }

    const { canvas: trimmedCanvas, trimRatioW, trimRatioH } = trimmedInfo;
    const base64Data = trimmedCanvas.toDataURL('image/png');
    this.uploadCroppedImage(base64Data, trimRatioW, trimRatioH);
  }

  private trimCanvasTransparency(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement, trimRatioW: number, trimRatioH: number } | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const w = canvas.width;
    const h = canvas.height;
    const pixels = ctx.getImageData(0, 0, w, h);
    const data = pixels.data;
    
    let top = h, bottom = 0, left = w, right = 0;
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 0) { // non-transparent pixel
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (top > bottom || left > right) {
      return null; // Empty or fully transparent image
    }

    const trimmedWidth = right - left + 1;
    const trimmedHeight = bottom - top + 1;

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const tCtx = trimmedCanvas.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(canvas, left, top, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
    }

    return { 
      canvas: trimmedCanvas, 
      trimRatioW: trimmedWidth / w,
      trimRatioH: trimmedHeight / h
    };
  }

  private async uploadCroppedImage(base64Data: string, trimRatioW: number, trimRatioH: number) {
    const widthInput = document.getElementById('logo-width') as HTMLInputElement;
    const heightInput = document.getElementById('logo-height') as HTMLInputElement;
    const hardnessInput = document.getElementById('logo-hardness') as HTMLInputElement;
    
    const originalW = parseInt(widthInput.value) || 100;
    const originalH = parseInt(heightInput.value) || 60;
    
    // Scale down physical dimensions if we trimmed transparent space
    const finalWidth = Math.max(1, Math.round(originalW * trimRatioW));
    const finalHeight = Math.max(1, Math.round(originalH * trimRatioH));

    const confirmBtn = document.getElementById('confirm-crop-btn') as HTMLButtonElement;
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = 'Uploading...';
    confirmBtn.disabled = true;

    try {
      const isEditing = !!this.editingLogoId;
      const endpoint = isEditing
        ? (APIClient.BASE_URL + `/admin/logos?id=${this.editingLogoId}`)
        : (APIClient.BASE_URL + '/admin/logos');

      const res = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({
          image_data: base64Data,
          width: finalWidth,
          height: finalHeight,
          hardness: parseInt(hardnessInput.value) || 10
        })
      });

      if (res.ok) {
        alert(isEditing ? 'Logo updated successfully!' : 'Logo cropped and uploaded successfully!');
        const fileInput = document.getElementById('logo-file') as HTMLInputElement;
        fileInput.value = ''; // clear
        (document.getElementById('upload-logo-btn') as HTMLButtonElement).disabled = true;
        this.closeCropper();
        this.editingLogoId = null;
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

  private startEditLogo(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    const widthEl = document.querySelector(`.logo-width-input[data-id="${id}"]`) as HTMLInputElement | null;
    const heightEl = document.querySelector(`.logo-height-input[data-id="${id}"]`) as HTMLInputElement | null;
    const hardnessEl = document.querySelector(`.logo-hardness-input[data-id="${id}"]`) as HTMLInputElement | null;

    const widthInput = document.getElementById('logo-width') as HTMLInputElement;
    const heightInput = document.getElementById('logo-height') as HTMLInputElement;
    const hardnessInput = document.getElementById('logo-hardness') as HTMLInputElement;

    if (widthEl) widthInput.value = widthEl.value;
    if (heightEl) heightInput.value = heightEl.value;
    if (hardnessEl) hardnessInput.value = hardnessEl.value;

    this.editingLogoId = id;

    const fileInput = document.getElementById('logo-file');
    if (fileInput) fileInput.scrollIntoView({ behavior: 'smooth' });
    alert('Select a file, crop it, then press Confirm & Upload to update the image for this logo.');
  }

  private async saveLogo(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    const widthEl = document.querySelector(`.logo-width-input[data-id="${id}"]`) as HTMLInputElement | null;
    const heightEl = document.querySelector(`.logo-height-input[data-id="${id}"]`) as HTMLInputElement | null;
    const hardnessEl = document.querySelector(`.logo-hardness-input[data-id="${id}"]`) as HTMLInputElement | null;

    const width = widthEl ? parseInt(widthEl.value) : NaN;
    const height = heightEl ? parseInt(heightEl.value) : NaN;
    const hardness = hardnessEl ? parseInt(hardnessEl.value) : NaN;

    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(hardness)) {
      alert('Invalid values');
      return;
    }

    try {
      const res = await fetch(APIClient.BASE_URL + `/admin/logos?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({ width, height, hardness })
      });

      if (res.ok) {
        this.loadLogosData();
      } else {
        const err = await res.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
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

  private async loadSpriteSetsData() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/spritesets');
      if (res.ok) {
        const spritesets = await res.json();
        this.renderSpriteSetsTable(spritesets);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private renderSpriteSetsTable(spritesets: any[]) {
    const tbody = document.getElementById('spritesets-list-body');
    if (!tbody) return;

    tbody.innerHTML = spritesets.map(s => `
      <tr>
        <td>${s.name}</td>
        <td><img src="${s.idle_src}" style="height: 40px; image-rendering: pixelated;"></td>
        <td><img src="${s.walk_src}" style="height: 40px; image-rendering: pixelated;"></td>
        <td>
          <button class="delete-spriteset-btn danger-btn small-btn" data-id="${s.id}">Delete</button>
        </td>
      </tr>
    `).join('');
    this.bindDynamicEvents();
  }

  private async loadWeaponsData() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/weapons');
      if (res.ok) {
        const weapons = await res.json();
        this.renderWeaponsTable(weapons);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private renderWeaponsTable(weapons: any[]) {
    const tbody = document.getElementById('weapons-list-body');
    if (!tbody) return;

    tbody.innerHTML = weapons.map(w => `
      <tr>
        <td>${w.icon_src ? `<img src="${w.icon_src}" style="height: 40px; image-rendering: pixelated;">` : 'None'}</td>
        <td><span style="color: ${w.color}">${w.name}</span></td>
        <td>${w.damage}</td>
        <td>${w.explosionRadius}</td>
        <td>${w.projectilesPerShot}</td>
        <td>
          <button class="delete-weapon-btn danger-btn small-btn" data-id="${w.id}">Delete</button>
        </td>
      </tr>
    `).join('');
    this.bindDynamicEvents();
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private async handleCreateSpriteSet() {
    const nameInput = document.getElementById('sprite-name') as HTMLInputElement;
    const idleInput = document.getElementById('sprite-idle') as HTMLInputElement;
    const walkInput = document.getElementById('sprite-walk') as HTMLInputElement;
    const jumpInput = document.getElementById('sprite-jump') as HTMLInputElement;
    const graveInput = document.getElementById('sprite-grave') as HTMLInputElement;
    const aimBazookaInput = document.getElementById('sprite-aim-bazooka') as HTMLInputElement;

    if (!nameInput.value || !idleInput.files?.[0] || !walkInput.files?.[0] || !jumpInput.files?.[0] || !graveInput.files?.[0]) {
      alert("Name and required sprites (idle, walk, jump, grave) are missing.");
      return;
    }

    const btn = document.getElementById('create-spriteset-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerText = 'Uploading...';

    try {
      const idle_src = await this.fileToBase64(idleInput.files[0]);
      const walk_src = await this.fileToBase64(walkInput.files[0]);
      const jump_src = await this.fileToBase64(jumpInput.files[0]);
      const grave_src = await this.fileToBase64(graveInput.files[0]);
      const aim_bazooka_src = aimBazookaInput.files?.[0] ? await this.fileToBase64(aimBazookaInput.files[0]) : null;

      const res = await fetch(APIClient.BASE_URL + '/admin/spritesets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({
          name: nameInput.value,
          idle_src, walk_src, jump_src, grave_src, aim_bazooka_src
        })
      });

      if (res.ok) {
        alert("Sprite Set Created!");
        nameInput.value = '';
        idleInput.value = ''; walkInput.value = ''; jumpInput.value = ''; graveInput.value = ''; aimBazookaInput.value = '';
        this.loadSpriteSetsData();
      } else {
        alert("Error creating Sprite Set");
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      btn.disabled = false;
      btn.innerText = 'Create Sprite Set';
    }
  }

  private async handleCreateWeapon() {
    const nameInput = document.getElementById('wpn-name') as HTMLInputElement;
    const colorInput = document.getElementById('wpn-color') as HTMLInputElement;
    const damageInput = document.getElementById('wpn-damage') as HTMLInputElement;
    const radiusInput = document.getElementById('wpn-radius') as HTMLInputElement;
    const knockbackInput = document.getElementById('wpn-knockback') as HTMLInputElement;
    const windInput = document.getElementById('wpn-wind') as HTMLInputElement;
    const spreadInput = document.getElementById('wpn-spread') as HTMLInputElement;
    const projectilesInput = document.getElementById('wpn-projectiles') as HTMLInputElement;
    const cooldownInput = document.getElementById('wpn-cooldown') as HTMLInputElement;
    const chargeSpeedInput = document.getElementById('wpn-chargespeed') as HTMLInputElement;
    const speedModInput = document.getElementById('wpn-speedmod') as HTMLInputElement;

    const iconInput = document.getElementById('wpn-icon') as HTMLInputElement;
    const projInput = document.getElementById('wpn-projectile') as HTMLInputElement;

    if (!nameInput.value || !damageInput.value) {
      alert("Name and Damage are required.");
      return;
    }

    const btn = document.getElementById('create-weapon-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerText = 'Uploading...';

    try {
      const icon_src = iconInput.files?.[0] ? await this.fileToBase64(iconInput.files[0]) : null;
      const projectile_src = projInput.files?.[0] ? await this.fileToBase64(projInput.files[0]) : null;

      const res = await fetch(APIClient.BASE_URL + '/admin/weapons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify({
          name: nameInput.value,
          color: colorInput.value,
          damage: parseFloat(damageInput.value) || 0,
          explosionRadius: parseFloat(radiusInput.value) || 0,
          knockback: parseFloat(knockbackInput.value) || 0,
          windMultiplier: parseFloat(windInput.value) || 0,
          spread: parseFloat(spreadInput.value) || 0,
          projectilesPerShot: parseInt(projectilesInput.value) || 1,
          cooldown: parseInt(cooldownInput.value) || 0,
          chargeSpeed: parseFloat(chargeSpeedInput.value) || 0.05,
          speedModifier: parseFloat(speedModInput.value) || 1.0,
          icon_src, projectile_src
        })
      });

      if (res.ok) {
        alert("Weapon Created!");
        nameInput.value = ''; damageInput.value = '';
        iconInput.value = ''; projInput.value = '';
        this.loadWeaponsData();
      } else {
        alert("Error creating weapon");
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      btn.disabled = false;
      btn.innerText = 'Create Weapon';
    }
  }

  private async deleteSpriteSet(e: Event) {
    if (!confirm('Are you sure?')) return;
    const id = (e.target as HTMLButtonElement).dataset.id;
    await fetch(APIClient.BASE_URL + '/admin/spritesets/' + id, {
      method: 'DELETE',
      headers: {
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      }
    });
    this.loadSpriteSetsData();
  }

  private async deleteWeapon(e: Event) {
    if (!confirm('Are you sure?')) return;
    const id = (e.target as HTMLButtonElement).dataset.id;
    await fetch(APIClient.BASE_URL + '/admin/weapons/' + id, {
      method: 'DELETE',
      headers: {
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      }
    });
    this.loadWeaponsData();
  }
}
