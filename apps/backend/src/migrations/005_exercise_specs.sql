-- Los ejercicios medidos con cámara pasan a ser DATOS: cada uno guarda su especificación (qué puntos del cuerpo y qué
-- ángulo medir, de perfil o de frente, postura…). Las columnas joint / rest_angle / default_target_angle / direction se
-- conservan porque ya las usan las consultas; se llenan a partir de la especificación al arrancar (ver db.js).
ALTER TABLE exercises ADD COLUMN spec TEXT;
