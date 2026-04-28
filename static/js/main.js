// ─────────────────────────────────────────────
// NEOBANK v2 — main.js
// ─────────────────────────────────────────────

let currentAction = '';

// ── AUTH ──────────────────────────────────────

function switchAuth(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('panel-login').classList.toggle('active', tab === 'login');
  document.getElementById('panel-register').classList.toggle('active', tab === 'register');
}

async function register() {
  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const balance  = parseFloat(document.getElementById('reg-balance').value) || 0;
  const pin      = document.getElementById('reg-pin').value.trim();
  const err      = document.getElementById('reg-err');
  err.textContent = '';

  if (!name)     { err.textContent = 'Please enter your full name.'; return; }
  if (!username) { err.textContent = 'Please choose a username.'; return; }
  if (pin.length !== 4 || !/^\d+$/.test(pin)) { err.textContent = 'PIN must be exactly 4 digits.'; return; }

  const res  = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, username, balance, pin }) });
  const data = await res.json();
  if (data.error) { err.textContent = data.error; return; }

  showToast(`Account created! Welcome, @${data.username}`, 'success');
  document.getElementById('login-id').value = data.username;
  switchAuth('login');
}

async function login() {
  const id  = document.getElementById('login-id').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  const err = document.getElementById('login-err');
  err.textContent = '';

  if (!id || !pin) { err.textContent = 'Please fill in all fields.'; return; }

  const res  = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, pin }) });
  const data = await res.json();
  if (data.error) { err.textContent = data.error; return; }

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('dashboard').classList.add('show');
  document.getElementById('user-name').textContent   = data.name;
  document.getElementById('user-handle').textContent = '@' + data.username;
  document.getElementById('user-avatar').textContent = data.name[0].toUpperCase();
  document.getElementById('balance-id').textContent  = data.account_id;
  updateBalance(data.balance);
  loadTransactions();
  loadAnalytics();
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  document.getElementById('dashboard').classList.remove('show');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('login-pin').value  = '';
  document.getElementById('login-err').textContent = '';
}

// ── BALANCE ───────────────────────────────────

function updateBalance(bal) {
  document.getElementById('balance-val').textContent =
    parseFloat(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── MODAL ─────────────────────────────────────

function openModal(action) {
  currentAction = action;
  const titles = { deposit: '↓ Deposit Funds', withdraw: '↑ Withdraw Funds', transfer: '⇄ Transfer Funds' };
  document.getElementById('modal-title').textContent = titles[action];
  document.getElementById('modal-amount').value    = '';
  document.getElementById('modal-category').value  = action === 'deposit' ? 'income' : 'other';
  document.getElementById('modal-err').textContent = '';
  document.getElementById('transfer-field').style.display  = action === 'transfer' ? 'block' : 'none';
  document.getElementById('category-field').style.display  = action !== 'transfer' ? 'block' : 'none';

  // Update category options based on action
  const cat = document.getElementById('modal-category');
  cat.innerHTML = '';
  if (action === 'deposit') {
    ['income', 'salary', 'freelance', 'investment', 'other'].forEach(c => {
      cat.innerHTML += `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`;
    });
  } else {
    ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'other'].forEach(c => {
      cat.innerHTML += `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`;
    });
  }

  document.getElementById('modal').classList.add('show');
}

function closeModal() { document.getElementById('modal').classList.remove('show'); }

async function confirmAction() {
  const amount = parseFloat(document.getElementById('modal-amount').value);
  const err    = document.getElementById('modal-err');
  err.textContent = '';

  if (!amount || amount <= 0) { err.textContent = 'Please enter a valid amount.'; return; }

  let body = { amount, category: document.getElementById('modal-category').value };
  if (currentAction === 'transfer') {
    const rec = document.getElementById('modal-recipient').value.trim();
    if (!rec) { err.textContent = 'Please enter recipient username or account ID.'; return; }
    body.recipient_id = rec;
  }

  const res  = await fetch(`/api/${currentAction}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) { err.textContent = data.error; return; }

  updateBalance(data.balance);
  closeModal();
  loadTransactions();
  loadAnalytics();
  const msgs = {
    deposit:  `$${amount.toFixed(2)} deposited`,
    withdraw: `$${amount.toFixed(2)} withdrawn`,
    transfer: `$${amount.toFixed(2)} sent to ${data.recipient_name || 'recipient'}`
  };
  showToast(msgs[currentAction], 'success');
}

// ── TRANSACTIONS ──────────────────────────────

async function loadTransactions() {
  const res  = await fetch('/api/transactions');
  const data = await res.json();
  if (data.error) return;

  updateBalance(data.balance);
  const list = document.getElementById('txn-list');

  if (!data.transactions.length) {
    list.innerHTML = '<div class="empty-state">No transactions yet — make your first deposit!</div>';
    return;
  }

  const icons = { deposit: '↓', withdraw: '↑', transfer_out: '↑', transfer_in: '↓' };
  list.innerHTML = data.transactions.map(t => {
    const isPlus = ['deposit', 'transfer_in'].includes(t.type);
    return `<div class="txn-item">
      <div class="txn-left">
        <div class="txn-icon ${t.type}">${icons[t.type] || '⇄'}</div>
        <div>
          <div class="txn-desc">${t.description}</div>
          <div class="txn-date">${t.created_at}</div>
        </div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${isPlus ? 'plus' : 'minus'}">${isPlus ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}</div>
        <div class="txn-bal">$${t.balance_after.toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── ANALYTICS ─────────────────────────────────

async function loadAnalytics() {
  const res  = await fetch('/api/analytics');
  const data = await res.json();
  if (data.error) return;

  document.getElementById('analytics-income').textContent   = '$' + data.income.toLocaleString('en-US', { minimumFractionDigits: 2 });
  document.getElementById('analytics-expenses').textContent = '$' + data.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 });
  document.getElementById('analytics-txn-count').textContent = data.transaction_count;

  const cats = data.spending_by_category;
  const max  = Math.max(...Object.values(cats), 1);
  const bars = document.getElementById('analytics-bars');

  if (!Object.keys(cats).length) {
    bars.innerHTML = '<div style="color:var(--muted);font-size:0.82rem">No spending data yet</div>';
    return;
  }

  bars.innerHTML = Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label">${cat}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:${(val / max * 100).toFixed(1)}%"></div>
        </div>
        <div class="chart-bar-val">$${val.toFixed(0)}</div>
      </div>`).join('');
}

// ── CURRENCY CONVERTER ────────────────────────

async function convertCurrency() {
  const amount = parseFloat(document.getElementById('curr-amount').value);
  const from   = document.getElementById('curr-from').value;
  const to     = document.getElementById('curr-to').value;
  const result = document.getElementById('currency-result');

  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  result.classList.remove('show');
  const res  = await fetch('/api/currency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, from, to }) });
  const data = await res.json();

  if (data.error) { showToast(data.error, 'error'); return; }

  document.getElementById('curr-result-main').textContent = `${data.result.toLocaleString()} ${data.to}`;
  document.getElementById('curr-result-sub').textContent  = `1 ${data.from} = ${data.rate} ${data.to}  ·  ${data.amount} ${data.from} → ${data.result} ${data.to}`;
  result.classList.add('show');
}

// ── STOCK LOOKUP ──────────────────────────────

async function lookupStock() {
  const ticker = document.getElementById('stock-ticker').value.trim().toUpperCase();
  const result = document.getElementById('stock-result');
  if (!ticker) { showToast('Enter a stock ticker', 'error'); return; }

  result.classList.remove('show');
  document.getElementById('stock-btn').textContent = 'Loading...';

  const res  = await fetch('/api/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
  const data = await res.json();
  document.getElementById('stock-btn').textContent = 'Look Up';

  if (data.error) { showToast(data.error, 'error'); return; }

  const changeColor = data.change >= 0 ? 'var(--green)' : 'var(--red)';
  const changeSign  = data.change >= 0 ? '+' : '';

  document.getElementById('stock-result-main').textContent = `$${data.price} ${data.currency}`;
  document.getElementById('stock-result-sub').textContent  = data.name;
  document.getElementById('stock-result-grid').innerHTML = `
    <div class="result-item"><div class="rl">Change</div><div class="rv" style="color:${changeColor}">${changeSign}${data.change}%</div></div>
    <div class="result-item"><div class="rl">Day High</div><div class="rv">$${data.high}</div></div>
    <div class="result-item"><div class="rl">Day Low</div><div class="rv">$${data.low}</div></div>
  `;
  result.classList.add('show');
}

// ── LOAN CALCULATOR ───────────────────────────

async function calculateLoan() {
  const principal = parseFloat(document.getElementById('loan-amount').value);
  const rate      = parseFloat(document.getElementById('loan-rate').value);
  const months    = parseInt(document.getElementById('loan-months').value);
  const result    = document.getElementById('loan-result');

  if (!principal || principal <= 0) { showToast('Enter a valid loan amount', 'error'); return; }
  if (isNaN(rate) || rate < 0)      { showToast('Enter a valid interest rate', 'error'); return; }
  if (!months || months <= 0)       { showToast('Enter a valid loan term', 'error'); return; }

  result.classList.remove('show');
  const res  = await fetch('/api/loan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal, rate, months }) });
  const data = await res.json();

  if (data.error) { showToast(data.error, 'error'); return; }

  document.getElementById('loan-result-main').textContent = `$${data.monthly_payment.toLocaleString('en-US', { minimumFractionDigits: 2 })} / mo`;
  document.getElementById('loan-result-sub').textContent  = `Total: $${data.total_payment.toLocaleString('en-US', { minimumFractionDigits: 2 })}  ·  Interest: $${data.total_interest.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const table = document.getElementById('loan-table-body');
  table.innerHTML = data.schedule.map(row => `
    <tr>
      <td>${row.month}</td>
      <td>$${row.payment.toFixed(2)}</td>
      <td>$${row.principal.toFixed(2)}</td>
      <td>$${row.interest.toFixed(2)}</td>
      <td>$${row.balance.toFixed(2)}</td>
    </tr>`).join('');

  result.classList.add('show');
}

// ── TOOLS TABS ────────────────────────────────

function switchTool(tool) {
  document.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tool-' + tool).classList.add('active');
}

// ── TOAST ─────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── EVENTS ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const authVisible = document.getElementById('auth-screen').style.display !== 'none';
      if (authVisible) {
        if (document.getElementById('panel-login').classList.contains('active')) login();
        else register();
      }
      if (document.getElementById('modal').classList.contains('show')) confirmAction();
    }
    if (e.key === 'Escape') closeModal();
  });
});
