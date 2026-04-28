# ◈ NeoBank — Premium Virtual Banking System

A full-stack fintech-style virtual banking web app built with Python and Flask.

## Live Demo
🔗 [Coming soon on Render]

## Features

| Feature | Description |
|---------|-------------|
| 🔐 Account Creation | Register with name, username, opening balance, and 4-digit PIN |
| 🔑 Secure Login | Sign in with username **or** Account ID + PIN |
| ↓ Deposit | Add funds with spending category tags |
| ↑ Withdraw | Withdraw with insufficient funds protection |
| ⇄ Transfer | Send money to any user by username or account ID |
| 📊 Spending Analytics | Visual bar chart of spending by category |
| 💱 Currency Converter | Real-time exchange rates via free API |
| 📈 Stock Lookup | Live stock prices via yfinance (AAPL, TSLA, etc.) |
| 🏦 Loan Calculator | Monthly payments + full amortization schedule |
| 🗃️ Transaction History | Full log with timestamps and balance tracking |

## Tech Stack

- **Python** — Core language
- **Flask** — Web server & REST API
- **SQLite** — Persistent database (auto-created on first run)
- **yfinance** — Live stock price data
- **requests** — Currency exchange rate API
- **HTML/CSS/JS** — Premium dark fintech UI (no frameworks)
- **Gunicorn** — Production WSGI server (for deployment)

## Project Structure

```
neo_bank/
├── app.py                  ← Flask backend & REST API
├── requirements.txt
├── .gitignore
├── neobank.db              ← Auto-created on first run (ignored by git)
├── templates/
│   └── index.html          ← Main HTML template
└── static/
    ├── css/
    │   └── style.css       ← All styling
    └── js/
        └── main.js         ← All frontend logic
```

## How to Test

1. Click **Open Account** — create two accounts with different usernames
2. Sign into Account 1 → deposit money with a category (e.g. Salary)
3. Withdraw money with a category (e.g. Food) → check Spending Analytics updates
4. Transfer funds to Account 2 using their username
5. Try the Currency Converter, Stock Lookup, and Loan Calculator in Financial Tools
6. Sign out → sign into Account 2 → verify the transfer arrived

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create new account |
| POST | `/api/login` | Login with username or account ID |
| POST | `/api/logout` | Sign out |
| POST | `/api/deposit` | Deposit funds |
| POST | `/api/withdraw` | Withdraw funds |
| POST | `/api/transfer` | Transfer to another account |
| GET  | `/api/transactions` | Get transaction history |
| GET  | `/api/analytics` | Get spending analytics |
| POST | `/api/currency` | Convert currency (live rates) |
| POST | `/api/stock` | Look up stock price |
| POST | `/api/loan` | Calculate loan payments |
