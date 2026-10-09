// Referencias citables. CADA entrada se verificó contra su registro original (PubMed vía NCBI E-utilities,
// o arXiv) en septiembre de 2026. `summary` solo dice lo que el resumen del artículo afirma; `limitation`
// dice lo que NO demuestra. Ninguno de estos estudios evalúa esta aplicación: respaldan el contexto clínico
// y técnico de las decisiones de diseño, no la eficacia del sistema.
//
// Si agregas una referencia: comprueba título, autores, año y cifras en el registro original y no infles
// las conclusiones. Un dato mal citado en un proyecto de grado es peor que no citar.

export const EVIDENCE = [
  {
    code: "cottrell2017",
    authors: "Cottrell MA, Galea OA, O'Leary SP, Hill AJ, Russell TG",
    year: 2017,
    title: "Real-time telerehabilitation for the treatment of musculoskeletal conditions is effective and comparable to standard practice: a systematic review and meta-analysis",
    source: "Clinical Rehabilitation, 31(5):625-638",
    kind: "revision_sistematica",
    topic: "telerrehabilitacion",
    pmid: "27141087",
    doi: "10.1177/0269215516645148",
    url: "https://pubmed.ncbi.nlm.nih.gov/27141087/",
    summary:
      "Revisión sistemática y metaanálisis de 13 estudios (1.520 participantes). Concluye que la telerrehabilitación en tiempo real parece efectiva y comparable a la atención convencional para mejorar la función física y el dolor en distintas condiciones musculoesqueléticas.",
    limitation:
      "Agrupa condiciones musculoesqueléticas variadas, no solo fracturas, y algunos análisis agrupados mostraron alta heterogeneidad. Evalúa telerrehabilitación en tiempo real con un profesional, no una app autónoma.",
  },
  {
    code: "dasilva2025",
    authors: "da Silva GG, de Araújo FX, Andriola AH, Pereira GC, Silva MF",
    year: 2025,
    title: "Telerehabilitation on the Physical and Functional Capacity of Traumatic Fractures of the Upper Limbs: A Systematic Review with Meta-Analysis",
    source: "International Journal of Telerehabilitation, 17(1):6667",
    kind: "revision_sistematica",
    topic: "fracturas",
    pmid: "40575141",
    doi: "10.63144/ijt.2025.6667",
    url: "https://pubmed.ncbi.nlm.nih.gov/40575141/",
    summary:
      "Revisión sistemática con metaanálisis de 3 ensayos clínicos aleatorizados (830 pacientes) con fracturas traumáticas de miembro superior. La telerrehabilitación parece tener efectos favorables sobre la capacidad funcional y la percepción del dolor, y efectos controvertidos sobre la fuerza de agarre.",
    limitation: "Solo 3 ensayos, por lo que la evidencia es limitada. No incluye fracturas de miembro inferior.",
  },
  {
    code: "challoumas2025",
    authors: "Challoumas D, Minhas H, Bagni S, Millar N",
    year: 2025,
    title: "Early versus delayed mobilisation for non-surgically treated proximal humerus fractures: a systematic review and meta-analysis of randomised trials",
    source: "BMC Musculoskeletal Disorders, 26(1):203",
    kind: "revision_sistematica",
    topic: "fracturas",
    pmid: "40016664",
    doi: "10.1186/s12891-025-08371-y",
    url: "https://pubmed.ncbi.nlm.nih.gov/40016664/",
    summary:
      "Metaanálisis de 6 ensayos aleatorizados (470 pacientes) con fracturas de húmero proximal tratadas sin cirugía. Empezar a movilizar dentro de la primera semana fue seguro y pudo dar un beneficio funcional a corto plazo (3 meses) frente a la movilización tardía, después de 3 o 4 semanas de inmovilización.",
    limitation:
      "Pocos estudios agrupados y sin análisis por tipo de fractura. Cuándo empezar a mover el hombro lo decide siempre el equipo tratante; este estudio no es una autorización.",
  },
  {
    code: "mehta2024",
    authors: "Mehta SP, Karagiannopoulos C, Pepin ME, Ballantyne BT, Michlovitz S, MacDermid JC, Grewal R, Martin RL",
    year: 2024,
    title: "Distal Radius Fracture Rehabilitation",
    source: "Journal of Orthopaedic & Sports Physical Therapy, 54(9):CPG1-CPG78",
    kind: "guia_clinica",
    topic: "fracturas",
    pmid: "39213418",
    doi: "10.2519/jospt.2024.0301",
    url: "https://pubmed.ncbi.nlm.nih.gov/39213418/",
    summary:
      "Guía de práctica clínica para el manejo de la fractura de radio distal por fisioterapeutas y terapeutas de mano. Sintetiza la evidencia disponible sobre pronóstico, evaluación e intervenciones y gradúa la fuerza de cada recomendación.",
    limitation:
      "Es una guía dirigida a profesionales: las recomendaciones dependen de la fuerza de la evidencia de cada tema. No sustituye la valoración individual.",
  },
  {
    code: "zhou2024",
    authors: "Zhou Z, et al.",
    year: 2024,
    title: "Impact of early rehabilitation therapy on functional outcomes in patients post distal radius fracture surgery: a systematic review and meta-analysis",
    source: "BMC Musculoskeletal Disorders, 25(1):198",
    kind: "revision_sistematica",
    topic: "fracturas",
    pmid: "38443916",
    doi: "10.1186/s12891-024-07317-0",
    url: "https://pubmed.ncbi.nlm.nih.gov/38443916/",
    summary:
      "Metaanálisis de 7 estudios. Tras cirugía de radio distal con placa palmar, la rehabilitación temprana mejoró la función del miembro superior y redujo el dolor, sin diferencias significativas en la función de la muñeca ni en las complicaciones.",
    limitation: "Aplica a la cirugía con placa palmar; son pocos estudios de diseño diverso.",
  },
  {
    code: "wang2025",
    authors: "Wang C, Li C",
    year: 2025,
    title: "Early weight-bearing after ankle fracture surgery: a systematic review and meta-analysis of functional outcomes and safety",
    source: "Journal of Orthopaedic Surgery and Research, 20(1):785",
    kind: "revision_sistematica",
    topic: "fracturas",
    pmid: "40841661",
    doi: "10.1186/s13018-025-06216-x",
    url: "https://pubmed.ncbi.nlm.nih.gov/40841661/",
    summary:
      "Metaanálisis de 12 estudios (1.847 participantes). En fracturas de tobillo operadas, cargar peso de forma temprana (en 2 semanas o menos) se asoció con menos dolor, mayor dorsiflexión y una seguridad equivalente frente a la carga tardía. Las lesiones sindesmóticas y la diabetes requieren valoración individual.",
    limitation: "La carga de peso depende de la indicación del cirujano: este estudio no autoriza a cargar por cuenta propia.",
  },
  {
    code: "bazarevsky2020",
    authors: "Bazarevsky V, Grishchenko I, Raveendran K, Zhu T, Zhang F, Grundmann M",
    year: 2020,
    title: "BlazePose: On-device Real-time Body Pose tracking",
    source: "arXiv:2006.10204",
    kind: "articulo_tecnico",
    topic: "medicion",
    pmid: null,
    doi: null,
    url: "https://arxiv.org/abs/2006.10204",
    summary:
      "Describe BlazePose, una red neuronal convolucional ligera que estima 33 puntos del cuerpo de una persona y corre a más de 30 cuadros por segundo en un teléfono. Es la familia de modelos en la que se basa MediaPipe Pose, que usa esta aplicación.",
    limitation: "Es un artículo técnico, no un estudio clínico: no valida mediciones de ángulos articulares en pacientes.",
  },
  {
    code: "russo2026",
    authors: "Russo M, Ricciardi C, Romano M, Santoriello V, Ponsiglione AM, Amato F, Spadea MF",
    year: 2026,
    title: "Estimation of the Knee Joint with Single-Camera Smartphone",
    source: "Sensors (Basel), 26(7):2148",
    kind: "estudio_validacion",
    topic: "medicion",
    pmid: "41977932",
    doi: "10.3390/s26072148",
    url: "https://pubmed.ncbi.nlm.nih.gov/41977932/",
    summary:
      "En 27 voluntarios sanos, una sola cámara de teléfono con MediaPipe midió la flexión de rodilla con un error absoluto medio de unos 3 a 4° frente a sensores portátiles, y el rango de movimiento de la rodilla con unos 4 a 5°. En el tobillo la concordancia fue pobre.",
    limitation:
      "Voluntarios sanos y marcha, no pacientes con fractura ni ejercicios de rehabilitación. Es coherente con medir con cámara solo rodilla, codo y hombro, y dejar el tobillo como ejercicio guiado sin medición.",
  },
  {
    code: "kusunose2023",
    authors: "Kusunose M, Inui A, Nishimoto H, Mifune Y, Yoshikawa T, Shinohara I, Furukawa T, Kato T, Tanaka S, Kuroda R",
    year: 2023,
    title: "Measurement of Shoulder Abduction Angle with Posture Estimation Artificial Intelligence Model",
    source: "Sensors (Basel), 23(14):6445",
    kind: "estudio_validacion",
    topic: "medicion",
    pmid: "37514738",
    doi: "10.3390/s23146445",
    url: "https://pubmed.ncbi.nlm.nih.gov/37514738/",
    summary:
      "En 10 voluntarios sanos, MediaPipe combinado con un modelo de aprendizaje automático (LightGBM) estimó el ángulo de abducción del hombro frente al goniómetro con R² = 0,988 y un error porcentual medio absoluto de 1,5 %, incluso con la cámara en diagonal.",
    limitation:
      "Voluntarios sanos, abducción (no flexión) y con un modelo entrenado sobre los puntos del cuerpo. Sugiere que entrenar un modelo propio sobre los landmarks puede mejorar la medición, algo que esta aplicación todavía no hace.",
  },
  {
    code: "barzegar2024",
    authors: "Barzegar Khanghah A, Fernie G, Roshan Fekr A",
    year: 2024,
    title: "Joint angle estimation during shoulder abduction exercise using contactless technology",
    source: "BioMedical Engineering OnLine, 23(1):11",
    kind: "estudio_validacion",
    topic: "medicion",
    pmid: "38281988",
    doi: "10.1186/s12938-024-01203-5",
    url: "https://pubmed.ncbi.nlm.nih.gov/38281988/",
    summary:
      "En 14 participantes, un sistema con cámara de profundidad (LiDAR) y seguimiento de esqueleto estimó ángulos del hombro con fuerte correlación frente a captura de movimiento. Otro sistema superó a MediaPipe en precisión, la precisión bajó al aumentar la distancia a la cámara y la calibración personalizada mejoró el rendimiento.",
    limitation:
      "Usa cámara de profundidad; con una cámara web común (2D) el error puede ser mayor. Apoya calibrar el reposo del paciente y no alejarse demasiado de la cámara.",
  },
  {
    code: "soucie2011",
    authors: "Soucie JM, Wang C, Forsyth A, Funk S, Denny M, Roach KE, Boone D",
    year: 2011,
    title: "Range of motion measurements: reference values and a database for comparison studies",
    source: "Haemophilia, 17(3):500-507",
    kind: "estudio_validacion",
    topic: "medicion",
    pmid: "21070485",
    doi: "10.1111/j.1365-2516.2010.02399.x",
    url: "https://pubmed.ncbi.nlm.nih.gov/21070485/",
    summary:
      "En 674 personas sanas de 2 a 69 años, fisioterapeutas midieron con goniómetro el rango de movimiento pasivo de codo, hombro, cadera, rodilla y tobillo. El rango varió con la edad y el sexo, y en la mayoría de los casos difirió de los valores normativos más usados.",
    limitation:
      "Personas sanas y medición pasiva con goniómetro. Por eso las metas de movimiento de esta aplicación las fija el fisioterapeuta para cada paciente, en lugar de usar un único valor «normal».",
  },
  {
    code: "jack2010",
    authors: "Jack K, McLean SM, Moffett JK, Gardiner E",
    year: 2010,
    title: "Barriers to treatment adherence in physiotherapy outpatient clinics: a systematic review",
    source: "Manual Therapy, 15(3):220-228",
    kind: "revision_sistematica",
    topic: "adherencia",
    pmid: "20163979",
    doi: "10.1016/j.math.2009.12.004",
    url: "https://pubmed.ncbi.nlm.nih.gov/20163979/",
    summary:
      "Revisión sistemática de 20 estudios de alta calidad en fisioterapia ambulatoria musculoesquelética. Hay evidencia sólida de que la baja adherencia se asocia con poca actividad física previa, baja adherencia al ejercicio durante el tratamiento, baja autoeficacia, depresión, ansiedad, sensación de impotencia, poco apoyo social, más barreras percibidas y más dolor durante el ejercicio.",
    limitation:
      "Describe asociaciones centradas en factores del paciente. No demuestra que una aplicación o un recordatorio mejore la adherencia.",
  },
];
