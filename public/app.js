/* ================================
   CloudVault — Client Application
   ================================ */

const API = '/api';
let currentUser = null;
let currentFolderId = null;
let currentView = 'my-drive';
let isGridView = true;
let selectedFiles = [];
let contextTarget = null;
let shareDocId = null;

// ================================
// Utility Functions
// ================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function getFileTypeInfo(mimeType, name) {
  const ext = name.split('.').pop().toLowerCase();
  
  if (mimeType.includes('pdf')) return { icon: 'PDF', cls: 'pdf', emoji: '📄' };
  if (mimeType.includes('word') || mimeType.includes('document') || ext === 'doc' || ext === 'docx') return { icon: 'DOC', cls: 'doc', emoji: '📝' };
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || ext === 'xls' || ext === 'xlsx') return { icon: 'XLS', cls: 'xls', emoji: '📊' };
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation') || ext === 'ppt' || ext === 'pptx') return { icon: 'PPT', cls: 'ppt', emoji: '📑' };
  if (mimeType.startsWith('image/')) return { icon: 'IMG', cls: 'img', emoji: '🖼️' };
  if (mimeType.startsWith('video/')) return { icon: 'VID', cls: 'vid', emoji: '🎬' };
  if (mimeType.startsWith('audio/')) return { icon: 'AUD', cls: 'vid', emoji: '🎵' };
  if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'md' || ext === 'csv') return { icon: 'TXT', cls: 'txt', emoji: '📃' };
  if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return { icon: 'ZIP', cls: 'zip', emoji: '📦' };
  return { icon: ext.toUpperCase().slice(0, 3), cls: 'default', emoji: '📄' };
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${url}`, { ...options, headers });
  const data = await res.json();
  
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      logout();
    }
    throw new Error(data.error || 'Something went wrong');
  }
  
  return data;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 300ms ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ================================
// Authentication
// ================================

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  const targetTab = document.querySelector(`[data-tab="${tab}"]`);
  const targetForm = document.getElementById(`${tab}-form`);
  if (targetTab) targetTab.classList.add('active');
  if (targetForm) targetForm.classList.add('active');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('.link-switch-tab').forEach(link => {
  link.addEventListener('click', () => switchTab(link.dataset.goto));
});

// Demo account instant autofill
const btnDemo = document.getElementById('btn-demo-autofill');
if (btnDemo) {
  btnDemo.addEventListener('click', () => {
    switchTab('login');
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (emailInput && pwdInput) {
      emailInput.value = 'tester';
      pwdInput.value = '123456';
      showToast('Demo credentials auto-filled! Click Unlock Vault.', 'info');
      pwdInput.focus();
    }
  });
}

// Password visibility toggles
document.querySelectorAll('.btn-toggle-password').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const openEye = btn.querySelector('.eye-open');
    const closedEye = btn.querySelector('.eye-closed');
    if (openEye && closedEye) {
      openEye.classList.toggle('hidden', isPassword);
      closedEye.classList.toggle('hidden', !isPassword);
    }
  });
});

// Interactive Password Strength Meter
const registerPasswordInput = document.getElementById('register-password');
const strengthText = document.getElementById('pwd-strength-text');
const strengthBars = document.querySelectorAll('.gauge-pip, .meter-bar');

if (registerPasswordInput && strengthText) {
  registerPasswordInput.addEventListener('input', (e) => {
    const val = e.target.value;
    let score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const colors = ['#71717a', '#f59e0b', '#22c55e', '#ffffff'];
    const labels = [
      { text: 'LOW ENTROPY', color: '#71717a' },
      { text: 'MODERATE (OK)', color: '#f59e0b' },
      { text: 'COMPLIANT', color: '#22c55e' },
      { text: 'CRYPTO-GRADE ◈', color: '#ededed' }
    ];

    strengthBars.forEach((bar, idx) => {
      if (val.length === 0) {
        bar.style.background = 'rgba(255, 255, 255, 0.08)';
      } else if (idx < score) {
        bar.style.background = colors[score - 1];
      } else {
        bar.style.background = 'rgba(255, 255, 255, 0.08)';
      }
    });

    if (val.length === 0) {
      strengthText.textContent = 'MIN 6 CHARS';
      strengthText.style.color = '#52525b';
    } else {
      const current = labels[Math.max(0, score - 1)];
      strengthText.textContent = current.text;
      strengthText.style.color = current.color;
    }
  });
}

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  
  btn.disabled = true;
  errEl.classList.remove('visible');
  
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      })
    });
    
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
  }
});

// Register
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-register');
  const errEl = document.getElementById('register-error');
  
  btn.disabled = true;
  errEl.classList.remove('visible');
  
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.getElementById('register-name').value,
        username: document.getElementById('register-username').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value
      })
    });
    
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    enterApp();
    showToast('Welcome to CloudVault!', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
  }
});

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

document.getElementById('btn-logout').addEventListener('click', logout);

async function enterApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  
  // Set user info
  if (currentUser) {
    document.getElementById('user-initials').textContent = getInitials(currentUser.full_name);
    document.getElementById('user-avatar-btn').style.background = currentUser.avatar_color || 'var(--gradient-accent)';
    document.getElementById('dropdown-name').textContent = currentUser.full_name;
    document.getElementById('dropdown-email').textContent = currentUser.email;
  }
  
  currentFolderId = null;
  currentView = 'my-drive';
  setActiveNav('my-drive');
  await loadContent();
  loadStats();
  loadStorageConfig();
}

// Check token or public share link on load
async function checkAuth() {
  // Check if navigating to a public share link
  const pathShareMatch = window.location.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
  const hashShareMatch = window.location.hash.match(/#\/?share[=\/]([a-zA-Z0-9]+)/);
  const queryShare = new URLSearchParams(window.location.search).get('share');
  const shareToken = (pathShareMatch && pathShareMatch[1]) || (hashShareMatch && hashShareMatch[1]) || queryShare;

  if (shareToken) {
    loadPublicShareScreen(shareToken);
    return;
  }

  const token = localStorage.getItem('token');
  if (token) {
    try {
      const data = await apiFetch('/auth/me');
      currentUser = data.user;
      enterApp();
    } catch {
      localStorage.removeItem('token');
    }
  }
}

// ================================
// Navigation
// ================================

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`[data-view="${view}"]`);
  if (navEl) navEl.classList.add('active');
  
  currentView = view;
  
  const viewTitle = document.getElementById('view-title');
  const btnNewFolder = document.getElementById('btn-new-folder');
  const breadcrumbs = document.getElementById('breadcrumbs');
  
  const titles = {
    'my-drive': 'My Drive',
    'shared': 'Shared with Me',
    'shared-by-me': 'Shared by Me',
    'starred': 'Starred',
    'trash': 'Trash'
  };
  
  viewTitle.textContent = titles[view] || 'My Drive';
  btnNewFolder.style.display = (view === 'my-drive') ? '' : 'none';
  breadcrumbs.style.display = (view === 'my-drive') ? '' : 'none';
  const btnEmptyTrash = document.getElementById('btn-empty-trash');
  if (btnEmptyTrash) btnEmptyTrash.style.display = (view === 'trash') ? '' : 'none';
}

document.querySelectorAll('.nav-item').forEach(nav => {
  nav.addEventListener('click', async (e) => {
    e.preventDefault();
    const view = nav.dataset.view;
    currentFolderId = null;
    setActiveNav(view);
    resetBreadcrumbs();
    await loadContent();
  });
});

// ================================
// Content Loading
// ================================

async function loadContent() {
  const filesGrid = document.getElementById('files-grid');
  const filesList = document.getElementById('files-list');
  const foldersGrid = document.getElementById('folders-grid');
  const emptyState = document.getElementById('empty-state');
  const foldersLabel = document.getElementById('folders-label');
  const filesLabel = document.getElementById('files-label');
  
  filesGrid.innerHTML = '';
  filesList.innerHTML = '';
  foldersGrid.innerHTML = '';
  emptyState.style.display = 'none';
  foldersLabel.style.display = 'none';
  filesLabel.style.display = 'none';
  
  try {
    let documents = [];
    let folders = [];
    
    if (currentView === 'my-drive') {
      // Load folders
      const folderParams = currentFolderId ? `?parent_id=${currentFolderId}` : '';
      const folderData = await apiFetch(`/folders${folderParams}`);
      folders = folderData.folders || [];
      
      // Load documents
      const docParams = currentFolderId ? `?folder_id=${currentFolderId}` : '';
      const docData = await apiFetch(`/documents${docParams}`);
      documents = docData.documents || [];
      
    } else if (currentView === 'shared') {
      const data = await apiFetch('/documents/shared');
      documents = data.documents || [];
      
    } else if (currentView === 'shared-by-me') {
      const data = await apiFetch('/documents/shared-by-me');
      documents = data.documents || [];
      
    } else if (currentView === 'starred') {
      const data = await apiFetch('/documents?starred=1');
      documents = data.documents || [];
      
    } else if (currentView === 'trash') {
      const data = await apiFetch('/documents?trashed=1');
      documents = data.documents || [];
    }
    
    if (folders.length === 0 && documents.length === 0) {
      const emptyMessages = {
        'my-drive': { title: 'No documents yet', desc: 'Upload your first document to get started' },
        'shared': { title: 'Nothing shared with you yet', desc: 'Documents others share with you will appear here' },
        'shared-by-me': { title: 'No shared documents yet', desc: 'Documents you share with teammates will appear here' },
        'starred': { title: 'No starred documents', desc: 'Star important documents for quick access' },
        'trash': { title: 'Trash is empty', desc: 'Deleted documents will appear here' }
      };
      
      document.getElementById('empty-title').textContent = emptyMessages[currentView]?.title || 'No documents';
      document.getElementById('empty-description').textContent = emptyMessages[currentView]?.desc || '';
      document.getElementById('empty-upload-btn').style.display = currentView === 'my-drive' ? '' : 'none';
      emptyState.style.display = 'flex';
      return;
    }
    
    // Render folders
    if (folders.length > 0) {
      foldersLabel.style.display = 'flex';
      folders.forEach(folder => {
        const card = createFolderCard(folder);
        foldersGrid.appendChild(card);
      });
    }
    
    // Render files
    if (documents.length > 0) {
      filesLabel.style.display = 'flex';
      
      if (isGridView) {
        filesGrid.classList.remove('hidden');
        filesList.classList.remove('active');
        documents.forEach(doc => {
          const card = createFileCard(doc);
          filesGrid.appendChild(card);
        });
      } else {
        filesGrid.classList.add('hidden');
        filesList.classList.add('active');
        
        const header = document.createElement('div');
        header.className = 'file-list-header';
        header.innerHTML = '<span>Name</span><span>Owner</span><span>Size</span><span>Modified</span><span></span>';
        filesList.appendChild(header);
        
        documents.forEach(doc => {
          const row = createFileRow(doc);
          filesList.appendChild(row);
        });
      }
    }
    
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'folder-card';
  card.dataset.id = folder.id;
  card.innerHTML = `
    <div class="folder-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
    </div>
    <div class="folder-info">
      <div class="folder-name">${escapeHtml(folder.name)}</div>
      <div class="folder-meta">${folder.document_count || 0} files</div>
    </div>
  `;
  
  card.addEventListener('dblclick', () => navigateToFolder(folder.id, folder.name));
  card.addEventListener('click', () => navigateToFolder(folder.id, folder.name));
  
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, { type: 'folder', data: folder });
  });
  
  return card;
}

function isImageFile(mimeType, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return (mimeType && mimeType.startsWith('image/')) || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
}

function isVideoFile(mimeType, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return (mimeType && mimeType.startsWith('video/')) || ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext);
}

function isAudioFile(mimeType, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return (mimeType && mimeType.startsWith('audio/')) || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext);
}

function isPdfFile(mimeType, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return (mimeType && mimeType.includes('pdf')) || ext === 'pdf';
}

function createFileCard(doc) {
  const typeInfo = getFileTypeInfo(doc.mime_type, doc.name);
  const card = document.createElement('div');
  card.className = 'file-card';
  card.dataset.id = doc.id;
  
  let badges = '';
  if (doc.is_starred) badges += '<span class="file-star">⭐</span>';
  if (doc.share_count > 0) badges += `<span class="file-share-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${doc.share_count}</span>`;
  
  const token = localStorage.getItem('token');
  const isImg = isImageFile(doc.mime_type, doc.name);
  let previewInner = '';

  if (isImg && token) {
    const thumbUrl = `/api/documents/${doc.id}/preview?token=${encodeURIComponent(token)}`;
    previewInner = `
      <img src="${thumbUrl}" class="file-thumb-img" alt="${escapeHtml(doc.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="file-type-icon ${typeInfo.cls}" style="display:none">${typeInfo.icon}</div>
      ${badges}
    `;
  } else {
    previewInner = `
      <div class="file-type-icon ${typeInfo.cls}">${typeInfo.icon}</div>
      ${badges}
    `;
  }

  card.innerHTML = `
    <div class="file-hover-actions">
      <button class="card-action-btn btn-card-open" title="Open Preview">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="card-action-btn btn-card-download" title="Download">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </button>
      <button class="card-action-btn btn-card-share" title="Share & Permissions">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>
    <div class="file-preview">
      ${previewInner}
    </div>
    <div class="file-details">
      <div class="file-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
      <div class="file-meta">
        <span>${formatBytes(doc.size)}</span>
        <span>${formatDate(doc.updated_at || doc.created_at)}</span>
      </div>
    </div>
    <div class="file-card-actions">
      <button class="btn-card-action btn-card-share" title="Share with users or copy link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Share</span>
      </button>
      <button class="btn-card-action btn-card-open" title="Open document preview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span>Open</span>
      </button>
      <button class="btn-card-action-icon btn-card-download" title="Download">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </button>
    </div>
  `;
  
  // Wire card buttons
  card.querySelectorAll('.btn-card-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDocumentPreview(doc);
    });
  });

  card.querySelectorAll('.btn-card-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadDocument(doc);
    });
  });

  card.querySelectorAll('.btn-card-share').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openShareModal(doc);
    });
  });

  card.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openDocumentPreview(doc);
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, { type: 'document', data: doc });
  });
  
  card.addEventListener('click', (e) => {
    if (e.target.closest('.file-card-actions') || e.target.closest('.file-hover-actions')) return;
    if (e.ctrlKey || e.metaKey) {
      card.classList.toggle('selected');
      return;
    }
    // Single click opens document preview
    openDocumentPreview(doc);
  });
  
  return card;
}

function createFileRow(doc) {
  const typeInfo = getFileTypeInfo(doc.mime_type, doc.name);
  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.id = doc.id;
  
  row.innerHTML = `
    <div class="file-row-name">
      <div class="file-row-icon ${typeInfo.cls}">${typeInfo.icon}</div>
      <span class="file-row-label">${doc.is_starred ? '⭐ ' : ''}${escapeHtml(doc.name)}</span>
    </div>
    <span class="file-row-owner">${escapeHtml(doc.owner_name || 'You')}</span>
    <span class="file-row-size">${formatBytes(doc.size)}</span>
    <span class="file-row-date">${formatDate(doc.updated_at || doc.created_at)}</span>
    <div class="file-row-actions">
      <button class="btn-row-share-pill btn-row-share" title="Share & Access Controls">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Share</span>
      </button>
      <button class="btn-icon btn-sm btn-row-open" title="Open Preview">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="btn-icon btn-sm btn-row-download" title="Download">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </button>
      <button class="btn-more" title="More actions">⋮</button>
    </div>
  `;
  
  row.querySelector('.btn-row-share').addEventListener('click', (e) => {
    e.stopPropagation();
    openShareModal(doc);
  });

  row.querySelector('.btn-row-open').addEventListener('click', (e) => {
    e.stopPropagation();
    openDocumentPreview(doc);
  });

  row.querySelector('.btn-row-download').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadDocument(doc);
  });

  row.querySelector('.btn-more').addEventListener('click', (e) => {
    e.stopPropagation();
    showContextMenu(e, { type: 'document', data: doc });
  });

  row.addEventListener('click', (e) => {
    if (e.target.closest('.file-row-actions')) return;
    if (e.ctrlKey || e.metaKey) {
      row.classList.toggle('selected');
      return;
    }
    openDocumentPreview(doc);
  });
  
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, { type: 'document', data: doc });
  });
  
  return row;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================================
// Folder Navigation
// ================================

async function navigateToFolder(folderId, folderName) {
  currentFolderId = folderId;
  await updateBreadcrumbs();
  await loadContent();
}

function resetBreadcrumbs() {
  const bc = document.getElementById('breadcrumbs');
  bc.innerHTML = `
    <a href="#" class="breadcrumb-item" data-folder="">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
      My Drive
    </a>
  `;
  bc.querySelector('.breadcrumb-item').addEventListener('click', (e) => {
    e.preventDefault();
    currentFolderId = null;
    resetBreadcrumbs();
    loadContent();
  });
}

async function updateBreadcrumbs() {
  if (!currentFolderId) {
    resetBreadcrumbs();
    return;
  }
  
  try {
    const data = await apiFetch(`/folders/${currentFolderId}/breadcrumbs`);
    const bc = document.getElementById('breadcrumbs');
    
    bc.innerHTML = '';
    
    // Root
    const root = document.createElement('a');
    root.href = '#';
    root.className = 'breadcrumb-item';
    root.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> My Drive`;
    root.addEventListener('click', (e) => {
      e.preventDefault();
      currentFolderId = null;
      resetBreadcrumbs();
      loadContent();
    });
    bc.appendChild(root);
    
    data.breadcrumbs.forEach(crumb => {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '›';
      bc.appendChild(sep);
      
      const item = document.createElement('a');
      item.href = '#';
      item.className = 'breadcrumb-item';
      item.textContent = crumb.name;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToFolder(crumb.id, crumb.name);
      });
      bc.appendChild(item);
    });
    
  } catch (err) {
    console.error('Breadcrumbs error:', err);
  }
}

// ================================
// Context Menu
// ================================

function showContextMenu(e, target) {
  contextTarget = target;
  const menu = document.getElementById('context-menu');
  
  // Update menu items based on target
  const starText = document.getElementById('star-text');
  const trashText = document.getElementById('trash-text');
  const deletePermItem = document.getElementById('context-delete-perm');
  
  if (target.type === 'document') {
    starText.textContent = target.data.is_starred ? 'Unstar' : 'Star';
    trashText.textContent = target.data.is_trashed ? 'Restore' : 'Move to Trash';
    menu.querySelector('[data-action="download"]').style.display = '';
    menu.querySelector('[data-action="share"]').style.display = '';
    menu.querySelector('[data-action="star"]').style.display = '';
    if (deletePermItem) deletePermItem.style.display = target.data.is_trashed ? '' : 'none';
  } else {
    menu.querySelector('[data-action="download"]').style.display = 'none';
    menu.querySelector('[data-action="share"]').style.display = 'none';
    menu.querySelector('[data-action="star"]').style.display = 'none';
    trashText.textContent = 'Delete Folder';
    if (deletePermItem) deletePermItem.style.display = 'none';
  }
  
  // Position menu
  const x = Math.min(e.clientX, window.innerWidth - 220);
  const y = Math.min(e.clientY, window.innerHeight - 280);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('open');
}

document.addEventListener('click', () => {
  document.getElementById('context-menu').classList.remove('open');
});

document.getElementById('btn-empty-trash')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to empty the trash? All deleted files will be permanently erased.')) return;
  try {
    const data = await apiFetch('/documents?trashed=1');
    const docs = data.documents || [];
    for (const doc of docs) {
      await apiFetch(`/documents/${doc.id}`, { method: 'DELETE' });
    }
    showToast('Trash emptied permanently', 'info');
    loadContent();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.querySelectorAll('.context-item').forEach(item => {
  item.addEventListener('click', async () => {
    if (!contextTarget) return;
    const action = item.dataset.action;
    
    try {
      if (contextTarget.type === 'document') {
        const doc = contextTarget.data;
        
        switch (action) {
          case 'open':
            openDocumentPreview(doc);
            break;
          case 'download':
            downloadDocument(doc);
            break;
          case 'share':
            openShareModal(doc);
            break;
          case 'rename':
            openRenameModal('document', doc);
            break;
          case 'star':
            await apiFetch(`/documents/${doc.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ is_starred: !doc.is_starred })
            });
            showToast(doc.is_starred ? 'Removed from starred' : 'Added to starred', 'success');
            loadContent();
            break;
          case 'trash':
            if (doc.is_trashed) {
              await apiFetch(`/documents/${doc.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_trashed: false })
              });
              showToast('Document restored', 'success');
            } else {
              await apiFetch(`/documents/${doc.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_trashed: true })
              });
              showToast('Moved to trash', 'info');
            }
            loadContent();
            loadStats();
            break;
          case 'delete-perm':
            if (confirm(`Permanently delete "${doc.name}"? Cloud and local storage files will be erased.`)) {
              await apiFetch(`/documents/${doc.id}`, { method: 'DELETE' });
              showToast('Document deleted permanently', 'info');
              loadContent();
              loadStats();
            }
            break;
        }
        
      } else if (contextTarget.type === 'folder') {
        const folder = contextTarget.data;
        
        switch (action) {
          case 'open':
            navigateToFolder(folder.id, folder.name);
            break;
          case 'rename':
            openRenameModal('folder', folder);
            break;
          case 'trash':
            if (confirm(`Delete folder "${folder.name}"? Files inside will be moved to root.`)) {
              await apiFetch(`/folders/${folder.id}`, { method: 'DELETE' });
              showToast('Folder deleted', 'info');
              loadContent();
            }
            break;
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});

// ================================
// Upload
// ================================

let uploadQueue = [];

function openUploadModal() {
  uploadQueue = [];
  document.getElementById('upload-queue').innerHTML = '';
  document.getElementById('btn-start-upload').disabled = true;
  openModal('upload-modal');
}

document.getElementById('btn-new-upload').addEventListener('click', openUploadModal);
document.getElementById('empty-upload-btn')?.addEventListener('click', openUploadModal);

// Upload area click
document.getElementById('upload-area').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

// File input change
document.getElementById('file-input').addEventListener('change', (e) => {
  addFilesToQueue(e.target.files);
  e.target.value = '';
});

// Hidden file input for drag-drop on main area
document.getElementById('hidden-file-input').addEventListener('change', (e) => {
  addFilesToQueue(e.target.files);
  e.target.value = '';
  openUploadModal();
});

// Drag and drop on upload area
const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  addFilesToQueue(e.dataTransfer.files);
});

// Drag and drop on main content
const mainContent = document.querySelector('.main-content');
const dropZone = document.getElementById('drop-zone');

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (document.getElementById('app-screen').classList.contains('active')) {
    dropZone.classList.add('active');
  }
});

dropZone.addEventListener('dragleave', (e) => {
  if (e.target === dropZone) dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  addFilesToQueue(e.dataTransfer.files);
  openUploadModal();
});

function addFilesToQueue(files) {
  const queue = document.getElementById('upload-queue');
  
  Array.from(files).forEach(file => {
    const id = Math.random().toString(36).substr(2, 9);
    uploadQueue.push({ id, file });
    
    const typeInfo = getFileTypeInfo(file.type, file.name);
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.id = `upload-item-${id}`;
    item.innerHTML = `
      <div class="upload-item-icon ${typeInfo.cls}">${typeInfo.icon}</div>
      <div class="upload-item-info">
        <div class="upload-item-name">${escapeHtml(file.name)}</div>
        <div class="upload-item-size">${formatBytes(file.size)}</div>
        <div class="upload-progress"><div class="upload-progress-fill" id="progress-${id}"></div></div>
      </div>
      <button class="upload-item-remove" data-id="${id}" title="Remove">✕</button>
    `;
    
    item.querySelector('.upload-item-remove').addEventListener('click', () => {
      uploadQueue = uploadQueue.filter(q => q.id !== id);
      item.remove();
      document.getElementById('btn-start-upload').disabled = uploadQueue.length === 0;
    });
    
    queue.appendChild(item);
  });
  
  document.getElementById('btn-start-upload').disabled = uploadQueue.length === 0;
}

document.getElementById('btn-start-upload').addEventListener('click', async () => {
  const btn = document.getElementById('btn-start-upload');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner"></div><span>Uploading...</span>';
  
  const formData = new FormData();
  uploadQueue.forEach(item => formData.append('files', item.file));
  if (currentFolderId) formData.append('folder_id', currentFolderId);
  
  try {
    const token = localStorage.getItem('token');
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        uploadQueue.forEach(item => {
          const fill = document.getElementById(`progress-${item.id}`);
          if (fill) fill.style.width = pct + '%';
        });
      }
    });
    
    await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      
      xhr.open('POST', `${API}/documents/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
    
    showToast(`${uploadQueue.length} file(s) uploaded successfully`, 'success');
    closeModal('upload-modal');
    loadContent();
    loadStats();
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg><span>Upload</span>';
  }
});

// ================================
// Folders
// ================================

document.getElementById('btn-new-folder').addEventListener('click', () => {
  document.getElementById('folder-name-input').value = '';
  openModal('folder-modal');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 100);
});

document.getElementById('btn-create-folder').addEventListener('click', async () => {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) return;
  
  try {
    await apiFetch('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: currentFolderId })
    });
    showToast('Folder created', 'success');
    closeModal('folder-modal');
    loadContent();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Enter key support for folder creation
document.getElementById('folder-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-create-folder').click();
});

// ================================
// Rename
// ================================

let renameTarget = null;

function openRenameModal(type, item) {
  renameTarget = { type, item };
  document.getElementById('rename-input').value = item.name;
  openModal('rename-modal');
  setTimeout(() => {
    const input = document.getElementById('rename-input');
    input.focus();
    input.select();
  }, 100);
}

document.getElementById('btn-confirm-rename').addEventListener('click', async () => {
  if (!renameTarget) return;
  const newName = document.getElementById('rename-input').value.trim();
  if (!newName) return;
  
  try {
    if (renameTarget.type === 'document') {
      await apiFetch(`/documents/${renameTarget.item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName })
      });
    } else {
      await apiFetch(`/folders/${renameTarget.item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName })
      });
    }
    showToast('Renamed successfully', 'success');
    closeModal('rename-modal');
    loadContent();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('rename-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-confirm-rename').click();
});

// ================================
// Sharing
// ================================

async function loadQuickTeamUsers() {
  const container = document.getElementById('quick-user-chips');
  if (!container) return;
  container.innerHTML = '<span style="font-size:12px; color:var(--text-tertiary)">Loading suggested users...</span>';

  try {
    const data = await apiFetch('/auth/search');
    const users = data.users || [];
    if (users.length === 0) {
      container.innerHTML = '<span style="font-size:12px; color:var(--text-tertiary)">No other users found in workspace. Type email directly below.</span>';
      return;
    }

    container.innerHTML = '';
    users.forEach(u => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-user-chip';
      chip.innerHTML = `
        <span class="user-chip-avatar" style="background:${u.avatar_color || '#6366f1'}">${getInitials(u.full_name || u.username)}</span>
        <span class="user-chip-name">${escapeHtml(u.full_name || u.username)}</span>
        <span class="user-chip-email">(${escapeHtml(u.email)})</span>
      `;
      chip.addEventListener('click', () => {
        document.getElementById('share-email').value = u.email;
        document.querySelectorAll('.quick-user-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        document.getElementById('share-permission').focus();
      });
      container.appendChild(chip);
    });
  } catch {
    container.innerHTML = '<span style="font-size:12px; color:var(--text-tertiary)">Type email directly below</span>';
  }
}

function openShareModal(doc) {
  shareDocId = doc.id;
  document.getElementById('share-doc-name').textContent = doc.name;
  document.getElementById('share-email').value = '';
  document.getElementById('share-error').classList.remove('visible');
  document.getElementById('public-link-display').style.display = 'none';
  document.getElementById('btn-create-public-link').style.display = '';
  
  openModal('share-modal');
  loadQuickTeamUsers();
  loadShares(doc.id);
}

async function loadShares(docId) {
  const shareList = document.getElementById('share-list');
  
  try {
    const data = await apiFetch(`/shares/document/${docId}`);
    const shares = data.shares || [];
    
    if (shares.length === 0) {
      shareList.innerHTML = '<div class="share-empty">No external users have access yet</div>';
      return;
    }
    
    shareList.innerHTML = '';
    
    shares.forEach(share => {
      if (share.is_public) {
        // Show public link
        document.getElementById('public-link-display').style.display = 'flex';
        document.getElementById('public-link-url').value = `${window.location.origin}/share/${share.share_link}`;
        document.getElementById('btn-create-public-link').style.display = 'none';
        return;
      }
      
      const item = document.createElement('div');
      item.className = 'share-item';
      const name = share.shared_with_name || share.shared_with_email || 'Unknown';
      const email = share.shared_with_email_user || share.shared_with_email || '';
      const color = share.avatar_color || '#6366f1';
      
      item.innerHTML = `
        <div class="share-avatar" style="background:${color}">${getInitials(name)}</div>
        <div class="share-user-info">
          <div class="share-user-name">${escapeHtml(name)}</div>
          <div class="share-user-email">${escapeHtml(email)}</div>
        </div>
        <div class="share-item-actions">
          <select class="share-perm-select" data-share-id="${share.id}" title="Change Permission">
            <option value="view" ${share.permission === 'view' ? 'selected' : ''}>👁️ Viewer</option>
            <option value="download" ${share.permission === 'download' ? 'selected' : ''}>📥 Downloader</option>
            <option value="edit" ${share.permission === 'edit' ? 'selected' : ''}>✏️ Editor</option>
          </select>
          <button class="btn-revoke" title="Revoke access" data-share-id="${share.id}">✕ Revoke</button>
        </div>
      `;
      
      item.querySelector('.share-perm-select').addEventListener('change', async (e) => {
        try {
          await apiFetch(`/shares/${share.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ permission: e.target.value })
          });
          showToast(`Access updated to ${e.target.value}`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
          loadShares(docId);
        }
      });

      item.querySelector('.btn-revoke').addEventListener('click', async () => {
        try {
          await apiFetch(`/shares/${share.id}`, { method: 'DELETE' });
          showToast('Access revoked', 'info');
          loadShares(docId);
          loadContent();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      
      shareList.appendChild(item);
    });
    
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Share button
document.getElementById('btn-share-send').addEventListener('click', async () => {
  const email = document.getElementById('share-email').value.trim();
  const permission = document.getElementById('share-permission').value;
  const errEl = document.getElementById('share-error');
  
  if (!email) {
    errEl.textContent = 'Please select a suggested user or enter an email address';
    errEl.classList.add('visible');
    return;
  }
  
  errEl.classList.remove('visible');
  
  try {
    await apiFetch('/shares', {
      method: 'POST',
      body: JSON.stringify({
        document_id: shareDocId,
        shared_with_email: email,
        permission
      })
    });
    
    showToast(`Access granted to ${email}`, 'success');
    document.getElementById('share-email').value = '';
    loadShares(shareDocId);
    loadContent();
    
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  }
});

// Create public link
document.getElementById('btn-create-public-link').addEventListener('click', async () => {
  try {
    const data = await apiFetch('/shares', {
      method: 'POST',
      body: JSON.stringify({
        document_id: shareDocId,
        is_public: true,
        permission: 'view'
      })
    });
    
    const link = `${window.location.origin}/share/${data.share.share_link}`;
    document.getElementById('public-link-url').value = link;
    document.getElementById('public-link-display').style.display = 'flex';
    document.getElementById('btn-create-public-link').style.display = 'none';
    showToast('Public link generated', 'success');
    
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Copy link
document.getElementById('btn-copy-link').addEventListener('click', () => {
  const input = document.getElementById('public-link-url');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Public link copied to clipboard', 'success');
  });
});

// Visit public link
const btnVisitLink = document.getElementById('btn-visit-link');
if (btnVisitLink) {
  btnVisitLink.addEventListener('click', () => {
    const link = document.getElementById('public-link-url').value;
    if (link) window.open(link, '_blank');
  });
}

// ================================
// Search
// ================================

let searchDebounce = null;
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const query = e.target.value.trim();
  
  if (!query) {
    currentView = 'my-drive';
    setActiveNav('my-drive');
    loadContent();
    return;
  }
  
  searchDebounce = setTimeout(async () => {
    try {
      const data = await apiFetch(`/documents?search=${encodeURIComponent(query)}`);
      const documents = data.documents || [];
      
      document.getElementById('view-title').textContent = `Search: "${query}"`;
      document.getElementById('btn-new-folder').style.display = 'none';
      document.getElementById('breadcrumbs').style.display = 'none';
      document.getElementById('folders-grid').innerHTML = '';
      document.getElementById('folders-label').style.display = 'none';
      
      const filesGrid = document.getElementById('files-grid');
      const filesList = document.getElementById('files-list');
      const filesLabel = document.getElementById('files-label');
      const emptyState = document.getElementById('empty-state');
      
      filesGrid.innerHTML = '';
      filesList.innerHTML = '';
      
      if (documents.length === 0) {
        filesLabel.style.display = 'none';
        document.getElementById('empty-title').textContent = 'No results found';
        document.getElementById('empty-description').textContent = `No documents match "${query}"`;
        document.getElementById('empty-upload-btn').style.display = 'none';
        emptyState.style.display = 'flex';
      } else {
        emptyState.style.display = 'none';
        filesLabel.style.display = 'flex';
        
        if (isGridView) {
          filesGrid.classList.remove('hidden');
          filesList.classList.remove('active');
          documents.forEach(doc => filesGrid.appendChild(createFileCard(doc)));
        } else {
          filesGrid.classList.add('hidden');
          filesList.classList.add('active');
          const header = document.createElement('div');
          header.className = 'file-list-header';
          header.innerHTML = '<span>Name</span><span>Owner</span><span>Size</span><span>Modified</span><span></span>';
          filesList.appendChild(header);
          documents.forEach(doc => filesList.appendChild(createFileRow(doc)));
        }
      }
      
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, 300);
});

// ================================
// View Toggle
// ================================

document.getElementById('view-toggle').addEventListener('click', () => {
  isGridView = !isGridView;
  const btn = document.getElementById('view-toggle');
  
  if (isGridView) {
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
  } else {
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
  }
  
  loadContent();
});

// ================================
// Stats
// ================================

async function loadStats() {
  try {
    const data = await apiFetch('/activity/stats');
    const stats = data.stats;
    
    const usedPct = (stats.total_size / stats.storage_limit) * 100;
    document.getElementById('storage-fill').style.width = Math.min(usedPct, 100) + '%';
    document.getElementById('storage-text').textContent = `${formatBytes(stats.total_size)} / ${formatBytes(stats.storage_limit)}`;
    
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ================================
// Modal Helpers
// ================================

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close buttons
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.getElementById('context-menu').classList.remove('open');
  }
});

// ================================
// User Menu
// ================================

document.getElementById('user-avatar-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('user-dropdown').classList.toggle('open');
});

document.addEventListener('click', () => {
  document.getElementById('user-dropdown').classList.remove('open');
});

// ================================
// Sidebar Toggle (Mobile)
// ================================

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ================================
// Document Download Helper
// ================================

function downloadDocument(doc) {
  try {
    const token = localStorage.getItem('token');
    const downloadUrl = `/api/documents/${doc.id}/download?token=${encodeURIComponent(token || '')}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = doc.original_name || doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download started', 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

// ================================
// Document Previewer
// ================================

function isCodeOrTextFile(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sql', 'sh', 'bat', 'ps1', 'xml', 'yaml', 'yml', 'csv', 'env', 'log', 'ini'].includes(ext);
}

function showPreviewFallback(doc, viewport, loading, errorMsg = null) {
  if (loading) loading.style.display = 'none';
  const typeInfo = getFileTypeInfo(doc.mime_type, doc.name);
  viewport.innerHTML = `
    <div class="preview-fallback">
      <div class="preview-fallback-icon">${typeInfo.emoji}</div>
      <div class="preview-fallback-name">${escapeHtml(doc.name)}</div>
      <div class="preview-fallback-meta">${formatBytes(doc.size)} • ${doc.mime_type}</div>
      ${errorMsg ? `<div class="form-error visible" style="margin-bottom:16px">${escapeHtml(errorMsg)}</div>` : ''}
      <button class="btn btn-primary" id="btn-fallback-download">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        <span>Download to View</span>
      </button>
    </div>
  `;
  const btn = viewport.querySelector('#btn-fallback-download');
  if (btn) btn.onclick = () => downloadDocument(doc);
}

async function openDocumentPreview(doc) {
  const typeInfo = getFileTypeInfo(doc.mime_type, doc.name);
  const token = localStorage.getItem('token');
  
  document.getElementById('preview-badge').textContent = typeInfo.icon;
  document.getElementById('preview-badge').className = `preview-badge ${typeInfo.cls}`;
  document.getElementById('preview-title').textContent = doc.name;
  document.getElementById('preview-subtitle').textContent = `${formatBytes(doc.size)} • ${doc.mime_type} • Updated ${formatDate(doc.updated_at || doc.created_at)}`;
  
  // Wire action buttons
  document.getElementById('btn-preview-download').onclick = () => downloadDocument(doc);
  document.getElementById('btn-preview-share').onclick = () => {
    closeModal('preview-modal');
    openShareModal(doc);
  };
  
  const viewport = document.getElementById('preview-viewport');
  const loading = document.getElementById('preview-loading');
  viewport.innerHTML = '';
  loading.style.display = 'flex';
  
  openModal('preview-modal');
  
  const previewUrl = `/api/documents/${doc.id}/preview?token=${encodeURIComponent(token || '')}`;
  
  try {
    if (isImageFile(doc.mime_type, doc.name)) {
      const img = new Image();
      img.className = 'preview-image';
      img.onload = () => {
        loading.style.display = 'none';
        viewport.innerHTML = '';
        viewport.appendChild(img);
      };
      img.onerror = () => showPreviewFallback(doc, viewport, loading);
      img.src = previewUrl;
    } else if (isPdfFile(doc.mime_type, doc.name)) {
      loading.style.display = 'none';
      viewport.innerHTML = `<iframe src="${previewUrl}" class="preview-frame" title="PDF Document Preview"></iframe>`;
    } else if (isVideoFile(doc.mime_type, doc.name)) {
      loading.style.display = 'none';
      viewport.innerHTML = `<video controls autoplay class="preview-media-player" style="max-width:100%; max-height:65vh"><source src="${previewUrl}" type="${doc.mime_type || 'video/mp4'}">Your browser does not support video playback.</video>`;
    } else if (isAudioFile(doc.mime_type, doc.name)) {
      loading.style.display = 'none';
      viewport.innerHTML = `<audio controls autoplay class="preview-media-player" style="width:100%"><source src="${previewUrl}" type="${doc.mime_type || 'audio/mpeg'}">Your browser does not support audio playback.</audio>`;
    } else if (isCodeOrTextFile(doc.name) || (doc.mime_type && doc.mime_type.startsWith('text/'))) {
      const res = await apiFetch(`/documents/${doc.id}/content`);
      loading.style.display = 'none';
      const pre = document.createElement('pre');
      pre.className = 'preview-text-box';
      const code = document.createElement('code');
      code.textContent = res.content;
      pre.appendChild(code);
      viewport.appendChild(pre);
    } else {
      showPreviewFallback(doc, viewport, loading);
    }
  } catch (err) {
    showPreviewFallback(doc, viewport, loading, err.message);
  }
}

// ================================
// Cloud Storage Configuration
// ================================

async function loadStorageConfig() {
  try {
    const data = await apiFetch('/activity/storage-config');
    const storage = data.storage;
    
    const nameEl = document.getElementById('storage-provider-name');
    if (nameEl) nameEl.textContent = storage.mode;
    
    const badgeEl = document.getElementById('storage-engine-badge');
    if (badgeEl) badgeEl.textContent = storage.mode;
    
    const bucketEl = document.getElementById('storage-bucket-name');
    if (bucketEl) bucketEl.textContent = storage.bucket;
    
    const regionEl = document.getElementById('storage-region-name');
    if (regionEl) regionEl.textContent = storage.region;
  } catch (err) {
    console.warn('Storage config load warning:', err.message);
  }
}

const storageProviderBtn = document.getElementById('storage-provider-btn');
if (storageProviderBtn) {
  storageProviderBtn.addEventListener('click', () => {
    openModal('storage-modal');
  });
}

// ================================
// Public Share Screen
// ================================

let activePublicShare = null;
let publicPreviewVisible = false;

async function loadPublicShareScreen(shareToken) {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('public-share-screen').classList.add('active');

  const titleEl = document.getElementById('public-file-name');
  const sizeEl = document.getElementById('public-file-size');
  const typeEl = document.getElementById('public-file-type');
  const ownerEl = document.getElementById('public-file-owner');
  const iconBox = document.getElementById('public-file-icon-box');
  const providerTag = document.getElementById('public-cloud-provider-tag');

  titleEl.textContent = 'Loading shared document...';

  try {
    const res = await fetch(`/api/shares/link/${encodeURIComponent(shareToken)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Shared document not found or link has expired');
    }

    const data = await res.json();
    const share = data.share;
    activePublicShare = share;

    const typeInfo = getFileTypeInfo(share.mime_type, share.name);
    iconBox.textContent = typeInfo.emoji;
    titleEl.textContent = share.original_name || share.name;
    sizeEl.textContent = formatBytes(share.size);
    typeEl.textContent = share.mime_type;
    ownerEl.textContent = `Shared by ${share.owner_name}`;
    providerTag.textContent = '☁️ CloudVault S3 Verified';

    // Hook up download
    const downloadBtn = document.getElementById('btn-public-download');
    downloadBtn.onclick = () => {
      window.location.href = `/api/shares/link/${encodeURIComponent(shareToken)}/download`;
    };

    // Hook up preview toggle
    const previewBtn = document.getElementById('btn-public-preview');
    const previewSection = document.getElementById('public-preview-section');
    const previewContent = document.getElementById('public-preview-content');
    const btnClosePreview = document.getElementById('btn-close-public-preview');

    const togglePreview = async () => {
      publicPreviewVisible = !publicPreviewVisible;
      if (publicPreviewVisible) {
        previewSection.style.display = 'block';
        previewContent.innerHTML = '<div class="loading-spinner"></div>';
        const previewUrl = `/api/shares/link/${encodeURIComponent(shareToken)}/preview`;

        if (isImageFile(share.mime_type, share.name)) {
          previewContent.innerHTML = `<img src="${previewUrl}" style="max-width:100%; max-height:480px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5)">`;
        } else if (isPdfFile(share.mime_type, share.name)) {
          previewContent.innerHTML = `<iframe src="${previewUrl}" style="width:100%; height:480px; border:none; border-radius:8px"></iframe>`;
        } else if (isVideoFile(share.mime_type, share.name)) {
          previewContent.innerHTML = `<video controls autoplay style="max-width:100%; max-height:450px; border-radius:8px"><source src="${previewUrl}" type="${share.mime_type || 'video/mp4'}"></video>`;
        } else if (isAudioFile(share.mime_type, share.name)) {
          previewContent.innerHTML = `<audio controls autoplay style="width:100%"><source src="${previewUrl}" type="${share.mime_type || 'audio/mpeg'}"></audio>`;
        } else if (isCodeOrTextFile(share.name) || (share.mime_type && share.mime_type.startsWith('text/'))) {
          try {
            const textRes = await fetch(`/api/shares/link/${encodeURIComponent(shareToken)}/content`);
            const textData = await textRes.json();
            previewContent.innerHTML = `<pre class="preview-text-box"><code>${escapeHtml(textData.content)}</code></pre>`;
          } catch (e) {
            previewContent.innerHTML = `<div style="color:var(--text-tertiary)">Failed to load text preview</div>`;
          }
        } else {
          previewContent.innerHTML = `
            <div style="text-align:center; padding:24px; color:var(--text-secondary)">
              <div style="font-size:3rem; margin-bottom:8px">${typeInfo.emoji}</div>
              <div>Direct inline preview is not supported for this file type.</div>
              <div style="font-size:12px; color:var(--text-tertiary); margin-top:4px">Click Download File to open it on your device.</div>
            </div>
          `;
        }
      } else {
        previewSection.style.display = 'none';
        previewContent.innerHTML = '';
      }
    };

    previewBtn.onclick = togglePreview;
    btnClosePreview.onclick = () => {
      publicPreviewVisible = false;
      previewSection.style.display = 'none';
      previewContent.innerHTML = '';
    };

  } catch (err) {
    titleEl.textContent = 'Unable to Load Document';
    sizeEl.textContent = '';
    typeEl.textContent = '';
    ownerEl.textContent = err.message;
    document.getElementById('btn-public-download').style.display = 'none';
    document.getElementById('btn-public-preview').style.display = 'none';
  }
}

// Goto login from public share page
const btnPublicGotoLogin = document.getElementById('btn-public-goto-login');
if (btnPublicGotoLogin) {
  btnPublicGotoLogin.addEventListener('click', () => {
    if (window.history.pushState) {
      window.history.pushState(null, '', '/');
    }
    document.getElementById('public-share-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
  });
}

// ================================
// Init
// ================================
checkAuth();
