-- En una base nueva V4 se aplica antes que las membresías de demostración (V1000), que quedan activas con
-- `joined_at` vacío: se les da como alta la de su creación (solo perfil dev).
UPDATE memberships SET joined_at = created_at WHERE status = 'active' AND joined_at IS NULL;
