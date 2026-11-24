// Colores de la presentación, compartidos por las escenas 3D (que necesitan
// valores concretos) y por css/deck.css, que define los mismos con nombre en
// :root. Si se cambia uno, se cambia en los dos sitios.
export const PALETA = {
  fondo: 0xf5f5f7,      // --c-fondo: fondo de las diapositivas (gris Apple)
  superficie: 0xffffff, // --c-superficie: paneles y tarjetas
  tinta: 0x1d1d1f,      // --c-tinta: texto principal
  tenue: 0x6e6e73,      // --c-tenue: texto secundario, ejes
  linea: 0xd2d2d7,      // --c-linea: bordes y rejillas
  acento: 0x0071e3,     // --c-acento: lo que está «en vivo» y el candidato correcto
  ok: 0x248a3d,         // --c-ok: byte recuperado, resultado positivo (texto)
  okVivo: 0x34c759,     // --c-ok-vivo: rellenos y puntos de lo positivo
  mal: 0xd70015,        // --c-mal: error, con mucha moderación
  // La placa CW1101 real (fotos en figuras/nano-*.jpg): máscara negra azulada
  // mate, serigrafía blanca y pads de oro (ENIG). El negro va algo levantado
  // a propósito: un proyector se come los negros y la placa sería una mancha.
  pcb: 0x262e3a,
  serigrafia: 0xf2f2f2,
  oro: 0xd9a441,
};

export const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
