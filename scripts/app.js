// Storage helpers
const STORAGE_KEYS = {
  sellers: 'fp_sellers',
  sellEntries: 'fp_sell_entries',
  invoices: 'fp_invoices',
  items: 'fp_items',
  expenseTypes: 'fp_expense_types',
  otherExpenses: 'fp_other_expenses',
  users: 'fp_users',
  currentUser: 'fp_current_user',
  serverConfig: 'fp_server_config',
  authToken: 'fp_auth_token'
};

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Failed to load', key, e);
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save', key, e);
  }
}

// Simple ID generator
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// User Management
function hashPassword(password) {
  // Simple hash function for demo purposes
  // In production, use a proper hashing library
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// App State
const state = {
  sellers: loadFromStorage(STORAGE_KEYS.sellers, []),
  sellEntries: loadFromStorage(STORAGE_KEYS.sellEntries, []),
  invoices: loadFromStorage(STORAGE_KEYS.invoices, []),
  items: loadFromStorage(STORAGE_KEYS.items, []),
  expenseTypes: loadFromStorage(STORAGE_KEYS.expenseTypes, [
    { id: 'wage', name: 'Wage' },
    { id: 'rent', name: 'Rent' },
    { id: 'office', name: 'Office expenses' },
    { id: 'tax', name: 'Tax expenses' },
    { id: 'other', name: 'Others' }
  ]),
  otherExpenses: loadFromStorage(STORAGE_KEYS.otherExpenses, []),
  users: loadFromStorage(STORAGE_KEYS.users, [
    {
      id: 'admin_user',
      name: 'Admin',
      surname: 'User',
      description: 'Default administrator account',
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      createdAt: new Date().toISOString()
    }
  ]),
  currentUser: loadFromStorage(STORAGE_KEYS.currentUser, null),
  sellFilters: { search: '', sortBy: 'date', sortDir: 'desc', from: '', to: '' },
  buyFilters: { from: '', to: '' },
  otherFilters: { from: '', to: '' },
  dashboardFilters: { from: '', to: '' },
  serverConfig: loadFromStorage(STORAGE_KEYS.serverConfig, { apiUrl: '', enabled: false }),
  authToken: loadFromStorage(STORAGE_KEYS.authToken, null)
};

function persist() {
  saveToStorage(STORAGE_KEYS.sellers, state.sellers);
  saveToStorage(STORAGE_KEYS.sellEntries, state.sellEntries);
  saveToStorage(STORAGE_KEYS.invoices, state.invoices);
  saveToStorage(STORAGE_KEYS.items, state.items);
  saveToStorage(STORAGE_KEYS.expenseTypes, state.expenseTypes);
  saveToStorage(STORAGE_KEYS.otherExpenses, state.otherExpenses);
  saveToStorage(STORAGE_KEYS.users, state.users);
  saveToStorage(STORAGE_KEYS.currentUser, state.currentUser);
  saveToStorage(STORAGE_KEYS.serverConfig, state.serverConfig);
  saveToStorage(STORAGE_KEYS.authToken, state.authToken);
}

// Utilities
function formatEuro(amount) {
  const num = Number(amount || 0);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(num);
}

function parseNumber(input) {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// Dashboard helpers
function monthKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d)) return 'Unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

function aggregateByMonthSell(fromDate = '', toDate = '') {
  const fiscalMap = new Map();
  const nonFiscalMap = new Map();
  
  state.sellEntries.forEach(e => {
    // Apply date filter if provided
    if (fromDate && e.date < fromDate) return;
    if (toDate && e.date > toDate) return;
    
    const key = monthKey(e.date);
    if (e.type === 'fiscal') {
      fiscalMap.set(key, (fiscalMap.get(key) || 0) + parseNumber(e.amount));
    } else {
      nonFiscalMap.set(key, (nonFiscalMap.get(key) || 0) + parseNumber(e.amount));
    }
  });
  
  return {
    fiscal: mapToSortedSeries(fiscalMap),
    nonFiscal: mapToSortedSeries(nonFiscalMap)
  };
}

function aggregateByMonthBuy() {
  const map = new Map();
  state.invoices.forEach(inv => {
    const key = monthKey(inv.invoiceDate);
    const total = computeInvoiceTotal(inv.items);
    map.set(key, (map.get(key) || 0) + total);
  });
  return mapToSortedSeries(map);
}

function aggregateByMonthExpenses(fromDate = '', toDate = '') {
  const purchasesMap = new Map();
  const expensesMap = new Map();
  
  // Purchases
  state.invoices.forEach(inv => {
    // Apply date filter if provided
    if (fromDate && inv.invoiceDate < fromDate) return;
    if (toDate && inv.invoiceDate > toDate) return;
    
    const key = monthKey(inv.invoiceDate);
    const total = computeInvoiceTotal(inv.items);
    purchasesMap.set(key, (purchasesMap.get(key) || 0) + total);
  });
  
  // Other expenses
  state.otherExpenses.forEach(exp => {
    // Apply date filter if provided
    if (fromDate && exp.date < fromDate) return;
    if (toDate && exp.date > toDate) return;
    
    const key = monthKey(exp.date);
    expensesMap.set(key, (expensesMap.get(key) || 0) + parseNumber(exp.amount));
  });
  
  return {
    purchases: mapToSortedSeries(purchasesMap),
    expenses: mapToSortedSeries(expensesMap)
  };
}

function mapToSortedSeries(map) {
  const labels = Array.from(map.keys()).sort();
  const values = labels.map(l => map.get(l) || 0);
  return { labels, values };
}

// Get current month start and end dates
function getCurrentMonthDates() {
  const now = new Date();
  // Ensure we're working with local time, not UTC
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  // Format dates as YYYY-MM-DD using local time
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    from: formatDate(startOfMonth),
    to: formatDate(endOfMonth)
  };
}

// Align multiple time-series to the same label axis
function alignSeriesLabels(seriesList) {
  const labelSet = new Set();
  seriesList.forEach(s => s.labels.forEach(l => labelSet.add(l)));
  const labels = Array.from(labelSet).sort();
  const alignedValues = seriesList.map(s => labels.map(l => {
    const idx = s.labels.indexOf(l);
    return idx >= 0 ? (s.values[idx] || 0) : 0;
  }));
  return { labels, alignedValues };
}

let sellChart, expensesChart;

function renderDashboard() {
  // Get date filters
  const fromDate = state.dashboardFilters.from;
  const toDate = state.dashboardFilters.to;
  
  // Calculate totals with date filtering
  const fiscalSales = state.sellEntries
    .filter(e => e.type === 'fiscal' && (!fromDate || e.date >= fromDate) && (!toDate || e.date <= toDate))
    .reduce((s, e) => s + parseNumber(e.amount), 0);
  const nonFiscalSales = state.sellEntries
    .filter(e => e.type === 'non-fiscal' && (!fromDate || e.date >= fromDate) && (!toDate || e.date <= toDate))
    .reduce((s, e) => s + parseNumber(e.amount), 0);
  const totalSales = fiscalSales + nonFiscalSales;
  
  const totalPurchases = state.invoices
    .filter(inv => (!fromDate || inv.invoiceDate >= fromDate) && (!toDate || inv.invoiceDate <= toDate))
    .reduce((s, inv) => s + computeInvoiceTotal(inv.items), 0);
  const totalOtherExpenses = state.otherExpenses
    .filter(e => (!fromDate || e.date >= fromDate) && (!toDate || e.date <= toDate))
    .reduce((s, e) => s + parseNumber(e.amount), 0);
  const totalExpenses = totalPurchases + totalOtherExpenses;
  const netResult = totalSales - totalExpenses;

  // Update financial report
  const fiscalSalesEl = document.getElementById('fiscalSales');
  const nonFiscalSalesEl = document.getElementById('nonFiscalSales');
  const totalSalesEl = document.getElementById('totalSales');
  const totalPurchasesEl = document.getElementById('totalPurchases');
  const totalOtherExpensesEl = document.getElementById('totalOtherExpenses');
  const totalExpensesEl = document.getElementById('totalExpenses');
  const netResultEl = document.getElementById('netResult');

  if (fiscalSalesEl) fiscalSalesEl.textContent = formatEuro(fiscalSales);
  if (nonFiscalSalesEl) nonFiscalSalesEl.textContent = formatEuro(nonFiscalSales);
  if (totalSalesEl) totalSalesEl.textContent = formatEuro(totalSales);
  if (totalPurchasesEl) totalPurchasesEl.textContent = formatEuro(totalPurchases);
  if (totalOtherExpensesEl) totalOtherExpensesEl.textContent = formatEuro(totalOtherExpenses);
  if (totalExpensesEl) totalExpensesEl.textContent = formatEuro(totalExpenses);
  if (netResultEl) netResultEl.textContent = formatEuro(netResult);



  // charts
  const sellSeries = aggregateByMonthSell(fromDate, toDate);
  const expensesSeries = aggregateByMonthExpenses(fromDate, toDate);
  
  // Ensure sales datasets share same labels
  const { labels: sellLabels, alignedValues: [fiscalVals, nonFiscalVals] } =
    alignSeriesLabels([sellSeries.fiscal, sellSeries.nonFiscal]);
  
  // Ensure expenses datasets share same labels
  const { labels: expLabels, alignedValues: [purchaseVals, expenseVals] } =
    alignSeriesLabels([expensesSeries.purchases, expensesSeries.expenses]);
  
  const sellCtx = document.getElementById('sellChart');
  const expensesCtx = document.getElementById('expensesChart');
  
  if (sellCtx) {
    const sellDatasets = [
      { values: fiscalVals, color: '#2563eb' },
      { values: nonFiscalVals, color: '#06b6d4' }
    ];
    sellChart = drawMultiBarChart(sellCtx, sellLabels, sellDatasets);
  }
  
  if (expensesCtx) {
    const expensesDatasets = [
      { values: purchaseVals, color: '#dc2626' },
      { values: expenseVals, color: '#f59e0b' }
    ];
    expensesChart = drawMultiBarChart(expensesCtx, expLabels, expensesDatasets);
  }
}

function setupDashboardDateFilter() {
  const fromDateInput = document.getElementById('dashboardFromDate');
  const toDateInput = document.getElementById('dashboardToDate');
  const applyBtn = document.getElementById('applyDateFilter');
  const resetBtn = document.getElementById('resetDateFilter');
  
  // Set default to current month if no filters are set
  if (!state.dashboardFilters.from && !state.dashboardFilters.to) {
    const currentMonth = getCurrentMonthDates();
    state.dashboardFilters = currentMonth;
  }
  
  // Set input values
  if (fromDateInput) fromDateInput.value = state.dashboardFilters.from;
  if (toDateInput) toDateInput.value = state.dashboardFilters.to;
  
  // Apply filter button
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const fromDate = fromDateInput?.value || '';
      const toDate = toDateInput?.value || '';
      
      if (fromDate && toDate && fromDate > toDate) {
        alert('From date cannot be after To date');
        return;
      }
      
      state.dashboardFilters = { from: fromDate, to: toDate };
      renderDashboard();
    });
  }
  
  // Reset button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const currentMonth = getCurrentMonthDates();
      state.dashboardFilters = currentMonth;
      if (fromDateInput) fromDateInput.value = currentMonth.from;
      if (toDateInput) toDateInput.value = currentMonth.to;
      renderDashboard();
    });
  }
}

function drawBarChart(canvas, labels, values, color) {
  const ctx = canvas.getContext('2d');
  const clientWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const width = canvas.width = Math.max(clientWidth, 300);
  const height = canvas.height = canvas.height; // keep provided height
  // clear
  ctx.clearRect(0, 0, width, height);
  // axes padding
  const padL = 36, padR = 12, padT = 14, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  // scale
  const maxVal = Math.max(10, Math.max(...values, 0));
  // draw axes
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();
  // bars
  const n = labels.length || 1;
  const gap = 8;
  const barW = Math.max(8, (plotW - gap * (n - 1)) / n);
  ctx.fillStyle = color;
  values.forEach((v, i) => {
    const x = padL + i * (barW + gap);
    const h = Math.round((v / maxVal) * (plotH - 2));
    const y = padT + plotH - h;
    ctx.fillRect(x, y, barW, h);
  });
  // labels (x-axis)
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((lab, i) => {
    const x = padL + i * (barW + gap) + barW / 2;
    ctx.fillText(lab, x, padT + plotH + 16);
  });
  return { ctx, labels, values };
}

function drawMultiBarChart(canvas, labels, datasets) {
  const ctx = canvas.getContext('2d');
  // Skip render if hidden or zero width
  const clientWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const width = canvas.width = Math.max(clientWidth, 300);
  const height = canvas.height = canvas.height;
  // clear
  ctx.clearRect(0, 0, width, height);
  // axes padding
  const padL = 36, padR = 12, padT = 14, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  
  // Find max value across all datasets
  const allValues = datasets.flatMap(ds => ds.values);
  const maxVal = Math.max(10, Math.max(...allValues, 0));
  
  // draw axes
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();
  
  // bars
  const n = labels.length || 1;
  const gap = 8;
  const barW = Math.max(6, (plotW - gap * (n - 1)) / (n * Math.max(1, datasets.length)));
  
  datasets.forEach((dataset, datasetIndex) => {
    ctx.fillStyle = dataset.color;
    dataset.values.forEach((v, i) => {
      const x = padL + i * (barW * datasets.length + gap) + datasetIndex * barW;
      const h = Math.round((v / maxVal) * (plotH - 2));
      const y = padT + plotH - h;
      ctx.fillRect(x, y, barW, h);
    });
  });
  
  // labels (x-axis)
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((lab, i) => {
    const x = padL + i * (barW * datasets.length + gap) + (barW * datasets.length) / 2;
    ctx.fillText(lab, x, padT + plotH + 16);
  });
  
  return { ctx, labels, datasets };
}



function renderUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.users.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.surname)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.description || '')}</td>
      <td>${escapeHtml(formatDateTime(user.createdAt))}</td>
      <td class="right">
        <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${user.id}">✎</button>
        <button class="btn btn-danger btn-icon" data-action="delete" data-id="${user.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure you want to delete this user?')) return;
      state.users = state.users.filter(u => u.id !== id);
      persist();
      renderUsers();
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const user = state.users.find(u => u.id === id);
      if (!user) return;
      const name = prompt('Edit name:', user.name) ?? user.name;
      const surname = prompt('Edit surname:', user.surname) ?? user.surname;
      const description = prompt('Edit description:', user.description || '') ?? (user.description || '');
      const username = prompt('Edit username:', user.username) ?? user.username;
      user.name = name.trim();
      user.surname = surname.trim();
      user.description = description.trim();
      user.username = username.trim();
      persist();
      renderUsers();
    });
  });
}

function setupMainLoginForm() {
  const mainLoginForm = document.getElementById('mainLoginForm');
  if (mainLoginForm) {
    mainLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('mainLoginUsername').value.trim();
      const password = document.getElementById('mainLoginPassword').value;

      if (!username || !password) {
        showMainLoginStatus('Please enter username and password', 'error');
    return;
      }
      // If server sync enabled, try server login first
      const cfg = state.serverConfig;
      const tryServer = cfg && cfg.enabled && cfg.apiUrl;
      const localLogin = () => {
        const user = state.users.find(u => u.username === username);
        if (!user || user.passwordHash !== hashPassword(password)) {
          showMainLoginStatus('Invalid username or password', 'error');
          return;
        }
        state.currentUser = { id: user.id, name: user.name, surname: user.surname, username: user.username };
        state.authToken = null;
        persist();
        mainLoginForm.reset();
        showMainLoginStatus(`Welcome, ${user.name} ${user.surname}!`, 'success');
        updateUserInterface();
        setTimeout(() => { const statusDiv = document.getElementById('mainLoginStatus'); if (statusDiv) statusDiv.style.display = 'none'; }, 2000);
      };
      if (!tryServer) {
        localLogin();
        return;
      }
      fetch(`${cfg.apiUrl.replace(/\/$/, '')}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(async (r) => {
        if (!r.ok) throw new Error('Login failed');
        const data = await r.json();
        state.authToken = data.token;
        state.currentUser = data.user;
        persist();
        mainLoginForm.reset();
        showMainLoginStatus(`Welcome, ${data.user.name} ${data.user.surname}!`, 'success');
        updateUserInterface();
        setTimeout(() => { const statusDiv = document.getElementById('mainLoginStatus'); if (statusDiv) statusDiv.style.display = 'none'; }, 2000);
      }).catch(() => {
        // Fallback to local login
        localLogin();
      });
    });
  }
}

function showMainLoginStatus(message, type) {
  const statusDiv = document.getElementById('mainLoginStatus');
  const messageDiv = document.getElementById('mainLoginStatusMessage');
  if (!statusDiv || !messageDiv) return;

  messageDiv.textContent = message;
  statusDiv.className = `login-status ${type === 'error' ? 'error' : 'success'}`;
  statusDiv.style.display = 'block';
}

function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      state.currentUser = null;
      persist();
      updateUserInterface();
      showMainLoginStatus('Logged out successfully', 'success');
    });
  }
}

function setupUserForms() {
  // User registration form
  const registerForm = document.getElementById('userRegisterForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('userName').value.trim();
      const surname = document.getElementById('userSurname').value.trim();
      const description = document.getElementById('userDescription').value.trim();
      const username = document.getElementById('userUsername').value.trim();
      const password = document.getElementById('userPassword').value;
      const confirmPassword = document.getElementById('userConfirmPassword').value;

      if (!name || !surname || !username || !password) {
        alert('Please fill in all required fields');
        return;
      }

      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
      }

      // Check if username already exists
      const existingUser = state.users.find(u => u.username === username);
      if (existingUser) {
        alert('Username already exists');
        return;
      }

      const newUser = {
        id: generateId('user'),
        name,
        surname,
        description,
        username,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };

      state.users.push(newUser);
      persist();
      registerForm.reset();
      renderUsers();
      alert('User registered successfully!');
    });
  }

  // User login form
  const loginForm = document.getElementById('userLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        alert('Please enter username and password');
        return;
      }

      const user = state.users.find(u => u.username === username);
      if (!user || user.passwordHash !== hashPassword(password)) {
        showLoginStatus('Invalid username or password', 'error');
        return;
      }

      // Login successful
      state.currentUser = {
        id: user.id,
        name: user.name,
        surname: user.surname,
        username: user.username
      };
      persist();
      loginForm.reset();
      showLoginStatus(`Welcome, ${user.name} ${user.surname}!`, 'success');
      
      // Update UI to show logged in user
      updateUserInterface();
    });
  }
}

function showLoginStatus(message, type) {
  const statusDiv = document.getElementById('loginStatus');
  const messageDiv = document.getElementById('loginStatusMessage');
  if (!statusDiv || !messageDiv) return;

  messageDiv.textContent = message;
  statusDiv.className = `card ${type === 'error' ? 'error' : 'success'}`;
  statusDiv.style.display = 'block';

  // Hide after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

function updateUserInterface() {
  const loginOverlay = document.getElementById('loginOverlay');
  const userInfoBtn = document.getElementById('userInfoBtn');
  const userInfoText = document.getElementById('userInfoText');
  const userDropdownName = document.getElementById('userDropdownName');
  const userDropdownUsername = document.getElementById('userDropdownUsername');
  
  if (state.currentUser) {
    // User is logged in - hide overlay, show user info
    document.body.classList.add('logged-in');
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (userInfoBtn) userInfoBtn.style.display = 'inline-block';
    if (userInfoText) userInfoText.textContent = `${state.currentUser.name} ${state.currentUser.surname}`;
    if (userDropdownName) userDropdownName.textContent = `${state.currentUser.name} ${state.currentUser.surname}`;
    if (userDropdownUsername) userDropdownUsername.textContent = state.currentUser.username;

    // Redraw charts after overlay removal to ensure correct canvas width
    setTimeout(() => {
      renderDashboard();
    }, 0);
  } else {
    // User is not logged in - show overlay, hide user info
    document.body.classList.remove('logged-in');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (userInfoBtn) userInfoBtn.style.display = 'none';
  }
}

function setupUserSubTabs() {
  const userSubTabButtons = document.querySelectorAll('[data-user-sub-tab-target]');
  const userSubPanels = document.querySelectorAll('.user-sub-tab-panel');
  
  userSubTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      userSubTabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      userSubPanels.forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const target = document.querySelector(btn.dataset.userSubTabTarget);
      if (target) {
        target.classList.add('active');
        target.hidden = false;
      }
    });
  });
}

// Tabs
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const target = document.querySelector(btn.dataset.tabTarget);
      if (target) {
        target.classList.add('active');
        target.hidden = false;
      }
    });
  });

  // Config landing navigation
  document.querySelectorAll('.nav-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-config-target');
      document.querySelectorAll('.config-panel').forEach(p => p.hidden = true);
      const el = document.querySelector(target);
      if (el) el.hidden = false;
      document.querySelectorAll('.nav-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  // Sub-tabs for purchases section
  const subTabButtons = document.querySelectorAll('.sub-tab');
  const subPanels = document.querySelectorAll('.sub-tab-panel');
  subTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      subTabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      subPanels.forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const target = document.querySelector(btn.dataset.subTabTarget);
      if (target) {
        target.classList.add('active');
        target.hidden = false;
        
        // Initialize form when Add New Invoice tab is shown
        if (target.id === 'addInvoice') {
          const invoiceItems = document.getElementById('invoiceItems');
          if (invoiceItems && invoiceItems.querySelectorAll('.item-row').length === 0) {
            addItemRow();
          }
          recalcInvoiceTotal();
        }
      }
    });
  });
}

// Expense Types (Configuration)
function renderExpenseTypes() {
  const tbody = document.querySelector('#expenseTypesTable tbody');
  const select = document.getElementById('otherExpenseType');
  if (!tbody || !select) return;
  tbody.innerHTML = '';
  select.innerHTML = '';
  state.expenseTypes.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td class="right">
        <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${t.id}">✎</button>
        <button class="btn btn-danger btn-icon" data-action="delete" data-id="${t.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      // Prevent deleting if used by an expense
      const used = state.otherExpenses.some(e => e.typeId === id);
      if (used) { alert('Cannot delete a type used by existing expenses.'); return; }
      if (!confirm('Are you sure?')) return;
      state.expenseTypes = state.expenseTypes.filter(t => t.id !== id);
      persist();
      renderExpenseTypes();
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const t = state.expenseTypes.find(x => x.id === id);
      if (!t) return;
      const name = prompt('Edit type name:', t.name) ?? t.name;
      t.name = name.trim();
      persist();
      renderExpenseTypes();
      renderOtherExpenses();
    });
  });
}

function setupExpenseTypeForm() {
  const form = document.getElementById('expenseTypeForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('expenseTypeName').value.trim();
    if (!name) return;
    state.expenseTypes.push({ id: generateId('ext'), name });
    persist();
    form.reset();
    renderExpenseTypes();
  });
}

// Other Expenses
function renderOtherExpenses() {
  const tbody = document.querySelector('#otherExpensesTable tbody');
  const totalCell = document.getElementById('otherExpensesTotal');
  if (!tbody || !totalCell) return;
  tbody.innerHTML = '';
  let total = 0;
  const typeById = new Map(state.expenseTypes.map(t => [t.id, t]));
  const from = state.otherFilters?.from ? new Date(state.otherFilters.from) : null;
  const to = state.otherFilters?.to ? new Date(state.otherFilters.to) : null;
  const filtered = state.otherExpenses.filter(e => {
    const d = e.date ? new Date(e.date) : null;
    const matchesFrom = !from || (d && d >= from);
    const matchesTo = !to || (d && d <= to);
    return matchesFrom && matchesTo;
  });
  const sorted = filtered.sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  sorted.forEach(e => {
    total += parseNumber(e.amount);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(typeById.get(e.typeId)?.name || '')}</td>
      <td>${escapeHtml(e.description)}</td>
      <td>${escapeHtml(formatDateTime(e.createdAt))}</td>
      <td class="right">${formatEuro(e.amount)}</td>
      <td class="right">
        <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${e.id}">✎</button>
        <button class="btn btn-danger btn-icon" data-action="delete" data-id="${e.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  totalCell.textContent = formatEuro(total);

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure?')) return;
      state.otherExpenses = state.otherExpenses.filter(x => x.id !== id);
      persist();
      renderOtherExpenses();
      renderDashboard();
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const e = state.otherExpenses.find(x => x.id === id);
      if (!e) return;
      const date = prompt('Edit date (YYYY-MM-DD):', e.date) ?? e.date;
      const typeId = prompt('Edit type id:', e.typeId) ?? e.typeId;
      const description = prompt('Edit description:', e.description) ?? e.description;
      const amount = prompt('Edit amount (€):', String(e.amount)) ?? String(e.amount);
      e.date = date;
      e.typeId = typeId;
      e.description = description;
      e.amount = parseNumber(amount);
      persist();
      renderOtherExpenses();
      renderDashboard();
    });
  });
}

function setupOtherExpenseForm() {
  const form = document.getElementById('otherExpenseForm');
  if (!form) return;
  // Setup filters and defaults
  const otherFromDate = document.getElementById('otherFromDate');
  const otherToDate = document.getElementById('otherToDate');
  const otherExportBtn = document.getElementById('otherExpensesExportBtn');
  if (!state.otherFilters.from && !state.otherFilters.to) {
    const currentMonth = getCurrentMonthDates();
    state.otherFilters.from = currentMonth.from;
    state.otherFilters.to = currentMonth.to;
  }
  if (otherFromDate && !otherFromDate.value) otherFromDate.value = state.otherFilters.from;
  if (otherToDate && !otherToDate.value) otherToDate.value = state.otherFilters.to;
  if (otherFromDate) otherFromDate.addEventListener('change', () => { state.otherFilters.from = otherFromDate.value; renderOtherExpenses(); renderDashboard(); });
  if (otherToDate) otherToDate.addEventListener('change', () => { state.otherFilters.to = otherToDate.value; renderOtherExpenses(); renderDashboard(); });
  if (otherExportBtn) otherExportBtn.addEventListener('click', () => exportOtherExpensesCsv());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('otherExpenseDate').value;
    const typeId = document.getElementById('otherExpenseType').value;
    const description = document.getElementById('otherExpenseDesc').value.trim();
    const amount = parseNumber(document.getElementById('otherExpenseAmount').value);
    if (!date || !typeId || !description || amount < 0) return;
    state.otherExpenses.push({ id: generateId('oex'), date, typeId, description, amount, createdAt: new Date().toISOString() });
    persist();
    form.reset();
    renderOtherExpenses();
    renderDashboard();
  });
}

// Sellers
function renderSellers() {
  const tbody = document.querySelector('#sellersTable tbody');
  const select = document.querySelector('#invoiceSeller');
  if (!tbody || !select) return;
  tbody.innerHTML = '';
  select.innerHTML = '<option value="" disabled selected>Select seller</option>';
  state.sellers.forEach(seller => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(seller.name)}</td>
      <td>${escapeHtml(seller.uniqueNumber)}</td>
      <td class="right">
        <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${seller.id}">✎</button>
        <button class="btn btn-danger btn-icon" data-action="delete" data-id="${seller.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
    const option = document.createElement('option');
    option.value = seller.id;
    option.textContent = `${seller.name} (${seller.uniqueNumber})`;
    select.appendChild(option);
  });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      // Prevent deleting if invoices exist for this seller
      const hasInvoices = state.invoices.some(inv => inv.sellerId === id);
      if (hasInvoices) {
        alert('Cannot delete seller with existing invoices.');
        return;
      }
      if (!confirm('Are you sure?')) return;
      state.sellers = state.sellers.filter(s => s.id !== id);
      persist();
      renderSellers();
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const seller = state.sellers.find(s => s.id === id);
      if (!seller) return;
      const name = prompt('Edit seller name:', seller.name) ?? seller.name;
      const unique = prompt('Edit unique number:', seller.uniqueNumber) ?? seller.uniqueNumber;
      seller.name = name.trim();
      seller.uniqueNumber = unique.trim();
      persist();
      renderSellers();
      renderInvoices();
    });
  });
}

function setupSellerForm() {
  const form = document.getElementById('sellerForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('sellerName').value.trim();
    const unique = document.getElementById('sellerUniqueNumber').value.trim();
    if (!name || !unique) return;
    state.sellers.push({ id: generateId('seller'), name, uniqueNumber: unique });
    persist();
    form.reset();
    renderSellers();
  });
}

// Sell ledger
function renderSellEntries() {
  const tbody = document.querySelector('#sellEntriesTable tbody');
  const totalCell = document.getElementById('sellTotal');
  tbody.innerHTML = '';
  let total = 0;
  // filtering
  const search = (state.sellFilters.search || '').toLowerCase();
  const from = state.sellFilters.from ? new Date(state.sellFilters.from) : null;
  const to = state.sellFilters.to ? new Date(state.sellFilters.to) : null;
  const filtered = state.sellEntries.filter(e => {
    const matchesSearch = !search || (e.description || '').toLowerCase().includes(search);
    const d = e.date ? new Date(e.date) : null;
    const matchesFrom = !from || (d && d >= from);
    const matchesTo = !to || (d && d <= to);
    return matchesSearch && matchesFrom && matchesTo;
  });
  // sorting
  const sortBy = state.sellFilters.sortBy;
  const dir = state.sellFilters.sortDir === 'asc' ? 1 : -1;
  filtered.sort((a,b) => {
    if (sortBy === 'createdAt') {
      return (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dir;
    }
    return ((a.date || '').localeCompare(b.date || '')) * dir;
  });
  filtered.forEach(entry => {
      const tr = document.createElement('tr');
      total += parseNumber(entry.amount);
      const typeDisplay = entry.type === 'fiscal' ? 'Fiscal' : 'Non-Fiscal';
      tr.innerHTML = `
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(typeDisplay)}</td>
        <td>${escapeHtml(entry.description)}</td>
        <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
        <td class="right">${formatEuro(entry.amount)}</td>
        <td class="right">
          <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${entry.id}">✎</button>
          <button class="btn btn-danger btn-icon" data-action="delete" data-id="${entry.id}">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  totalCell.textContent = formatEuro(total);

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure?')) return;
      state.sellEntries = state.sellEntries.filter(e => e.id !== id);
      persist();
      renderSellEntries();
      renderDashboard();
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const entry = state.sellEntries.find(e => e.id === id);
      if (!entry) return;
      const date = prompt('Edit date (YYYY-MM-DD):', entry.date) ?? entry.date;
      const type = prompt('Edit type (fiscal/non-fiscal):', entry.type || 'fiscal') ?? (entry.type || 'fiscal');
      const description = prompt('Edit Z Report nr.:', entry.description) ?? entry.description;
      const amount = prompt('Edit amount (€):', String(entry.amount)) ?? String(entry.amount);
      entry.date = date;
      entry.type = type;
      entry.description = description;
      entry.amount = parseNumber(amount);
      persist();
      renderSellEntries();
    });
  });
}

function setupSellForm() {
  const form = document.getElementById('sellEntryForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('sellDate').value;
    const type = document.getElementById('sellType').value;
    const description = document.getElementById('sellDescription').value.trim();
    const amount = parseNumber(document.getElementById('sellAmount').value);
    if (!date || !type || !description || amount < 0) return;
    const entry = { id: generateId('sell'), date, type, description, amount, createdAt: new Date().toISOString() };
    state.sellEntries.push(entry);
    persist();
    // If server sync enabled and token present, post to server (best-effort)
    const cfg = state.serverConfig;
    if (cfg && cfg.enabled && cfg.apiUrl && state.authToken) {
      fetch(`${cfg.apiUrl.replace(/\/$/, '')}/api/sell-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.authToken}` },
        body: JSON.stringify({
          id: entry.id,
          date: entry.date,
          type: entry.type,
          description: entry.description,
          amount: entry.amount,
          createdAt: entry.createdAt
        })
      }).catch(() => {/* ignore for offline */});
    }
    form.reset();
    // Reset the type to default value
    document.getElementById('sellType').value = 'fiscal';
    renderSellEntries();
  });
  // toolbar events
  const searchInput = document.getElementById('sellSearch');
  const sortBySelect = document.getElementById('sellSortBy');
  const orderBtn = document.getElementById('sellOrderBtn');
  const fromDate = document.getElementById('sellFromDate');
  const toDate = document.getElementById('sellToDate');
  const exportBtn = document.getElementById('sellExportBtn');
  // Default sell ledger filter to current month if unset
  if (!state.sellFilters.from && !state.sellFilters.to) {
    const currentMonth = getCurrentMonthDates();
    state.sellFilters.from = currentMonth.from;
    state.sellFilters.to = currentMonth.to;
  }
  // Initialize inputs with current state
  if (fromDate && !fromDate.value) fromDate.value = state.sellFilters.from;
  if (toDate && !toDate.value) toDate.value = state.sellFilters.to;
  if (searchInput) searchInput.addEventListener('input', () => { state.sellFilters.search = searchInput.value; renderSellEntries(); });
  if (sortBySelect) sortBySelect.addEventListener('change', () => { state.sellFilters.sortBy = sortBySelect.value; renderSellEntries(); });
  if (orderBtn) orderBtn.addEventListener('click', () => {
    state.sellFilters.sortDir = state.sellFilters.sortDir === 'asc' ? 'desc' : 'asc';
    orderBtn.textContent = state.sellFilters.sortDir === 'asc' ? '↑' : '↓';
    renderSellEntries();
  });
  if (fromDate) fromDate.addEventListener('change', () => { state.sellFilters.from = fromDate.value; renderSellEntries(); });
  if (toDate) toDate.addEventListener('change', () => { state.sellFilters.to = toDate.value; renderSellEntries(); });
  if (exportBtn) exportBtn.addEventListener('click', () => exportSellCsv());
}

// Purchases / Invoices
function computeInvoiceTotal(items) {
  return items.reduce((sum, i) => sum + parseNumber(i.price), 0);
}

function renderInvoices() {
  const tbody = document.querySelector('#invoicesTable tbody');
  tbody.innerHTML = '';
  const sellerById = new Map(state.sellers.map(s => [s.id, s]));
  const from = state.buyFilters.from ? new Date(state.buyFilters.from) : null;
  const to = state.buyFilters.to ? new Date(state.buyFilters.to) : null;
  const filtered = state.invoices
    .filter(inv => {
      const d = inv.invoiceDate ? new Date(inv.invoiceDate) : null;
      const matchesFrom = !from || (d && d >= from);
      const matchesTo = !to || (d && d <= to);
      return matchesFrom && matchesTo;
    })
    .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''))
    .forEach(inv => {
      const tr = document.createElement('tr');
      const total = computeInvoiceTotal(inv.items);
      const seller = sellerById.get(inv.sellerId);
      tr.innerHTML = `
        <td>${seller ? escapeHtml(seller.name) : '—'}</td>
        <td>${escapeHtml(inv.invoiceNumber)}</td>
        <td>${escapeHtml(inv.documentedDate)}</td>
        <td>${escapeHtml(inv.invoiceDate)}</td>
        <td>${escapeHtml(inv.type)}</td>
        <td class="right">${formatEuro(total)}</td>
        <td class="right">
          <button class="btn btn-secondary btn-icon" data-action="view" data-id="${inv.id}">👁</button>
          <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${inv.id}">✎</button>
          <button class="btn btn-danger btn-icon" data-action="delete" data-id="${inv.id}">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure?')) return;
      state.invoices = state.invoices.filter(i => i.id !== id);
      persist();
      renderInvoices();
      renderDashboard();
    });
  });

  tbody.querySelectorAll('button[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const inv = state.invoices.find(i => i.id === id);
      if (!inv) return;
      const seller = state.sellers.find(s => s.id === inv.sellerId);
      const lines = [
        `Seller: ${seller ? seller.name : '—'}`,
        `Invoice #: ${inv.invoiceNumber}`,
        `Doc Date: ${inv.documentedDate}`,
        `Inv Date: ${inv.invoiceDate}`,
        `Type: ${inv.type}`,
        'Items:\n' + inv.items.map(it => `  - ${it.description}: ${formatEuro(it.price)}`).join('\n'),
        `Total: ${formatEuro(computeInvoiceTotal(inv.items))}`
      ];
      alert(lines.join('\n'));
    });
  });

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      loadInvoiceIntoForm(id);
    });
  });
}

function loadInvoiceIntoForm(invoiceId) {
  const inv = state.invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  
  // Switch to Add New Invoice tab
  const addInvoiceTab = document.querySelector('.sub-tab[data-sub-tab-target="#addInvoice"]');
  if (addInvoiceTab) {
    addInvoiceTab.click();
  }
  
  // Wait a moment for the tab to switch, then populate form
  setTimeout(() => {
    // Populate form fields
    const sellerSelect = document.getElementById('invoiceSeller');
    const typeSelect = document.getElementById('invoiceType');
    const documentedDateInput = document.getElementById('invoiceDocumentedDate');
    const invoiceDateInput = document.getElementById('invoiceDate');
    const invoiceNumberInput = document.getElementById('invoiceNumber');
    
    if (sellerSelect) sellerSelect.value = inv.sellerId;
    if (typeSelect) typeSelect.value = inv.type;
    if (documentedDateInput) documentedDateInput.value = inv.documentedDate;
    if (invoiceDateInput) invoiceDateInput.value = inv.invoiceDate;
    if (invoiceNumberInput) invoiceNumberInput.value = inv.invoiceNumber;
    
    // Clear and populate items
    const itemsContainer = document.getElementById('invoiceItems');
    if (itemsContainer) {
      itemsContainer.querySelectorAll('.item-row').forEach(r => r.remove());
      inv.items.forEach(item => {
        addItemRow(item.description, item.price, item.itemId || '');
      });
      recalcInvoiceTotal();
    }
    
    // Attach edit id to form dataset
    const form = document.getElementById('invoiceForm');
    if (form) {
      form.dataset.editId = inv.id;
    }
  }, 100);
}

function addItemRow(description = '', price = '', itemId = '') {
  const container = document.getElementById('invoiceItems');
  if (!container) {
    console.warn('Invoice items container not found');
    return;
  }
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <select class="item-select"><option value="">Custom...</option></select>
    <input type="text" class="item-desc" placeholder="Item description" required>
    <input type="number" class="item-price" step="0.01" min="0" placeholder="0.00" required>
    <button type="button" class="btn btn-danger btn-icon remove-item" title="Remove">×</button>
  `;
  container.appendChild(row);
  const select = row.querySelector('.item-select');
  const desc = row.querySelector('.item-desc');
  const priceInput = row.querySelector('.item-price');
  const removeBtn = row.querySelector('.remove-item');
  
  // populate options
  refreshItemSelectOptions(select);
  desc.value = description;
  priceInput.value = price;
  if (itemId) select.value = itemId;

  select.addEventListener('change', () => {
    const chosen = state.items.find(i => i.id === select.value);
    if (chosen) {
      desc.value = chosen.name;
      if (chosen.defaultPrice !== undefined && chosen.defaultPrice !== null && chosen.defaultPrice !== '') {
        priceInput.value = String(chosen.defaultPrice);
      }
      recalcInvoiceTotal();
    }
  });
  
  priceInput.addEventListener('input', recalcInvoiceTotal);
  removeBtn.addEventListener('click', () => {
    if (!confirm('Are you sure?')) return;
    row.remove();
    recalcInvoiceTotal();
  });
}

function recalcInvoiceTotal() {
  const prices = Array.from(document.querySelectorAll('#invoiceItems .item-price'));
  const total = prices.reduce((sum, input) => sum + parseNumber(input.value), 0);
  const totalElement = document.getElementById('invoiceTotal');
  if (totalElement) {
    totalElement.textContent = formatEuro(total);
  }
}

function setupInvoiceForm() {
  const addItemBtn = document.getElementById('addItemBtn');
  const invoiceItems = document.getElementById('invoiceItems');
  const form = document.getElementById('invoiceForm');
  
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => addItemRow());
  }
  
  if (invoiceItems) {
    invoiceItems.addEventListener('input', (e) => {
      if (e.target.matches('.item-price')) recalcInvoiceTotal();
    });
  }
  
  const showBtn = document.getElementById('showInvoiceFormBtn');
  if (showBtn) showBtn.addEventListener('click', () => {
    // Form is permanently hidden - do nothing
    return;
  });
  // filters + export
  const buyFromDate = document.getElementById('buyFromDate');
  const buyToDate = document.getElementById('buyToDate');
  const invoicesExportBtn = document.getElementById('invoicesExportBtn');
  // Default purchases filter to current month if unset
  if (!state.buyFilters.from && !state.buyFilters.to) {
    const currentMonth = getCurrentMonthDates();
    state.buyFilters.from = currentMonth.from;
    state.buyFilters.to = currentMonth.to;
  }
  // Initialize inputs with current state
  if (buyFromDate && !buyFromDate.value) buyFromDate.value = state.buyFilters.from;
  if (buyToDate && !buyToDate.value) buyToDate.value = state.buyFilters.to;
  if (buyFromDate) buyFromDate.addEventListener('change', () => { state.buyFilters.from = buyFromDate.value; renderInvoices(); renderDashboard(); });
  if (buyToDate) buyToDate.addEventListener('change', () => { state.buyFilters.to = buyToDate.value; renderInvoices(); renderDashboard(); });
  if (invoicesExportBtn) invoicesExportBtn.addEventListener('click', () => exportInvoicesCsv());
  
    if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Check if all required form elements exist
      const sellerSelect = document.getElementById('invoiceSeller');
      const typeSelect = document.getElementById('invoiceType');
      const documentedDateInput = document.getElementById('invoiceDocumentedDate');
      const invoiceDateInput = document.getElementById('invoiceDate');
      const invoiceNumberInput = document.getElementById('invoiceNumber');
      
      if (!sellerSelect || !typeSelect || !documentedDateInput || !invoiceDateInput || !invoiceNumberInput) {
        console.error('Required form elements not found');
        return;
      }
      
      const sellerId = sellerSelect.value;
      const type = typeSelect.value;
      const documentedDate = documentedDateInput.value;
      const invoiceDate = invoiceDateInput.value;
      const invoiceNumber = invoiceNumberInput.value.trim();
    const items = Array.from(document.querySelectorAll('#invoiceItems .item-row')).map(row => ({
      itemId: row.querySelector('.item-select') ? row.querySelector('.item-select').value || undefined : undefined,
      description: row.querySelector('.item-desc').value.trim(),
      price: parseNumber(row.querySelector('.item-price').value)
    })).filter(i => i.description && i.price >= 0);

    if (!sellerId || !type || !documentedDate || !invoiceDate || !invoiceNumber || items.length === 0) return;

    const editId = form.dataset.editId;
    if (editId) {
      const inv = state.invoices.find(i => i.id === editId);
      if (inv) {
        inv.sellerId = sellerId;
        inv.type = type;
        inv.documentedDate = documentedDate;
        inv.invoiceDate = invoiceDate;
        inv.invoiceNumber = invoiceNumber;
        inv.items = items;
      }
      delete form.dataset.editId;
    } else {
      state.invoices.push({
        id: generateId('inv'),
        sellerId,
        type,
        documentedDate,
        invoiceDate,
        invoiceNumber,
        items
      });
    }

    persist();
    renderInvoices();
    renderDashboard();
    form.reset();
    // keep items one row
    document.querySelectorAll('#invoiceItems .item-row').forEach(r => r.remove());
    addItemRow();
    recalcInvoiceTotal();
    // Switch back to invoice list tab after save
    document.querySelector('.sub-tab[data-sub-tab-target="#invoiceList"]').click();
  });
  }
}

// Import / Export
function setupImportExport() {
  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sellers: state.sellers,
      sellEntries: state.sellEntries,
      invoices: state.invoices,
      items: state.items,
      expenseTypes: state.expenseTypes,
      otherExpenses: state.otherExpenses,
      users: state.users
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-platform-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importDataInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('Invalid file');
      state.sellers = Array.isArray(data.sellers) ? data.sellers : state.sellers;
      state.sellEntries = Array.isArray(data.sellEntries) ? data.sellEntries : state.sellEntries;
      state.invoices = Array.isArray(data.invoices) ? data.invoices : state.invoices;
      state.items = Array.isArray(data.items) ? data.items : state.items;
      state.expenseTypes = Array.isArray(data.expenseTypes) ? data.expenseTypes : state.expenseTypes;
      state.otherExpenses = Array.isArray(data.otherExpenses) ? data.otherExpenses : state.otherExpenses;
      state.users = Array.isArray(data.users) ? data.users : state.users;
      persist();
      renderUsers();
      renderSellers();
      renderSellEntries();
      renderInvoices();
      renderItems();
      renderExpenseTypes();
      renderOtherExpenses();
      alert('Import completed');
    } catch (err) {
      console.error(err);
      alert('Failed to import file');
    } finally {
      e.target.value = '';
    }
  });

  // Server Sync config form
  const serverForm = document.getElementById('serverSyncForm');
  if (serverForm) {
    const apiUrlInput = document.getElementById('serverApiUrl');
    const enabledSelect = document.getElementById('serverSyncEnabled');
    if (apiUrlInput) apiUrlInput.value = state.serverConfig.apiUrl || '';
    if (enabledSelect) enabledSelect.value = state.serverConfig.enabled ? 'on' : 'off';
    serverForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
      const enabled = enabledSelect ? enabledSelect.value === 'on' : false;
      state.serverConfig = { apiUrl, enabled };
      persist();
      alert('Server sync settings saved');
    });
  }
}

// Items registry
function renderItems() {
  const tbody = document.querySelector('#itemsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td class="right">${item.defaultPrice !== undefined ? formatEuro(item.defaultPrice) : ''}</td>
      <td class="right">
        <button class="btn btn-secondary btn-icon" data-action="edit" data-id="${item.id}">✎</button>
        <button class="btn btn-danger btn-icon" data-action="delete" data-id="${item.id}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure?')) return;
      state.items = state.items.filter(i => i.id !== id);
      persist();
      renderItems();
      document.querySelectorAll('#invoiceItems .item-select').forEach(sel => refreshItemSelectOptions(sel));
    });
  });
  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = state.items.find(i => i.id === id);
      if (!item) return;
      const name = prompt('Edit item name:', item.name) ?? item.name;
      const price = prompt('Edit default price (€):', item.defaultPrice ?? '') ?? item.defaultPrice ?? '';
      item.name = String(name).trim();
      const num = Number(price);
      item.defaultPrice = Number.isFinite(num) ? num : undefined;
      persist();
      renderItems();
      document.querySelectorAll('#invoiceItems .item-select').forEach(sel => refreshItemSelectOptions(sel));
    });
  });
}

function setupItemForm() {
  const form = document.getElementById('itemForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('itemName').value.trim();
    const defaultPriceRaw = document.getElementById('itemPrice').value;
    const defaultPriceNum = defaultPriceRaw === '' ? undefined : parseNumber(defaultPriceRaw);
    if (!name) return;
    state.items.push({ id: generateId('item'), name, defaultPrice: defaultPriceNum });
    persist();
    form.reset();
    renderItems();
    document.querySelectorAll('#invoiceItems .item-select').forEach(sel => refreshItemSelectOptions(sel));
  });
}

function refreshItemSelectOptions(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Custom...</option>' + state.items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  if (current) selectEl.value = current;
}



// CSV Exports
function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportSellCsv() {
  const rows = [[ 'Date', 'Type', 'Z Report nr.', 'Amount (€)' ]];
  const search = (state.sellFilters.search || '').toLowerCase();
  const from = state.sellFilters.from ? new Date(state.sellFilters.from) : null;
  const to = state.sellFilters.to ? new Date(state.sellFilters.to) : null;
  const filtered = state.sellEntries.filter(e => {
    const matchesSearch = !search || (e.description || '').toLowerCase().includes(search);
    const d = e.date ? new Date(e.date) : null;
    const matchesFrom = !from || (d && d >= from);
    const matchesTo = !to || (d && d <= to);
    return matchesSearch && matchesFrom && matchesTo;
  });
  // Sort by date
  filtered.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  filtered.forEach(e => {
    const typeDisplay = e.type === 'fiscal' ? 'Fiscal' : 'Non-Fiscal';
    rows.push([ e.date, typeDisplay, e.description, Number(e.amount).toFixed(2) ]);
  });
  downloadCsv(`sell-ledger-${new Date().toISOString().slice(0,10)}.csv`, rows);
}

function exportInvoicesCsv() {
  const rows = [[ 'Seller', 'Invoice #', 'Documented Date', 'Invoice Date', 'Type', 'Total (€)' ]];
  const sellerById = new Map(state.sellers.map(s => [s.id, s]));
  const from = state.buyFilters.from ? new Date(state.buyFilters.from) : null;
  const to = state.buyFilters.to ? new Date(state.buyFilters.to) : null;
  state.invoices
    .filter(inv => {
      const d = inv.invoiceDate ? new Date(inv.invoiceDate) : null;
      const matchesFrom = !from || (d && d >= from);
      const matchesTo = !to || (d && d <= to);
      return matchesFrom && matchesTo;
    })
    .forEach(inv => {
      const seller = sellerById.get(inv.sellerId);
      rows.push([
        seller ? seller.name : '',
        inv.invoiceNumber,
        inv.documentedDate,
        inv.invoiceDate,
        inv.type,
        computeInvoiceTotal(inv.items).toFixed(2)
      ]);
    });
  downloadCsv(`invoices-${new Date().toISOString().slice(0,10)}.csv`, rows);
}

function exportOtherExpensesCsv() {
  const rows = [[ 'Date', 'Type', 'Description', 'Created', 'Amount (€)' ]];
  const typeById = new Map(state.expenseTypes.map(t => [t.id, t]));
  const from = state.otherFilters?.from ? new Date(state.otherFilters.from) : null;
  const to = state.otherFilters?.to ? new Date(state.otherFilters.to) : null;
  const filtered = state.otherExpenses.filter(e => {
    const d = e.date ? new Date(e.date) : null;
    const matchesFrom = !from || (d && d >= from);
    const matchesTo = !to || (d && d <= to);
    return matchesFrom && matchesTo;
  }).sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  filtered.forEach(e => {
    rows.push([
      e.date,
      typeById.get(e.typeId)?.name || '',
      e.description,
      e.createdAt ? formatDateTime(e.createdAt) : '',
      Number(e.amount).toFixed(2)
    ]);
  });
  downloadCsv(`other-expenses-${new Date().toISOString().slice(0,10)}.csv`, rows);
}

// Security: simple HTML escape
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupUserSubTabs();
  setupMainLoginForm();
  setupLogoutButton();
  setupUserForms();
  setupSellerForm();
  setupSellForm();
  setupInvoiceForm();
  setupItemForm();
  setupExpenseTypeForm();
  setupOtherExpenseForm();
  setupImportExport();
  setupDashboardDateFilter();
  // initial render
  renderUsers();
  renderSellers();
  renderSellEntries();
  renderInvoices();
  renderItems();
  renderExpenseTypes();
  renderOtherExpenses();
  renderDashboard();
  updateUserInterface();
  
  // If logged in on load, ensure charts draw with computed widths
  if (document.body.classList.contains('logged-in')) {
    setTimeout(() => renderDashboard(), 0);
  }
  
  // Initialize invoice form safely - only if the form is visible
  const addInvoicePanel = document.getElementById('addInvoice');
  const invoiceItems = document.getElementById('invoiceItems');
  if (addInvoicePanel && !addInvoicePanel.hidden && invoiceItems && invoiceItems.querySelectorAll('.item-row').length === 0) {
    addItemRow();
  }
  
  // Recalculate total only if the form is visible
  const invoiceTotal = document.getElementById('invoiceTotal');
  if (invoiceTotal && addInvoicePanel && !addInvoicePanel.hidden) {
    recalcInvoiceTotal();
  }
});


