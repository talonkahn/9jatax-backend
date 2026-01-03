-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- companies
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  tin TEXT,
  vat_registered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);

-- chart_of_accounts (simple)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  code TEXT,
  name TEXT,
  account_type TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- transactions (double-entry simplified: store entries as pairs)
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,
  debit_account_id INTEGER REFERENCES chart_of_accounts(id),
  credit_account_id INTEGER REFERENCES chart_of_accounts(id),
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

-- customers (for invoices)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  tin TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- invoices
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  customer_id INTEGER REFERENCES customers(id),
  invoice_number TEXT,
  date DATE DEFAULT CURRENT_DATE,
  total NUMERIC(14,2),
  vat_total NUMERIC(14,2),
  status TEXT DEFAULT 'draft',
  payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);