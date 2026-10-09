# Fase 1 — Prototipo de Tracking de Movimiento

Prototipo aislado (sin backend, sin login) que demuestra la pieza más riesgosa
del sistema de telerehabilitación: medir el ángulo articular en tiempo real
con la cámara del navegador, contar repeticiones al alcanzar el rango de
movimiento (ROM) objetivo, y detectar compensaciones básicas de postura.

## Cómo ejecutarlo

No requiere `npm install` ni bundler: es HTML/CSS/JS plano con módulos ES.
MediaPipe se carga desde el CDN oficial en tiempo de ejecución, directamente
en tu navegador.

**Importante:** los navegadores bloquean el acceso a la cámara si abres el
`index.html` directamente como archivo (`file://`). Debes servirlo con un
servidor local simple:

```bash
cd apps/tracking-prototype
python3 -m http.server 8000
# o, si tienes Node:  npx serve .
```

Luego abre `http://localhost:8000` en Chrome o Edge (navegadores con mejor
soporte de WebGL/WASM para MediaPipe).

## Cómo usarlo

1. Elige el ejercicio (rodilla, codo u hombro) y el lado (izquierdo/derecho).
2. Ajusta el ángulo objetivo (ROM) si quieres uno distinto al valor por defecto.
3. Pulsa **Iniciar cámara** y da permiso de cámara al navegador.
4. Ubícate donde se vea toda la extremidad, de perfil o de frente según el
   ejercicio.
5. Pulsa **Calibrar postura de reposo** una vez estés quieto en tu posición
   inicial — esto es lo que usa el detector de compensaciones como referencia.
6. Empieza a repetir el ejercicio. El contador de repeticiones y el
   historial de ROM se actualizan solos.

## Estructura del código

```
apps/tracking-prototype/
├── index.html          UI del prototipo
├── styles.css
├── src/
│   ├── angleMath.js      Cálculo de ángulos + definición de ejercicios (SIN dependencias)
│   ├── repCounter.js     Máquina de estados para contar repeticiones (SIN dependencias)
│   ├── compensation.js   Reglas de detección de compensación (SIN dependencias)
│   ├── poseTracker.js    Envoltorio sobre MediaPipe Tasks Vision (PoseLandmarker)
│   └── app.js            Cablea la UI con los módulos anteriores
└── tests/
    ├── angleMath.test.mjs
    ├── repCounter.test.mjs
    └── compensation.test.mjs
```

Los tres módulos de lógica (`angleMath`, `repCounter`, `compensation`) son
JavaScript puro, sin DOM ni MediaPipe — por diseño, para poder probarlos con
datos sintéticos y para poder reutilizarlos tal cual dentro de la plataforma
del paciente en la Fase 3 (donde este mismo motor de tracking se integrará
como un componente dentro de la pantalla de ejercicio, en vez de ser toda la
pantalla).

## Cómo correr las pruebas

No requieren ninguna librería externa (se usa el test runner nativo de
Node.js, disponible desde Node 18+):

```bash
node --test tests/*.test.mjs
```

18/18 pruebas pasan (ver `docs/FASE-1-TRACKING.md` para el detalle de qué
cubre cada una).

## Limitaciones conocidas de este prototipo (a validar con cámara real)

- **Ángulo en 2D:** se calcula sobre la proyección x,y de la imagen, no en
  3D. Es preciso mientras la extremidad se mueva aproximadamente paralela al
  plano de la cámara; se degrada si el paciente gira el cuerpo hacia/desde
  la cámara.
- **Convención izquierda/derecha:** MediaPipe etiqueta los landmarks
  "left_/right_" según su propio criterio interno, y el video en pantalla se
  muestra en espejo (más natural para el usuario). Es posible que el
  selector "Izquierdo/Derecho" de la UI no coincida a la primera con lo que
  ves en pantalla — pruébalo con cámara real y, si está invertido, es un
  ajuste de una línea (invertir qué landmarks usa `getPoints` según el lado).
- **Compensación:** las reglas (inclinación de tronco, elevación de
  cadera/hombro) son heurísticas simples y explicables, no un modelo
  entrenado. Suficiente y defendible para un prototipo de Fase 1; queda
  como trabajo futuro afinar umbrales con datos reales de pacientes.
- **No se ha probado con cámara real todavía** (este entorno de desarrollo
  no tiene acceso a webcam ni a internet para descargar el modelo de
  MediaPipe) — la siguiente acción recomendada es que lo abras tú en tu
  computador y lo pruebes end-to-end antes de darlo por cerrado.
