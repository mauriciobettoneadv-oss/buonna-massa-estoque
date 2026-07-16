ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(30);
UPDATE products SET purchase_unit = unit_measure WHERE purchase_unit IS NULL;
ALTER TABLE products ALTER COLUMN purchase_unit SET NOT NULL;
