-- WhatsApp no cadastro de usuário
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);

-- Novos status para contagem (aberta → salva → finalizada)
ALTER TABLE stock_counts DROP CONSTRAINT IF EXISTS stock_counts_status_check;
ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_status_check
  CHECK (status IN ('aberta', 'salva', 'finalizada'));

ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS saved_by INTEGER REFERENCES users(id);
ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS saved_at TIMESTAMP;

-- Configurações de notificações
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  schedule_days INTEGER[] NOT NULL DEFAULT '{0}',
  main_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  reminder_time VARCHAR(5) NOT NULL DEFAULT '22:00',
  main_message TEXT NOT NULL DEFAULT 'Realizar contagem de estoque.',
  reminder_message TEXT NOT NULL DEFAULT 'A contagem ainda não foi feita.',
  evolution_url VARCHAR(255),
  evolution_key VARCHAR(255),
  evolution_instance VARCHAR(100),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Histórico de notificações
CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  recipient_name VARCHAR(120),
  recipient_whatsapp VARCHAR(20),
  message_type VARCHAR(50) NOT NULL,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'enviado',
  error_detail TEXT,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Configuração padrão inicial
INSERT INTO notification_settings (schedule_days, main_time, reminder_time, main_message, reminder_message)
SELECT '{0}', '18:00', '22:00', 'Realizar contagem de estoque.', 'A contagem ainda não foi feita.'
WHERE NOT EXISTS (SELECT 1 FROM notification_settings);
