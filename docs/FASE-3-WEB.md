# Fases 3 y 4 (primera entrega) — Aplicación web

**Código:** `apps/web/` · **Marca:** Clínica Ocaña (logo de demostración, ficticio).
Esta entrega cubre lo visible de las Fases 3 y 4: la portada, la vista del paciente con el ejercicio por cámara y el
panel del fisioterapeuta. Faltan la biblioteca de videos, el "cuerpo interactivo" y el chatbot (Fase 3), los
reportes con IA (Fase 4) y el login por rol (Fase 5).

## 1. Decisiones técnicas

| Decisión | Por qué |
|---|---|
| **React + Vite** | Como se anticipó en la Fase 1: hay ruteo, estados de carga y varias pantallas. Vite da recarga instantánea y un build pequeño. |
| **React Router** | Rutas por rol (`/fisio/:id`, `/paciente/:id`) que en la Fase 5 quedarán protegidas. |
| **Recharts** | Gráficas declarativas y accesibles (línea de evolución con meta, barras semanales). Se carga solo en las pantallas que la usan (`React.lazy`): el paquete inicial bajó de 685 KB a 273 KB. |
| **Motor de tracking reutilizado, no copiado** | `angleMath`, `repCounter`, `compensation` y `poseTracker` se importan de `apps/tracking-prototype/src` mediante el alias `@engine`. Cero duplicación. Deuda conocida: moverlo a un paquete propio (`packages/tracking-engine`) cuando se cambie el modelo. |
| **La lógica de negocio vive en el servidor** | El frontend no calcula adherencia, progreso ni estados: solo los muestra. Así el paciente y el fisioterapeuta ven lo mismo. La única duplicación es la fórmula de flexión (`lib/rom.js`), cubierta por una prueba que la compara con la convención del backend. |
| **Un solo tema claro** | El logo está pensado sobre fondo claro; se prefirió un tema cuidado a dos a medias. |

## 2. Sistema de diseño (derivado del logo)

- **Color:** azul marino del texto del logo (`#0C3C64`), azul (`#144C84`), verde azulado (`#249C9C`) y el verde del degradado de la cruz. Neutros con matiz azul, no grises puros. Los colores de **estado** (verde, ámbar, rojo) están separados del acento de marca.
- **Tipografía:** Montserrat (la del logo: geométrica y ancha) para títulos y etiquetas en mayúsculas espaciadas, como "CLÍNICA" en el logo; Figtree para el texto y las cifras de las tablas.
- **Motivo:** la cruz redondeada del logo, grande y tenue, detrás de la ilustración de la portada; el degradado de marca solo en progreso (anillos, barras, pasos).
- **Estados:** siempre color más texto (píldora con punto), nunca solo color.

## 3. Pantallas

| Ruta | Qué muestra |
|---|---|
| `/` | Portada: hero, cómo funciona, roles, privacidad |
| `/entrar` | Selección de usuario del **modo demostración** (no es autenticación) |
| `/fisio/:id` | KPIs, atención prioritaria, sesiones por semana, compensaciones, tabla filtrable de pacientes |
| `/fisio/:id/paciente/:pid` | Ficha del paciente en solo lectura |
| `/paciente/:pid` | Mi recuperación: anillo de progreso, racha, plan de la semana, evolución, últimos 7 días |
| `/paciente/:pid/ejercicio/:planId` | Ejercicio con cámara; al terminar guarda la sesión en el backend |

Las cifras de la portada son **hechos del diseño** (3 articulaciones, 0 videos guardados, 1 cámara), no métricas de uso inventadas.

## 4. Cómo se conecta la cámara con el resto

`tracking/useTracking.js` orquesta cámara → MediaPipe → motor. Las alertas de postura vistas **durante** un movimiento se
asocian a esa repetición (`compensation_flags`). Al terminar, la sesión se envía al backend, que calcula los agregados.
Si el guardado falla, la sesión sigue en pantalla y se puede reintentar sin perder las repeticiones.

## 5. Verificación realizada

- 59 pruebas unitarias del frontend (`npm test`) y `vite build` sin errores.
- Capturas de todas las pantallas en escritorio y móvil, con revisión visual. Se corrigieron: tarjeta de privacidad desalineada, el número total de pacientes en rojo (sugería "6 problemas"), interlineado de títulos y una tarjeta que tapaba la ilustración.
- Prueba con una **cámara falsa de Chromium**: la cámara enciende, el modelo de MediaPipe carga, el ciclo corre sin errores y apaga limpio.
- **No verificado aún:** detección de un cuerpo real, conteo de repeticiones y guardado desde esta interfaz. Requiere una persona frente a la cámara (el motor es el de la Fase 1, ya probado con cámara real por el autor).

## 6. Limitaciones conocidas

- **Modo demostración, sin autenticación:** `/entrar` permite entrar como cualquiera. Es solo para la demo; se reemplaza en la Fase 5.
- **Datos ficticios** (`npm run seed` en el backend).
- **Solo los ejercicios de la Fase 1** (rodilla, codo, hombro); el plan lo asigna el seed, aún no hay pantalla para que el fisioterapeuta prescriba.
- **Sin pruebas de interfaz automatizadas** (solo lógica pura); la interfaz se revisó con capturas.
- **Accesibilidad:** foco visible, etiquetas en gráficas y estados con texto; falta una auditoría completa con lector de pantalla.

## 7. Cómo correrlo

```bash
cd apps/backend && npm install && npm run seed && npm start      # API en :3001
cd apps/web     && npm install && npm run dev                    # web en :5173
```

## 8. Rediseño del panel del fisioterapeuta (segunda entrega)

**Problema detectado por el autor:** demasiados colores sin orden, barras poco claras, información escondida y una lista de pacientes difícil de escanear.

### Sistema de diseño aplicado

- **Un color de acción y de datos** (azul de marca). **Verde, ámbar y rojo significan únicamente estado** (al día, atención, urgente). Se eliminaron los degradados en barras y anillos, los segundos acentos (verde azulado en etiquetas y en la línea de meta) y los números coloreados.
- **Una sola estructura de página** (`PageHeader` + ritmo vertical `.stack`): título, descripción y acciones siempre en el mismo lugar.
- **Todo visible sin pasar el mouse.** La lista de pacientes muestra por fila: foto o iniciales, nombre, lesión, código CIE-10, día de recuperación, etapa, estado, sesiones de la semana (`3 de 4` **y** puntos), progreso (número **y** barra fina) y última sesión, con «Ver paciente» e «Informe» siempre a la vista.
- **Acciones a un clic donde se necesitan:** cada pendiente del resumen trae «Ver paciente», «Llamar» y «WhatsApp».
- **Avatar** (`Avatar.jsx`): foto redonda o iniciales sobre uno de seis tonos suaves y estables por paciente; si la foto falla al cargar, cae a iniciales.

### Decisiones de ingeniería

| Decisión | Por qué |
|---|---|
| **Filtro, orden y búsqueda en la URL** (`?estado=&orden=&q=`) | Se pueden compartir, «atrás» funciona y al volver de una ficha la lista queda como estaba. La lógica es pura y está probada (`patientList.js`): búsqueda sin tildes, orden con datos vacíos al final, una URL con valores inválidos no rompe la lista. |
| **`useSectionForm`**: formularios por sección | Cada sección (identificación, contacto, salud, ajustes) guarda **solo lo que cambió**, muestra errores del servidor, avisa de cambios sin guardar y **se actualiza con lo que el servidor dejó normalizado** (p. ej. el celular sin espacios). Guardar una sección **no borra** los cambios sin guardar de otra (una versión previa lo hacía; se detectó y corrigió antes de entregar). |
| **Foto recortada y reducida en el navegador** | Sale ya pequeña (unos 20 KB). Recorte cuadrado centrado con función pura probada y respeto de la rotación de las fotos de celular. |
| **Configuración editable** | Los umbrales de alerta ya no son constantes: cada fisioterapeuta los ajusta. Los valores por defecto del frontend y del backend se comparan en una prueba para que no diverjan. |
| **`workspace.css` documenta sus reglas** | El archivo abre con las reglas de diseño que sigue, para que el siguiente cambio las respete. |

### Responsive verificado

Capturas a 1360, 820 y 390 px de ancho y comprobación automática de que no hay **desplazamiento horizontal**. La fila de paciente pasa de **una línea** (pantalla ancha) a **dos renglones** (tablet) y a **tarjeta apilada** (celular); el menú lateral se vuelve una barra horizontal.

### Errores encontrados durante la revisión (y corregidos)

1. Un `grid` sin columnas explícitas **crece con su contenido y desborda la página** (la lista se salía por la derecha). Solución: `grid-template-columns: minmax(0, 1fr)`.
2. La etiqueta de la demostración animada compartía nombre de clase CSS con la insignia «Modo demostración» de la barra superior (una colisión de cascada).
3. Guardar una sección reiniciaba las demás (ver arriba).
4. Un texto genérico («Revisar su plan») en la tarea de un paciente que alcanzó su meta.

### Verificación de punta a punta con un navegador real

Un recorrido automatizado (Playwright) crea un paciente desde la lista, guarda el documento y comprueba que se **normaliza** (`1.020.304.050` → `1020304050`) y que la cabecera lo muestra con puntos; rechaza un celular inválido con mensaje claro y guarda uno válido; comprueba que el botón de WhatsApp apunta a `wa.me/57…`; sube una foto (queda un JPEG de ~2 KB); registra y revoca el consentimiento; busca «ramirez» (sin tilde) y comprueba que la búsqueda sigue al volver desde la ficha; y guarda y restablece los umbrales, comprobando que **persisten al recargar**. Sin errores de JavaScript.

### Limitaciones de esta entrega

- Los campos de fecha siguen el formato del **navegador del usuario** (en un navegador configurado para Colombia se ven como día/mes/año).
- **Sin autenticación:** la foto y los datos personales son accesibles a quien llegue a la API. Ver `CONSIDERACIONES-COLOMBIA.md`, sección 3.1.
- Las fotos de la demostración son **ilustraciones ficticias**, no personas.
- El lado del paciente se rediseñó en la sección 9.

## 9. Rediseño del lado del paciente (tercera entrega)

**Punto de partida (revisado con capturas antes de tocar nada):** el inicio era una página larga donde competían siete bloques (saludo con anillo, tarjeta azul oscura, cuatro indicadores, plan, rutinas, gráfica, columna lateral); usaba varios colores y degradados; «M M J V» se confundían; el aviso de postura era un círculo con un número sin explicación («1»); en el celular el botón «Cambiar de usuario» se partía en dos líneas.

### Criterio de diseño (distinto al del fisioterapeuta, porque el usuario es otro)

Quien usa esta parte es una persona en recuperación, en casa, muchas veces con el celular y a 2 o 3 metros de la cámara. Por eso:

| Principio | Cómo se aplica |
|---|---|
| **Una decisión por pantalla** | «Inicio» responde una sola pregunta: *¿qué hago ahora?* La tarjeta «Tu siguiente paso» es la única con fondo propio. Gráfica, indicadores y sesiones pasaron a su propia pantalla. |
| **Lenguaje llano, sin tooltips** | «postura por revisar» en vez de «compensación»; «Llevas 4 de 10 en esta serie»; el avance se cuenta como **«37° → 79° · meta 90°»**, no solo «87 %». |
| **Objetivos táctiles ≥ 44 px** | Botones principales de 52 px; un chequeo automático en 390 px de ancho no encuentra ningún control menor a 44 px. |
| **Navegación al alcance del pulgar** | Cuatro secciones (Inicio · Mi progreso · Rutinas · Aprender). En el celular pasan a una barra inferior. |
| **Seguridad visible** | «Cuándo parar y avisar» en el inicio y una franja fija mientras se practica. El texto sale del contenido verificado «Dolor, hinchazón y señales de alerta» de la biblioteca (no se inventó un texto médico nuevo). |
| **Mismo sistema visual** | Un acento (azul); verde/ámbar/rojo solo como estado; `PageHeader`, `.stack`, `Kpi`, `Avatar` y `panel` compartidos con el panel del fisioterapeuta. |

### Pantallas

- **Inicio:** saludo con foto, «Tu siguiente paso» (con la demostración animada al lado y un botón grande), «Tu semana» (7 días con «Hoy» marcado y cada ejercicio con su botón «Empezar»), «Tu avance», rutinas para ti y «Cuándo parar y avisar». Tres estados: pendiente, semana completa y sin plan.
- **Mi progreso (nueva):** el recorrido de cada ejercicio (primera sesión → hoy → meta y cuántos grados faltan), indicadores, evolución, últimos 7 días y sesiones recientes.
- **Ejercicio con cámara:** los números clave (flexión y repeticiones) van **sobre el video**, grandes, para leerlos a distancia; muestra la **serie actual** («Serie 2 de 3 · llevas 4 de 10»); sugiere **descansar entre series**; el botón principal es siempre el siguiente paso lógico (encender → calibrar → terminar); se puede terminar antes y se guardan las repeticiones hechas; al terminar ofrece **«Siguiente: …»** con el ejercicio al que más le falta. En el celular el indicador de pasos muestra solo el paso actual.
- **Rutinas y Biblioteca:** mismo encabezado y ritmo; tarjetas sin degradados; estado vacío con salida clara.

### Decisiones de ingeniería

| Decisión | Por qué |
|---|---|
| **Lógica de «qué mostrar» en un módulo puro** (`lib/patientHome.js`, 14 pruebas) | Siguiente ejercicio (el que más le falta **en proporción**, con empate estable), estado del inicio, semana sin «5/4», recorrido sin números inventados, serie actual. Es la parte donde un error confundiría al paciente, así que se prueba sin navegador. |
| **`key` por ejercicio en el flujo** | Al pasar de un ejercicio al siguiente, React reutiliza el mismo componente: sin `key` se quedaba en la pantalla «Listo» del ejercicio anterior. Se encontró con la prueba de punta a punta. |
| **`Kpi` único** | Había dos tarjetas de indicador (`StatCard` y una local del resumen). Se unificó; `StatCard` y ~25 reglas CSS sin uso (detectadas con un script que busca cada clase en el código) se eliminaron. |
| **Nombres de día de tres letras** | «M» era martes y miércoles; «Hoy» sustituye al último día. Lo usan también la ficha del fisioterapeuta. |
| **Biblioteca y evidencia del fisioterapeuta** pasaron a `PageHeader` + `.stack` | Comparten vistas con el paciente (`RoutineView`, `LibraryBrowser`), así que quedaron con el mismo encabezado. |

### Verificación

- **Pruebas:** 118 en total (backend 54, web 46, prototipo 18), y `vite build` sin errores.
- **Flujo de cámara de punta a punta** (Playwright con cámara falsa y un **detector de pose simulado** que mueve rodilla y codo en ciclos; el contador de repeticiones, las series, el guardado en el backend real y las pantallas son el código de verdad): enciende la cámara → calibra → cuenta repeticiones → cierra la serie 1 y avisa el descanso → termina antes de tiempo y guarda → «Listo» con la cámara apagada → «Siguiente: Flexión de codo» vuelve al paso 1 → completa 2×5 → el inicio muestra las dos sesiones. Sin errores de JavaScript.
- **Responsive:** 1360, 820 y 390 px, sin desplazamiento horizontal en 14 pantallas (paciente y fisioterapeuta).
- **Accesibilidad básica:** un solo `h1` por pantalla, ningún control sin nombre, ninguna imagen sin `alt`.

### Errores encontrados durante la revisión (y corregidos)

1. El contenido del paciente arrancaba 60 px más a la derecha que el logo y el menú (anchos distintos).
2. En «Mi progreso» la tarjeta de 7 días quedaba corta junto a la lista de sesiones: se reordenaron las columnas.
3. Las notas de una rutina («Con cámara», «Solo si tu equipo lo autorizó») se estiraban al ancho de la tarjeta y aparecían en ámbar aunque no eran una advertencia.
4. Los filtros de la biblioteca medían 34 px de alto (difícil de tocar).
5. «Siguiente ejercicio» mostraba la pantalla «Listo» anterior (ver `key`).

### Limitaciones

- **La detección con un cuerpo real sigue sin verificarse por mí.** La prueba usa un detector simulado; el conteo con MediaPipe y una persona lo debe comprobar quien tenga la cámara.
- El paciente no puede registrar **cómo se sintió** (dolor 0–10) después de una sesión. Es una práctica habitual y útil para el fisioterapeuta; requiere un campo nuevo en la sesión (migración 4), su vista en la ficha y su informe. Queda como siguiente mejora.
- Sigue sin haber inicio de sesión: el selector de usuario es del modo demostración (Fase 5).

## 10. Ingreso y renovación estética (cuarta entrega)

**Pedido del autor (con maqueta y foto):** pantalla de ingreso con la foto de fondo desvanecida, el logo de la clínica, la tarjeta de credenciales flotante y el texto «programa de rehabilitación domiciliaria acompañada de IA»; y un cambio estético general con concepto de rehabilitación en todo el recorrido del paciente.

### Ingreso (`pages/Login.jsx`, `styles/auth.css`)

- **Composición de la maqueta:** foto a la izquierda que se desvanece hacia el fondo claro, cruz del logo como marca de agua translúcida sobre la foto (el óvalo de la maqueta), titular y tres razones para confiar (cámara, privacidad, seguimiento) sobre un velo azul; a la derecha, tarjeta flotante con el logo arriba. En el celular la foto pasa a ser una franja superior y la tarjeta sube sobre ella.
- **Formulario accesible:** etiquetas visibles, `autocomplete` correcto (gestores de contraseñas), validación al salir del campo con mensajes específicos y `aria-invalid`, botón de mostrar/ocultar contraseña (44 px), foco visible. La validación de forma es una función pura (`lib/loginForm.js`, 5 pruebas).
- **Aún no autentica:** el botón valida y avisa que el ingreso real llega con la autenticación. Se dejó un acceso «modo demostración» (`/demo`), marcado como **temporal**, que se retira con los datos de ejemplo. No hay enlace de «olvidé mi contraseña» porque todavía no existe esa función; se agrega al construirla.
- **La portada anterior se eliminó** (`/` ahora es el ingreso; `/entrar` redirige). Su privacidad («tu video no sale de tu dispositivo») pasó a la pantalla de ingreso.
- **Foto:** reducida a 1800 px y 250 KB (`public/brand/rehab-hero.jpg`). **Verificar la licencia de la imagen** antes de publicar; si no se puede usar comercialmente, hay que cambiarla (es solo un archivo).

### Concepto visual: energía y calidez en el área del paciente

| Cambio | Por qué |
|---|---|
| **Coral** (el color de las pesas de la foto) para las acciones principales del paciente y los logros; `--coral-600` cumple 4,5:1 con texto blanco | La rehabilitación es esfuerzo y avance: un color cálido y activo invita a empezar. El azul de la marca sigue siendo el de datos y estructura |
| **Fondo cálido** (`--bg-warm`) en el área del paciente; el panel del fisioterapeuta conserva el fondo frío | Dos áreas, dos ánimos: calidez para quien se recupera, sobriedad para quien analiza |
| **Portada del inicio** con la foto, la foto/iniciales del paciente, la etapa y tres cifras (racha, sesiones, avance); la tarjeta «Tu siguiente paso» sube sobre ella | Primera impresión humana y de una sola mirada: quién soy, cómo voy y qué hago ahora |
| **Logros** (`components/Achievements.jsx`) en el inicio, en «Mi progreso» y al terminar una sesión | Refuerzo positivo sin comparar con otros pacientes. Se basan **solo en datos acumulados** (sesiones, repeticiones, mejor flexión histórica), nunca en la racha actual: un logro ganado no se pierde. La lógica es pura y probada (`lib/patientHome.js`, 8 pruebas nuevas) |
| **Al guardar una sesión** se muestran los logros que acaba de desbloquear | Es el momento de mayor motivación; se calcula localmente con los datos previos más la sesión, sin pedir nada extra |

### Verificación

- **Pruebas:** 131 en total (backend 54, web 59, prototipo 18) y `vite build` sin errores.
- **Ingreso:** recorrido con navegador real (campos vacíos, correo mal formado, correo válido con espacios y mayúsculas que se normaliza, mostrar/ocultar contraseña, acceso a la demostración, `/entrar` redirige).
- **Logros de punta a punta:** un paciente nuevo, creado por la API, hace su primera sesión con cámara falsa y detector simulado; al terminar aparecen «Primer paso» y «A mitad de camino», y el inicio muestra «2 de 6».
- **Barrido de 36 combinaciones** (18 pantallas × escritorio y celular): sin desplazamiento horizontal, sin errores de JavaScript, un `h1` por pantalla, ningún control sin nombre y, en celular, ningún control táctil menor de 44 px (fuera del panel del fisioterapeuta, que es de escritorio).

### Limitaciones

- El rediseño estético del **panel del fisioterapeuta** se limita a lo heredado (tokens y encabezados); su identidad propia queda para una siguiente iteración si se pide.
- Los logros son simples y de ejemplo: umbrales (10 y 25 sesiones, 100 repeticiones, 50 % de la meta) elegidos como punto de partida, **no criterio clínico**; el fisioterapeuta podría definirlos en el futuro.

## 11. Análisis de la sesión y video subido (quinta entrega)

**Para el paciente**
- Al terminar una sesión ve **una barra por repetición** con la línea de la meta y hasta **dos observaciones en lenguaje llano** («tus últimas repeticiones fueron más cortas: puede ser cansancio»). Nunca diagnostica ni culpa.
- **«Tengo un video grabado»** (paso «Haz tu serie»): elige un video del celular y el navegador lo analiza con barra de progreso y botón de cancelar. **El video no se sube** (solo viajan unos KB de datos). Si el archivo no es un video, no se ve a la persona o no se detectan repeticiones, lo dice y **no guarda** una sesión vacía.

**Para el fisioterapeuta** (pestaña «Sesiones» → «Ver análisis», en una tarjeta aparte debajo de la tabla)
- Cuatro cifras (repeticiones de las prescritas, mejor flexión, cambio dentro de la sesión, ritmo), el recorrido por repetición, las **observaciones con cifras**, la tabla con subida/sostén/bajada y alertas de cada repetición, y el **replay del movimiento como un muñeco** (reproducir/pausar, velocidad 0,5×–2×, línea de tiempo con las repeticiones marcadas y saltos por repetición).
- **«Rehacer el análisis»** vuelve a analizar el registro guardado con la versión actual del motor.

Decisiones:
- **Los textos están separados del motor** (`lib/insights.js`): el motor devuelve códigos con números y la pantalla los dice distinto al paciente y al fisioterapeuta. Una prueba exige que los códigos que genera el motor sean exactamente los que tienen texto (si se agrega uno, avisa).
- **Si el registro es demasiado grande**, se quita primero el esqueleto y, si aun así no cabe, se guarda la sesión sin registro; **nunca se pierde una sesión por el registro** (`lib/sessionPayload.js`, `lib/saveSession.js`).
- La lógica del replay (`lib/replayModel.js`) es pura y está probada; el componente solo dibuja.

Errores encontrados al verificar (y corregidos): la tabla de sesiones **ensanchaba la página en el celular** por el texto oculto de una cabecera (`.sr-only` es absoluto y escapaba del contenedor con scroll; error anterior a esta entrega); el análisis dentro de una celda de la tabla obligaba a desplazarse de lado (ahora es una tarjeta aparte).

**Verificación de punta a punta con navegador** (cámara falsa y detector simulado con fatiga): sesión en vivo → resultado del paciente → guardado en el servidor (10 repeticiones en vivo, 10 guardadas, 10 en el análisis) → panel del fisioterapeuta → replay y saltos de repetición → rehacer análisis; y la subida de un **video real generado en el navegador** (archivo que no es video, video sin movimiento, cancelar y caso exitoso, comprobando que ninguna petición lleva el video). Sin errores de JavaScript, sin desbordamiento horizontal en escritorio ni celular.

**Limitaciones:** la detección con un cuerpo real y MediaPipe sigue sin verificarse por mí (los detectores de las pruebas son simulados); el replay muestra la vista de la cámara sin espejo; los umbrales de las observaciones son orientativos.

## 12. Ejercicios sin ejemplos «de relleno», elevación de pierna y asistente (sexta entrega)

**Biblioteca depurada.** Pedido del autor: quitar lo que aún no sirve. Quedan los ejercicios que hoy se pueden medir, más el contenido educativo:

| Estado | Ejercicios | Vuelve en |
|---|---|---|
| En la biblioteca (con cámara) | flexión de rodilla, de codo, elevación frontal del brazo, **elevación de pierna recta (nuevo)** | — |
| Archivados | contracción de cuádriceps, agarre, retracción de omóplatos, rotación del antebrazo | Fase 2: sesiones **guiadas** (temporizador, sostén, esfuerzo/dolor) |
| Archivado | péndulo de Codman | Fase 3: **trayectoria** |
| Archivados | bombeo de tobillo, flexión de muñeca | Medición con reservas («experimental»), sin evidencia citada |
| Rutinas | queda «Movilidad temprana de rodilla» (2 ejercicios); las de hombro, codo y muñeca se archivaron por quedar de uno o cero ejercicios | |

Nada se borró: el contenido (pasos, precauciones, evidencia) está en `backend/src/content/pending.js` y las animaciones en `web/src/demos/archived.js`, con la fase en que cada uno regresa.

**Pantalla del ejercicio, según su especificación:** las indicaciones de colocación salen de la postura y la vista que pide el ejercicio («Acuéstate boca arriba…», «Ponte de perfil…», «que se vea de la cadera a la rodilla»), y mientras se practica se avisa **«Estás de frente. Gírate de perfil…»** si la persona no está como pide el ejercicio. El mensaje «No veo bien tu rodilla» dice «pierna» en la elevación de pierna.

**Asistente de recuperación** (diseño y justificación en `ARQUITECTURA.md`, sección 14):
- **Paciente:** al terminar una sesión y en su inicio ve «Lo que va bien», «Para tu próxima sesión» y «Habla con tu fisioterapeuta», cada recomendación con **«¿Por qué te lo digo?»** (sus propios números) y, si aplica, el estudio y lo que no demuestra.
- **Fisioterapeuta:** en la ficha, «Sugerencias del asistente»; las propuestas (subir la meta 5° tras tres sesiones seguidas en la meta, menos repeticiones si hay fatiga repetida) se aplican con un botón, **dejan una nota clínica con el motivo** y nunca se aplican solas. Estancamiento o retroceso piden reevaluar, sin cambios automáticos.

**Verificación de punta a punta:** una paciente con elevación de pierna (cámara falsa y detector simulado acostado): indicaciones correctas, aviso de «de frente», 6 repeticiones contadas, resultado con meta 45° y el asistente; un paciente de rodilla con cuatro sesiones: el fisioterapeuta ve «Subir la meta», pulsa Aplicar (la meta pasa de 90° a 95° de flexión en la base y queda la nota) y el paciente ve «¡Llegaste a tu meta!» en su inicio. Sin errores de JavaScript, sin desbordamiento horizontal. Pruebas web: 97 (antes 82). Barrido de 21 pantallas × escritorio y celular: sin hallazgos.

**Limitaciones:** el replay y el análisis de la elevación de pierna se probaron con detectores simulados, no con una persona real; «Descartar» una sugerencia solo la oculta en esa pantalla (no se guarda); las pantallas de error no tienen un título de nivel 1.
