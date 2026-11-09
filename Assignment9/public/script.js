/**
 * CampusEats — CS543 Assignment 09: API Security & RBAC Console
 * Client-Side Application: JWT State Machine, Dedicated Test Cards, & Wire Inspector
 */

document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'campuseats_assignment9_jwt';

  // State
  let requestHistory = [];

  // DOM Elements - Session & Claims
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const claimUserId = document.getElementById('claimUserId');
  const claimEmail = document.getElementById('claimEmail');
  const claimRole = document.getElementById('claimRole');
  const claimIat = document.getElementById('claimIat');
  const claimExp = document.getElementById('claimExp');
  const claimStatus = document.getElementById('claimStatus');
  const rawTokenDisplay = document.getElementById('rawTokenDisplay');

  // DOM Elements - Quick Logins & Forms
  const quickLoginCustomerBtn = document.getElementById('quickLoginCustomerBtn');
  const quickLoginRestaurantBtn = document.getElementById('quickLoginRestaurantBtn');
  const quickLoginAdminBtn = document.getElementById('quickLoginAdminBtn');
  const customLoginForm = document.getElementById('customLoginForm');
  const inputEmail = document.getElementById('inputEmail');
  const inputPassword = document.getElementById('inputPassword');

  // DOM Elements - Token Inspector Actions
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  const tamperTokenBtn = document.getElementById('tamperTokenBtn');
  const clearTokenBtn = document.getElementById('clearTokenBtn');

  // DOM Elements - 5 Test Cards
  const runTest1Btn = document.getElementById('runTest1Btn');
  const runTest2Btn = document.getElementById('runTest2Btn');
  const runTest3Btn = document.getElementById('runTest3Btn');
  const runTest4Btn = document.getElementById('runTest4Btn');
  const runTest5Btn = document.getElementById('runTest5Btn');

  // DOM Elements - Wire Inspector
  const responseStatusBadge = document.getElementById('responseStatusBadge');
  const responseLatency = document.getElementById('responseLatency');
  const requestLog = document.getElementById('requestLog');
  const responseLog = document.getElementById('responseLog');

  // DOM Elements - Request History
  const historyTableBody = document.getElementById('historyTableBody');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // DOM Elements - Catalogue & Form
  const refreshBtn = document.getElementById('refreshBtn');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const itemsContainer = document.getElementById('itemsContainer');
  const emptyCatalogueMessage = document.getElementById('emptyCatalogueMessage');
  const addItemForm = document.getElementById('addItemForm');
  const alertBox = document.getElementById('alertBox');

  // =========================================================================
  // Token Management & JWT Parsing
  // =========================================================================

  function getToken() {
    return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || '';
  }

  function setToken(token) {
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
    updateSessionUI();
  }

  function parseJwt(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      const decodeBase64Url = (str) => {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
          atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        return JSON.parse(json);
      };

      return {
        header: decodeBase64Url(parts[0]),
        payload: decodeBase64Url(parts[1]),
        signature: parts[2]
      };
    } catch {
      return null;
    }
  }

  function updateSessionUI() {
    const token = getToken();
    rawTokenDisplay.value = token;

    if (!token) {
      sessionStatusBadge.textContent = 'Session: Guest (Unauthenticated)';
      sessionStatusBadge.className = 'badge role-guest';
      claimUserId.textContent = 'None';
      claimEmail.textContent = 'None';
      claimRole.innerHTML = '<span class="role-pill pill-guest">None</span>';
      claimIat.textContent = 'N/A';
      claimExp.textContent = 'N/A';
      claimStatus.textContent = 'No Active Token';
      claimStatus.className = 'claim-val status-val-unauth';
      return;
    }

    const parsed = parseJwt(token);
    if (!parsed || !parsed.payload) {
      sessionStatusBadge.textContent = 'Session: Corrupted Token';
      sessionStatusBadge.className = 'badge role-guest';
      claimUserId.textContent = 'Malformed';
      claimEmail.textContent = 'Malformed';
      claimRole.innerHTML = '<span class="role-pill pill-guest">Invalid</span>';
      claimIat.textContent = 'Invalid';
      claimExp.textContent = 'Invalid';
      claimStatus.textContent = 'Signature / Format Corrupted';
      claimStatus.className = 'claim-val status-val-tampered';
      return;
    }

    const { payload } = parsed;
    claimUserId.textContent = payload.id || 'N/A';
    claimEmail.textContent = payload.email || 'N/A';

    const role = payload.role || 'guest';
    let pillClass = 'pill-guest';
    if (role === 'customer') pillClass = 'pill-customer';
    if (role === 'restaurant') pillClass = 'pill-restaurant';
    if (role === 'admin') pillClass = 'pill-admin';

    sessionStatusBadge.textContent = `Session: ${role.toUpperCase()}`;
    sessionStatusBadge.className = `badge ${role === 'customer' ? 'course-badge' : 'team-badge'}`;
    claimRole.innerHTML = `<span class="role-pill ${pillClass}">${escapeHtml(role)}</span>`;

    if (payload.iat) {
      claimIat.textContent = new Date(payload.iat * 1000).toLocaleTimeString();
    } else {
      claimIat.textContent = 'N/A';
    }

    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      const isExpired = Date.now() >= payload.exp * 1000;
      claimExp.textContent = expDate.toLocaleTimeString();

      if (isExpired) {
        claimStatus.textContent = 'Expired';
        claimStatus.className = 'claim-val status-val-tampered';
      } else {
        const remainingMinutes = Math.max(1, Math.round((payload.exp * 1000 - Date.now()) / 60000));
        claimStatus.textContent = `Active (Valid for ~${remainingMinutes} min)`;
        claimStatus.className = 'claim-val status-val-active';
      }
    } else {
      claimExp.textContent = 'No expiration';
      claimStatus.textContent = 'Active (No Expiry)';
      claimStatus.className = 'claim-val status-val-active';
    }
  }

  // =========================================================================
  // Safe HTML Escaping Helper
  // =========================================================================

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // Alert Toast Helper
  // =========================================================================

  let alertTimeout = null;
  function showAlert(message, type = 'info', duration = 6000) {
    if (alertTimeout) clearTimeout(alertTimeout);
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = 'block';

    if (duration > 0) {
      alertTimeout = setTimeout(() => {
        alertBox.style.display = 'none';
      }, duration);
    }
  }

  // =========================================================================
  // Authenticated API Wrapper & Wire Logger
  // =========================================================================

  function maskToken(token) {
    if (!token || typeof token !== 'string') return '';
    if (token.length <= 16) return '***';
    return `${token.slice(0, 10)}...[MASKED]...${token.slice(-6)}`;
  }

  async function apiRequest(endpoint, options = {}, overrideToken = undefined) {
    const method = options.method || 'GET';
    const url = endpoint;
    const headers = { ...(options.headers || {}) };

    const token = (overrideToken !== undefined) ? overrideToken : getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body = options.body;
    if (body && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const startTime = performance.now();

    try {
      const response = await fetch(url, { method, headers, body });
      const latencyMs = Math.round(performance.now() - startTime);

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Log to Wire Inspector (masking sensitive tokens in headers)
      logWire(method, url, headers, options.body, response.status, response.statusText, data, latencyMs);

      // Append to Request History
      addHistoryRecord(method, url, response.status, latencyMs);

      return {
        status: response.status,
        ok: response.ok,
        data,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      logWire(method, url, headers, options.body, 0, 'Network Error', { error: err.message }, latencyMs);
      addHistoryRecord(method, url, 'ERR', latencyMs);
      throw err;
    }
  }

  function logWire(method, url, headers, reqBody, status, statusText, resBody, latencyMs) {
    // Mask Authorization header in wire log
    const maskedHeaders = { ...headers };
    if (maskedHeaders['Authorization']) {
      const parts = maskedHeaders['Authorization'].split(' ');
      if (parts.length === 2) {
        maskedHeaders['Authorization'] = `${parts[0]} ${maskToken(parts[1])}`;
      }
    }

    const reqText = [
      `${method} ${url} HTTP/1.1`,
      ...Object.entries(maskedHeaders).map(([k, v]) => `${k}: ${v}`),
      '',
      reqBody ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody, null, 2)) : '(No body)'
    ].join('\n');

    const resText = [
      `HTTP/1.1 ${status} ${statusText}`,
      `Content-Type: application/json; charset=utf-8`,
      '',
      typeof resBody === 'object' ? JSON.stringify(resBody, null, 2) : String(resBody)
    ].join('\n');

    requestLog.textContent = reqText;
    responseLog.textContent = resText;

    responseLatency.textContent = `${latencyMs} ms`;

    // Status badge formatting
    responseStatusBadge.textContent = `${status} ${statusText}`;
    if (status >= 200 && status < 300) {
      responseStatusBadge.className = 'status-badge-lg badge-200';
    } else if (status === 401) {
      responseStatusBadge.className = 'status-badge-lg badge-401';
    } else if (status === 403) {
      responseStatusBadge.className = 'status-badge-lg badge-403';
    } else if (status === 422) {
      responseStatusBadge.className = 'status-badge-lg badge-422';
    } else {
      responseStatusBadge.className = 'status-badge-lg badge-idle';
    }
  }

  // =========================================================================
  // Request History Management
  // =========================================================================

  function addHistoryRecord(method, endpoint, status, latencyMs) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    requestHistory.unshift({
      time: timeStr,
      method,
      endpoint,
      status,
      latencyMs
    });

    if (requestHistory.length > 25) {
      requestHistory.pop();
    }

    renderHistory();
  }

  function renderHistory() {
    if (requestHistory.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="5" class="empty-history-cell">No API calls recorded yet.</td></tr>';
      return;
    }

    historyTableBody.innerHTML = '';
    requestHistory.forEach(item => {
      const tr = document.createElement('tr');

      let statusBadgeClass = 'badge-idle';
      if (item.status === 200 || item.status === 201) statusBadgeClass = 'badge-200';
      else if (item.status === 401) statusBadgeClass = 'badge-401';
      else if (item.status === 403) statusBadgeClass = 'badge-403';
      else if (item.status === 422) statusBadgeClass = 'badge-422';

      tr.innerHTML = `
        <td>${escapeHtml(item.time)}</td>
        <td><strong>${escapeHtml(item.method)}</strong></td>
        <td><code>${escapeHtml(item.endpoint)}</code></td>
        <td><span class="status-badge ${statusBadgeClass}">${escapeHtml(item.status)}</span></td>
        <td>${escapeHtml(item.latencyMs)} ms</td>
      `;
      historyTableBody.appendChild(tr);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    requestHistory = [];
    renderHistory();
    showAlert('API request history cleared.', 'info');
  });

  // =========================================================================
  // Login Operations
  // =========================================================================

  async function executeLogin(email, password, roleName) {
    showAlert(`Authenticating as ${roleName} (${email})...`, 'info');
    try {
      const res = await apiRequest('/login', {
        method: 'POST',
        body: { email, password }
      }, ''); // Send without token

      if (res.status === 200 && res.data && res.data.token) {
        setToken(res.data.token);
        showAlert(`Signed in successfully as ${res.data.user.email} (Role: ${res.data.user.role})!`, 'success');
        fetchItems();
      } else {
        showAlert(`Login Failed (${res.status}): ${res.data.message || 'Invalid credentials'}`, 'danger');
      }
      return res;
    } catch (err) {
      showAlert(`Login error: ${err.message}`, 'danger');
      throw err;
    }
  }

  quickLoginCustomerBtn.addEventListener('click', () => {
    executeLogin('customer@campuseats.com', 'customer123', 'Customer');
  });

  quickLoginRestaurantBtn.addEventListener('click', () => {
    executeLogin('restaurant@campuseats.com', 'restaurant123', 'Restaurant');
  });

  quickLoginAdminBtn.addEventListener('click', () => {
    executeLogin('admin@campuseats.com', 'admin123', 'Admin');
  });

  customLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = inputEmail.value.trim();
    const password = inputPassword.value;
    executeLogin(email, password, 'User');
  });

  // =========================================================================
  // Token Inspector Actions
  // =========================================================================

  copyTokenBtn.addEventListener('click', () => {
    const token = getToken();
    if (!token) {
      showAlert('No active token to copy.', 'warning');
      return;
    }
    navigator.clipboard.writeText(token).then(() => {
      showAlert('JWT Token copied to clipboard!', 'success');
    }).catch(() => {
      showAlert('Failed to copy token to clipboard.', 'danger');
    });
  });

  tamperTokenBtn.addEventListener('click', () => {
    const currentToken = getToken();
    if (!currentToken) {
      showAlert('No token to tamper. Please sign in first.', 'warning');
      return;
    }
    const parts = currentToken.split('.');
    if (parts.length === 3) {
      const tampered = `${parts[0]}.${parts[1]}.TAMPERED_${parts[2].slice(9)}`;
      setToken(tampered);
      showAlert('Token signature tampered! Next API request will trigger HTTP 401 Unauthorized.', 'danger');
    }
  });

  clearTokenBtn.addEventListener('click', () => {
    setToken('');
    showAlert('Bearer token cleared from session storage.', 'info');
    fetchItems();
  });

  // =========================================================================
  // 5 Mandatory Test Cards Runners
  // =========================================================================

  // Helper to display test card result
  function renderCardResult(resContainer, statusEl, jsonEl, explEl, status, data, explanation) {
    resContainer.style.display = 'flex';
    statusEl.textContent = `HTTP ${status}`;
    if (status === 200 || status === 201) {
      statusEl.className = 'res-code badge-200';
    } else if (status === 401) {
      statusEl.className = 'res-code badge-401';
    } else if (status === 403) {
      statusEl.className = 'res-code badge-403';
    } else {
      statusEl.className = 'res-code badge-idle';
    }
    jsonEl.textContent = JSON.stringify(data, null, 2);
    explEl.textContent = explanation;
  }

  // TEST 1: GET /items without Token -> 401 Unauthorized
  runTest1Btn.addEventListener('click', async () => {
    const res = await apiRequest('/items', {}, ''); // Empty token override
    renderCardResult(
      document.getElementById('resTest1'),
      document.getElementById('resStatus1'),
      document.getElementById('resJson1'),
      document.getElementById('resExpl1'),
      res.status,
      res.data,
      'Guard 1 (auth) executed and rejected the request because the Authorization header was missing.'
    );
  });

  // TEST 2: POST /login as Customer -> 200 OK + JWT
  runTest2Btn.addEventListener('click', async () => {
    const res = await apiRequest('/login', {
      method: 'POST',
      body: { email: 'customer@campuseats.com', password: 'customer123' }
    }, '');

    if (res.status === 200 && res.data && res.data.token) {
      setToken(res.data.token);
    }

    renderCardResult(
      document.getElementById('resTest2'),
      document.getElementById('resStatus2'),
      document.getElementById('resJson2'),
      document.getElementById('resExpl2'),
      res.status,
      res.data,
      'Password verified using bcrypt.compareSync. Server generated an HS256-signed JWT carrying role "customer".'
    );
  });

  // TEST 3: GET /items with Valid Token -> 200 OK
  runTest3Btn.addEventListener('click', async () => {
    // Ensure we have a token (log in customer if needed)
    let token = getToken();
    if (!token) {
      const loginRes = await apiRequest('/login', {
        method: 'POST',
        body: { email: 'customer@campuseats.com', password: 'customer123' }
      }, '');
      if (loginRes.status === 200) {
        token = loginRes.data.token;
        setToken(token);
      }
    }

    const res = await apiRequest('/items');
    renderCardResult(
      document.getElementById('resTest3'),
      document.getElementById('resStatus3'),
      document.getElementById('resJson3'),
      document.getElementById('resExpl3'),
      res.status,
      res.data,
      'Valid Bearer token presented. Guard 1 passed cryptographic verification and returned the menu catalogue.'
    );
    fetchItems();
  });

  // TEST 4: POST /items with Restaurant Token -> 201 Created
  runTest4Btn.addEventListener('click', async () => {
    // Acquire restaurant token
    const loginRes = await apiRequest('/login', {
      method: 'POST',
      body: { email: 'restaurant@campuseats.com', password: 'restaurant123' }
    }, '');

    if (loginRes.status === 200 && loginRes.data.token) {
      const restToken = loginRes.data.token;
      setToken(restToken);

      const uniqueSuffix = Math.floor(Math.random() * 900 + 100);
      const res = await apiRequest('/items', {
        method: 'POST',
        body: {
          name: `Chef Special Biryani #${uniqueSuffix}`,
          price: 240.00,
          category: 'Campus Special',
          available: true
        }
      });

      renderCardResult(
        document.getElementById('resTest4'),
        document.getElementById('resStatus4'),
        document.getElementById('resJson4'),
        document.getElementById('resExpl4'),
        res.status,
        res.data,
        'Restaurant role is authorized to write to the catalogue. Guard 2 (requireRole) passed and item was added.'
      );
      fetchItems();
    }
  });

  // TEST 5: POST /items with Customer Token -> 403 Forbidden
  runTest5Btn.addEventListener('click', async () => {
    // Acquire customer token
    const loginRes = await apiRequest('/login', {
      method: 'POST',
      body: { email: 'customer@campuseats.com', password: 'customer123' }
    }, '');

    if (loginRes.status === 200 && loginRes.data.token) {
      const custToken = loginRes.data.token;
      setToken(custToken);

      const res = await apiRequest('/items', {
        method: 'POST',
        body: {
          name: 'Unauthorized Student Dish',
          price: 99.00,
          category: 'Snacks'
        }
      });

      renderCardResult(
        document.getElementById('resTest5'),
        document.getElementById('resStatus5'),
        document.getElementById('resJson5'),
        document.getElementById('resExpl5'),
        res.status,
        res.data,
        'Guard 1 passed authentication, but Guard 2 (requireRole) rejected role "customer" because only restaurant/admin can modify items.'
      );
    }
  });

  // =========================================================================
  // Menu Catalogue Management (GET /items & POST /items)
  // =========================================================================

  async function fetchItems() {
    loadingIndicator.style.display = 'block';
    itemsContainer.innerHTML = '';
    emptyCatalogueMessage.style.display = 'none';

    try {
      const res = await apiRequest('/items');
      loadingIndicator.style.display = 'none';

      if (res.status === 401) {
        itemsContainer.innerHTML = `
          <div class="alert-box alert-danger" style="grid-column: 1 / -1; display: block;">
            <strong>HTTP 401 Unauthorized:</strong> ${escapeHtml(res.data.message || 'Authentication required to view catalogue.')}
            <br><small>Tip: Sign in with Customer or Restaurant above, or click TEST 2.</small>
          </div>
        `;
        return;
      }

      if (!res.ok) {
        itemsContainer.innerHTML = `
          <div class="alert-box alert-danger" style="grid-column: 1 / -1; display: block;">
            Error loading catalogue: ${escapeHtml(res.data.message || 'Unknown error')}
          </div>
        `;
        return;
      }

      const items = res.data;
      if (!Array.isArray(items) || items.length === 0) {
        emptyCatalogueMessage.style.display = 'block';
        return;
      }

      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';

        const itemTop = document.createElement('div');
        itemTop.className = 'item-top';

        const itemName = document.createElement('span');
        itemName.className = 'item-name';
        itemName.textContent = item.name;

        const itemId = document.createElement('span');
        itemId.className = 'item-id-tag';
        itemId.textContent = `#${item.id}`;

        itemTop.appendChild(itemName);
        itemTop.appendChild(itemId);

        const categoryTag = document.createElement('span');
        categoryTag.className = 'item-category-tag';
        categoryTag.textContent = item.category || 'Special';

        const itemMeta = document.createElement('div');
        itemMeta.className = 'item-meta';

        const itemPrice = document.createElement('span');
        itemPrice.className = 'item-price';
        itemPrice.textContent = `₹${Number(item.price).toFixed(2)}`;

        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${item.available ? 'status-available' : 'status-unavailable'}`;
        statusBadge.textContent = item.available ? '● Available' : '○ Sold Out';

        itemMeta.appendChild(itemPrice);
        itemMeta.appendChild(statusBadge);

        card.appendChild(itemTop);
        card.appendChild(categoryTag);
        card.appendChild(itemMeta);

        itemsContainer.appendChild(card);
      });

    } catch (err) {
      loadingIndicator.style.display = 'none';
      showAlert(`Network error: ${err.message}`, 'danger');
    }
  }

  addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('itemName').value;
    const price = document.getElementById('itemPrice').value;
    const category = document.getElementById('itemCategory').value;
    const available = document.getElementById('itemAvailable').checked;

    const payload = {
      name,
      price: parseFloat(price),
      category,
      available
    };

    try {
      const res = await apiRequest('/items', {
        method: 'POST',
        body: payload
      });

      if (res.status === 401) {
        showAlert('HTTP 401 Unauthorized: Please log in first.', 'danger');
        return;
      }

      if (res.status === 403) {
        showAlert(`HTTP 403 Forbidden: ${res.data.message || 'Access denied. Restaurant role required.'}`, 'warning', 8000);
        return;
      }

      if (res.status === 201) {
        showAlert(`Created item '${res.data.name}' with ID #${res.data.id} (HTTP 201 Created).`, 'success');
        addItemForm.reset();
        document.getElementById('itemAvailable').checked = true;
        fetchItems();
        return;
      }

      showAlert(`Validation Error (${res.status}): ${res.data.message || 'Failed to create item'}`, 'danger');
    } catch (err) {
      showAlert(`Submission error: ${err.message}`, 'danger');
    }
  });

  refreshBtn.addEventListener('click', fetchItems);

  // Initial dashboard load
  updateSessionUI();
  fetchItems();
});
