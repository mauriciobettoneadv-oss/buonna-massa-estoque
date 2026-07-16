CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'aberta'
);

CREATE TABLE IF NOT EXISTS quotation_counts (
  quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE,
  stock_count_id INT REFERENCES stock_counts(id),
  PRIMARY KEY (quotation_id, stock_count_id)
);

CREATE TABLE IF NOT EXISTS quotation_suppliers (
  id SERIAL PRIMARY KEY,
  quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS quotation_prices (
  id SERIAL PRIMARY KEY,
  supplier_id INT REFERENCES quotation_suppliers(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_price NUMERIC(10,4) DEFAULT 0,
  UNIQUE(supplier_id, product_id)
);
