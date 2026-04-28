"""
NeoBank v2 - Premium Virtual Banking System
=============================================
Features:
  - Account creation with username + PIN
  - Login via username or account ID
  - Deposit, Withdraw, Transfer
  - Transaction history with categories
  - Currency Converter (exchangerate-api)
  - Stock Price Lookup (Yahoo Finance via yfinance)
  - Loan / Interest Calculator
  - Spending Analytics & Charts

Tech: Python, Flask, SQLite, yfinance, requests
"""

import os, sqlite3, hashlib, uuid, requests
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)
DB = "neobank.db"

# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                pin_hash TEXT NOT NULL,
                balance REAL DEFAULT 0,
                created_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                account_id TEXT,
                type TEXT,
                amount REAL,
                category TEXT,
                description TEXT,
                balance_after REAL,
                created_at TEXT
            )
        """)
        conn.commit()

def hash_pin(pin):
    return hashlib.sha256(pin.encode()).hexdigest()

def log_txn(conn, account_id, txn_type, amount, category, description, balance_after):
    conn.execute("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?)", (
        str(uuid.uuid4()), account_id, txn_type, amount, category,
        description, balance_after, datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))

init_db()

# ─────────────────────────────────────────────
# ROUTES - PAGES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

# ─────────────────────────────────────────────
# ROUTES - AUTH
# ─────────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def api_register():
    d        = request.get_json()
    name     = d.get("name", "").strip()
    username = d.get("username", "").strip().lower()
    balance  = float(d.get("balance", 0))
    pin      = str(d.get("pin", "")).strip()

    if not name:                               return jsonify({"error": "Name is required"}), 400
    if not username or len(username) < 3:      return jsonify({"error": "Username must be at least 3 characters"}), 400
    if not username.replace("_","").isalnum(): return jsonify({"error": "Username: letters, numbers, underscores only"}), 400
    if len(pin) != 4 or not pin.isdigit():     return jsonify({"error": "PIN must be exactly 4 digits"}), 400
    if balance < 0:                            return jsonify({"error": "Invalid opening balance"}), 400

    account_id = "NEO-" + str(uuid.uuid4())[:6].upper()
    with get_db() as conn:
        if conn.execute("SELECT id FROM accounts WHERE username=?", (username,)).fetchone():
            return jsonify({"error": "Username already taken"}), 400
        conn.execute("INSERT INTO accounts VALUES (?,?,?,?,?,?)", (
            account_id, name, username, hash_pin(pin), balance,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        if balance > 0:
            log_txn(conn, account_id, "deposit", balance, "income", "Opening deposit", balance)
        conn.commit()
    return jsonify({"account_id": account_id, "username": username})


@app.route("/api/login", methods=["POST"])
def api_login():
    d          = request.get_json()
    identifier = d.get("identifier", "").strip()
    pin        = str(d.get("pin", "")).strip()

    with get_db() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (identifier,)).fetchone()
        if not row:
            row = conn.execute("SELECT * FROM accounts WHERE username=?", (identifier.lower(),)).fetchone()

    if not row or row["pin_hash"] != hash_pin(pin):
        return jsonify({"error": "Invalid credentials"}), 401

    session["account_id"] = row["id"]
    return jsonify({"account_id": row["id"], "name": row["name"], "username": row["username"], "balance": row["balance"]})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

# ─────────────────────────────────────────────
# ROUTES - BANKING
# ─────────────────────────────────────────────

@app.route("/api/deposit", methods=["POST"])
def api_deposit():
    if "account_id" not in session: return jsonify({"error": "Not logged in"}), 401
    d        = request.get_json()
    amount   = float(d.get("amount", 0))
    category = d.get("category", "income")
    if amount <= 0: return jsonify({"error": "Invalid amount"}), 400

    with get_db() as conn:
        row     = conn.execute("SELECT * FROM accounts WHERE id=?", (session["account_id"],)).fetchone()
        new_bal = row["balance"] + amount
        conn.execute("UPDATE accounts SET balance=? WHERE id=?", (new_bal, session["account_id"]))
        log_txn(conn, session["account_id"], "deposit", amount, category, f"Deposit — {category}", new_bal)
        conn.commit()
    return jsonify({"balance": new_bal})


@app.route("/api/withdraw", methods=["POST"])
def api_withdraw():
    if "account_id" not in session: return jsonify({"error": "Not logged in"}), 401
    d        = request.get_json()
    amount   = float(d.get("amount", 0))
    category = d.get("category", "other")
    if amount <= 0: return jsonify({"error": "Invalid amount"}), 400

    with get_db() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (session["account_id"],)).fetchone()
        if row["balance"] < amount: return jsonify({"error": "Insufficient funds"}), 400
        new_bal = row["balance"] - amount
        conn.execute("UPDATE accounts SET balance=? WHERE id=?", (new_bal, session["account_id"]))
        log_txn(conn, session["account_id"], "withdraw", amount, category, f"Withdrawal — {category}", new_bal)
        conn.commit()
    return jsonify({"balance": new_bal})


@app.route("/api/transfer", methods=["POST"])
def api_transfer():
    if "account_id" not in session: return jsonify({"error": "Not logged in"}), 401
    d            = request.get_json()
    amount       = float(d.get("amount", 0))
    recipient_id = d.get("recipient_id", "").strip()

    if amount <= 0:      return jsonify({"error": "Invalid amount"}), 400
    if not recipient_id: return jsonify({"error": "Recipient required"}), 400
    if recipient_id == session["account_id"]: return jsonify({"error": "Cannot transfer to yourself"}), 400

    with get_db() as conn:
        sender    = conn.execute("SELECT * FROM accounts WHERE id=?", (session["account_id"],)).fetchone()
        recipient = conn.execute("SELECT * FROM accounts WHERE id=? OR username=?", (recipient_id, recipient_id.lower())).fetchone()

        if not recipient:           return jsonify({"error": "Recipient not found"}), 404
        if sender["balance"] < amount: return jsonify({"error": "Insufficient funds"}), 400

        s_bal = sender["balance"] - amount
        r_bal = recipient["balance"] + amount
        conn.execute("UPDATE accounts SET balance=? WHERE id=?", (s_bal, session["account_id"]))
        conn.execute("UPDATE accounts SET balance=? WHERE id=?", (r_bal, recipient["id"]))
        log_txn(conn, session["account_id"], "transfer_out", amount, "transfer", f"Transfer to @{recipient['username']}", s_bal)
        log_txn(conn, recipient["id"],       "transfer_in",  amount, "transfer", f"Transfer from @{sender['username']}", r_bal)
        conn.commit()
    return jsonify({"balance": s_bal, "recipient_name": recipient["name"]})


@app.route("/api/transactions")
def api_transactions():
    if "account_id" not in session: return jsonify({"error": "Not logged in"}), 401
    with get_db() as conn:
        row  = conn.execute("SELECT balance FROM accounts WHERE id=?", (session["account_id"],)).fetchone()
        txns = conn.execute(
            "SELECT * FROM transactions WHERE account_id=? ORDER BY created_at DESC LIMIT 30",
            (session["account_id"],)
        ).fetchall()
    return jsonify({"balance": row["balance"], "transactions": [dict(t) for t in txns]})


@app.route("/api/analytics")
def api_analytics():
    if "account_id" not in session: return jsonify({"error": "Not logged in"}), 401
    with get_db() as conn:
        txns = conn.execute(
            "SELECT * FROM transactions WHERE account_id=? ORDER BY created_at DESC",
            (session["account_id"],)
        ).fetchall()

    spending = {}
    income   = 0
    expenses = 0
    for t in txns:
        if t["type"] in ("withdraw", "transfer_out"):
            expenses += t["amount"]
            cat = t["category"] or "other"
            spending[cat] = spending.get(cat, 0) + t["amount"]
        elif t["type"] in ("deposit", "transfer_in"):
            income += t["amount"]

    return jsonify({
        "income":   round(income, 2),
        "expenses": round(expenses, 2),
        "spending_by_category": {k: round(v, 2) for k, v in spending.items()},
        "transaction_count": len(txns)
    })

# ─────────────────────────────────────────────
# ROUTES - EXTERNAL APIs
# ─────────────────────────────────────────────

@app.route("/api/currency", methods=["POST"])
def api_currency():
    d      = request.get_json()
    amount = float(d.get("amount", 1))
    frm    = d.get("from", "USD").upper()
    to     = d.get("to", "EUR").upper()
    try:
        # Free tier — no key needed
        url  = f"https://api.exchangerate-api.com/v4/latest/{frm}"
        data = requests.get(url, timeout=5).json()
        rate = data["rates"].get(to)
        if not rate: return jsonify({"error": f"Currency {to} not found"}), 400
        return jsonify({
            "from": frm, "to": to,
            "rate": round(rate, 6),
            "amount": amount,
            "result": round(amount * rate, 2)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stock", methods=["POST"])
def api_stock():
    d      = request.get_json()
    ticker = d.get("ticker", "").strip().upper()
    if not ticker: return jsonify({"error": "Ticker required"}), 400
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info  = stock.info
        price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        if not price: return jsonify({"error": f"Could not find data for {ticker}"}), 404
        return jsonify({
            "ticker":   ticker,
            "name":     info.get("longName", ticker),
            "price":    round(price, 2),
            "currency": info.get("currency", "USD"),
            "change":   round(info.get("regularMarketChangePercent", 0), 2),
            "high":     round(info.get("dayHigh", 0), 2),
            "low":      round(info.get("regularMarketDayLow", 0), 2),
            "market_cap": info.get("marketCap", 0)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/loan", methods=["POST"])
def api_loan():
    d          = request.get_json()
    principal  = float(d.get("principal", 0))
    rate       = float(d.get("rate", 0))       # annual %
    months     = int(d.get("months", 12))

    if principal <= 0: return jsonify({"error": "Invalid loan amount"}), 400
    if rate < 0:       return jsonify({"error": "Invalid interest rate"}), 400
    if months <= 0:    return jsonify({"error": "Invalid loan term"}), 400

    if rate == 0:
        monthly = round(principal / months, 2)
        total   = principal
        interest = 0
    else:
        r       = (rate / 100) / 12
        monthly = principal * (r * (1 + r)**months) / ((1 + r)**months - 1)
        total   = monthly * months
        interest = total - principal

    schedule = []
    balance  = principal
    for m in range(1, min(months + 1, 13)):  # show first 12 months
        int_payment  = balance * (rate / 100 / 12) if rate > 0 else 0
        prin_payment = monthly - int_payment
        balance      = max(0, balance - prin_payment)
        schedule.append({
            "month":     m,
            "payment":   round(monthly, 2),
            "principal": round(prin_payment, 2),
            "interest":  round(int_payment, 2),
            "balance":   round(balance, 2)
        })

    return jsonify({
        "monthly_payment": round(monthly, 2),
        "total_payment":   round(total, 2),
        "total_interest":  round(interest, 2),
        "principal":       principal,
        "rate":            rate,
        "months":          months,
        "schedule":        schedule
    })

# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("\n◈  NeoBank v2")
    print("   Running at: http://127.0.0.1:5000\n")
    app.run(debug=True)
