-- Campos de caixa nos produtos
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS box_qty          NUMERIC,       -- qtd de unidades na caixa
  ADD COLUMN IF NOT EXISTS box_unit_weight  NUMERIC,       -- peso/volume por unidade dentro da caixa
  ADD COLUMN IF NOT EXISTS price_unit       TEXT;          -- unidade de preço: 'Kilo', 'Bisnaga', 'Lata', etc.

-- Cidades de entrega nos fornecedores
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS delivery_cities  TEXT[] DEFAULT '{}';

-- Observação e marca alternativa por produto no formulário do fornecedor
ALTER TABLE quotation_prices
  ADD COLUMN IF NOT EXISTS notes           TEXT,
  ADD COLUMN IF NOT EXISTS alt_brand       TEXT;
