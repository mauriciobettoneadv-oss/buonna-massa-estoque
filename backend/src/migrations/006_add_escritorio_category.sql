ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN ('Laticínios','Embutidos','Bebidas','Limpeza','Descartáveis','Massas','Molhos','Escritório','Outros'));
