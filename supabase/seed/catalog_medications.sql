-- Catálogo geral OPCIONAL de medicamentos (owner_id nulo).
-- Serve apenas para padronizar nomes e classes nos registros; NÃO é recomendação e não traz doses.
-- A lista e as classes devem ser revisadas pelo responsável médico da CENDOR antes do uso.
insert into public.medications (owner_id, trade_name, active_ingredient, category) values
  (null, 'Dipirona', 'dipirona', 'analgesic'),
  (null, 'Paracetamol', 'paracetamol', 'analgesic'),
  (null, 'Ibuprofeno', 'ibuprofeno', 'nsaid'),
  (null, 'Naproxeno', 'naproxeno', 'nsaid'),
  (null, 'Cetoprofeno', 'cetoprofeno', 'nsaid'),
  (null, 'Sumatriptana', 'sumatriptana', 'triptan'),
  (null, 'Rizatriptana', 'rizatriptana', 'triptan'),
  (null, 'Naratriptana', 'naratriptana', 'triptan'),
  (null, 'Zolmitriptana', 'zolmitriptana', 'triptan'),
  (null, 'Metoclopramida', 'metoclopramida', 'antiemetic'),
  (null, 'Ondansetrona', 'ondansetrona', 'antiemetic');
