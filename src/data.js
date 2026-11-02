const COLS = [40, 300, 560, 860, 1140];

export const STORAGE_KEY = 'er-aztlan-editable-v1';
export const EXTRA_HUES = [190, 110, 0, 270, 45, 340, 130, 215];

export function defaultDiagram() {
  const groups = [
    { id: 'seg', name: 'Seguridad', hue: 25 },
    { id: 'auth', name: 'Autenticación', hue: 70 },
    { id: 'cat', name: 'Catálogo', hue: 150 },
    { id: 'inv', name: 'Inventario', hue: 240 },
    { id: 'ia', name: 'Asistente IA', hue: 305 },
  ];
  const ents = [
    ['roles', 'Rol', 'seg', 2, 40], ['users', 'Usuario', 'seg', 2, 200],
    ['refresh_tokens', 'Token de sesión', 'auth', 3, 40], ['password_reset_tokens', 'Token de recuperación', 'auth', 4, 40],
    ['email_outbox', 'Cola de correos', 'auth', 4, 250], ['auth_events', 'Evento de autenticación', 'auth', 3, 300],
    ['assistant_interactions', 'Interacción IA', 'ia', 0, 400], ['assistant_function_calls', 'Llamada a función IA', 'ia', 1, 400],
    ['movement_headers', 'Movimiento', 'inv', 2, 400], ['warehouses', 'Almacén', 'cat', 3, 400],
    ['movement_lines', 'Línea de movimiento', 'inv', 2, 570], ['stock', 'Existencia', 'inv', 4, 570],
    ['assets', 'Activo / destino', 'cat', 2, 740], ['products', 'Producto', 'cat', 3, 740],
    ['product_categories', 'Categoría de producto', 'cat', 4, 740], ['units', 'Unidad de medida', 'cat', 3, 910],
  ].map(([id, es, g, c, y]) => ({ id, es, g, x: COLS[c], y }));
  // a = tabla con la FK (lado muchos), b = tabla referenciada (lado uno)
  const rels = [
    ['users', 'roles'], ['refresh_tokens', 'users'], ['refresh_tokens', 'refresh_tokens', 1], ['password_reset_tokens', 'users'],
    ['email_outbox', 'users', 1], ['email_outbox', 'password_reset_tokens', 1], ['auth_events', 'users', 1],
    ['product_categories', 'product_categories', 1], ['units', 'units', 1],
    ['products', 'product_categories'], ['products', 'units'], ['stock', 'products'], ['stock', 'warehouses'],
    ['movement_headers', 'users'], ['movement_headers', 'warehouses', 1, 'origen'], ['movement_headers', 'warehouses', 1, 'destino'],
    ['movement_lines', 'movement_headers'], ['movement_lines', 'products'], ['movement_lines', 'assets', 1],
    ['assistant_interactions', 'users'], ['assistant_function_calls', 'assistant_interactions'], ['assistant_function_calls', 'movement_headers', 1],
  ].map(([a, b, opt, lab]) => ({ a, b, opt: !!opt, lab: lab || '' }));
  return { groups, ents, rels };
}

export function loadDiagram() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.ents) return saved;
  } catch {}
  return defaultDiagram();
}
