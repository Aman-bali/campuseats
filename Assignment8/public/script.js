/**
 * CampusEats — CS543 Assignment 8
 * Frontend REST Client via native fetch()
 * Authors: Aman Bali (20251651015) & Bhupesh Kumar (20251651032)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const itemsContainer = document.getElementById('itemsContainer');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const emptyState = document.getElementById('emptyState');
  const refreshBtn = document.getElementById('refreshBtn');
  const alertBox = document.getElementById('alertBox');
  const addItemForm = document.getElementById('addItemForm');
  const submitBtn = document.getElementById('submitBtn');
  const lookupIdInput = document.getElementById('lookupIdInput');
  const lookupBtn = document.getElementById('lookupBtn');
  const lookupResult = document.getElementById('lookupResult');

  let alertTimeout = null;
  let isSubmitting = false;

  // ==========================================
  // Helper: Display Dismissible Alert Toast
  // ==========================================
  function showAlert(message, type = 'success') {
    if (alertTimeout) clearTimeout(alertTimeout);

    alertBox.className = `alert-box alert-${type}`;
    alertBox.textContent = message;
    alertBox.style.display = 'flex';

    alertTimeout = setTimeout(() => {
      alertBox.style.display = 'none';
    }, 4500);
  }

  // ==========================================
  // Helper: Format Currency (INR)
  // ==========================================
  function formatPrice(val) {
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  // ==========================================
  // 1. GET /items — Fetch & Render Menu List
  // ==========================================
  async function fetchItems() {
    loadingIndicator.style.display = 'block';
    emptyState.style.display = 'none';

    try {
      const response = await fetch('/items');
      
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status} (${response.statusText})`);
      }

      const items = await response.json();
      renderItems(items);
    } catch (err) {
      console.error('Failed to fetch items:', err);
      showAlert(`Error loading menu catalogue: ${err.message}`, 'danger');
      loadingIndicator.style.display = 'none';
    }
  }

  // Render items safely to prevent XSS injection
  function renderItems(items) {
    loadingIndicator.style.display = 'none';
    itemsContainer.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      emptyState.style.display = 'block';
      itemsContainer.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    itemsContainer.style.display = 'grid';

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';

      // Header row: ID tag & Category badge
      const headerRow = document.createElement('div');
      headerRow.className = 'item-card-header';

      const idTag = document.createElement('span');
      idTag.className = 'item-id-tag';
      idTag.textContent = `#${item.id}`;

      const catTag = document.createElement('span');
      catTag.className = 'item-category-tag';
      catTag.textContent = item.category || 'Special';

      headerRow.appendChild(idTag);
      headerRow.appendChild(catTag);

      // Dish name
      const nameEl = document.createElement('h3');
      nameEl.className = 'item-name';
      nameEl.textContent = item.name;

      // Footer row: Price & Availability badge
      const footerRow = document.createElement('div');
      footerRow.className = 'item-card-footer';

      const priceEl = document.createElement('div');
      priceEl.className = 'item-price';

      const currencySpan = document.createElement('span');
      currencySpan.className = 'item-currency';
      currencySpan.textContent = '₹';

      const priceValue = document.createTextNode(formatPrice(item.price));
      priceEl.appendChild(currencySpan);
      priceEl.appendChild(priceValue);

      const statusPill = document.createElement('span');
      if (item.available) {
        statusPill.className = 'status-pill status-available';
        statusPill.textContent = 'Available';
      } else {
        statusPill.className = 'status-pill status-unavailable';
        statusPill.textContent = 'Sold Out';
      }

      footerRow.appendChild(priceEl);
      footerRow.appendChild(statusPill);

      // Assemble card
      card.appendChild(headerRow);
      card.appendChild(nameEl);
      card.appendChild(footerRow);

      itemsContainer.appendChild(card);
    });
  }

  // ==========================================
  // 2. POST /items — Add Record & Refresh List
  // ==========================================
  addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return; // Prevent duplicate submission

    const nameInput = document.getElementById('itemName');
    const priceInput = document.getElementById('itemPrice');
    const categoryInput = document.getElementById('itemCategory');
    const availableInput = document.getElementById('itemAvailable');

    const rawName = nameInput.value.trim();
    const rawPrice = priceInput.value.trim();
    const category = categoryInput.value;
    const available = availableInput.checked;

    // Client-side quick check
    if (!rawName) {
      showAlert('Validation Error: Dish name cannot be empty.', 'danger');
      nameInput.focus();
      return;
    }

    if (!rawPrice || isNaN(Number(rawPrice)) || Number(rawPrice) < 0) {
      showAlert('Validation Error: Please provide a valid non-negative price.', 'danger');
      priceInput.focus();
      return;
    }

    // Set UI to loading/disabled state
    isSubmitting = true;
    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    if (btnText) btnText.textContent = 'Adding Item...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';

    const payload = {
      name: rawName,
      price: parseFloat(rawPrice),
      category: category,
      available: available
    };

    try {
      const response = await fetch('/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.status === 201) {
        // HTTP 201 Created — Success!
        showAlert(`Success! Added "${data.name}" (ID #${data.id}) to catalogue.`, 'success');
        addItemForm.reset();
        // Reset checkbox to checked default
        availableInput.checked = true;
        // Refresh menu list from server
        await fetchItems();
      } else if (response.status === 422) {
        // HTTP 422 Unprocessable Content — Validation failure
        showAlert(`Validation Error (422): ${data.message || data.error}`, 'danger');
      } else {
        // Other unexpected status codes
        showAlert(`Error (${response.status}): ${data.message || data.error || 'Failed to add item.'}`, 'danger');
      }
    } catch (err) {
      console.error('POST request failed:', err);
      showAlert(`Network error: ${err.message}`, 'danger');
    } finally {
      // Restore UI state
      isSubmitting = false;
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Add to Menu Catalogue';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  });

  // ==========================================
  // 3. GET /items/:id — Route Inspector Test
  // ==========================================
  async function lookupItemById() {
    const id = lookupIdInput.value.trim();
    if (!id) {
      lookupResult.style.display = 'block';
      lookupResult.innerHTML = '<p style="color: var(--danger);">Please enter a valid numeric ID.</p>';
      return;
    }

    lookupBtn.disabled = true;
    lookupBtn.textContent = '...';

    try {
      const response = await fetch(`/items/${encodeURIComponent(id)}`);
      const status = response.status;
      const data = await response.json();

      lookupResult.style.display = 'block';
      lookupResult.innerHTML = '';

      const statusRow = document.createElement('div');
      statusRow.className = 'lookup-status-row';

      const labelSpan = document.createElement('strong');
      labelSpan.textContent = `GET /items/${id}`;

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${status === 200 ? 'badge-200' : 'badge-404'}`;
      statusBadge.textContent = status === 200 ? '200 OK' : `${status} ${response.statusText || 'Not Found'}`;

      statusRow.appendChild(labelSpan);
      statusRow.appendChild(statusBadge);

      const jsonPre = document.createElement('pre');
      jsonPre.className = 'lookup-json';
      jsonPre.textContent = JSON.stringify(data, null, 2);

      lookupResult.appendChild(statusRow);
      lookupResult.appendChild(jsonPre);
    } catch (err) {
      lookupResult.style.display = 'block';
      lookupResult.innerHTML = `<p style="color: var(--danger);">Request failed: ${err.message}</p>`;
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Fetch';
    }
  }

  lookupBtn.addEventListener('click', lookupItemById);
  lookupIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupItemById();
    }
  });

  // Refresh button listener
  refreshBtn.addEventListener('click', () => {
    fetchItems();
    showAlert('Menu catalogue refreshed from server.', 'success');
  });

  // Initial load
  fetchItems();
});
