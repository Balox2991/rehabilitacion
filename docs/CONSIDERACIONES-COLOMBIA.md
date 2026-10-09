# Consideraciones para Colombia — ficha del paciente y buenas prácticas

Este documento explica **por qué** la ficha del paciente tiene los campos que tiene, qué normas colombianas la
rodean y qué recomendaciones quedan pendientes. Está pensado como material para la sustentación.

> **Aviso.** Es orientación técnica para un proyecto de grado, **no asesoría jurídica**. Las normas se verificaron
> contra fuentes oficiales en septiembre de 2026, pero pueden haber cambiado. Antes de operar con pacientes reales,
> valida cada punto con un abogado especialista en salud y protección de datos.

## 1. Qué se implementó y por qué

| Campo / función | Por qué es propio de Colombia |
|---|---|
| **Tipo y número de documento** (CC, TI, CE, PA, RC, otro) | Son los tipos que usa el sistema de salud en el Registro Individual de Prestación de Servicios (RIPS, Resolución 3374 de 2000). El número se guarda sin puntos y se muestra con puntos de miles (`CC 1.020.304.050`), la costumbre local. Un mismo documento no puede repetirse. |
| **Fecha de nacimiento → edad** | La edad cambia la valoración (y determina si hace falta un representante legal, ver 3.3). Se muestra como día/mes/año. |
| **Celular de 10 dígitos que empieza por 3** (y fijos con indicativo 60) | Es el formato de los celulares colombianos (`3XX XXX XXXX`). Se acepta escribirlo con `+57`, espacios o guiones y se guarda normalizado. |
| **Botones «Llamar» y «WhatsApp»** | WhatsApp es el canal habitual con pacientes en Colombia. El mensaje precargado es genérico y **no incluye datos de salud**; el fisioterapeuta puede editarlo antes de enviarlo. Solo aparece con celulares (un fijo no tiene WhatsApp). |
| **EPS o aseguradora** (texto libre) | El aseguramiento en salud pasa por la EPS. Es texto libre porque el listado de EPS cambia con el tiempo; una lista cerrada quedaría desactualizada. |
| **Diagnóstico con código CIE-10** | El CIE-10 es la clasificación de diagnósticos que se reporta en Colombia (por ejemplo en el RIPS). Se validan la forma (`S82.2`) y se sugieren los códigos de fracturas del alcance del proyecto: S42.0 clavícula, S42.2 extremo superior del húmero, S52.0 extremo superior del cúbito, S72.4 extremo inferior del fémur, S82.0 rótula, S82.2 diáfisis de la tibia. |
| **Ciudad, ocupación, lado dominante, fecha de cirugía, contacto de emergencia** | Datos clínicos y operativos habituales de una ficha de fisioterapia: la ocupación orienta la meta funcional; el lado dominante, el pronóstico; el contacto de emergencia es necesario en tratamientos a distancia. |
| **Registro de la autorización de tratamiento de datos** (fecha, quién la registró, revocación) | La Ley 1581 de 2012 trata los datos de salud como **sensibles**. Ver 2. |
| **Foto opcional del paciente** | Es un dato personal (y, según el caso, biométrico). Es opcional, se reduce en el navegador antes de subirla (≈ 20 KB) y se puede quitar en cualquier momento. |
| **Umbrales de alerta configurables** | Los criterios de «sin actividad» y «compensaciones» son de ejemplo, no clínicos; cada fisioterapeuta los ajusta. |

Las validaciones son de **forma** (evitan errores de digitación). No comprueban que el documento, el teléfono o el
código existan.

## 2. Marco normativo (fuentes oficiales)

| Norma | Qué dice, en lo que nos toca | Fuente |
|---|---|---|
| **Ley 1581 de 2012** — protección de datos personales | Los datos relativos a la **salud** son *datos sensibles* (art. 5). Su tratamiento está prohibido salvo autorización **explícita** del titular u otra excepción legal (art. 6). La autorización debe ser previa, expresa e informada, y otorgarse por un medio que permita **consultarla después**. | [Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) |
| **Resolución 1995 de 1999** (MinSalud) — historia clínica | Define la historia clínica y establece su custodia, confidencialidad y conservación (en su texto original, mínimo 20 años desde la última atención). | [MinSalud](https://www.minsalud.gov.co/normatividad_nuevo/resoluci%C3%93n%201995%20de%201999.pdf) |
| **Resolución 839 de 2017** (MinSalud) | Modifica la Resolución 1995 de 1999 en lo relativo a la historia clínica y su conservación. **Revisa la versión vigente de los plazos de retención.** | [MinSalud](https://www.minsalud.gov.co/Normatividad_Nuevo/Resolucion%20No%20839%20de%202017.pdf) |
| **Resolución 2654 de 2019** (MinSalud) — telesalud y telemedicina | Fija disposiciones para la telesalud y parámetros para la telemedicina: uso de medios tecnológicos, calidad y seguridad de la atención y de la información. Entre sus principios está el **consentimiento informado**. Los prestadores deben registrarse y habilitar el servicio en la modalidad correspondiente. | [MinSalud](https://www.minsalud.gov.co/normatividad_nuevo/resoluci%C3%B3n%20no.%202654%20del%202019.pdf) |
| **Ley 528 de 1999** — ejercicio de la fisioterapia | Reglamenta la profesión y su ética. Para ejercer se requiere el título y la **tarjeta profesional** del Consejo Profesional Nacional de Fisioterapia. | [Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=66199) |
| **Ley 2015 de 2020** — historia clínica electrónica interoperable | Crea la interoperabilidad de la historia clínica electrónica, con plan de implementación por el Ministerio. A futuro, el intercambio de información clínica entre prestadores deberá seguir esa norma. | [Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=105472) |

## 3. Recomendaciones (lo que sigue, ordenado por prioridad)

### 3.1 Antes de usar la aplicación con pacientes reales
1. **Autenticación y control de acceso reales (Fase 5).** Hoy cualquiera que llegue a la API ve todo. Cada fisioterapeuta debe ver **solo a sus pacientes** y cada paciente **solo lo suyo**. Es el requisito de seguridad más importante.
2. **Registro de auditoría**: quién consultó o modificó datos de un paciente y cuándo. Es lo que permite demostrar un uso legítimo de datos sensibles.
3. **Política de tratamiento de datos personales y aviso de privacidad** (documento aparte, firmado por el paciente), con un canal para que el titular **consulte, corrija o pida suprimir** sus datos. El registro de la autorización que ya existe en la ficha es la evidencia; el documento es lo que se le presenta al paciente.
4. **Cifrado**: en tránsito (HTTPS obligatorio en producción) y en reposo (base de datos y copias de seguridad).
5. **Habilitación del servicio de telemedicina** de la clínica según la Resolución 2654 de 2019, y consentimiento informado específico para la modalidad a distancia.
6. **Asesoría jurídica** sobre si la clínica debe inscribir la base de datos ante la Superintendencia de Industria y Comercio (Registro Nacional de Bases de Datos) y sobre la conservación de la información (Resoluciones 1995/1999 y 839/2017).

### 3.2 Mejoras de producto con sentido colombiano
1. **Número de tarjeta profesional** del fisioterapeuta en su perfil y en el pie del informe (la Ley 528 la exige para ejercer) y **línea de firma** en el informe impreso.
2. **Orden médica y sesiones autorizadas por la EPS**: en muchos servicios la atención depende de una orden y de un número de sesiones autorizadas. Conviene registrarlas por paciente y avisar cuando se acaben (según el convenio de cada clínica).
3. **Exportación en el formato que usa la clínica** (por ejemplo, datos alineados con el RIPS: tipo y número de documento, diagnóstico CIE-10, fecha de atención).
4. **Recordatorios por WhatsApp** dentro de la aplicación (con plantilla aprobada) en lugar de abrir el chat manualmente.
5. **Tratamiento de pacientes menores** (ver 3.3) y de **pacientes que no usan un computador**: permitir que un acudiente los acompañe.

### 3.3 Menores de edad
Si el paciente tiene tarjeta de identidad (TI) o registro civil (RC), es menor de edad. La Ley 1581 tiene reglas especiales para los datos de niños, niñas y adolescentes: la autorización debe darla su **representante legal**. **Verifica el artículo aplicable con asesoría jurídica.** El siguiente paso técnico es registrar en la ficha quién otorga la autorización y su parentesco.

## 4. Lo que esta aplicación NO es

- **No es la historia clínica** de la clínica: las notas y las mediciones son un **seguimiento complementario**. La historia clínica sigue las Resoluciones 1995/1999 y 839/2017 y sus propios sistemas.
- **No es un dispositivo médico validado.** Las mediciones con cámara son estimaciones con margen de error (ver «Evidencia clínica» en la aplicación) y no reemplazan el goniómetro ni la valoración del fisioterapeuta.
- Los datos que trae la demostración (pacientes, documentos, teléfonos, EPS, fotos) son **ficticios**. Las fotos de ejemplo son ilustraciones, no personas.

### 3.4 Registros de movimiento (esqueleto y análisis de cada sesión)

Desde la migración 4 el sistema guarda, por sesión, un **registro de movimiento**: ángulos, visibilidad, alertas de postura y 12 puntos del cuerpo (un «esqueleto»). **No guarda video ni imágenes.** Aun así sigue siendo información de salud (muestra cómo se mueve una persona lesionada), así que se trata como dato **sensible**:

1. Incluirlo en el **consentimiento informado** y en la política de tratamiento de datos: qué se guarda, para qué (seguimiento clínico) y por cuánto tiempo.
2. Mismo control de acceso que el resto de la historia del paciente (Fase 5): hoy `GET /sessions/:id/trace` es público como toda la API.
3. **Política de retención**: definir cuánto tiempo se conservan los registros y borrarlos después (el análisis resumido puede conservarse más tiempo que el esqueleto).
4. **Subir el video real** (no implementado) exigiría consentimiento específico, almacenamiento cifrado, acceso auditado y retención propia; es un salto de riesgo mucho mayor que el esqueleto.
5. Si en el futuro se entrena un modelo propio con estos registros, requiere autorización expresa para ese fin y, de preferencia, datos sin identificar.

### 3.5 Recomendaciones automáticas del asistente

El asistente de recuperación (`ARQUITECTURA.md`, sección 14) genera orientación para el paciente y propuestas de ajuste para el fisioterapeuta. Para mantenerlo del lado seguro:

1. Es **orientación general con los datos del propio paciente**, no una indicación clínica: no define cargas, rangos ni plazos. Cada pantalla lo dice.
2. **Las decisiones sobre el plan son del fisioterapeuta**: las propuestas nunca se aplican solas y, al aplicarse, quedan en una nota clínica con el motivo (trazabilidad).
3. Es un sistema de reglas **sin envío de datos a terceros**. Antes de integrar un modelo de lenguaje habría que resolver consentimiento, transferencia de datos de salud a un proveedor, y revisión clínica de todo texto que se muestre.
4. Si se usa en una clínica real, los umbrales (`COACH`) deben validarlos los fisioterapeutas; los de hoy son orientativos.
