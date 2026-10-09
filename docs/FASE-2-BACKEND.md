# Fase 2 — Backend y base de datos

**Alcance:** persistir lo que hoy solo vive en la memoria del navegador (Fase 1):
pacientes, fisioterapeutas, planes de ejercicio, sesiones y el historial de ROM
repetición por repetición. Código en `apps/backend/`.

Fuera de alcance de esta fase (a propósito): login y roles con permisos (Fase 5),
interfaz (Fases 3 y 4) y el modelo de visión (se replantea aparte, ver
"Relación con el modelo de tracking").

## 1. Decisiones técnicas

| Decisión | Por qué |
|---|---|
| **Node.js + Express** | El motor de tracking ya es JavaScript; un solo lenguaje en todo el sistema y en el futuro se puede compartir código (validaciones, definiciones de ejercicios) entre cliente y servidor. |
| **SQLite (`node:sqlite`, incluido en Node ≥ 22.5)** | Cero instalación y cero servicios externos: la base es un archivo. Es relacional, con llaves foráneas y transacciones, que es lo que este dominio necesita (paciente → plan → sesión → repetición). El esquema es SQL estándar, así que migrar a PostgreSQL para producción es cambiar el driver, no rediseñar. |
| **Una sola tabla `users` con rol** | La Fase 5 (autenticación por rol) solo agrega `password_hash` y sesiones sobre esta misma tabla. El perfil clínico va aparte (`patient_profiles`) para no mezclar datos de cuenta con datos de salud. |
| **El servidor calcula los agregados de la sesión** | `reps_completed`, `best_rom` y `compensation_count` se derivan de las repeticiones enviadas; el cliente no los dicta. Así el historial clínico no depende de que el navegador sea honesto ni de que no tenga bugs. |
| **Sesión guardada en una transacción** | Si una repetición es inválida no queda una sesión a medias en la base. Hay una prueba que lo verifica. |
| **Sin video en el servidor** | Solo se guardan ángulos y banderas de compensación. Consistente con la decisión de la Fase 1 de procesar el video en el navegador del paciente. |

## 2. Modelo de datos

```
users ─┬─< patient_profiles (1:1 con pacientes; therapist_id → users)
       │
       ├─< exercise_plans >─ exercises      (plan prescrito: ejercicio, lado, ROM objetivo, series, reps, frecuencia)
       │
       └─< sessions >─ exercises            (una ejecución con cámara; plan_id opcional)
              │
              └─< rep_records               (ROM logrado y banderas de compensación por repetición)
```

Detalle en `apps/backend/src/schema.sql`. Puntos a mencionar en la sustentación:

- `exercises` replica las definiciones de `angleMath.js` (ángulo de reposo, objetivo por defecto y `direction`).
- `best_rom` respeta la dirección del ejercicio: el **mínimo** ángulo para flexión de rodilla/codo (el ángulo baja al flexionar) y el **máximo** para hombro.
- Los `CHECK` de la base rechazan datos imposibles (lado distinto de left/right, series ≤ 0, etc.) aunque la API falle.

## 3. API

| Método y ruta | Qué hace |
|---|---|
| `GET /exercises` | Catálogo de ejercicios |
| `GET /therapists` | Lista de fisioterapeutas (solo para el modo demostración; sin login todavía) |
| `POST /users` | Crea fisioterapeuta o paciente (con `therapist_id`, `fracture_site`, `injury_date`, `notes`) |
| `GET /therapists/:id/patients` | Pacientes de un fisioterapeuta |
| `GET /patients/:id` · `PATCH /patients/:id` | Ficha del paciente / actualizar perfil |
| `POST /patients/:id/plans` · `GET /patients/:id/plans?active=1` | Prescribir y listar planes |
| `PATCH /plans/:id` | Ajustar ROM objetivo, series, repeticiones, frecuencia o desactivar |
| `POST /patients/:id/sessions` | Guardar una sesión terminada con sus repeticiones |
| `GET /patients/:id/sessions` · `GET /sessions/:id` | Historial de sesiones / detalle con repeticiones |
| `GET /patients/:id/rom-history?exercise=knee_flexion` | Serie temporal de ROM (ángulo crudo) |
| `GET /patients/:id/overview?tz=-300` | Vista del paciente: plan, progreso, racha, últimos 7 días, sesiones recientes |
| `GET /therapists/:id/summary?tz=-300` | Panel del fisioterapeuta: KPIs, estado y alertas por paciente, serie semanal, compensaciones |

`tz` = minutos al este de UTC (Colombia: -300). Los "días" (racha, hoy, última sesión) se cuentan en la zona
del usuario; las marcas de tiempo se guardan en UTC.

Todos los errores devuelven `{ "error": "mensaje" }` con el código HTTP adecuado
(400 validación, 404 no existe, 409 conflicto: email repetido o plan activo duplicado).

## 4. Estadísticas y reglas de negocio (`src/analytics.js`)

Toda la lógica que decide qué ve cada rol vive en el servidor, para que paciente y fisioterapeuta lean los mismos números.

- **Flexión** (grados de movimiento con 0 en reposo, como en goniometría clínica) = `180 − ángulo` para rodilla y codo, y `ángulo` para hombro. El motor mide el ángulo interno de la articulación; las gráficas usan flexión para que "más alto = más recuperado".
- **Progreso** = porcentaje del camino entre el reposo y la meta del plan, acotado a 0–100, calculado con la mejor repetición de la última sesión.
- **Adherencia semanal** = sesiones hechas en 7 días frente a las prescritas (`times_per_week`), sin pasar de lo prescrito por plan.
- **Estados** (en este orden de prioridad): `sin_plan` → `sin_actividad` (5 o más días sin sesión) → `compensaciones` (30 % o más de repeticiones con alerta en 30 días) → `en_meta` (progreso 100 %) → `al_dia`. El panel muestra primero a quien necesita atención.
- Los umbrales de alerta (días sin sesión, % de repeticiones con alerta de postura) son **valores de ejemplo, no criterio clínico**, y son **configurables por fisioterapeuta** (`therapist_settings`, `GET/PUT /therapists/:id/settings`).
- `summarizePatient()` es la **única fuente** de la lógica de estados: la usan el panel y la ficha del paciente, y una prueba comprueba que ambos devuelven exactamente lo mismo.
- El reloj es inyectable (`createApp(db, { now })`), así las pruebas no dependen de la fecha.

## 5. Pruebas

54 pruebas (`npm test` en `apps/backend`) contra la API real con base en memoria:
flujo completo fisioterapeuta → paciente → plan → sesión → historial; validaciones; cálculo de `best_rom` en ambas
direcciones; rollback transaccional; aislamiento entre pacientes; JSON malformado; y las estadísticas con reloj fijo
(progreso, racha, adherencia, cada estado, desglose de compensaciones, serie semanal, zona horaria).

## 6. Datos de demostración

`npm run seed` (o `npm run seed -- --reset`) crea 1 fisioterapeuta, 6 pacientes y unas 126 sesiones **ficticias** a través
de la propia API, con un generador pseudoaleatorio determinista y fechas relativas a hoy. Cubre los cuatro estados.
Nada de esto son datos de pacientes reales.

## 7. Limitaciones conocidas

- **Sin autenticación ni autorización:** cualquiera que llegue a la API puede leer o escribir datos de cualquier paciente. Es intencional para esta fase y **no debe exponerse a internet así**; se resuelve en la Fase 5.
- **SQLite es de un solo escritor:** suficiente para desarrollo y una demo; para muchos usuarios simultáneos se migra a PostgreSQL.
- **Sin migraciones versionadas:** el esquema se crea con `CREATE TABLE IF NOT EXISTS`; si cambia una tabla existente hay que borrar la base de desarrollo o escribir la migración a mano. Conviene agregar una herramienta de migraciones antes de la Fase 4.
- **Sin paginación** en los listados de sesiones; las estadísticas leen el historial completo (aceptable a esta escala, a optimizar con muchos pacientes).
- **La foto del paciente es un dato personal sensible:** hoy se sirve sin autenticación (como el resto de la API). Antes de usarla con pacientes reales, requiere la autenticación de la Fase 5.
- **`created_by` lo declara el cliente:** hasta que exista autenticación, el servidor no puede saber quién es realmente quien prescribe un plan.
- **Las pruebas comparten estado y dependen del orden** (usan el mismo fisioterapeuta y paciente en varias). Aceptable ahora; conviene aislarlas antes de que crezca la suite.

## 8. Relación con el modelo de tracking

El backend solo espera, por repetición, `rom_achieved` y una lista de banderas de
texto. Es independiente de cómo se obtengan: sirve igual con las reglas actuales
de la Fase 1 que con un modelo convolucional entrenado más adelante. Cambiar el
modelo no requiere tocar la base de datos ni la API.

## 9. Cómo correrlo

```bash
cd apps/backend
npm install
npm test          # 54 pruebas
npm run seed      # datos de demostración
npm start         # http://localhost:3001  (BD en apps/backend/data/telerehab.db)
```

Variables opcionales: `PORT`, `DB_FILE`.

## 10. Errores corregidos en la revisión

1. Un plan inexistente respondía 400 en vez de 404.
2. Las fechas de sesión se guardaban sin normalizar; con husos horarios distintos, el historial de ROM podía salir en orden incorrecto. Ahora todo se guarda en UTC.
3. `injury_date` aceptaba cualquier texto (incluso fechas imposibles como 2026-02-31).
4. Se podían crear dos planes activos del mismo ejercicio y lado para un mismo paciente.
5. Los días (racha, "hoy", última sesión) se contaban en UTC: para alguien en Colombia, de noche el panel mostraba ya el día siguiente. Detectado al revisar una captura del panel a las 22:37. Ahora el cliente envía su zona horaria (`tz`).

## 11. Ficha del paciente, foto, consentimiento y umbrales (migración 3)

Detalle y justificación de cada campo en `docs/CONSIDERACIONES-COLOMBIA.md`.

| Método y ruta | Qué hace |
|---|---|
| `PATCH /patients/:id` | Ahora acepta la ficha completa: documento (tipo + número validados **como par**), fecha de nacimiento, celular, ciudad, EPS, contacto de emergencia, diagnóstico CIE-10, fecha de cirugía, lado dominante y ocupación. Vacío = borrar el dato. |
| `PUT /patients/:id/consent` | Registra o revoca la autorización de tratamiento de datos (Ley 1581): guarda fecha y quién la registró. |
| `PUT /patients/:id/photo` · `GET` · `DELETE` | Foto en **JPEG**, máximo 300 KB. Se valida la firma real del archivo (`FF D8 FF`), no solo el `Content-Type`. Vive en su propia tabla para que los listados no la arrastren. |
| `GET/PUT /therapists/:id/settings` | Umbrales de alerta por fisioterapeuta (validados: 1–60 días, 5–100 %). |

Decisiones y por qué:

- **Validación en un módulo puro** (`profile.js` + `validators.js`): recibe lo que llegó y devuelve **solo las columnas a guardar**, ya normalizadas, o el primer error. Los nombres de columna salen de una lista fija: aunque el cliente mande `"notes; DROP TABLE users"`, se ignora (hay una prueba).
- **El documento se valida como par** (el largo válido depende del tipo) y es **único** por tipo + número (índice parcial); un duplicado responde 409 sin dejar el usuario a medias (transacción).
- **Todo lo que llega del cliente y puede faltar se trata como «no existe», no como error 500**: una prueba encontró que un `recorded_by` ausente hacía lanzar a la base de datos.
- **Migración 3 sobre una base con datos**: `ALTER TABLE ... ADD COLUMN` (sin perder nada) y tablas nuevas; la prueba de «base antigua» sigue verificando la ruta de actualización completa.

Errores encontrados al probar (corregidos): un id ausente en `recorded_by` / `author_id` provocaba un 500; y una prueba mía contaba mal las repeticiones de 30 días (1 de 4 es 25 %, no 50 %).

## 12. Análisis de cada sesión (migración 4)

| Método y ruta | Qué hace |
|---|---|
| `POST /patients/:id/sessions` | Ahora acepta `trace` (opcional). Si llega, el **servidor** lo valida, lo **analiza** y guarda registro + resumen en `session_analysis`. Solo esta ruta admite cuerpos de hasta 3 MB; el resto sigue en 100 KB |
| `GET /sessions/:id` | Incluye `has_trace` y `analysis` (repeticiones con su tempo, resumen y observaciones; sin el registro, que pesa) |
| `GET /sessions/:id/trace` | El registro completo, para reproducir el movimiento como un muñeco |
| `POST /sessions/:id/analysis` | **Rehace el análisis** con la versión actual del motor a partir del registro guardado |

Decisiones y por qué:

- **Una sola fuente de verdad:** con registro, las repeticiones guardadas son las del análisis del servidor, no las que declare el cliente (así las repeticiones y el análisis nunca se contradicen, aunque el navegador tenga otra versión del motor). Se descubrió probando: un servidor sin reiniciar tenía el motor viejo y guardaba 9 repeticiones donde el navegador veía 10. Excepción deliberada: si el análisis no encuentra ninguna repetición pero el cliente sí contó, se respeta lo del cliente; **nunca se pierde la sesión de un paciente por un fallo del análisis**.
- **El análisis usa los datos de la base** (ejercicio, lado, meta, dirección), no los que afirme el registro.
- **Validación estricta del registro** (`trace.js`, pura): tipos, rangos, tiempos enteros y crecientes, tamaños máximos, puntos del esqueleto de una lista fija y arreglos del mismo largo. Un registro inválido responde 400 y **no deja la sesión a medias** (transacción).
- **El servidor comparte el motor con el navegador** (`src/engine.js` reexporta `apps/tracking-prototype/src`): el análisis que ve el paciente al terminar es el mismo que el servidor guarda.
- **Qué contiene el registro:** tiempos, ángulos, visibilidad, alertas y 12 puntos del cuerpo. **No hay video ni imágenes.** Aun así es un dato personal de salud: ver `CONSIDERACIONES-COLOMBIA.md`, sección 3.4.

Pruebas: 75 del backend (antes 54): validación del registro, guardado y análisis en el servidor, datos de la base por encima de los del cliente, límite de 3 MB solo para sesiones, rehacer análisis, sesión sin registro como antes y borrado en cascada.

## 13. Ejercicios como datos y asistente de recuperación (migración 5)

- **Catálogo de ejercicios desde las especificaciones:** `exercises.spec` guarda la especificación (JSON). En cada arranque el catálogo se **actualiza desde `exerciseSpecs.js`** (una sola fuente: no hay dos listas que se desincronicen); las filas conservan su `id`, así los planes y sesiones existentes no se rompen. Los planes del paciente (`/patients/:id/overview`) y `GET /exercises` incluyen `spec`, y la pantalla arma el ejercicio a partir de ella.
- **Contenido archivado:** `seedContent` ahora también **retira de la base lo que ya no está en el código** (ejercicios y rutinas archivados en `content/pending.js`), con sus evidencias y las asignaciones de esas rutinas a pacientes, sin tocar a los pacientes ni sus sesiones. Prueba con una base «de antes».
- **`GET /patients/:id/coach[?session=ID]`:** por cada plan activo, las recomendaciones para el paciente y las propuestas para el fisioterapeuta, con los estudios citados completos (incluido lo que NO demuestran). `?session=` fija cuál es «la sesión de hoy». Aplicar una propuesta usa el `PATCH /plans/:id` que ya existía: el asistente **no escribe nada por su cuenta**.
- **`coaching.js`** solo lee la base (historial de cada plan: mejor movimiento, repeticiones, alertas y, si la sesión tiene análisis, cansancio, ritmo y visibilidad) y se lo entrega al motor puro.

Error encontrado al probar: el motor hablaba de `plan_id` y la fila de la base de `id`, así que la propuesta salía **sin el id del plan** (no se podía aplicar). Lo detectó la prueba que compara la propuesta con el `PATCH`.

Pruebas del backend: 89 (antes 75).
