/** Configuración completa del paciente (el servidor la recibe entera). */
export const settingsOf = (p: any) => ({
  show_nutrients: p.show_nutrients,
  allow_self_measurements: p.allow_self_measurements,
  allow_body_photos: p.allow_body_photos,
  shared_indicators: p.shared_indicators,
  habits: p.habits,
});
