const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dayjs = require('dayjs');

let db;

const createDatabaseFile = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const initializeDatabase = (app) => {
  const dbPath = path.join(app.getPath('userData'), 'personal-finance.db');
  createDatabaseFile(dbPath);

  db = new Database(dbPath, { verbose: console.log });

  const schema = `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      limit_value REAL NOT NULL,
      closing_day INTEGER DEFAULT 1,
      due_day INTEGER DEFAULT 10,
      brand TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      card_id INTEGER,
      installments INTEGER DEFAULT 1,
      installment_number INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE SET NULL
    );
  `;

  db.exec(schema);
};

const addCard = ({ name, limitValue, closingDay, dueDay, brand }) => {
  const stmt = db.prepare(
    `INSERT INTO cards (name, limit_value, closing_day, due_day, brand)
     VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(name.trim(), Number(limitValue), closingDay || 1, dueDay || 10, brand?.trim() || null);
  return db.prepare('SELECT * FROM cards ORDER BY name ASC').all();
};

const removeCard = (id) => {
  db.prepare(`DELETE FROM cards WHERE id = ?`).run(id);
  return db.prepare('SELECT * FROM cards ORDER BY name ASC').all();
};

const centsDistribution = (total, parts) => {
  const totalCents = Math.round(Number(total) * 100);
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  const distribution = Array.from({ length: parts }, (_, index) =>
    base + (index < remainder ? 1 : 0)
  );
  return distribution.map((value) => value / 100);
};

const addTransaction = ({
  type,
  description,
  category,
  amount,
  transactionDate,
  installments = 1,
  cardId = null
}) => {
  const normalizedType = type === 'income' ? 'income' : 'expense';
  const totalInstallments = normalizedType === 'income' ? 1 : Math.max(1, Number(installments));
  const safeTransactionDate = transactionDate || dayjs().format('YYYY-MM-DD');
  const amounts = centsDistribution(amount, totalInstallments);

  const insert = db.prepare(
    `INSERT INTO transactions
      (type, description, category, amount, transaction_date, card_id, installments, installment_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((entries) => {
    for (const entry of entries) insert.run(entry);
  });

  const transactionEntries = [];
  for (let i = 0; i < totalInstallments; i++) {
    const currentDate = dayjs(safeTransactionDate).add(i, 'month').format('YYYY-MM-DD');
    transactionEntries.push([
      normalizedType,
      description.trim(),
      category.trim(),
      amounts[i],
      currentDate,
      cardId || null,
      totalInstallments,
      i + 1
    ]);
  }

  insertMany(transactionEntries);

  return db.prepare('SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC').all();
};

const removeTransaction = (id) => {
  db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id);
  return db.prepare('SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC').all();
};

const updateTransaction = ({
  id,
  type,
  description,
  category,
  amount,
  transactionDate,
  installments = 1,
  installmentNumber = 1,
  cardId = null
}) => {
  const normalizedType = type === 'income' ? 'income' : 'expense';
  const normalizedInstallments =
    normalizedType === 'income' ? 1 : Math.max(1, Number(installments) || 1);
  const normalizedInstallmentNumber =
    normalizedType === 'income'
      ? 1
      : Math.min(Math.max(1, Number(installmentNumber) || 1), normalizedInstallments);

  db.prepare(
    `UPDATE transactions
       SET type = ?,
           description = ?,
           category = ?,
           amount = ?,
           transaction_date = ?,
           card_id = ?,
           installments = ?,
           installment_number = ?
     WHERE id = ?`
  ).run(
    normalizedType,
    description.trim(),
    category.trim(),
    Number(amount),
    transactionDate,
    normalizedType === 'income' ? null : cardId || null,
    normalizedInstallments,
    normalizedInstallmentNumber,
    id
  );

  return db.prepare('SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC').all();
};

const getSavingsHistory = () => {
  const rows = db.prepare(
    `SELECT 
       CAST(strftime('%Y', transaction_date) AS INTEGER) AS year,
       CAST(strftime('%m', transaction_date) AS INTEGER) AS month,
       SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense
     FROM transactions
     GROUP BY year, month
     ORDER BY year DESC, month DESC`
  ).all();

  const history = rows.map((row) => {
    const income = Number(row.total_income || 0);
    const expense = Number(row.total_expense || 0);
    const savings = Math.max(income - expense, 0);
    return {
      year: row.year,
      month: row.month,
      income,
      expense,
      savings
    };
  });

  const totalSaved = history.reduce((acc, entry) => acc + entry.savings, 0);

  return {
    history,
    totalSaved
  };
};

const getAllData = () => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY name ASC').all();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC').all();
  const savings = getSavingsHistory();
  return { cards, transactions, savings };
};

const getTransactionsByMonth = (year, month) => {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
  const end = start.endOf('month');
  return db.prepare(
    `SELECT * FROM transactions
     WHERE date(transaction_date) BETWEEN ? AND ?
     ORDER BY date(transaction_date) ASC, installment_number ASC`
  ).all(start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'));
};

module.exports = {
  initializeDatabase,
  addCard,
  removeCard,
  addTransaction,
  removeTransaction,
  updateTransaction,
  getAllData,
  getTransactionsByMonth,
  getSavingsHistory
};