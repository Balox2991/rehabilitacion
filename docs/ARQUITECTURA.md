# Arquitectura del sistema

Este documento explica **qué tecnologías usa el proyecto, qué es una API, dónde se conecta cada pieza** y cómo pasa de
funcionar en tu computador a estar publicado en internet y, más adelante, a tener una app de celular. Sirve también
como material de sustentación.

## 1. Qué es una API (y por qué la necesitamos)

**API** (*Application Programming Interface*) es el conjunto de «puertas» con las que un programa le pide cosas a otro.
En este proyecto es una **API HTTP**: el navegador (o, en el futuro, una app de celular) envía una petición por internet
y el servidor responde con datos en formato **JSON**.

Una petición tiene cuatro partes:

| Parte | Ejemplo real de este proyecto |
|---|---|
| **Método** (qué quiero hacer) | `GET` leer · `POST` crear · `PUT` reemplazar · `PATCH` modificar · `DELETE` borrar |
| **Ruta** (sobre qué) | `/patients/5/sessions` |
| **Cuerpo** (los datos que envío) | `{ "exercise_code": "knee_flexion", "reps": [...] }` |
| **Respuesta** (código + JSON) | `201 Created` + la sesión guardada · `404` si no existe · `409` si choca con algo |

**¿Por qué separar el servidor del navegador?** Por tres razones que importan en este proyecto:

1. **Los datos viven en un solo lugar.** El navegador de cada paciente no guarda nada importante: pide y envía a la API.
2. **Las reglas se aplican en el servidor, no en la pantalla.** Cualquiera puede manipular lo que se ve en su navegador;
   nadie puede manipular lo que decide el servidor. Por eso la validación del documento, el estado «al día / sin
   actividad» y (próximamente) los permisos viven en el backend.
3. **Varios clientes usan la misma API.** Hoy es la web; mañana puede ser una app de celular, **sin reescribir las reglas**.
   La API es el contrato entre ambos.

## 2. Mapa de tecnologías

| Capa | Tecnología | Para qué sirve | Dónde está |
|---|---|---|---|
| **Cliente web** | React 19 + Vite 8 | Dibuja las pantallas y reacciona a lo que hace el usuario | `apps/web` |
| Rutas del cliente | react-router-dom 7 | Que `/paciente/5/progreso` sea una pantalla sin recargar la página | `apps/web/src/App.jsx` |
| Gráficas | Recharts 3 | Evolución del movimiento, barras semanales | `apps/web/src/charts` |
| **Visión por computador** | MediaPipe Tasks Vision (PoseLandmarker) | Detecta 33 puntos del cuerpo **en el navegador del paciente** | `apps/tracking-prototype/src/poseTracker.js` |
| Motor de tracking | JavaScript puro | Calcula ángulos, cuenta repeticiones, detecta compensaciones | `apps/tracking-prototype/src` |
| **API (servidor)** | Node 24 + Express 5 | Recibe peticiones, valida, aplica reglas, responde JSON | `apps/backend/src/app.js` |
| **Base de datos** | SQLite (`node:sqlite`) con migraciones | Guarda usuarios, planes, sesiones, notas, fotos, evidencia | `apps/backend/data/telerehab.db` |
| Pruebas | `node --test`, Playwright | Pruebas unitarias, de API y de punta a punta con navegador real | `apps/*/tests` |

**Decisión clave de privacidad:** el video **nunca sale del dispositivo del paciente**. MediaPipe corre en el navegador;
al servidor solo viaja el resultado numérico de cada repetición (grados alcanzados y alertas de postura), no imágenes.

## 3. Diagrama

```
 HOY (desarrollo, un solo computador)

   Navegador ──► Vite :5173 ──(/api)──► Express :3001 ──► SQLite (archivo)
   (React +                (proxy)      (la API)
    MediaPipe)

 PUBLICADO (propuesta)

   Paciente / Fisio                      Internet (HTTPS)
   ┌──────────────┐   estáticos   ┌───────────────────────┐
   │ Navegador    │◄──────────────│ Hosting del front     │  HTML/JS/CSS (React compilado)
   │ React        │               │ (Vercel / Netlify /   │
   │ + MediaPipe  │               │  Cloudflare Pages)    │
   │ (cámara local)│               └───────────────────────┘
   │              │   JSON+HTTPS  ┌───────────────────────┐   SQL   ┌───────────────┐
   │              │◄─────────────►│ API Express (Render / │◄───────►│ PostgreSQL    │
   └──────────────┘   (cookie o   │ Railway / Fly.io)     │         │ gestionado    │
                       token)     └──────────┬────────────┘         └───────────────┘
   ┌──────────────┐                          │ correo (recuperar contraseña)
   │ App celular  │◄─────────────────────────┤──────────► Servicio de correo (Resend / SMTP)
   │ (futuro)     │   la MISMA API           │
   └──────────────┘                          └──────────► Almacenamiento de fotos (futuro)
```

## 4. Recorrido de una petición real: guardar una sesión

1. El paciente termina su ejercicio. `useTracking` (en el navegador) ya tiene la lista de repeticiones medidas.
2. `api.saveSession()` (`apps/web/src/lib/api.js`) hace `POST /api/patients/5/sessions` con el JSON de las repeticiones.
3. En desarrollo, **Vite reenvía** `/api/...` a `http://localhost:3001/...` (así el navegador cree que todo es el mismo
   sitio). Publicado, un *proxy inverso* o el propio dominio cumple ese papel.
4. **Express** recibe la petición (`app.post("/patients/:id/sessions")`), **valida** el cuerpo, normaliza las fechas a UTC
   y **guarda en una transacción** (sesión + repeticiones, todo o nada).
5. Responde `201` con la sesión; la pantalla «Listo» muestra el resultado.
6. Al abrir «Inicio», `GET /patients/5/overview` devuelve el estado **ya calculado por el servidor**
   (`summarizePatient`): la pantalla solo lo dibuja.

## 5. Estado actual y brecha de seguridad (importante)

Hoy la API **no tiene autenticación**: quien conozca la URL puede pedir `/patients/5` y ver los datos o la foto de
cualquier paciente, porque el identificador va en la ruta y el servidor confía en él. Eso es aceptable para una demostración
con datos ficticios y **no lo es** con pacientes reales (datos de salud = datos sensibles, Ley 1581 de 2012).
La Fase 5 cierra esa brecha.

## 6. Diseño propuesto de cuentas reales (Fase 5)

**Roles:** `admin` (primera cuenta, crea fisioterapeutas), `fisio`, `paciente`.
Reglas de acceso, siempre aplicadas **en el servidor**:

| Quién | Qué puede ver y hacer |
|---|---|
| Paciente | Solo **sus** datos, su plan y sus sesiones |
| Fisio | Solo **sus** pacientes: crear, editar, asignar planes, notas, informes |
| Admin | Crear/desactivar fisioterapeutas; no ve clínica de pacientes ajenos salvo que sea también su fisio |

**Cómo se crean las cuentas:** configuración inicial → primera cuenta admin; el fisio **da de alta a su paciente** y el
sistema envía por correo una **invitación de un solo uso** para que el paciente elija su contraseña. Nadie se
autoregistra.

**Contraseñas:** nunca se guardan; se guarda un *hash* con **scrypt** (viene en `node:crypto`, sin dependencias) con *sal*
única por usuario. Mínimo de longitud, y bloqueo temporal tras varios intentos fallidos (*rate limiting*).

**Sesión (cómo el servidor sabe quién eres)** — aquí influye el celular futuro:

| Opción | Web | App de celular | Veredicto |
|---|---|---|---|
| Cookie de sesión `HttpOnly` + `Secure` + `SameSite` | Excelente (JavaScript no puede robarla) | Incómoda | Buena para web sola |
| Token en cabecera `Authorization: Bearer` | Funciona, pero hay que guardarlo con cuidado | Es el estándar | Buena para móvil |
| **Recomendada:** token de sesión **opaco** guardado (con *hash*) en la base de datos; el web lo recibe en cookie `HttpOnly`, el celular en `Bearer` | ✅ | ✅ | Una sola lógica en el servidor, se puede **revocar** al instante (cerrar sesión, perder el celular) |

(No usamos JWT puros porque no se pueden revocar fácilmente y no aportan nada con una sola API.)

**Recuperar contraseña por correo:** el servidor genera un token aleatorio de un solo uso (guarda solo su *hash*), válido
~30 minutos, y lo envía por correo. La respuesta es la misma exista o no el correo (no revela quién tiene cuenta).

**Auditoría:** tabla `audit_log` (quién, qué, cuándo) para accesos y cambios a datos de pacientes
(ver `CONSIDERACIONES-COLOMBIA.md`, 3.1).

**Endurecimiento básico:** HTTPS obligatorio, cabeceras de seguridad (`helmet`), CORS restringido a tu dominio, límite de
tamaño de petición, validación de todas las entradas, y secretos solo en variables de entorno (nunca en el repositorio).

## 7. Publicar: qué cambia

| Tema | Hoy | Publicado |
|---|---|---|
| Base de datos | SQLite en un archivo | **PostgreSQL gestionado**: copias de seguridad automáticas, varias instancias, cifrado en reposo. Se migra el esquema (SQL casi idéntico) |
| Fotos | Dentro de la base de datos | Aceptable al inicio (≤300 KB); luego almacenamiento de objetos |
| Frontend | `vite dev` | `vite build` → archivos estáticos en un CDN |
| API | `npm start` en tu PC | Servicio siempre encendido con HTTPS |
| Secretos | no hay | Variables de entorno del hosting |
| Dominio | `localhost` | Un dominio propio (también lo necesita el correo para no caer en spam) |
| Cámara | Funciona en `localhost` | **Solo funciona con HTTPS** (requisito del navegador) |

**Dónde publicar (opciones razonables, con plan gratuito o muy económico para empezar):**
frontend en **Cloudflare Pages / Vercel / Netlify**; API en **Render / Railway / Fly.io**; base de datos en **Neon /
Supabase / Railway Postgres**; correo con **Resend** (o SMTP del dominio). La **ubicación de los servidores** de datos de
salud y el contrato con el proveedor son temas para revisar con asesoría jurídica antes de operar con pacientes reales.

## 8. App de celular en el futuro

La API es el contrato, así que **la mayor parte del trabajo ya está hecho** (reglas, datos, permisos). Opciones:

1. **PWA (recomendada primero):** la misma web, instalable en el celular desde el navegador, con icono y pantalla
   completa. La cámara y MediaPipe **ya funcionan** porque corren en el navegador. Costo bajo, cero reescritura.
2. **App nativa (React Native / Flutter):** más «de tienda», pero hay que **reimplementar la detección de pose con el SDK
   móvil de MediaPipe** (el motor de ángulos y repeticiones, en JS puro, se puede reutilizar o portar). Es un proyecto
   en sí mismo.

Por eso las decisiones de hoy (cabecera `Bearer`, sesiones revocables, la API sin dependencia de la web) se toman para
no cerrar esa puerta.

## 9. Herramientas de desarrollo en Visual Studio

El proyecto es JavaScript/Node: la herramienta natural es **Visual Studio Code** (gratis; extensiones ESLint, Prettier,
REST Client). Con **Visual Studio 2022** también se puede abrir la carpeta (carga de Node.js necesaria), pero está
pensado para .NET/C++. En cualquiera: abrir la carpeta `telerehab-ia`, y en la terminal integrada `npm run dev` en
`apps/backend` y `apps/web`.

## 10. Plan por pasos (cada uno se prueba y documenta antes de seguir)

1. **Quitar el modo demostración:** sin datos de ejemplo, sin `/entrar`, sin avatares ficticios; base vacía con pantalla de
   configuración inicial.
2. **Cuentas y sesiones:** tablas `credentials`/`sessions`, hash con scrypt, rate limiting, roles, login/logout.
3. **Control de acceso en toda la API:** cada ruta comprueba rol y pertenencia (el fisio solo ve a los suyos).
4. **Alta de pacientes por el fisio + invitación y recuperación por correo** (con un envío «de consola» en desarrollo y
   Resend en producción).
5. **Auditoría y endurecimiento** (helmet, CORS, límites).
6. **Rediseño estético y de UX** (lo que definas).
7. **Publicación:** PostgreSQL, variables de entorno, HTTPS, dominio, copias de seguridad.
8. **PWA** (instalable en el celular).

## 11. Decisiones que siguen abiertas

- Lista concreta de **cambios estéticos y de UX** que quieres.
- **Presupuesto y proveedor** de hosting; si ya tienes (o piensas comprar) un **dominio**.
- **Servicio de correo** (Resend requiere dominio verificado).
- Si la clínica Ocaña es una **clínica real** o el proyecto sigue siendo académico: define qué tan estricta debe ser la
  parte legal (política de datos, habilitación de telemedicina, registro de bases de datos).

## 12. ¿Y si el paciente sube un video en vez de usar la cámara en vivo? (análisis y recomendación)

**Propuesta del autor:** el paciente ve un video explicativo, hace el ejercicio, **sube un video**, el modelo lo analiza y el fisioterapeuta recibe estadísticas y sugerencias de mejora.

| | Cámara en vivo (hoy) | Subir un video para analizarlo después |
|---|---|---|
| **Precisión** | Limitada: solo ve el pasado (filtros con retraso) y decide al instante | **Mayor**: analiza toda la grabación (filtrado sin retraso, picos con ventana completa, varias pasadas, modelo más pesado) |
| **Retroalimentación al paciente** | Inmediata (conteo, aviso de postura) | Tardía: se entera después de si lo hizo bien |
| **Privacidad** | El video **nunca sale** del dispositivo | El video viaja y se guarda: dato **sensible** (Ley 1581): consentimiento específico, almacenamiento cifrado, retención, acceso auditado |
| **Costo / infraestructura** | Cero en servidor | Almacenamiento de video, ancho de banda y cómputo del análisis; no cabe en un hosting compartido |
| **Calidad de la toma** | Se corrige en el momento («no te veo bien») | Un video mal grabado se descubre tarde y se pierde la sesión |
| **Datos para entrenar un modelo propio** | Solo números | Videos reales etiquetados (valioso para la idea de un modelo propio) |

**Recomendación: un camino híbrido, sin mover el video a un servidor al principio.**

1. **Mantener la guía en vivo**, pero como *apoyo* (conteo, «no te veo», «ve más despacio»), no como fuente de verdad.
2. **El dato oficial sale de un análisis posterior de la grabación, hecho en el propio navegador** (`MediaRecorder` + MediaPipe sobre el archivo, sin latencia, con el modelo `full`/`heavy` y filtrado de dos pasadas). Mismo beneficio de precisión que subir el video, **sin enviar imágenes**. El paciente también podría **cargar un video ya grabado** desde su celular.
3. **Al servidor solo viajan números y el «esqueleto»:** ángulos por repetición y la traza de puntos del cuerpo (33 puntos por frame, unos KB). El fisioterapeuta ve la repetición como un **muñeco animado** con el ángulo dibujado, sin ver a la persona.
4. **Subir el video real queda como opción con consentimiento explícito** (para que el fisio revise la técnica o para construir un conjunto de datos), y se construye cuando existan almacenamiento, cifrado y política de retención.
5. **Estadísticas y «mejoras» para el fisio (reglas explicables, no cajas negras):** ROM por repetición, tendencia dentro de la sesión (caída por fatiga), tempo de subida/bajada y sostén, regularidad, comparación con el otro lado, línea de tiempo de compensaciones y repeticiones marcadas para revisar. Sugerencias del tipo «el movimiento bajó 18 % en las últimas 3 repeticiones» o «subes en menos de 1 s: conviene ir más lento». Cuando haya datos etiquetados por fisioterapeutas, un **modelo propio (CNN/secuencial) puede clasificar la calidad de cada repetición sobre la traza de puntos**; no reemplaza a MediaPipe en la detección del cuerpo.

**Por qué no «solo video, sin cámara en vivo»:** se pierde la corrección inmediata, que es lo que más ayuda a un paciente solo en casa, y se cambia un riesgo de precisión (que se puede medir y mejorar) por un riesgo legal y de costos (mucho más difícil de revertir).

**Mejora de precisión pendiente en cualquiera de las dos opciones:** medir el ángulo en 3D con `worldLandmarks` de MediaPipe (menos sensible a cuánto gira el cuerpo respecto de la cámara). Se prueba con el registro técnico descrito en `FASE-1-TRACKING.md`.

### 12.1 Estado de la implementación (octubre de 2026)

Construido (camino híbrido): guía en vivo como apoyo; **dato oficial desde el análisis posterior**; registro con esqueleto (sin video) guardado en el servidor, que lo analiza y puede **rehacer el análisis**; estadísticas y observaciones para el paciente y el fisioterapeuta; replay del movimiento como muñeco; y **análisis de un video grabado en el navegador** (el archivo no se sube). Detalle en `FASE-1-TRACKING.md`, `FASE-2-BACKEND.md` (sección 12) y `FASE-3-WEB.md` (sección 11).

Pendiente: subir el video real (opción con consentimiento explícito), tendencias entre sesiones y comparación de lados, medición en 3D con `worldLandmarks`, **verificación con un cuerpo real** (registros con `?debug=1`) y, sobre esos registros, el modelo propio de calidad de repetición.


## 13. Cada ejercicio es distinto: cómo medirlos todos sin reescribir el sistema (análisis y recomendación)

**La pregunta:** el modelo de visión no sabe de ejercicios, entonces ¿cómo se registra cada uno si cada uno se mueve distinto?

### 13.1 Qué es genérico y qué es propio de cada ejercicio

| Etapa | ¿Depende del ejercicio? |
|---|---|
| Detección del cuerpo (MediaPipe: 33 puntos, incluidos manos y pies) | **No.** Es la misma para todos |
| **Extracción de la señal:** «qué número saco de esos puntos en cada cuadro» | **Sí. Es lo único que cambia** |
| Filtrado, detección de repeticiones, tempo, fatiga, observaciones, guardado, replay | **No.** Trabajan sobre una señal de un solo número en el tiempo |

Hoy la extracción está escrita a mano para **tres** ejercicios (`EXERCISES` en `angleMath.js` y tres filas en la base): flexión de rodilla, de codo y de hombro. De los 11 ejercicios de la biblioteca, **8 no se pueden medir con cámara ni prescribir con seguimiento**, y un fisioterapeuta no puede agregar uno.

**Prueba (simulación, esqueleto sintético con ruido y picos):** una *elevación de pierna recta* (8 repeticiones reales, la rodilla nunca se dobla) con el motor actual de «flexión de rodilla» cuenta **0 repeticiones**: se mide la articulación equivocada. No es un fallo del conteo, es que **al ejercicio le falta su propia definición de qué medir**.

### 13.2 Recomendación: ejercicios definidos por una *especificación* (datos, no código) y tres niveles

Cada ejercicio pasa a ser una especificación guardada en la base. El motor la lee y arma la señal; todo lo demás se reutiliza.

```
{ code, measure: { type, points, reference }, unit, direction, rest, target,
  view: "perfil" | "frente", posture, visibility: [puntos que deben verse],
  hold, compensations: [...] }
```

Tipos de medición:
1. **Ángulo de articulación** (3 puntos): rodilla, codo, tobillo (rodilla–tobillo–punta del pie), muñeca (codo–muñeca–índice).
2. **Ángulo de segmento contra un eje** (2 puntos y vertical / horizontal / tronco): elevación de pierna recta (muslo contra la horizontal), elevación del brazo (brazo contra el tronco: más robusto que cadera–hombro–codo).
3. **Trayectoria / desplazamiento** normalizado por el tamaño del cuerpo: péndulo de hombro (amplitud y número de oscilaciones, sin grados clínicos).
4. **Sin medición posible** → **sesión guiada**: video de ejemplo, temporizador y conteo de sostén, y el paciente reporta esfuerzo o dolor (0–10) y repeticiones. Genera datos de adherencia, que es lo que el fisioterapeuta puede usar.

| Ejercicio de la biblioteca | Nivel recomendado | Por qué |
|---|---|---|
| Flexión de rodilla, de codo, elevación frontal del brazo | **Ángulo medido** (hoy) | Hay estudios de validación con una cámara para rodilla y hombro (sección «Evidencia») |
| Elevación de pierna recta | **Ángulo de segmento** (perfil, acostado) | La rodilla no se dobla; se mide el muslo |
| Bombeo de tobillo, flexión de muñeca | **Medición con reservas** («experimental») | Segmentos pequeños: el modelo de cuerpo ubica mal manos y pies; sin evidencia citada |
| Péndulo de Codman | **Trayectoria** | Importa cuánto y cuántas veces oscila, no un ángulo |
| Contracción de cuádriceps, agarre, retracción de omóplatos | **Guiado** | Isométricos o con el omóplato, que no es un punto del modelo |
| Rotación del antebrazo | **Guiado** (a futuro, modelo de manos) | La rotación sobre el eje del antebrazo no se ve con los puntos del cuerpo |

### 13.3 Enseñar un ejercicio con una demostración

Para no escribir especificaciones a mano: el fisioterapeuta se graba haciendo **3–5 repeticiones correctas**, el sistema prueba **todas las mediciones candidatas** (ángulos de 3 puntos y de segmentos) y las ordena por cuántas repeticiones periódicas y cuánto recorrido detectan; propone la mejor y el fisioterapeuta la confirma o la cambia.

**Prueba (simulación):** con la elevación de pierna recta, de 28 candidatas solo 12 detectan algún movimiento; las primeras cinco son exactamente el muslo, la pierna y la cadera, con 45° de recorrido (el real), y las descartadas incluyen el ángulo de la rodilla (constante). En 30 semillas con ruido distintas, **la medición correcta quedó primera 30 de 30 veces**. Un señuelo (un ángulo con picos de ruido) llegó a aparecer con 2 repeticiones: por eso se exige un mínimo de repeticiones y regularidad antes de proponer. Es una simulación con un esqueleto ideal: indica que es factible, **no valida** el método con personas reales.

### 13.4 Dónde entra un modelo propio (CNN / secuencial)

- **La medición debe seguir siendo analítica** (ángulos): es explicable, se compara con un goniómetro y se defiende en la sustentación. Un modelo que prediga grados directamente necesitaría cientos de sesiones con ángulo de referencia medido con goniómetro.
- **El aprendizaje sí sirve para clasificar sobre las trazas guardadas:** reconocer qué ejercicio se está haciendo, y juzgar si una repetición fue buena o mala (etiquetada por fisioterapeutas). Cada sesión guardada y cada demostración van construyendo ese conjunto de datos.

### 13.5 Plan por fases

1. **Especificación declarativa** de ejercicios (tipos 1 y 2, unidades, vista y postura exigidas, verificación de que la persona está de perfil o de frente), migración de la base, y los ejercicios de ángulo de segmento. Pruebas con esqueletos sintéticos por cada tipo de medición.
2. **Sesiones guiadas** (nivel 4): temporizador, sostén, esfuerzo/dolor 0–10 y adherencia visible para el fisioterapeuta.
3. **Enseñar con una demostración** (13.3) y trayectorias.
4. **Validación contra goniómetro** con voluntarios: es el experimento que convierte el proyecto en una contribución defendible, y los datos alimentan el modelo propio.

### 13.6 Estado de la fase 1 (octubre de 2026)

Hecho: especificación declarativa de ejercicios (tipos `joint_angle` y `segment_angle`), catálogo de la base sembrado desde ella (migración 5), verificación de perfil/frente, elevación de pierna recta, y depuración de la biblioteca (lo no utilizable quedó archivado con su fase de regreso). Siguen: fase 2 (sesiones guiadas), fase 3 (enseñar con una demostración y trayectorias) y fase 4 (validación con goniómetro).

## 14. Asistente de recuperación: recomendaciones a partir del video y la evidencia

**Pedido:** que la IA dé una recomendación o sugerencia al paciente según su video o evidencia.

**Qué es y qué no es.** Es un sistema de **reglas explicables** que combina tres fuentes: (1) el **análisis del video** de la sesión (cansancio, ritmo, sostén, postura, visibilidad), (2) el **historial** del paciente (tendencia, estancamiento, retroceso, adherencia) y (3) su **plan** y etapa. **No es un modelo generativo**: es determinista, está probado y se puede auditar. Para un sistema de salud, un texto inventado por un modelo de lenguaje es un riesgo (puede afirmar algo clínico que nadie validó) y exigiría enviar datos de salud a un tercero (Ley 1581). Si en el futuro se usa un modelo de lenguaje, solo debería **redactar** con otras palabras una recomendación que el motor ya decidió, sin datos identificables y con consentimiento.

**Qué lo distingue de una lista de consejos:**
1. **Explicable:** cada recomendación lleva su «¿por qué?» con los números de ese paciente.
2. **Honesto con el margen de error:** la cámara mide con un error de unos 3 a 5° (Russo 2026, voluntarios sanos), así que **no celebra ni alarma por cambios menores a 4°** (umbral `noiseFloorDeg`).
3. **Humano en el circuito:** al paciente le da orientación y le dice cuándo avisar; al fisioterapeuta le **propone** ajustes (meta, repeticiones) con su justificación y solo se aplican si él pulsa «Aplicar», lo que deja una nota clínica con el motivo. En etapa de protección no propone mover la meta.
4. **Con respaldo, sin exagerar:** solo cita estudios verificados donde dicen algo del tema (adherencia: Jack 2010; precisión y distancia a la cámara: Barzegar 2024; error de la medición: Russo 2026; metas individuales: Soucie 2011) y siempre muestra **lo que el estudio no demuestra**.
5. **No inventa indicación clínica:** no sugiere cargas, rangos ni plazos que el equipo tratante no haya definido.

**Reglas (todas con umbrales visibles en `COACH`, orientativos y discutibles):** nuevo mejor movimiento, mejora sostenida (tendencia robusta de Theil–Sen, no un día excepcional), «ya casi llegas», ritmo rápido, sostén corto, cansancio, postura, cámara mal colocada; y para avisar al fisioterapeuta: estancamiento (4 sesiones dentro del margen de error), retroceso (más de 8° por debajo de lo habitual), baja adherencia (menos de la mitad de las sesiones del plan en 2 semanas, solo si el plan tiene 14 días o más) y fatiga, postura o ritmo **repetidos** (en al menos 2 de las últimas 3 sesiones).

Siguientes ideas: un **modo ritmo** en vivo (guía sonora/visual de subida y bajada cuando el análisis detecta movimientos rápidos), y recomendaciones aprendidas con los datos que dejen las validaciones de la fase 4.
