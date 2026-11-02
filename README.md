# Diagrama Entidad-Relación conceptual

Proyecto React + Vite gestionado con pnpm.

## Uso

```bash
pnpm install
pnpm dev       # servidor de desarrollo en http://localhost:5173
pnpm build     # build de producción en dist/
pnpm preview   # previsualiza el build
```

## Estructura

- `src/ERDiagram.jsx` — lienzo infinito del diagrama (zoom, paneo, selección múltiple y por área, arrastrar, editar tablas, relaciones y grupos).
- `src/data.js` — datos iniciales (grupos, entidades, relaciones) y persistencia en localStorage.
- `src/main.jsx` — punto de entrada.

## Props de `<ERDiagram />`

- `labelMode`: `"Español + tabla"` | `"Solo español"` | `"Solo tabla"`
- `colorByGroup`: `true` | `false`

## Controles del lienzo

- **Rueda**: desplazar · **Ctrl + rueda** (o pellizco en trackpad): zoom hacia el cursor
- **Espacio + arrastrar** o **botón central**: mover el lienzo
- **Clic**: seleccionar · **Ctrl/Shift + clic**: añadir o quitar de la selección
- **Arrastrar en vacío**: selección por área (con Ctrl/Shift se suma a la selección)
- **Arrastrar una tabla seleccionada**: mueve toda la selección
- **Ctrl 0** 100% · **Ctrl +/-** zoom · **Shift 1** ajustar todo · **Shift 2** enfocar selección
- **Ctrl A** seleccionar todo · **Supr** eliminar · **Flechas** mover selección · **Esc** deseleccionar
