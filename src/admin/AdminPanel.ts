import { APIClient } from '../network/APIClient';
import { AI_V } from '../ai/AIVersion';
import 'cropperjs/dist/cropper.css';
import Cropper from 'cropperjs';
import '../styles/admin.css';

export class AdminPanel {
  private adminHeaders = new Headers();

  private cropper: Cropper | null = null;
  private editingLogoId: string | null = null;
  private lastMaps: any[] = [];
  private lastWeapons: any[] = [];
  private selectedWeaponId: string | null = null;
  private pendingWeaponIconSrc: string | null = null;
  private pendingWeaponProjectileSrc: string | null = null;
  private upscaleAllAbort: boolean = false;

  constructor() {
    document.documentElement.classList.add('admin-mode');
    document.body.classList.add('admin-mode');
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
              <button id="nav-bot" class="admin-nav-btn">Bot</button>
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
                <div style="display:flex; gap:8px; align-items:center; flex-wrap: wrap;">
                  <button id="load-maps" class="secondary-btn small-btn">Refresh</button>
                  <button id="upscale-all-maps-btn" class="secondary-btn small-btn">Upscale ALL 1000h</button>
                  <button id="upscale-all-maps-cancel-btn" class="danger-btn small-btn" style="display:none;">Cancel</button>
                  <span id="upscale-all-maps-progress" style="font-size:12px; color:#ccc;"></span>
                </div>
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
              <div class="upload-form" style="margin-bottom: 20px; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                <h3>Airdrop Physics</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                  <input type="number" id="adp-mass" placeholder="Mass" class="retro-input" step="0.1">
                  <input type="number" id="adp-restitution" placeholder="Restitution" class="retro-input" step="0.01">
                  <input type="number" id="adp-friction" placeholder="Friction" class="retro-input" step="0.05">
                  <input type="number" id="adp-comy" placeholder="COM Y offset" class="retro-input" step="0.01">
                  <input type="number" id="adp-spacing" placeholder="Contact spacing" class="retro-input" step="1">
                  <input type="number" id="adp-maxpoints" placeholder="Max contact points" class="retro-input" step="1">
                  <input type="number" id="adp-iters" placeholder="Solver iterations" class="retro-input" step="1">
                  <input type="number" id="adp-sleeptime" placeholder="Sleep time" class="retro-input" step="0.1">
                  <input type="number" id="adp-sleepv" placeholder="Sleep linear" class="retro-input" step="0.5">
                  <input type="number" id="adp-sleepw" placeholder="Sleep angular" class="retro-input" step="0.05">
                  <input type="number" id="adp-maxpen" placeholder="Max penetration" class="retro-input" step="1">
                  <input type="number" id="adp-penk" placeholder="Pen correction" class="retro-input" step="0.05">
                  <input type="number" id="adp-lindampg" placeholder="Lin damp ground" class="retro-input" step="0.5">
                  <input type="number" id="adp-angdampg" placeholder="Ang damp ground" class="retro-input" step="0.5">
                  <input type="number" id="adp-shake" placeholder="Impact shake time" class="retro-input" step="0.05">
                </div>
                <div style="display:flex; gap:10px; margin-top:10px;">
                  <button id="adp-load" class="secondary-btn small-btn">Load</button>
                  <button id="adp-save" class="primary-btn small-btn">Save</button>
                </div>
              </div>
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

            <section id="section-bot" class="admin-section">
              <h2 style="display:flex; align-items:center; justify-content:space-between;">
                <span style="display:flex; align-items:baseline; gap:10px;"><span>Bot</span><span style="opacity:0.7; font-size:0.85em;">AI_V=${AI_V}</span></span>
                <button id="bot-help" class="secondary-btn small-btn" style="width: 34px; height: 34px; padding: 0;">I</button>
              </h2>
              <div class="upload-form bot-settings-card" style="margin-bottom: 14px;">
                <h3>AI vs AI</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                  <label class="bot-setting">
                    <span class="bot-setting-label">AI 1 (team1)</span>
                    <select id="bot-aivai-a1" class="retro-input bot-setting-input">
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>
                  </label>
                  <label class="bot-setting">
                    <span class="bot-setting-label">AI 2 (team2)</span>
                    <select id="bot-aivai-a2" class="retro-input bot-setting-input">
                      <option value="easy">easy</option>
                      <option value="medium" selected>medium</option>
                      <option value="hard">hard</option>
                    </select>
                  </label>
                </div>
                <div style="margin-top: 10px;">
                  <label class="bot-setting bot-setting-wide">
                    <span class="bot-setting-label">Map</span>
                    <select id="bot-aivai-map" class="retro-input bot-setting-input">
                      <option value="" selected>Loading maps...</option>
                    </select>
                  </label>
                </div>
                <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                  <button id="bot-aivai-start" class="primary-btn small-btn">Start</button>
                  <button id="bot-aivai-copy" class="secondary-btn small-btn">Copy link</button>
                  <input id="bot-aivai-link" class="retro-input" readonly style="flex: 1; min-width: 260px;" />
                </div>
              </div>
              <div class="upload-form bot-settings-card">
                <h3>Настройки бота</h3>
                <div class="bot-settings-scroll">
                  <div class="bot-settings-grid">
                    <label class="bot-setting">
                      <span class="bot-setting-label">Планирование, сек</span>
                      <input type="number" id="bot-plan" class="retro-input bot-setting-input" step="0.1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Резерв, сек</span>
                      <input type="number" id="bot-reserve" class="retro-input bot-setting-input" step="0.1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Лимит верёвки (easy)</span>
                      <input type="number" id="bot-rope-easy" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Лимит верёвки (medium)</span>
                      <input type="number" id="bot-rope-medium" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Лимит верёвки (hard)</span>
                      <input type="number" id="bot-rope-hard" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка прицеливания % (easy)</span>
                      <input type="number" id="bot-aim-easy" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка прицеливания % (medium)</span>
                      <input type="number" id="bot-aim-medium" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка прицеливания % (hard)</span>
                      <input type="number" id="bot-aim-hard" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка силы % (easy)</span>
                      <input type="number" id="bot-power-easy" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка силы % (medium)</span>
                      <input type="number" id="bot-power-medium" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Ошибка силы % (hard)</span>
                      <input type="number" id="bot-power-hard" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Фитиль гранаты, сек</span>
                      <input type="number" id="bot-grenade-fuse" class="retro-input bot-setting-input" step="0.1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Отскок гранаты</span>
                      <input type="number" id="bot-grenade-rest" class="retro-input bot-setting-input" step="0.05">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Трение гранаты</span>
                      <input type="number" id="bot-grenade-fric" class="retro-input bot-setting-input" step="0.05">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Стоп-скорость гранаты</span>
                      <input type="number" id="bot-grenade-stop" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Бонус за добивание</span>
                      <input type="number" id="bot-kill-bonus" class="retro-input bot-setting-input" step="100">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Вес урона</span>
                      <input type="number" id="bot-damage-weight" class="retro-input bot-setting-input" step="0.1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Штраф за промах</span>
                      <input type="number" id="bot-miss-weight" class="retro-input bot-setting-input" step="0.1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Штраф за движение (на пиксель)</span>
                      <input type="number" id="bot-move-penalty" class="retro-input bot-setting-input" step="0.05">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Запас безопасности (радиус)</span>
                      <input type="number" id="bot-safe-extra" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Копание включено (0/1)</span>
                      <input type="number" id="bot-dig-enabled" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Копаний за ход</span>
                      <input type="number" id="bot-dig-max" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting bot-setting-wide">
                      <span class="bot-setting-label">Дистанции копания (пример: 80,120,160)</span>
                      <input type="text" id="bot-dig-dist" class="retro-input bot-setting-input">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Глубина копания min</span>
                      <input type="number" id="bot-dig-depth-min" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Глубина копания max</span>
                      <input type="number" id="bot-dig-depth-max" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Повторы стратегии/ход</span>
                      <input type="number" id="bot-move-max-attempts" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Провалы стратегии/ход</span>
                      <input type="number" id="bot-move-max-fails" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Replan при бане ≥</span>
                      <input type="number" id="bot-move-replan-banned" class="retro-input bot-setting-input" step="1">
                    </label>
                    <label class="bot-setting">
                      <span class="bot-setting-label">Replan cooldown, сек</span>
                      <input type="number" id="bot-move-replan-cooldown" class="retro-input bot-setting-input" step="0.1">
                    </label>
                  </div>
                </div>
                <div class="bot-settings-actions">
                  <button id="bot-load" class="secondary-btn small-btn">Загрузить</button>
                  <button id="bot-save" class="primary-btn small-btn">Сохранить</button>
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
              <div class="weapon-editor-layout">
                <div class="weapon-list-panel">
                  <div class="weapon-list-toolbar">
                    <input id="weapon-search" type="text" class="retro-input" placeholder="Search..." />
                    <button id="weapon-new-btn" class="secondary-btn small-btn">New</button>
                  </div>
                  <div id="weapon-list" class="weapon-list"></div>
                </div>

                <div class="weapon-editor-panel">
                  <div class="weapon-editor-header">
                    <div id="weapon-score-badge" class="weapon-score-badge">Score: --</div>
                    <div class="weapon-editor-actions">
                      <button id="weapon-save-btn" class="primary-btn small-btn">Save</button>
                      <button id="weapon-duplicate-btn" class="secondary-btn small-btn">Duplicate</button>
                      <button id="weapon-delete-btn" class="danger-btn small-btn">Delete</button>
                    </div>
                  </div>

                  <div class="weapon-editor-body">
                    <div class="weapon-preview-row">
                      <div class="weapon-preview">
                        <div class="weapon-preview-label">Icon</div>
                        <img id="weapon-icon-preview" class="weapon-preview-img" />
                        <input type="file" id="weapon-icon-file" accept="image/png" />
                      </div>
                      <div class="weapon-preview">
                        <div class="weapon-preview-label">Projectile</div>
                        <img id="weapon-projectile-preview" class="weapon-preview-img" />
                        <input type="file" id="weapon-projectile-file" accept="image/png" />
                      </div>
                    </div>

                    <div class="weapon-form-grid">
                      <label class="weapon-field weapon-field-wide">
                        <span class="weapon-field-label">ID</span>
                        <input type="text" id="weapon-id" class="retro-input" disabled />
                      </label>
                      <label class="weapon-field weapon-field-wide">
                        <span class="weapon-field-label">Название</span>
                        <input type="text" id="weapon-name" class="retro-input" />
                      </label>
                      <label class="weapon-field weapon-field-wide">
                        <span class="weapon-field-label">Цвет</span>
                        <input type="color" id="weapon-color" class="retro-input weapon-color-input" />
                      </label>

                      <label class="weapon-field">
                        <span class="weapon-field-label">Урон</span>
                        <input type="number" id="weapon-damage" class="retro-input weapon-num" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Радиус</span>
                        <input type="number" id="weapon-radius" class="retro-input weapon-num" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Отдача</span>
                        <input type="number" id="weapon-knockback" class="retro-input weapon-num" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Ветер</span>
                        <input type="number" id="weapon-wind" class="retro-input weapon-num" step="0.1" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Разброс</span>
                        <input type="number" id="weapon-spread" class="retro-input weapon-num" step="0.1" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Снаряды</span>
                        <input type="number" id="weapon-projectiles" class="retro-input weapon-num" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Откат</span>
                        <input type="number" id="weapon-cooldown" class="retro-input weapon-num" step="0.05" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Заряд</span>
                        <input type="number" id="weapon-chargespeed" class="retro-input weapon-num" step="0.05" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Скорость</span>
                        <input type="number" id="weapon-speedmod" class="retro-input weapon-num" step="0.05" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Дальность</span>
                        <input type="number" id="weapon-maxrange" class="retro-input weapon-num" />
                      </label>
                      <label class="weapon-field">
                        <span class="weapon-field-label">Таймер</span>
                        <input type="number" id="weapon-fuse" class="retro-input weapon-num" step="0.1" />
                      </label>
                    </div>

                    <div class="weapon-derived" id="weapon-derived"></div>
                  </div>
                </div>
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
    document.getElementById('adp-load')?.addEventListener('click', () => this.loadAirdropPhysics());
    document.getElementById('adp-save')?.addEventListener('click', () => this.saveAirdropPhysics());
    document.getElementById('bot-load')?.addEventListener('click', () => this.loadBotSettings());
    document.getElementById('bot-save')?.addEventListener('click', () => this.saveBotSettings());
    document.getElementById('bot-help')?.addEventListener('click', () => this.showBotHelp());

    const a1Sel = document.getElementById('bot-aivai-a1') as HTMLSelectElement | null;
    const a2Sel = document.getElementById('bot-aivai-a2') as HTMLSelectElement | null;
    const mapSel = document.getElementById('bot-aivai-map') as HTMLSelectElement | null;
    const linkEl = document.getElementById('bot-aivai-link') as HTMLInputElement | null;
    const buildLink = () => {
      const a1 = (a1Sel?.value || 'easy').trim();
      const a2 = (a2Sel?.value || 'medium').trim();
      const map = (mapSel?.value || '').trim();
      const mapPart = map ? `&map=${encodeURIComponent(map)}` : '';
      return `${window.location.origin}/?mode=aivai&a1=${encodeURIComponent(a1)}&a2=${encodeURIComponent(a2)}${mapPart}`;
    };
    const syncLink = () => {
      if (linkEl) linkEl.value = buildLink();
    };
    a1Sel?.addEventListener('change', syncLink);
    a2Sel?.addEventListener('change', syncLink);
    mapSel?.addEventListener('change', syncLink);
    syncLink();

    if (mapSel) {
      fetch('/api/maps')
        .then(r => r.json())
        .then((maps: any[]) => {
          const keep = mapSel.value;
          mapSel.innerHTML = `<option value="">(default)</option>` + (Array.isArray(maps) ? maps.map(m => `<option value="${String(m.id)}">${String(m.name || m.id)}</option>`).join('') : '');
          if (keep) mapSel.value = keep;
          syncLink();
        })
        .catch(() => {
          mapSel.innerHTML = `<option value="">(default)</option>`;
          syncLink();
        });
    }

    document.getElementById('bot-aivai-start')?.addEventListener('click', () => {
      const url = buildLink();
      window.open(url, '_blank', 'noopener');
    });
    document.getElementById('bot-aivai-copy')?.addEventListener('click', async () => {
      const url = buildLink();
      try {
        await navigator.clipboard.writeText(url);
        alert('Copied!');
      } catch {
        alert(url);
      }
    });
    
    // Navigation
    document.getElementById('nav-dashboard')?.addEventListener('click', (e) => {
      this.switchTab('dashboard', e.target as HTMLElement);
      this.loadUsersData(); // To populate dashboard stats
      this.loadAirdropPhysics();
    });
    document.getElementById('nav-bot')?.addEventListener('click', (e) => {
      this.switchTab('bot', e.target as HTMLElement);
      this.loadBotSettings();
    });
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
    document.getElementById('upscale-all-maps-btn')?.addEventListener('click', () => this.upscaleAllMapsToHeight(1000));
    document.getElementById('upscale-all-maps-cancel-btn')?.addEventListener('click', () => { this.upscaleAllAbort = true; });
    
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
            const author = (this.adminHeaders.get('X-Admin-Email') || '').trim();
            const named = `${name} (${img.width}x${img.height})${author ? ` by ${author}` : ''}`;
            const res = await fetch(APIClient.BASE_URL + '/admin/maps', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
                'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
              },
              body: JSON.stringify({
                name: named,
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
              const err = await res.json();
              alert('Failed to upload map: ' + (err.error || 'Unknown error'));
            }
          } catch(e) {
            console.error(e);
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
    document.getElementById('weapon-save-btn')?.addEventListener('click', () => this.saveSelectedWeapon());
    document.getElementById('weapon-duplicate-btn')?.addEventListener('click', () => this.duplicateSelectedWeapon());
    document.getElementById('weapon-delete-btn')?.addEventListener('click', () => this.deleteSelectedWeapon());
    document.getElementById('weapon-new-btn')?.addEventListener('click', () => this.createNewWeapon());
    document.getElementById('weapon-search')?.addEventListener('input', () => this.renderWeaponList());
    document.getElementById('weapon-icon-file')?.addEventListener('change', (e) => this.handleWeaponSpriteFile(e, 'icon'));
    document.getElementById('weapon-projectile-file')?.addEventListener('change', (e) => this.handleWeaponSpriteFile(e, 'projectile'));
    document.querySelectorAll('#section-weapons .weapon-form-grid input').forEach(el => {
      el.addEventListener('input', () => this.updateWeaponDerived());
      el.addEventListener('change', () => this.updateWeaponDerived());
    });
  }

  private switchTab(tabId: string, btnElement: HTMLElement) {
    document.querySelectorAll('.admin-section').forEach(el => {
      el.classList.remove('active');
    });
    document.querySelectorAll('.admin-nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetSection = document.getElementById(`section-${tabId}`);
    if (targetSection) {
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
        this.switchTab('maps', document.getElementById('nav-maps') as HTMLElement);
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
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <input type="number" class="retro-input balance-input" data-id="${userId}" value="${u.play_time_balance}" style="width: 80px;" title="Seconds">
            <span style="font-size: 12px; color: #aaa;">${Math.floor(u.play_time_balance / 3600).toString().padStart(2, '0')}:${Math.floor((u.play_time_balance % 3600) / 60).toString().padStart(2, '0')}</span>
            <button class="secondary-btn small-btn add-time-btn" data-id="${userId}">+ Time</button>
          </div>
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
      const res = await fetch(APIClient.BASE_URL + '/maps?include_image_data=1');
      if (!res.ok) throw new Error('Failed to fetch maps');
      
      const maps = await res.json();
      this.lastMaps = Array.isArray(maps) ? maps : [];
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
        <td><img src="${APIClient.BASE_URL.replace('/api', '')}${map.image_data}?t=${Date.now()}" alt="${map.name}" style="max-width: 150px; max-height: 100px; object-fit: contain; background: rgba(0,0,0,0.5); border-radius: 4px; padding: 2px;" crossorigin="anonymous"></td>
        <td>${map.name}</td>
        <td>${map.width} x ${map.height}</td>
        <td style="white-space: nowrap;">
          <button class="secondary-btn small-btn upscale-map-btn" data-id="${map.id}" style="margin-right: 5px;">Upscale 1000h</button>
          <button class="secondary-btn small-btn delete-map-btn" data-id="${map.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.delete-map-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteMap(e));
    });
    document.querySelectorAll('.upscale-map-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.upscaleMap(e));
    });
  }

  private async upscaleMap(e: Event) {
    const btn = e.target as HTMLButtonElement;
    const id = btn.dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to upscale this map to 1000px height? This will overwrite the current map data.')) return;

    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;

    try {
      await this.upscaleMapToHeight(id, 1000);
      alert('Map upscaled to 1000h successfully!');
      this.loadMapsData();
    } catch (err: any) {
      console.error(err);
      alert('Error upscaling map: ' + err.message);
    } finally {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  }

  private normalizeMapName(name: string, width: number, height: number): string {
    const m = String(name || 'Unnamed Map').match(/^(.*?)(\s*\(\s*\d+\s*x\s*\d+\s*\))?(\s*by\s+.+)?\s*$/i);
    const base = (m?.[1] || 'Unnamed Map').trim();
    const by = (m?.[3] || '').trim();
    return `${base} (${width}x${height})${by ? ` ${by}` : ''}`;
  }

  private async upscaleMapToHeight(id: string, targetHeight: number): Promise<void> {
    const res = await fetch(APIClient.BASE_URL + `/maps/${id}`);
    if (!res.ok) throw new Error('Failed to fetch map data');
    const mapObj = await res.json();
    const mapUrl = APIClient.BASE_URL.replace('/api', '') + mapObj.image_data + '?t=' + Date.now();

    const img = new Image();
    img.crossOrigin = "Anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load map image'));
      img.src = mapUrl;
    });

    const targetW = Math.max(1, Math.round(img.width * (targetHeight / Math.max(1, img.height))));
    const targetH = Math.max(1, Math.round(targetHeight));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const newBase64 = canvas.toDataURL('image/png');
    const newName = this.normalizeMapName(mapObj?.name || 'Unnamed Map', targetW, targetH);
    const updateRes = await fetch(APIClient.BASE_URL + `/admin/maps/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      },
      body: JSON.stringify({
        name: newName,
        image_data: newBase64,
        width: targetW,
        height: targetH
      })
    });
    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({} as any));
      throw new Error(err?.error || 'Failed to update map');
    }
  }

  private async upscaleAllMapsToHeight(targetHeight: number) {
    if (!confirm(`Upscale ALL custom maps to ${targetHeight}px height? This will overwrite the current map data for each map.`)) return;
    const btn = document.getElementById('upscale-all-maps-btn') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('upscale-all-maps-cancel-btn') as HTMLButtonElement | null;
    const progressEl = document.getElementById('upscale-all-maps-progress') as HTMLElement | null;
    const maps = Array.isArray(this.lastMaps) ? this.lastMaps : [];
    if (maps.length === 0) return;

    this.upscaleAllAbort = false;
    if (btn) btn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    try {
      for (let i = 0; i < maps.length; i++) {
        if (this.upscaleAllAbort) break;
        const m = maps[i];
        if (progressEl) progressEl.innerText = `Processing ${i + 1}/${maps.length}: ${m.name}`;
        await this.upscaleMapToHeight(String(m.id), targetHeight);
      }
      if (progressEl) progressEl.innerText = this.upscaleAllAbort ? 'Cancelled' : 'Done';
      await this.loadMapsData();
    } catch (e: any) {
      if (progressEl) progressEl.innerText = 'Error';
      alert('Error upscaling maps: ' + (e?.message || String(e)));
    } finally {
      if (btn) btn.disabled = false;
      if (cancelBtn) cancelBtn.style.display = 'none';
      this.upscaleAllAbort = false;
    }
  }

  private async deleteMap(e: Event) {
    const id = (e.target as HTMLButtonElement).dataset.id;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this map?')) return;

    try {
      const res = await fetch(APIClient.BASE_URL + `/admin/maps/${id}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        }
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

    this.removeSolidBackground(canvas);
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

  private removeSolidBackground(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const pts = [
      0, 0,
      w - 1, 0,
      0, h - 1,
      w - 1, h - 1
    ];
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      const off = (y * w + x) * 4;
      if (d[off + 3] < 10) continue;
      r += d[off];
      g += d[off + 1];
      b += d[off + 2];
      n++;
    }
    if (n === 0) return;
    r = r / n;
    g = g / n;
    b = b / n;
    const thr = 18;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      if (Math.abs(d[i] - r) < thr && Math.abs(d[i + 1] - g) < thr && Math.abs(d[i + 2] - b) < thr) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private setNumberInput(id: string, v: any) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    const num = Number(v);
    if (Number.isFinite(num)) el.value = String(num);
  }

  private setTextInput(id: string, v: any) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.value = v === undefined || v === null ? '' : String(v);
  }

  private getNumberInput(id: string, fallback: number) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return fallback;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  private getTextInput(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return '';
    return String(el.value || '');
  }

  private async loadAirdropPhysics() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/settings/airdrop_physics');
      if (!res.ok) return;
      const cfg = await res.json();
      this.setNumberInput('adp-mass', cfg.mass);
      this.setNumberInput('adp-restitution', cfg.restitution);
      this.setNumberInput('adp-friction', cfg.friction);
      this.setNumberInput('adp-comy', cfg.centerOfMassYOffset);
      this.setNumberInput('adp-spacing', cfg.contactSpacing);
      this.setNumberInput('adp-maxpoints', cfg.maxContactPoints);
      this.setNumberInput('adp-iters', cfg.solverIterations);
      this.setNumberInput('adp-sleeptime', cfg.sleepTime);
      this.setNumberInput('adp-sleepv', cfg.sleepLinear);
      this.setNumberInput('adp-sleepw', cfg.sleepAngular);
      this.setNumberInput('adp-maxpen', cfg.maxPenetration);
      this.setNumberInput('adp-penk', cfg.penetrationCorrection);
      this.setNumberInput('adp-lindampg', cfg.linearDampingGround);
      this.setNumberInput('adp-angdampg', cfg.angularDampingGround);
      this.setNumberInput('adp-shake', cfg.impactShakeTime);
    } catch {}
  }

  private async saveAirdropPhysics() {
    try {
      const cfg = {
        mass: this.getNumberInput('adp-mass', 3),
        restitution: this.getNumberInput('adp-restitution', 0.05),
        friction: this.getNumberInput('adp-friction', 0.7),
        centerOfMassYOffset: this.getNumberInput('adp-comy', 0.18),
        contactSpacing: this.getNumberInput('adp-spacing', 26),
        maxContactPoints: this.getNumberInput('adp-maxpoints', 14),
        solverIterations: this.getNumberInput('adp-iters', 6),
        sleepTime: this.getNumberInput('adp-sleeptime', 0.9),
        sleepLinear: this.getNumberInput('adp-sleepv', 6),
        sleepAngular: this.getNumberInput('adp-sleepw', 0.35),
        maxPenetration: this.getNumberInput('adp-maxpen', 10),
        penetrationCorrection: this.getNumberInput('adp-penk', 0.55),
        linearDampingGround: this.getNumberInput('adp-lindampg', 6),
        angularDampingGround: this.getNumberInput('adp-angdampg', 10),
        impactShakeTime: this.getNumberInput('adp-shake', 0.3)
      };
      const res = await fetch(APIClient.BASE_URL + '/settings/airdrop_physics', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify(cfg)
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
        return;
      }
      await this.loadAirdropPhysics();
    } catch (e: any) {
      alert('Network error');
    }
  }

  private async loadBotSettings() {
    try {
      const res = await fetch(APIClient.BASE_URL + '/settings/bot');
      if (!res.ok) return;
      const cfg = await res.json();

      this.setNumberInput('bot-plan', cfg.planSeconds);
      this.setNumberInput('bot-reserve', cfg.reserveSeconds);

      this.setNumberInput('bot-rope-easy', cfg.ropeAttachLimit?.easy);
      this.setNumberInput('bot-rope-medium', cfg.ropeAttachLimit?.medium);
      this.setNumberInput('bot-rope-hard', cfg.ropeAttachLimit?.hard);

      this.setNumberInput('bot-aim-easy', Math.round((cfg.aimErrorPct?.easy || 0) * 100));
      this.setNumberInput('bot-aim-medium', Math.round((cfg.aimErrorPct?.medium || 0) * 100));
      this.setNumberInput('bot-aim-hard', Math.round((cfg.aimErrorPct?.hard || 0) * 100));

      this.setNumberInput('bot-power-easy', Math.round((cfg.powerErrorPct?.easy || 0) * 100));
      this.setNumberInput('bot-power-medium', Math.round((cfg.powerErrorPct?.medium || 0) * 100));
      this.setNumberInput('bot-power-hard', Math.round((cfg.powerErrorPct?.hard || 0) * 100));

      this.setNumberInput('bot-grenade-fuse', cfg.grenade?.fuseSeconds);
      this.setNumberInput('bot-grenade-rest', cfg.grenade?.restitution);
      this.setNumberInput('bot-grenade-fric', cfg.grenade?.friction);
      this.setNumberInput('bot-grenade-stop', cfg.grenade?.stopSpeed);

      this.setNumberInput('bot-kill-bonus', cfg.scoring?.killBonus);
      this.setNumberInput('bot-damage-weight', cfg.scoring?.damageWeight);
      this.setNumberInput('bot-miss-weight', cfg.scoring?.missWeight);
      this.setNumberInput('bot-move-penalty', cfg.scoring?.movePenaltyPerPx);
      this.setNumberInput('bot-safe-extra', cfg.scoring?.safeExtraRadius);

      this.setNumberInput('bot-dig-enabled', cfg.dig?.enabled ? 1 : 0);
      this.setNumberInput('bot-dig-max', cfg.dig?.maxShotsPerTurn);
      const dist = Array.isArray(cfg.dig?.distances) ? cfg.dig.distances.join(',') : '';
      this.setTextInput('bot-dig-dist', dist);
      this.setNumberInput('bot-dig-depth-min', cfg.dig?.depthMin);
      this.setNumberInput('bot-dig-depth-max', cfg.dig?.depthMax);

      this.setNumberInput('bot-move-max-attempts', cfg.movement?.maxStrategyAttemptsPerTurn);
      this.setNumberInput('bot-move-max-fails', cfg.movement?.maxStrategyFailuresPerTurn);
      this.setNumberInput('bot-move-replan-banned', cfg.movement?.replanWhenBannedAtLeast);
      this.setNumberInput('bot-move-replan-cooldown', cfg.movement?.replanCooldownSeconds);
    } catch {}
  }

  private async saveBotSettings() {
    try {
      const distRaw = (this.getTextInput('bot-dig-dist') || '').split(',').map(s => s.trim()).filter(Boolean);
      const dist = distRaw.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0);
      const cfg = {
        planSeconds: this.getNumberInput('bot-plan', 3),
        reserveSeconds: this.getNumberInput('bot-reserve', 1),
        ropeAttachLimit: {
          easy: this.getNumberInput('bot-rope-easy', 3),
          medium: this.getNumberInput('bot-rope-medium', 4),
          hard: this.getNumberInput('bot-rope-hard', 5)
        },
        aimErrorPct: {
          easy: this.getNumberInput('bot-aim-easy', 30) / 100,
          medium: this.getNumberInput('bot-aim-medium', 15) / 100,
          hard: this.getNumberInput('bot-aim-hard', 5) / 100
        },
        powerErrorPct: {
          easy: this.getNumberInput('bot-power-easy', 30) / 100,
          medium: this.getNumberInput('bot-power-medium', 15) / 100,
          hard: this.getNumberInput('bot-power-hard', 5) / 100
        },
        grenade: {
          fuseSeconds: this.getNumberInput('bot-grenade-fuse', 3),
          restitution: this.getNumberInput('bot-grenade-rest', 0.35),
          friction: this.getNumberInput('bot-grenade-fric', 0.85),
          stopSpeed: this.getNumberInput('bot-grenade-stop', 28)
        },
        scoring: {
          killBonus: this.getNumberInput('bot-kill-bonus', 4000),
          damageWeight: this.getNumberInput('bot-damage-weight', 1),
          missWeight: this.getNumberInput('bot-miss-weight', 1),
          movePenaltyPerPx: this.getNumberInput('bot-move-penalty', 0.35),
          safeExtraRadius: this.getNumberInput('bot-safe-extra', 14)
        },
        dig: {
          enabled: this.getNumberInput('bot-dig-enabled', 1) !== 0,
          maxShotsPerTurn: this.getNumberInput('bot-dig-max', 1),
          distances: dist,
          depthMin: this.getNumberInput('bot-dig-depth-min', 10),
          depthMax: this.getNumberInput('bot-dig-depth-max', 40)
        },
        movement: {
          maxStrategyAttemptsPerTurn: this.getNumberInput('bot-move-max-attempts', 3),
          maxStrategyFailuresPerTurn: this.getNumberInput('bot-move-max-fails', 3),
          replanWhenBannedAtLeast: this.getNumberInput('bot-move-replan-banned', 3),
          replanCooldownSeconds: this.getNumberInput('bot-move-replan-cooldown', 1.2)
        }
      };

      const res = await fetch(APIClient.BASE_URL + '/settings/bot', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
          'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
        },
        body: JSON.stringify(cfg)
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
        return;
      }
      await this.loadBotSettings();
    } catch {
      alert('Network error');
    }
  }

  private showBotHelp() {
    alert(
      [
        'Параметры бота (BOT):',
        '',
        'Планирование, сек — сколько секунд бот тратит на поиск плана (в это время не двигается и не стреляет).',
        'Резерв, сек — сколько секунд оставляем в конце хода на резервный выстрел.',
        'Execution time считается автоматически: 30 - plan - reserve.',
        '',
        'Лимит верёвки (easy/medium/hard) — лимит успешных attach верёвки за один ход на каждой сложности.',
        '',
        'Ошибка прицеливания / силы % — погрешность перед выстрелом. Например 30% означает шум до ±30% по углу/силе.',
        '',
        'Фитиль гранаты, сек — время до взрыва гранаты.',
        'Отскок гранаты — “прыгучесть” при отскоках (0..1).',
        'Трение гранаты — трение/гашение скорости при касании поверхности.',
        'Стоп-скорость гранаты — скорость, ниже которой граната считается остановившейся.',
        '',
        'Бонус за добивание — бонус к оценке, если выстрел (по оценке) добивает врага.',
        'Вес урона — вес ожидаемого урона в скоринге.',
        'Штраф за промах — штраф за промах/дистанцию до цели в скоринге.',
        'Штраф за движение (на пиксель) — штраф за перемещение к позиции (чем больше, тем меньше бот любит ходить далеко).',
        'Запас безопасности (радиус) — дополнительный запас безопасности к радиусу взрыва (чтобы не зацепить себя/союзников).',
        '',
        'Копание включено (0/1) — включить режим “копать под движение”, если нет хорошего плана выстрела.',
        'Копаний за ход — максимум копающих выстрелов за ход (обычно 1).',
        'Дистанции копания — расстояния по X от бота для точек копания (через запятую).',
        'Глубина копания min/max — насколько глубоко в грунт целиться относительно поверхности (пиксели).',
        '',
        'Movement (анти-зацикливание):',
        'Повторы стратегии/ход — сколько раз за ход можно выбрать одну и ту же стратегию (walk/jump/rope_*).',
        'Провалы стратегии/ход — сколько раз стратегия может не дать прогресса, после чего она банится до конца хода.',
        'Replan при бане ≥ — если забанено не меньше этого числа стратегий, бот сбрасывает план и ищет новый.',
        'Replan cooldown, сек — минимальная пауза между перепланированиями.'
      ].join('\\n')
    );
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
        this.lastWeapons = Array.isArray(weapons) ? weapons : [];
        if (!this.selectedWeaponId && this.lastWeapons.length > 0) {
          this.selectedWeaponId = this.lastWeapons[0].id;
        }
        this.renderWeaponList();
        if (this.selectedWeaponId) {
          this.selectWeapon(this.selectedWeaponId);
        } else {
          this.clearWeaponEditor();
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  private renderWeaponList() {
    const listEl = document.getElementById('weapon-list');
    const searchEl = document.getElementById('weapon-search') as HTMLInputElement | null;
    if (!listEl) return;

    const q = (searchEl?.value || '').trim().toLowerCase();
    const items = this.lastWeapons
      .filter(w => {
        if (!q) return true;
        const id = (w?.id || '').toString().toLowerCase();
        const name = (w?.name || '').toString().toLowerCase();
        return id.includes(q) || name.includes(q);
      })
      .map(w => {
        const score = this.computeWeaponScore100(w);
        const selected = this.selectedWeaponId === w.id;
        const cls = selected ? 'weapon-list-item selected' : 'weapon-list-item';
        const icon = w.icon_src ? `<img src="${w.icon_src}" class="weapon-list-icon" />` : `<div class="weapon-list-icon placeholder"></div>`;
        return `
          <button class="${cls}" data-id="${w.id}">
            ${icon}
            <div class="weapon-list-meta">
              <div class="weapon-list-name">${w.name}</div>
              <div class="weapon-list-sub">${w.id}</div>
            </div>
            <div class="weapon-list-score">${score}</div>
          </button>
        `;
      });

    listEl.innerHTML = items.join('');
    listEl.querySelectorAll<HTMLButtonElement>('.weapon-list-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!id) return;
        this.selectWeapon(id);
        this.renderWeaponList();
      });
    });
  }

  private clearWeaponEditor() {
    (document.getElementById('weapon-id') as HTMLInputElement | null)?.setAttribute('value', '');
    const fields = [
      'weapon-id','weapon-name','weapon-color','weapon-damage','weapon-radius','weapon-knockback','weapon-wind',
      'weapon-spread','weapon-projectiles','weapon-cooldown','weapon-chargespeed','weapon-speedmod','weapon-maxrange','weapon-fuse'
    ];
    for (const id of fields) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) continue;
      el.value = '';
    }
    const icon = document.getElementById('weapon-icon-preview') as HTMLImageElement | null;
    const proj = document.getElementById('weapon-projectile-preview') as HTMLImageElement | null;
    if (icon) icon.src = '';
    if (proj) proj.src = '';
    const derived = document.getElementById('weapon-derived');
    if (derived) derived.innerHTML = '';
    this.pendingWeaponIconSrc = null;
    this.pendingWeaponProjectileSrc = null;
    this.updateWeaponScoreBadge(null);
  }

  private selectWeapon(id: string) {
    const w = this.lastWeapons.find(x => x.id === id);
    if (!w) return;
    this.selectedWeaponId = id;
    this.pendingWeaponIconSrc = null;
    this.pendingWeaponProjectileSrc = null;

    (document.getElementById('weapon-id') as HTMLInputElement).value = w.id || '';
    (document.getElementById('weapon-name') as HTMLInputElement).value = w.name || '';
    (document.getElementById('weapon-color') as HTMLInputElement).value = w.color || '#ffffff';
    (document.getElementById('weapon-damage') as HTMLInputElement).value = String(w.damage ?? 0);
    (document.getElementById('weapon-radius') as HTMLInputElement).value = String(w.explosionRadius ?? 0);
    (document.getElementById('weapon-knockback') as HTMLInputElement).value = String(w.knockback ?? 0);
    (document.getElementById('weapon-wind') as HTMLInputElement).value = String(w.windMultiplier ?? 1);
    (document.getElementById('weapon-spread') as HTMLInputElement).value = String(w.spread ?? 0);
    (document.getElementById('weapon-projectiles') as HTMLInputElement).value = String(w.projectilesPerShot ?? 1);
    (document.getElementById('weapon-cooldown') as HTMLInputElement).value = String(w.cooldown ?? 1);
    (document.getElementById('weapon-chargespeed') as HTMLInputElement).value = String(w.chargeSpeed ?? 1);
    (document.getElementById('weapon-speedmod') as HTMLInputElement).value = String(w.speedModifier ?? 1);
    (document.getElementById('weapon-maxrange') as HTMLInputElement).value = String(w.maxRange ?? 1900);
    const fuseRaw = (w as any).fuseSeconds;
    const fuse = typeof fuseRaw === 'number' ? fuseRaw : ((w.id === 'grenade') ? 3.0 : 0);
    (document.getElementById('weapon-fuse') as HTMLInputElement).value = String(fuse);

    const icon = document.getElementById('weapon-icon-preview') as HTMLImageElement | null;
    const proj = document.getElementById('weapon-projectile-preview') as HTMLImageElement | null;
    if (icon) icon.src = w.icon_src || '';
    if (proj) proj.src = w.projectile_src || '';

    this.updateWeaponDerived();
  }

  private updateWeaponScoreBadge(score100: number | null) {
    const el = document.getElementById('weapon-score-badge');
    if (!el) return;
    if (score100 === null) {
      el.textContent = 'Score: --';
      el.setAttribute('data-score', '');
      return;
    }
    el.textContent = `Score: ${score100}`;
    el.setAttribute('data-score', String(score100));
  }

  private clamp01(x: number): number {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  private norm(x: number, min: number, max: number): number {
    if (!Number.isFinite(x)) return 0;
    return this.clamp01((x - min) / (max - min));
  }

  private computeWeaponScore100(w: any): number {
    const powerRef = 60;
    const damage = Number(w.damage) || 0;
    const radius = Number(w.explosionRadius) || 0;
    const knockback = Number(w.knockback) || 0;
    const wind = Number(w.windMultiplier) || 0;
    const spread = Number(w.spread) || 0;
    const pCount = Math.max(1, Number(w.projectilesPerShot) || 1);
    const cooldown = Number(w.cooldown) || 0;
    const chargeSpeed = Number(w.chargeSpeed) || 0;
    const speedMod = Number(w.speedModifier) || 0;
    const maxRange = Number(w.maxRange) || 0;
    const fuseSeconds = Number(w.fuseSeconds) || 0;

    const spreadNorm = this.norm(spread, 0, 25);
    const windNorm = this.norm(wind, 0, 1.5);
    const speedNorm = this.norm(speedMod, 0.6, 1.6);
    const radiusNorm = this.norm(radius, 8, 70);
    const knockNorm = this.norm(knockback, 0, 350);
    const rangeNorm = this.norm(maxRange, 600, 2400);
    const fuseNorm = this.norm(fuseSeconds, 0.5, 6.0);
    const pNorm = this.norm(pCount, 1, 6);

    const hitFactor = this.clamp01(1 - 0.55 * spreadNorm - 0.35 * windNorm + 0.25 * speedNorm);
    const aoeFactor = 0.35 + 0.65 * radiusNorm;

    const chargeTime = chargeSpeed <= 0 ? 0 : (powerRef / 100) / Math.max(0.0001, chargeSpeed);
    const cooldownEffective = cooldown * Math.max(0.2, powerRef / 100);
    const cycleTime = Math.max(0.15, chargeTime + cooldownEffective);

    const damageAdj = damage / pCount;
    const rawDps = (damageAdj * pCount * hitFactor * aoeFactor) / cycleTime;
    const rawDpsNorm = this.clamp01(rawDps / 120);
    const utility = 0.25 * knockNorm + 0.10 * radiusNorm + 0.10 * rangeNorm + 0.05 * fuseNorm;
    const variancePenalty = 0.6 * spreadNorm + 0.4 * pNorm;
    const score = this.clamp01(rawDpsNorm * 0.75 + utility * 0.25 - 0.15 * variancePenalty);
    return Math.round(score * 100);
  }

  private getWeaponEditorValueNumber(id: string, fallback: number): number {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  }

  private getWeaponEditorValueString(id: string, fallback: string): string {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const v = el ? el.value : '';
    return v && v.trim().length > 0 ? v : fallback;
  }

  private gatherWeaponFromEditor(): any | null {
    const id = this.getWeaponEditorValueString('weapon-id', '');
    if (!id) return null;
    return {
      id,
      name: this.getWeaponEditorValueString('weapon-name', id),
      color: this.getWeaponEditorValueString('weapon-color', '#ffffff'),
      damage: this.getWeaponEditorValueNumber('weapon-damage', 0),
      explosionRadius: this.getWeaponEditorValueNumber('weapon-radius', 0),
      knockback: this.getWeaponEditorValueNumber('weapon-knockback', 0),
      windMultiplier: this.getWeaponEditorValueNumber('weapon-wind', 1),
      spread: this.getWeaponEditorValueNumber('weapon-spread', 0),
      projectilesPerShot: Math.max(1, Math.floor(this.getWeaponEditorValueNumber('weapon-projectiles', 1))),
      cooldown: this.getWeaponEditorValueNumber('weapon-cooldown', 1),
      chargeSpeed: this.getWeaponEditorValueNumber('weapon-chargespeed', 1),
      speedModifier: this.getWeaponEditorValueNumber('weapon-speedmod', 1),
      maxRange: this.getWeaponEditorValueNumber('weapon-maxrange', 1900),
      fuseSeconds: this.getWeaponEditorValueNumber('weapon-fuse', 3.0),
      icon_src: this.pendingWeaponIconSrc,
      projectile_src: this.pendingWeaponProjectileSrc
    };
  }

  private updateWeaponDerived() {
    const w = this.gatherWeaponFromEditor();
    if (!w) {
      this.updateWeaponScoreBadge(null);
      return;
    }
    const score100 = this.computeWeaponScore100(w);
    this.updateWeaponScoreBadge(score100);

    const derivedEl = document.getElementById('weapon-derived');
    if (!derivedEl) return;
    const powerRef = 60;
    const chargeSpeed = Number(w.chargeSpeed) || 0;
    const cooldown = Number(w.cooldown) || 0;
    const chargeTime = chargeSpeed <= 0 ? 0 : (powerRef / 100) / Math.max(0.0001, chargeSpeed);
    const cooldownEffective = cooldown * Math.max(0.2, powerRef / 100);
    const cycleTime = chargeTime + cooldownEffective;
    derivedEl.innerHTML = `
      <div class="weapon-derived-row">
        <div>cycleTime</div><div>${cycleTime.toFixed(2)}s</div>
        <div>maxRange</div><div>${Math.round(Number(w.maxRange) || 0)}px</div>
        <div>score</div><div>${score100}</div>
      </div>
    `;
  }

  private async handleWeaponSpriteFile(e: Event, kind: 'icon' | 'projectile') {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const data = await this.fileToBase64(file);
    if (kind === 'icon') {
      this.pendingWeaponIconSrc = data;
      const img = document.getElementById('weapon-icon-preview') as HTMLImageElement | null;
      if (img) img.src = data;
    } else {
      this.pendingWeaponProjectileSrc = data;
      const img = document.getElementById('weapon-projectile-preview') as HTMLImageElement | null;
      if (img) img.src = data;
    }
  }

  private async saveSelectedWeapon() {
    const payload = this.gatherWeaponFromEditor();
    if (!payload) return;

    const exists = this.lastWeapons.some(w => w.id === payload.id);
    const url = exists ? (APIClient.BASE_URL + '/admin/weapons/' + payload.id) : (APIClient.BASE_URL + '/admin/weapons');
    const method = exists ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Failed to save: ' + (err.error || res.statusText));
      return;
    }
    await this.loadWeaponsData();
  }

  private async duplicateSelectedWeapon() {
    const payload = this.gatherWeaponFromEditor();
    if (!payload) return;
    payload.id = 'wpn_' + Math.random().toString(36).substring(2, 8).toLowerCase();
    payload.name = `${payload.name} copy`;

    const res = await fetch(APIClient.BASE_URL + '/admin/weapons', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Failed to duplicate: ' + (err.error || res.statusText));
      return;
    }

    await this.loadWeaponsData();
    this.selectedWeaponId = payload.id;
    this.renderWeaponList();
    this.selectWeapon(payload.id);
  }

  private async deleteSelectedWeapon() {
    const id = this.selectedWeaponId;
    if (!id) return;
    if (!confirm('Are you sure?')) return;

    const res = await fetch(APIClient.BASE_URL + '/admin/weapons/' + id, {
      method: 'DELETE',
      headers: {
        'X-Admin-Email': this.adminHeaders.get('X-Admin-Email') || '',
        'X-Admin-Password': this.adminHeaders.get('X-Admin-Password') || ''
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Failed to delete: ' + (err.error || res.statusText));
      return;
    }

    this.selectedWeaponId = null;
    await this.loadWeaponsData();
  }

  private createNewWeapon() {
    this.selectedWeaponId = null;
    this.pendingWeaponIconSrc = null;
    this.pendingWeaponProjectileSrc = null;
    const id = 'wpn_' + Math.random().toString(36).substring(2, 8).toLowerCase();
    (document.getElementById('weapon-id') as HTMLInputElement).value = id;
    (document.getElementById('weapon-name') as HTMLInputElement).value = 'New Weapon';
    (document.getElementById('weapon-color') as HTMLInputElement).value = '#ffffff';
    (document.getElementById('weapon-damage') as HTMLInputElement).value = '10';
    (document.getElementById('weapon-radius') as HTMLInputElement).value = '30';
    (document.getElementById('weapon-knockback') as HTMLInputElement).value = '100';
    (document.getElementById('weapon-wind') as HTMLInputElement).value = '1.0';
    (document.getElementById('weapon-spread') as HTMLInputElement).value = '0';
    (document.getElementById('weapon-projectiles') as HTMLInputElement).value = '1';
    (document.getElementById('weapon-cooldown') as HTMLInputElement).value = '1.0';
    (document.getElementById('weapon-chargespeed') as HTMLInputElement).value = '1.0';
    (document.getElementById('weapon-speedmod') as HTMLInputElement).value = '1.0';
    (document.getElementById('weapon-maxrange') as HTMLInputElement).value = '1900';
    (document.getElementById('weapon-fuse') as HTMLInputElement).value = '3.0';
    const icon = document.getElementById('weapon-icon-preview') as HTMLImageElement | null;
    const proj = document.getElementById('weapon-projectile-preview') as HTMLImageElement | null;
    if (icon) icon.src = '';
    if (proj) proj.src = '';
    this.updateWeaponDerived();
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

}
