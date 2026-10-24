// Cuestionario previo base (preguntas fijas). La profesional puede sumar preguntas propias.
export const BASE_QUESTIONS: { key: string; label: string; hint?: string }[] = [
  { key: 'motivo', label: '¿Por qué consultás? ¿Qué te gustaría lograr?' },
  { key: 'antecedentes', label: 'Enfermedades, cirugías o problemas de salud (tuyos)' },
  { key: 'antecedentes_familiares', label: 'Enfermedades en tu familia directa (diabetes, colesterol, presión, etc.)' },
  { key: 'alergias', label: 'Alergias o intolerancias alimentarias', hint: 'Por ejemplo: celiaquía, lactosa, maní. Si no tenés, escribí "ninguna".' },
  { key: 'medicacion', label: 'Medicación y suplementos que tomás' },
  { key: 'preferencias', label: 'Alimentos que te gustan y preparaciones habituales' },
  { key: 'rechazos', label: 'Alimentos que no comés o no te gustan' },
  { key: 'horarios', label: 'Horarios habituales (trabajo, estudio, comidas, sueño)' },
  { key: 'actividad', label: 'Actividad física: tipo, frecuencia y duración' },
  { key: 'contexto', label: '¿Quién cocina y dónde comés habitualmente? ¿Comprás vos?' },
  { key: 'agua', label: '¿Cuánta agua y otras bebidas tomás por día?' },
];

export const RECALL_KEY = 'recordatorio_24h';

export const CLINICAL_FIELDS: { key: string; label: string }[] = [
  { key: 'motivo', label: 'Motivo de consulta' },
  { key: 'objetivos', label: 'Objetivos' },
  { key: 'antecedentes_personales', label: 'Antecedentes personales' },
  { key: 'antecedentes_familiares', label: 'Antecedentes familiares' },
  { key: 'alergias_detalle', label: 'Alergias (detalle)' },
  { key: 'intolerancias', label: 'Intolerancias' },
  { key: 'restricciones', label: 'Restricciones (religiosas, éticas, económicas, otras)' },
  { key: 'medicacion', label: 'Medicación' },
  { key: 'suplementos', label: 'Suplementos que ya consume' },
  { key: 'preferencias', label: 'Preferencias alimentarias' },
  { key: 'alimentos_rechazados', label: 'Alimentos rechazados' },
  { key: 'habitos', label: 'Hábitos (sueño, alcohol, tabaco, picoteo, etc.)' },
  { key: 'horarios', label: 'Horarios' },
  { key: 'actividad_fisica', label: 'Actividad física' },
  { key: 'contexto', label: 'Contexto alimentario (quién cocina, compras, comidas fuera)' },
  { key: 'otros', label: 'Otros' },
];
