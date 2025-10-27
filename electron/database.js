const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');

let db;

const createDatabaseFile = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.closeSync(fs.openSync(filePath, 'w'));
  }
};

const initializeDatabase = (app) =>
  new Promise((resolve, reject) => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'personal-finance.db');
      createDatabaseFile(dbPath);
      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        db.serialize(() => {
          db.run(
            `PRAGMA foreign_keys = ON`,
            (pragmaErr) => pragmaErr && console.error('Failed to enable foreign keys', pragmaErr)
          );
          db.run(
            `CREATE TABLE IF NOT EXISTS cards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              limit_value REAL NOT NULL,
              closing_day INTEGER DEFAULT 1,
              due_day INTEGER DEFAULT 10,
              brand TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`
          );
          db.run(
            `CREATE TABLE IF NOT EXISTS transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL CHECK(type IN ('income','expense')),
              description TEXT NOT NULL,
              category TEXT NOT NULL,
              amount REAL NOT NULL,
              transaction_date TEXT NOT NULL,
              card_id INTEGER,
              installments INTEGER DEFAULT 1,
              installment_number INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE SET NULL
            )`,
            (schemaErr) => {
              if (schemaErr) {
                reject(schemaErr);
              } else {
                resolve();
              }
            }
          );
        });
      });
    } catch (error) {
      reject(error);
    }
  });

const runQuery = (query, params = []) =>
  new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    db.run(query, params, function runCallback(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });

const selectAll = (query, params = []) =>
  new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

const addCard = async ({ name, limitValue, closingDay, dueDay, brand }) => {
  await runQuery(
    `INSERT INTO cards (name, limit_value, closing_day, due_day, brand)
     VALUES (?, ?, ?, ?, ?)`,
    [name.trim(), Number(limitValue), closingDay || 1, dueDay || 10, brand?.trim() || null]
  );
  return selectAll('SELECT * FROM cards ORDER BY name ASC');
};

const removeCard = async (id) => {
  await runQuery(`DELETE FROM cards WHERE id = ?`, [id]);
  return selectAll('SELECT * FROM cards ORDER BY name ASC');
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

const addTransaction = async ({
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

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      const statement = db.prepare(
        `INSERT INTO transactions
          (type, description, category, amount, transaction_date, card_id, installments, installment_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      let index = 0;
      const insertNext = () => {
        if (index >= totalInstallments) {
          statement.finalize((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
          return;
        }
        const currentDate = dayjs(safeTransactionDate)
          .add(index, 'month')
          .format('YYYY-MM-DD');
        statement.run(
          [
            normalizedType,
            description.trim(),
            category.trim(),
            amounts[index],
            currentDate,
            cardId || null,
            totalInstallments,
            index + 1
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              index += 1;
              insertNext();
            }
          }
        );
      };
      insertNext();
    });
  });

  return selectAll(
    `SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC`
  );
};

const removeTransaction = async (id) => {
  await runQuery(`DELETE FROM transactions WHERE id = ?`, [id]);
  return selectAll(
    `SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC`
  );
};

const updateTransaction = async ({
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

  await runQuery(
    `UPDATE transactions
       SET type = ?,
           description = ?,
           category = ?,
           amount = ?,
           transaction_date = ?,
           card_id = ?,
           installments = ?,
           installment_number = ?
     WHERE id = ?`,
    [
      normalizedType,
      description.trim(),
      category.trim(),
      Number(amount),
      transactionDate,
      normalizedType === 'income' ? null : cardId || null,
      normalizedInstallments,
      normalizedInstallmentNumber,
      id
    ]
  );

  return selectAll(
    `SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC`
  );
};

const getSavingsHistory = async () => {
  const rows = await selectAll(
    `SELECT 
       CAST(strftime('%Y', transaction_date) AS INTEGER) AS year,
       CAST(strftime('%m', transaction_date) AS INTEGER) AS month,
       SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense
     FROM transactions
     GROUP BY year, month
     ORDER BY year DESC, month DESC`
  );

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

const getAllData = async () => {
  const [cards, transactions, savings] = await Promise.all([
    selectAll('SELECT * FROM cards ORDER BY name ASC'),
    selectAll(
      `SELECT * FROM transactions ORDER BY date(transaction_date) DESC, created_at DESC`
    ),
    getSavingsHistory()
  ]);
  return { cards, transactions, savings };
};

const getTransactionsByMonth = async (year, month) => {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
  const end = start.endOf('month');
  return selectAll(
    `SELECT * FROM transactions
     WHERE date(transaction_date) BETWEEN ? AND ?
     ORDER BY date(transaction_date) ASC, installment_number ASC`,
    [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  );
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
