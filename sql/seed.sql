INSERT INTO plans (name, max_obras, max_residentes, price, description)
VALUES
('Básico', 1, 1, 499.00, 'Plan básico: 1 obra, 1 residente'),
('Profesional', 5, 5, 1999.00, 'Plan profesional: 5 obras, 5 residentes'),
('Empresarial', -1, -1, 4999.00, 'Plan empresarial: Obras y residentes ilimitados')
ON CONFLICT (name) DO NOTHING;