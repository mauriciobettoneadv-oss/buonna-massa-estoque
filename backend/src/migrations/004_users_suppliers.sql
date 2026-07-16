-- Expand role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('dono', 'gerente', 'contador', 'proprietario'));

-- Add unit and active to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id INT REFERENCES units(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Suppliers catalog
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  categories TEXT[] DEFAULT '{}',
  phone VARCHAR(50),
  email VARCHAR(200),
  min_order NUMERIC(10,2) DEFAULT 0,
  delivery_days TEXT[] DEFAULT '{}',
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Supplier product prices
CREATE TABLE IF NOT EXISTS supplier_product_prices (
  id SERIAL PRIMARY KEY,
  supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  unit_price NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(supplier_id, product_id)
);
