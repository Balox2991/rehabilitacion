# Fase 1 — Prototipo de Tracking de Movimiento

**Proyecto:** Sistema de telerehabilitación asistido por IA (recuperación de fracturas)
**Alcance de esta fase:** demostrar de forma aislada la pieza técnicamente más
riesgosa del sistema — medir ángulo articular en tiempo real con la cámara,
contar repeticiones al alcanzar el rango de movimiento (ROM) objetivo, y
detectar compensaciones básicas de postura — antes de integrarla al resto
de la plataforma.

Código: `apps/tracking-prototype/`.

---

## 1. Objetivo de la fase

Responder, con evidencia funcional, tres preguntas de las que depende todo
lo demás:

1. ¿Se puede medir el ángulo de una articulación con suficiente precisión
   usando solo una cámara web y sin hardware adicional (sin goniómetro
   físico, sin sensores IMU)?
2. ¿Se puede contar repeticiones de forma confiable sin que el ruido de la
   detección genere conteos falsos?
3. ¿Se puede detectar, con reglas simples y explicables, cuando el paciente
   compensa el movimiento con otra parte del cuerpo?

Este prototipo no tiene login, base de datos ni backend — es intencional:
aísla la variable de riesgo (visión por computador) del resto de la
arquitectura.

## 2. Decisiones técnicas y su justificación

### 2.1 MediaPipe Tasks Vision (PoseLandmarker) — visión por computador

Se usa `@mediapipe/tasks-vision`, la librería oficial de Google, sucesora de
la antigua `@mediapipe/pose`. Se eligió sobre alternativas (OpenPose,
MoveNet/TensorFlow.js, un modelo propio) por:

- **Corre 100% en el navegador del paciente** (WebAssembly + aceleración
  GPU vía WebGL cuando el navegador la soporta). El video nunca sale del
  computador del paciente — esto es relevante para la sustentación porque
  simplifica el tratamiento de datos de salud (no hay video de terceros
  viajando a un servidor ni almacenándose).
- **Tiempo real:** al no depender de una llamada de red por frame, la
  latencia es la de la inferencia local (típicamente unos pocos
  milisegundos por frame en equipos modestos con el modelo "lite").
- **Sin costo de infraestructura:** no se necesita un servidor con GPU para
  esta parte.
- **Mantenimiento activo y documentación oficial de Google**, con modelos
  ya entrenados (no hay que entrenar nada para este alcance).
- Da 33 puntos de referencia (landmarks) del cuerpo completo, de los cuales
  usamos hombros, codos, muñecas, caderas, rodillas y tobillos.

Contraparte a mencionar si el jurado pregunta: al ser un modelo 2D de una
sola cámara, la profundidad (eje Z) es menos confiable que x/y, así que el
cálculo de ángulo se hace en el plano de la imagen (ver 2.3).

### 2.2 Sin framework/bundler para este prototipo (HTML + JS puro con módulos ES)

Se decidió **no** usar Vite/React/npm para esta fase específica, por una
razón práctica y una de diseño:

- Práctica: el entorno donde se desarrolló este prototipo no tuvo acceso a
  los registros de paquetes (npm) en el momento de construirlo.
- De diseño: un prototipo "aislado y demostrable" (como pidió el alcance de
  esta fase) se beneficia de tener cero pasos de instalación — se abre con
  un servidor estático de una sola línea y ya funciona. MediaPipe se importa
  como módulo ES directamente desde su CDN oficial, cargado por el propio
  navegador del usuario en tiempo de ejecución.

Esto **no** es la decisión final de stack para toda la plataforma: en la
Fase 3 (plataforma del paciente), donde se necesita login, ruteo entre
pantallas y estado de aplicación más complejo, sí se recomendará un
framework (React) — momento en el que este mismo motor de tracking
(`angleMath.js`, `repCounter.js`, `compensation.js`) se reutiliza tal cual,
porque fue escrito sin dependencias del DOM ni de MediaPipe.

### 2.3 Cálculo del ángulo articular

Para tres puntos A (proximal), B (articulación), C (distal) — por ejemplo,
para la rodilla: A = cadera, B = rodilla, C = tobillo — el ángulo interno en
B se calcula con el producto punto de los vectores BA y BC:

```
ángulo = arccos( (BA · BC) / (|BA| · |BC|) )
```

Esto es exactamente lo que hace un goniómetro físico (mide el ángulo entre
dos segmentos que comparten un vértice), solo que aquí los "segmentos" son
vectores entre landmarks detectados por cámara en vez de los brazos físicos
del instrumento. Se calcula en 2D (coordenadas x,y normalizadas de la
imagen) — ver limitación en la sección 5.

### 2.4 Conteo de repeticiones: máquina de estados con histéresis

Un enfoque ingenuo ("cuenta cada vez que el ángulo cruza el objetivo")
falla en la práctica: la detección de pose tiene ruido de un par de grados
frame a frame, y ese ruido por sí solo generaría conteos falsos si el
paciente se queda quieto justo en el umbral.

La solución implementada usa **dos zonas con histéresis** (el mismo
principio que usan las apps de conteo de repeticiones de ejercicio tipo
sentadillas):

```
reposo ──(cruza hacia el objetivo)──> objetivo alcanzado ──(vuelve a reposo)──> +1 repetición
```

Solo se cuenta una repetición cuando el paciente completa el ciclo
ida-y-vuelta completo, no cada vez que toca el umbral. Además se exige un
tiempo mínimo entre transiciones de estado (`minDwellMs`, 250 ms por
defecto) para filtrar picos de un solo frame. Esta lógica está desacoplada
de la cámara (vive en `repCounter.js`, sin ninguna dependencia) y se probó
con 8 pruebas unitarias usando secuencias de ángulos sintéticas, incluyendo
casos de jitter/ruido y de múltiples repeticiones consecutivas.

### 2.5 Detección de compensaciones: reglas explicables, no un modelo entrenado

Para el alcance de "detección básica de compensaciones" se implementaron
dos reglas, calibradas contra la propia postura de reposo del paciente
(no contra una postura "ideal" genérica, porque el rango de movimiento de
un paciente en recuperación de fractura varía persona a persona):

- **Inclinación de tronco:** ángulo de la línea hombro-cadera respecto a la
  vertical; si se desvía más de un umbral (15° por defecto) respecto a la
  calibración, se marca.
- **Elevación de cadera/hombro:** desplazamiento vertical del punto medio
  de cadera (en ejercicios de rodilla) u hombro (en ejercicios de codo/
  hombro) respecto a la calibración.

Se eligió un enfoque basado en reglas, en vez de un modelo de machine
learning entrenado, porque: (a) no se cuenta con un dataset etiquetado de
"compensaciones" de pacientes reales para entrenar algo así en el tiempo
disponible, y (b) las reglas son transparentes y auditables — se puede
explicar exactamente por qué el sistema marcó una compensación, lo cual
importa en un contexto clínico. Queda documentado como trabajo futuro
(Fase 2 de investigación, fuera del alcance de este proyecto de grado)
migrar a un clasificador entrenado si se consigue el dataset.

## 3. Pruebas

18 pruebas unitarias con el test runner nativo de Node.js (`node --test`,
sin dependencias externas), todas en verde:

- `angleMath.test.mjs` (6): ángulos de 90°/180°/~0°, caso realista de
  rodilla, manejo de landmarks faltantes (oclusión) y de vectores
  degenerados.
- `repCounter.test.mjs` (7): ciclo completo de una repetición, no doble
  conteo por jitter, filtro de pico de ruido por tiempo mínimo, múltiples
  repeticiones consecutivas, dirección "increasing" (ej. hombro), y
  registro del ROM realmente alcanzado por repetición.
- `compensation.test.mjs` (5): sin calibrar no marca nada, postura estable
  no marca nada, inclinación de tronco por encima del umbral sí marca,
  elevación de cadera/hombro sí marca (sin falso positivo de tronco), y un
  desplazamiento pequeño dentro del margen no marca (evita falsos
  positivos).

Lo que **no** se pudo probar en este entorno de desarrollo (y queda como
siguiente paso antes de dar la fase por cerrada): el flujo end-to-end con
una cámara real y un cuerpo real, porque el entorno donde se construyó este
prototipo no tiene webcam ni acceso a internet para bajar el modelo de
MediaPipe. Es la primera verificación que debes hacer al abrir el
prototipo en tu propio computador.

## 4. Ejercicios/articulaciones cubiertos en este prototipo

| Ejercicio | Landmarks usados | Ángulo de reposo (aprox.) | Ángulo objetivo por defecto |
|---|---|---|---|
| Flexión de rodilla | cadera–rodilla–tobillo | ~175° (extendida) | 90° |
| Flexión de codo | hombro–codo–muñeca | ~170° (extendido) | 60° |
| Flexión de hombro | cadera–hombro–codo | ~15° (brazo abajo) | 150° |

Los ángulos "objetivo" son valores orientativos de ejemplo, no
prescripciones clínicas — en la Fase 4 (dashboard del fisioterapeuta) el
profesional podrá ajustar el objetivo por paciente y fase de recuperación.

## 5. Limitaciones conocidas y cómo se mitigan / quedan documentadas

| Limitación | Mitigación / estado |
|---|---|
| Ángulo calculado en 2D (no en 3D) | Preciso si la extremidad se mueve paralela al plano de cámara; se le pide al paciente ubicarse de perfil/frente según el ejercicio |
| Convención izquierda/derecha de MediaPipe vs. imagen en espejo | Documentado en el README; ajuste de una línea si aparece invertido al probar con cámara real |
| Reglas de compensación son heurísticas, no un modelo entrenado | Transparente y suficiente para el alcance de grado; mejora futura fuera de alcance |
| No probado aún con cámara/persona real | Siguiente paso inmediato antes de cerrar la fase |
| Un solo cuerpo detectado a la vez (`numPoses: 1`) | Correcto para este caso de uso (un paciente haciendo ejercicio solo) |

## 6. Qué sigue

1. **Tú:** abrir el prototipo en tu computador (ver README de
   `apps/tracking-prototype/`) y validar con cámara real: precisión del
   ángulo contra una medición manual de referencia, que el conteo de
   repeticiones se sienta natural, y que las alertas de compensación no
   sean ni demasiado sensibles ni demasiado laxas. Avísame qué ajustar.
2. Con eso validado, cerramos formalmente la Fase 1 y pasamos a la
   **Fase 2: backend + base de datos** (modelo de datos de pacientes,
   fisioterapeutas, sesiones, historial de ROM y planes de ejercicio),
   donde este motor de tracking pasará a alimentar un historial persistente
   en vez de vivir solo en memoria del navegador.

---

## 7. Correcciones posteriores

- **Parpadeo del esqueleto y del ángulo:** `requestAnimationFrame` corre a unos 60 Hz y la cámara entrega unos 30 cuadros por segundo, así que en la mitad de las iteraciones no había un cuadro nuevo y `detect()` devolvía `null`, que el código trataba como "no hay persona" (borraba el esqueleto y mostraba "—"). Ahora `detect()` devuelve `undefined` cuando no hay cuadro nuevo y `null` solo cuando no se detecta a nadie; el llamador ignora el primer caso.

### Corrección de precisión (octubre de 2026), tras la prueba con cámara real

**Síntoma reportado por el autor:** el modelo «no toma las repeticiones verdaderas ni los extremos» y a veces marca mal cada repetición.

**Método:** antes de cambiar nada se reprodujo el problema con señales sintéticas (`tests/helpers/signals.mjs`: reposo→extremo→reposo con ruido, picos aislados, fps irregular). Se encontraron **cuatro causas**, de mayor a menor impacto:

| # | Causa | Evidencia | Corrección |
|---|---|---|---|
| 1 | **El contador exigía llegar a la meta del plan.** Un paciente en recuperación casi nunca la alcanza (va por el 40 %, el 70 %…) | 10 repeticiones reales de un paciente que llega a 105° (meta 90°): la versión 1 contó **0** | El contador detecta repeticiones por la **forma del movimiento** (valles y picos con histéresis relativa al recorrido), no por umbrales absolutos. La meta solo decide `lastReachedTarget` («llegó» / «no llegó») |
| 2 | **Los ángulos se calculaban en coordenadas normalizadas (0–1)**, que MediaPipe escala por el ancho y por el alto *por separado* | En un video 640×480, un ángulo **real de 90° con la pierna inclinada 45° se medía como 73,7°** (16° de error) | `toPixelSpace`/`measureJoint` miden en píxeles reales; `CompensationDetector` recibe la proporción del video para el ángulo del tronco |
| 3 | **Sin filtrado de señal:** el ROM era el extremo del ruido (sesgo hacia «más movimiento») y un frame equivocado podía contar una repetición | Con ruido de ±3° y picos del 5 % de los frames hubo repeticiones falsas | Mediana de 5 (quita picos de 1–2 frames) + filtro One Euro (estándar en seguimiento de movimiento); el número en pantalla es el ángulo suavizado |
| 4 | **Se usaban puntos tapados o fuera de cuadro** (MediaPipe los «adivina») y un reposo fijo de 175° | — | Se descarta la lectura si la visibilidad de los tres puntos es < 0,5 y la pantalla avisa «No veo bien tu rodilla»; el contador ya no depende de un reposo calibrado |

Cambios adicionales: modelo `pose_landmarker_full` (con respaldo a `lite`) y umbrales de confianza de 0,6 en lugar de 0,5.

**Errores míos encontrados durante la corrección (corregidos):** un pico en las primeras 5 lecturas fijaba un «valle» falso porque la mediana aún no tenía ventana (se añadió calentamiento); la duración de la subida se medía desde un valle antiguo (ahora desde la última vez que la señal estuvo en el fondo); el valle era un mínimo eterno (ahora se relaja lentamente cuando la articulación está quieta).

**Verificación:** 50 pruebas del prototipo (antes 18), con 20 señales distintas por escenario de ruido y el conteo exacto en todas: paciente que no llega a la meta, reposo distinto de 175°, repeticiones que no vuelven al reposo, sostén de 2,5 s, repeticiones lentas y rápidas, 10–30 fps con frames perdidos, hombro (dirección contraria), rebote arriba, lecturas inválidas y pausa de la cámara. De punta a punta con navegador (cámara falsa y detector simulado en geometría de píxeles): un paciente que cicla 175°→105° (no llega a 90°) cuenta sus repeticiones; un tramo con la pierna «tapada» muestra el aviso y **no cuenta** movimientos adivinados.

**Lo que sigue sin comprobarse:** que con un cuerpo real y MediaPipe el conteo coincida con el real. Para cerrarlo con datos y no con impresiones, la pantalla de ejercicio tiene una herramienta técnica (`?debug=1`): descarga la serie de ángulos de la sesión (solo números, sin video) junto con las repeticiones que la persona contó a mano, y `node scripts/replay.mjs <archivo.json>` reproduce el registro sin cámara y permite probar otros parámetros. Con un par de registros reales se puede afinar el detector con evidencia.

**Limitación que no se arregla con filtros:** el ángulo sigue siendo 2D (plano de la imagen). Si la persona gira el cuerpo respecto de la cámara, el ángulo medido cambia aunque la articulación no. La mejora real es medir en 3D (`worldLandmarks` de MediaPipe) o guiar mejor la ubicación de la cámara; ver `docs/ARQUITECTURA.md`, sección 12.

### Análisis posterior de la sesión y video subido (octubre de 2026)

Se implementó el camino híbrido de `docs/ARQUITECTURA.md` (sección 12). Módulos nuevos del motor, todos puros y probados:

| Módulo | Qué hace |
|---|---|
| `analysis.js` | Analiza la sesión COMPLETA: suavizado **sin retraso** (mediana centrada + One Euro hacia adelante y atrás), repeticiones por **prominencia de picos**, ROM del extremo (mediana de la meseta si el paciente sostiene arriba; máximo suavizado si no), **tempo** de cada repetición (subida y bajada del 10 al 90 %, sostén sobre el 90 %), caída del recorrido entre el primer y el último tercio (fatiga), regularidad del ritmo y **observaciones** con sus umbrales a la vista (`THRESHOLDS`, orientativos, no clínicos) |
| `traceRecorder.js` | Arma el REGISTRO de la sesión (`telerehab-trace/2`): tiempo, ángulo, visibilidad, cambios de alerta de postura y el esqueleto de 12 puntos. Nunca video ni imágenes |
| `videoPass.js` | Recorre una **grabación** cuadro por cuadro (15 por segundo) y arma el mismo registro que la cámara en vivo |
| `replay.js` | Reproduce un registro sin cámara y compara conteo en vivo, análisis posterior y conteo manual |

Decisiones y por qué:

- **La estimación del extremo se eligió midiendo, no por intuición.** Con 40 señales sintéticas por escenario se compararon cinco estimadores: con sostén arriba, la mediana de la meseta del extremo tuvo error medio de 0,8° frente a 1,65° del máximo suavizado (2,2° con sostén largo). Sin sostén ningún promedio gana al máximo, que ya subestima la punta de un pico angosto; por eso el análisis usa uno u otro según haya meseta o no.
- **El conteo en vivo y el posterior usan los mismos umbrales** (`repThresholds`) para llamar «repetición» a lo mismo. Una diferencia que apareció al probar: si el paciente apretaba «terminar» a mitad de la bajada de la última repetición, el conteo en vivo la contaba y el posterior no. Ahora una repetición cortada por el final cuenta si ya bajó lo suficiente **y** su lomo dura al menos 250 ms (sin eso, un grupo de lecturas malas al final creaba repeticiones falsas; lo encontró la prueba de ruido).
- **Todo recorrido de video es local:** `apps/web/src/tracking/videoAnalysis.js` abre el archivo en el navegador, lo recorre con el mismo detector y entrega el registro. El video no se sube.

**Verificación:** 93 pruebas del prototipo (antes 50). Incluyen exactitud del conteo en 30 señales con ruido, picos y fps bajos; fatiga, tempo, visibilidad e interrupciones; alertas asignadas a su repetición; el ciclo completo video simulado → registro → análisis; y cancelación.

**Limitación:** la cámara frontal del celular puede invertir izquierda y derecha (se recomienda la trasera). Con un video, la postura de referencia para las alertas es la del primer cuadro con la persona: se supone que el video empieza en reposo.

### Ejercicios definidos como datos, ángulo de segmento y asistente (octubre de 2026)

| Módulo | Qué hace |
|---|---|
| `exerciseSpecs.js` | Cada ejercicio medido con cámara es una **especificación** validada (`validateSpec`): qué puntos del cuerpo, qué ángulo (`joint_angle` de 3 puntos o `segment_angle` de un segmento contra la horizontal o la vertical), sentido, reposo, meta, vista (perfil/frente) y postura. `angleMath.EXERCISES` se **arma a partir de ellas**: un ejercicio nuevo es una especificación nueva, sin tocar el contador, el análisis ni las pantallas |
| `angleMath.segmentAngle` | Elevación de un segmento sobre la horizontal (igual si la persona mira a la izquierda o a la derecha) o su separación de la vertical, en **píxeles reales** |
| `viewCheck.js` | ¿De perfil o de frente? Por la separación de los hombros relativa al largo del tronco (no depende de la distancia ni de la orientación: acostado de perfil también da «perfil»). Avisa solo de un desajuste claro |
| `coach.js` | El asistente de recuperación (ver `ARQUITECTURA.md`, sección 14) |

**Elevación de pierna recta** (ejercicio nuevo): la rodilla no se dobla, se mide cuánto sube el muslo sobre la camilla (`segment_angle` cadera→rodilla contra la horizontal; solo hacen falta cadera y rodilla). Con el motor de «flexión de rodilla» daba **0 repeticiones** aunque el paciente hiciera todas; con su especificación cuenta las 8 y mide 45° ± 4° en la simulación, también con un paciente que solo llega a 25° y con la rodilla tapada.

Pruebas del prototipo: 138 (antes 93).
