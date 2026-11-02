import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultDiagram, loadDiagram, STORAGE_KEY, EXTRA_HUES } from './data.js';

const W = 200, H = 52, INK = '#3a3d42', CANVAS = '#fdfcfa', SELECT = '#0d99ff';
const MONO = "'IBM Plex Mono', monospace";
const SANS = "'IBM Plex Sans', sans-serif";
const MIN_Z = 0.1, MAX_Z = 4, PANEL_W = 320;
const sp = { stroke: INK, strokeWidth: 1.5, fill: 'none' };

const GlyphOne = () => <path d="M-7,-7V7M-13,-7V7" {...sp} />;
const GlyphZeroOne = () => (<><path d="M-7,-7V7" {...sp} /><circle cx={-17} cy={0} r={4} {...sp} fill={CANVAS} /></>);
const GlyphZeroMany = () => (<><path d="M0,-8L-12,0L0,8M-12,0H0" {...sp} /><circle cx={-18} cy={0} r={4} {...sp} fill={CANVAS} /></>);

function Marker({ id, children }) {
  return (
    <marker id={id} viewBox="-26 -10 28 20" refX={0} refY={0} markerWidth={28} markerHeight={20} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      {children}
    </marker>
  );
}

function LegendGlyph({ children }) {
  return (
    <svg width={56} height={20} viewBox="0 -10 56 20" style={{ flexShrink: 0 }}>
      <line x1={0} y1={0} x2={40} y2={0} stroke={INK} strokeWidth={1.5} />
      <rect x={40} y={-9} width={14} height={18} fill="#fff" stroke={INK} strokeWidth={1.5} rx={2} />
      <g transform="translate(40,0)">{children}</g>
    </svg>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid #e3e1dc', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  title: { fontSize: 14, fontWeight: 600 },
  label: { fontSize: 12, color: '#6b6e73' },
  input: { height: 34, padding: '0 10px', border: '1px solid #d6d3cd', borderRadius: 6, fontSize: 14 },
  select: { height: 34, padding: '0 8px', border: '1px solid #d6d3cd', borderRadius: 6, fontSize: 14, background: '#fff' },
  primary: { height: 34, border: 'none', background: '#1d1f22', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  float: { position: 'absolute', background: '#fff', border: '1px solid #e3e1dc', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.06)' },
  tool: { height: 30, minWidth: 30, padding: '0 8px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#1d1f22' },
};

function exitPoint(px, py, dx, dy, rx, ry) {
  const tx = dx > 0 ? (rx + W - px) / dx : dx < 0 ? (rx - px) / dx : Infinity;
  const ty = dy > 0 ? (ry + H - py) / dy : dy < 0 ? (ry - py) / dy : Infinity;
  const t = Math.min(tx, ty);
  return [px + dx * t, py + dy * t];
}

const clampZ = (z) => Math.min(MAX_Z, Math.max(MIN_Z, z));
const snap = (v) => Math.round(v / 10) * 10;
const isTyping = () => ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
const isAdditive = (ev) => ev.ctrlKey || ev.metaKey || ev.shiftKey;

export default function ERDiagram({ labelMode = 'Español + tabla', colorByGroup = true }) {
  const [diagram, setDiagram] = useState(loadDiagram);
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState([]);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [box, setBox] = useState(null); // rectángulo de selección en coordenadas de pantalla
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [nt, setNt] = useState({ id: '', es: '', g: 'seg' });
  const [nr, setNr] = useState({ a: '', b: '', opt: false, lab: '' });
  const [ng, setNg] = useState('');
  const [err, setErr] = useState('');
  const vpRef = useRef(null);
  const spaceRef = useRef(false);
  const keyRef = useRef(null);

  const { groups: G, ents: E, rels: R } = diagram;
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram)); } catch {}
  }, [diagram]);

  const update = (fn) => setDiagram((d) => ({ ...d, ...fn(d) }));
  const gmap = Object.fromEntries(G.map((g) => [g.id, g]));
  const pos = Object.fromEntries(E.map((e) => [e.id, e]));
  const selSet = new Set(sel);
  const RR = R.filter((r) => pos[r.a] && pos[r.b]);
  const related = new Set(hover ? [hover] : []);
  if (hover) RR.forEach(({ a, b }) => { if (a === hover) related.add(b); if (b === hover) related.add(a); });

  const colors = (gid) => {
    const hue = (gmap[gid] || { hue: 0 }).hue;
    return colorByGroup
      ? { color: `oklch(0.55 0.13 ${hue})`, tint: `oklch(0.97 0.025 ${hue})`, ink: `oklch(0.42 0.1 ${hue})` }
      : { color: INK, tint: '#ffffff', ink: '#6b6e73' };
  };

  // Desplazamiento de relaciones paralelas entre el mismo par de tablas
  const pairCount = {}, pairIdx = [];
  RR.forEach((r) => { const k = [r.a, r.b].sort().join('|'); pairIdx.push(pairCount[k] || 0); pairCount[k] = (pairCount[k] || 0) + 1; });

  // ---- Vista: zoom y desplazamiento ----
  const zoomAt = (px, py, factor) => setView((v) => {
    const z = clampZ(v.z * factor);
    return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z };
  });
  const zoomCenter = (factor) => {
    const r = vpRef.current.getBoundingClientRect();
    zoomAt((r.width - (panelOpen ? PANEL_W + 32 : 0)) / 2, r.height / 2, factor);
  };
  const fit = (list = E) => {
    const r = vpRef.current.getBoundingClientRect();
    if (!list.length) return setView({ x: 0, y: 0, z: 1 });
    const minX = Math.min(...list.map((e) => e.x)), minY = Math.min(...list.map((e) => e.y));
    const maxX = Math.max(...list.map((e) => e.x + W)), maxY = Math.max(...list.map((e) => e.y + H));
    const availW = r.width - (panelOpen ? PANEL_W + 32 : 0), top = 110, pad = 60;
    const z = clampZ(Math.min((availW - pad * 2) / (maxX - minX), (r.height - top - pad) / (maxY - minY), 1.5));
    setView({ z, x: (availW - (maxX - minX) * z) / 2 - minX * z, y: top + (r.height - top - pad - (maxY - minY) * z) / 2 - minY * z });
  };
  useLayoutEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rueda: desplaza; Ctrl/⌘ + rueda (o pellizco en trackpad): zoom hacia el cursor
  useEffect(() => {
    const el = vpRef.current;
    const onWheel = (ev) => {
      ev.preventDefault();
      const k = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      const dx = ev.deltaX * k, dy = ev.deltaY * k;
      if (ev.ctrlKey || ev.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-dy * 0.01));
      } else if (ev.shiftKey && !dx) {
        setView((v) => ({ ...v, x: v.x - dy }));
      } else {
        setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Teclado ----
  const deleteSelected = () => {
    const del = new Set(sel);
    update((d) => ({ ents: d.ents.filter((n) => !del.has(n.id)), rels: d.rels.filter((r) => !del.has(r.a) && !del.has(r.b)) }));
    setSel([]); setHover(null);
  };
  keyRef.current = (ev) => {
    if (isTyping()) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (ev.code === 'Space') { ev.preventDefault(); if (!spaceRef.current) { spaceRef.current = true; setSpace(true); } return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.length) { ev.preventDefault(); deleteSelected(); }
    else if (ev.key === 'Escape') setSel([]);
    else if (mod && ev.key.toLowerCase() === 'a') { ev.preventDefault(); setSel(E.map((e) => e.id)); }
    else if (mod && ev.key === '0') { ev.preventDefault(); zoomCenter(1 / view.z); }
    else if (mod && (ev.key === '=' || ev.key === '+')) { ev.preventDefault(); zoomCenter(1.25); }
    else if (mod && ev.key === '-') { ev.preventDefault(); zoomCenter(0.8); }
    else if (ev.shiftKey && ev.code === 'Digit1') fit();
    else if (ev.shiftKey && ev.code === 'Digit2' && sel.length) fit(E.filter((e) => selSet.has(e.id)));
    else if (ev.key.startsWith('Arrow') && sel.length) {
      ev.preventDefault();
      const step = ev.shiftKey ? 50 : 10;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
      update((d) => ({ ents: d.ents.map((n) => (selSet.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }));
    }
  };
  useEffect(() => {
    const down = (ev) => keyRef.current(ev);
    const up = (ev) => { if (ev.code === 'Space') { spaceRef.current = false; setSpace(false); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const drag = (ev, onMove, onUp) => {
    const sx = ev.clientX, sy = ev.clientY;
    let moved = false;
    const move = (m) => {
      const dx = m.clientX - sx, dy = m.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      onMove(dx, dy, m);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      onUp(moved);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ---- Lienzo: paneo (espacio o botón central) y selección por área ----
  const onCanvasMouseDown = (ev) => {
    if (ev.button === 1 || (ev.button === 0 && spaceRef.current)) {
      ev.preventDefault();
      const v0 = view;
      setPanning(true);
      drag(ev, (dx, dy) => setView({ ...v0, x: v0.x + dx, y: v0.y + dy }), () => setPanning(false));
      return;
    }
    if (ev.button !== 0) return;
    ev.preventDefault();
    if (isTyping()) document.activeElement.blur();
    const r = vpRef.current.getBoundingClientRect();
    const x0 = ev.clientX - r.left, y0 = ev.clientY - r.top;
    const additive = isAdditive(ev), base = additive ? sel : [];
    drag(ev, (dx, dy) => {
      const b = { x: Math.min(x0, x0 + dx), y: Math.min(y0, y0 + dy), w: Math.abs(dx), h: Math.abs(dy) };
      setBox(b);
      const wx1 = (b.x - view.x) / view.z, wy1 = (b.y - view.y) / view.z;
      const wx2 = wx1 + b.w / view.z, wy2 = wy1 + b.h / view.z;
      const hits = E.filter((e) => e.x < wx2 && e.x + W > wx1 && e.y < wy2 && e.y + H > wy1).map((e) => e.id);
      setSel([...new Set([...base, ...hits])]);
    }, (moved) => {
      setBox(null);
      if (!moved && !additive) setSel([]);
    });
  };

  // ---- Entidades: clic selecciona, Ctrl/Shift+clic alterna, arrastrar mueve toda la selección ----
  const onEntityMouseDown = (id) => (ev) => {
    if (ev.button !== 0 || spaceRef.current) return; // deja que el lienzo haga el paneo
    ev.preventDefault();
    ev.stopPropagation();
    if (isTyping()) document.activeElement.blur();
    const additive = isAdditive(ev), was = selSet.has(id);
    const moving = was ? sel : additive ? [...sel, id] : [id];
    if (!was) setSel(moving);
    const start = Object.fromEntries(E.filter((n) => moving.includes(n.id)).map((n) => [n.id, [n.x, n.y]]));
    const z = view.z;
    drag(ev, (dx, dy) => {
      update((d) => ({ ents: d.ents.map((n) => (start[n.id] ? { ...n, x: snap(start[n.id][0] + dx / z), y: snap(start[n.id][1] + dy / z) } : n)) }));
    }, (moved) => {
      if (moved) return;
      if (additive && was) setSel(sel.filter((x) => x !== id));
      else if (!additive) setSel([id]);
      setErr('');
    });
  };

  // Lugar libre cerca del centro de la vista actual
  const freeSpot = () => {
    const r = vpRef.current.getBoundingClientRect();
    const cx = snap(((r.width - (panelOpen ? PANEL_W + 32 : 0)) / 2 - view.x) / view.z - W / 2);
    const cy = snap((r.height / 2 - view.y) / view.z - H / 2);
    for (let ring = 0; ring < 12; ring++)
      for (let i = -ring; i <= ring; i++)
        for (const [ox, oy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
          const x = cx + ox * 260, y = cy + oy * 130;
          if (!E.some((e) => Math.abs(e.x - x) < W + 20 && Math.abs(e.y - y) < H + 40)) return { x, y };
        }
    return { x: cx, y: cy };
  };

  const addTable = () => {
    const id = nt.id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!id) return setErr('Escribe el nombre de la tabla.');
    if (pos[id]) return setErr(`La tabla "${id}" ya existe.`);
    update((d) => ({ ents: [...d.ents, { id, es: nt.es.trim() || id, g: nt.g || G[0].id, ...freeSpot() }] }));
    setNt({ id: '', es: '', g: nt.g }); setErr(''); setSel([id]);
  };
  const addRel = () => {
    if (!nr.a || !nr.b) return setErr('Elige ambas tablas de la relación.');
    update((d) => ({ rels: [...d.rels, { a: nr.a, b: nr.b, opt: nr.opt, lab: nr.lab.trim() }] }));
    setNr({ a: '', b: '', opt: false, lab: '' }); setErr('');
  };
  const addGroup = () => {
    const name = ng.trim();
    if (!name) return setErr('Escribe el nombre del grupo.');
    if (G.some((g) => g.name.toLowerCase() === name.toLowerCase())) return setErr('Ese grupo ya existe.');
    update((d) => ({ groups: [...d.groups, { id: 'g' + Date.now(), name, hue: EXTRA_HUES[(d.groups.length - 5 + EXTRA_HUES.length) % EXTRA_HUES.length] }] }));
    setNg(''); setErr('');
  };
  const setSelectedGroup = (g) => update((d) => ({ ents: d.ents.map((n) => (selSet.has(n.id) ? { ...n, g } : n)) }));
  const reset = () => { setDiagram(defaultDiagram()); setSel([]); setHover(null); setErr(''); };

  const one = sel.length === 1 ? sel[0] : null;
  const selE = one && pos[one];
  const selRels = selE ? R.map((r, i) => ({ r, i })).filter(({ r }) => r.a === one || r.b === one) : [];
  const toggleBtn = (active) => ({ flex: 1, height: 32, border: '1px solid #1d1f22', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: active ? '#1d1f22' : '#fff', color: active ? '#fff' : '#1d1f22' });

  // Rejilla de puntos que se adapta al zoom
  let grid = 20;
  while (grid * view.z < 12) grid *= 2;
  const gs = grid * view.z;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div ref={vpRef} onMouseDown={onCanvasMouseDown} onAuxClick={(ev) => ev.preventDefault()}
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', background: CANVAS,
          backgroundImage: 'radial-gradient(circle, #d9d6cf 1px, transparent 1.2px)',
          backgroundSize: `${gs}px ${gs}px`, backgroundPosition: `${view.x}px ${view.y}px`,
          cursor: panning ? 'grabbing' : space ? 'grab' : 'default',
        }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <Marker id="m-one"><GlyphOne /></Marker>
              <Marker id="m-zo"><GlyphZeroOne /></Marker>
              <Marker id="m-zm"><GlyphZeroMany /></Marker>
            </defs>
            {RR.map((r, i) => {
              const { a, b, opt, lab } = r;
              const on = !hover || a === hover || b === hover;
              const common = { ...sp, markerStart: 'url(#m-zm)', markerEnd: opt ? 'url(#m-zo)' : 'url(#m-one)' };
              const A = pos[a], B = pos[b];
              const n = pairCount[[a, b].sort().join('|')], k = pairIdx[i];
              const gProps = { key: i, opacity: on ? 1 : 0.12, style: { transition: 'opacity .15s' } };
              if (a === b) {
                const x = A.x + W, y = A.y, out = 46 + k * 20;
                return <g {...gProps}><path {...common} d={`M${x},${y + 12}H${x + out}V${y + 40}H${x}`} /></g>;
              }
              const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
              const sgn = a < b ? 1 : -1;
              const off = (k - (n - 1) / 2) * 20 * sgn;
              const nx = (-dy / len) * off, ny = (dx / len) * off;
              const [x1, y1] = exitPoint(A.x + W / 2 + nx, A.y + H / 2 + ny, dx, dy, A.x, A.y);
              const [x2, y2] = exitPoint(B.x + W / 2 + nx, B.y + H / 2 + ny, -dx, -dy, B.x, B.y);
              const side = (off < 0 ? -1 : 1) * sgn;
              return (
                <g {...gProps}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
                  {lab && (
                    <text x={(x1 + x2) / 2 + (-dy / len) * 9 * side} y={(y1 + y2) / 2 + (dx / len) * 9 * side + 4} textAnchor="middle"
                      fontFamily={MONO} fontSize={10} fill="#4a4d52" stroke={CANVAS} strokeWidth={3} paintOrder="stroke">{lab}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {E.map((e) => {
            const c = colors(e.g);
            const picked = selSet.has(e.id);
            return (
              <div key={e.id} onMouseDown={onEntityMouseDown(e.id)} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
                style={{
                  position: 'absolute', left: e.x, top: e.y, width: W, height: H, boxSizing: 'border-box',
                  border: `1.5px solid ${c.color}`, background: c.tint, borderRadius: 6,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 1,
                  opacity: !hover || related.has(e.id) ? 1 : 0.25,
                  boxShadow: picked ? `0 0 0 ${2 / view.z}px ${SELECT}` : 'none',
                  transition: 'opacity .15s', cursor: space ? 'inherit' : 'grab', userSelect: 'none',
                }}>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: labelMode === 'Solo tabla' ? MONO : SANS }}>
                  {labelMode === 'Solo tabla' ? e.id : e.es}
                </div>
                {labelMode === 'Español + tabla' && <div style={{ fontFamily: MONO, fontSize: 11, color: c.ink }}>{e.id}</div>}
              </div>
            );
          })}
        </div>

        {box && (
          <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, border: `1px solid ${SELECT}`, background: 'rgba(13,153,255,.08)', pointerEvents: 'none' }} />
        )}
      </div>

      <header style={{ ...s.float, left: 16, top: 16, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 'calc(100% - 32px - 352px)' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b6e73' }}>inventario_aztlan · PostgreSQL</div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Diagrama Entidad-Relación conceptual</h1>
        <div style={{ fontSize: 12, color: '#4a4d52' }}>{E.length} entidades · {RR.length} relaciones · notación pata de gallo (Crow's Foot)</div>
      </header>

      <div style={{ ...s.float, left: 16, bottom: 16, padding: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <button style={s.tool} title="Alejar (Ctrl -)" onClick={() => zoomCenter(0.8)}>−</button>
        <button style={{ ...s.tool, fontFamily: MONO, fontSize: 12, minWidth: 52 }} title="Zoom al 100% (Ctrl 0)" onClick={() => zoomCenter(1 / view.z)}>{Math.round(view.z * 100)}%</button>
        <button style={s.tool} title="Acercar (Ctrl +)" onClick={() => zoomCenter(1.25)}>+</button>
        <div style={{ width: 1, height: 18, background: '#e3e1dc', margin: '0 4px' }} />
        <button style={{ ...s.tool, fontSize: 12 }} title="Ajustar a todo (Shift 1)" onClick={() => fit()}>Ajustar</button>
      </div>

      <div style={{ position: 'absolute', left: 16, bottom: 62, fontSize: 11, color: '#8a8d92', lineHeight: 1.6, pointerEvents: 'none', textShadow: `0 0 4px ${CANVAS}` }}>
        Rueda: desplazar · Ctrl + rueda: zoom · Espacio + arrastrar: mover lienzo<br />
        Arrastrar en vacío: seleccionar área · Ctrl/Shift + clic: añadir o quitar de la selección
      </div>

      {!panelOpen && (
        <button onClick={() => setPanelOpen(true)} style={{ ...s.float, right: 16, top: 16, height: 36, padding: '0 14px', fontSize: 13, cursor: 'pointer' }}>Mostrar panel</button>
      )}

      {panelOpen && (
        <aside style={{ position: 'absolute', right: 16, top: 16, bottom: 16, width: PANEL_W, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button onClick={() => setPanelOpen(false)} style={{ alignSelf: 'flex-end', flexShrink: 0, height: 30, padding: '0 12px', border: '1px solid #e3e1dc', background: '#fff', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#4a4d52' }}>Ocultar panel</button>

          {selE && (
            <div style={{ ...s.card, border: '1.5px solid #1d1f22', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500 }}>{one}</div>
                <button onClick={() => setSel([])} style={{ border: 'none', background: 'none', fontSize: 13, color: '#6b6e73', cursor: 'pointer', padding: 4 }}>Cerrar</button>
              </div>
              <label style={s.field}>
                <span style={s.label}>Nombre en español</span>
                <input style={s.input} value={selE.es} onChange={(ev) => { const v = ev.target.value; update((d) => ({ ents: d.ents.map((n) => (n.id === one ? { ...n, es: v } : n)) })); }} />
              </label>
              <label style={s.field}>
                <span style={s.label}>Grupo</span>
                <select style={s.select} value={selE.g} onChange={(ev) => setSelectedGroup(ev.target.value)}>
                  {G.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={s.label}>Relaciones ({selRels.length})</span>
                {selRels.map(({ r, i }) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '6px 8px', background: '#f6f5f2', borderRadius: 4 }}>
                    <div style={{ fontFamily: MONO, overflowWrap: 'anywhere' }}>{r.a} → {r.b} · {r.opt ? 'opcional' : 'obligatoria'}{r.lab ? ' · ' + r.lab : ''}</div>
                    <button onClick={() => update((d) => ({ rels: d.rels.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: 'oklch(0.5 0.15 25)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>Quitar</button>
                  </div>
                ))}
              </div>
              <button onClick={deleteSelected} style={{ height: 34, border: '1px solid oklch(0.55 0.15 25)', color: 'oklch(0.5 0.15 25)', background: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Eliminar tabla</button>
            </div>
          )}

          {sel.length > 1 && (
            <div style={{ ...s.card, border: '1.5px solid #1d1f22', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sel.length} tablas seleccionadas</div>
                <button onClick={() => setSel([])} style={{ border: 'none', background: 'none', fontSize: 13, color: '#6b6e73', cursor: 'pointer', padding: 4 }}>Cerrar</button>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: '#4a4d52', overflowWrap: 'anywhere' }}>{sel.join(', ')}</div>
              <label style={s.field}>
                <span style={s.label}>Mover todas al grupo</span>
                <select style={s.select} value="" onChange={(ev) => ev.target.value && setSelectedGroup(ev.target.value)}>
                  <option value="">—</option>
                  {G.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <button onClick={() => fit(E.filter((e) => selSet.has(e.id)))} style={{ height: 34, border: '1px solid #1d1f22', background: '#fff', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Enfocar selección</button>
              <button onClick={deleteSelected} style={{ height: 34, border: '1px solid oklch(0.55 0.15 25)', color: 'oklch(0.5 0.15 25)', background: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Eliminar {sel.length} tablas</button>
            </div>
          )}

          <div style={s.card}>
            <div style={s.title}>Agregar tabla</div>
            <input style={{ ...s.input, fontSize: 13, fontFamily: MONO }} placeholder="nombre_tabla" value={nt.id} onChange={(ev) => { setNt({ ...nt, id: ev.target.value }); setErr(''); }} />
            <input style={s.input} placeholder="Nombre en español" value={nt.es} onChange={(ev) => setNt({ ...nt, es: ev.target.value })} />
            <select style={s.select} value={nt.g} onChange={(ev) => setNt({ ...nt, g: ev.target.value })}>
              {G.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button style={s.primary} onClick={addTable}>Agregar tabla</button>
          </div>

          <div style={s.card}>
            <div style={s.title}>Agregar relación</div>
            <label style={s.field}>
              <span style={s.label}>Tabla con la FK (lado muchos)</span>
              <select style={{ ...s.select, fontSize: 13, fontFamily: MONO }} value={nr.a} onChange={(ev) => { setNr({ ...nr, a: ev.target.value }); setErr(''); }}>
                <option value="">—</option>
                {E.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
              </select>
            </label>
            <label style={s.field}>
              <span style={s.label}>Tabla referenciada (lado uno)</span>
              <select style={{ ...s.select, fontSize: 13, fontFamily: MONO }} value={nr.b} onChange={(ev) => { setNr({ ...nr, b: ev.target.value }); setErr(''); }}>
                <option value="">—</option>
                {E.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={toggleBtn(!nr.opt)} onClick={() => setNr({ ...nr, opt: false })}>Obligatoria</button>
              <button style={toggleBtn(nr.opt)} onClick={() => setNr({ ...nr, opt: true })}>Opcional</button>
            </div>
            <input style={{ ...s.input, fontSize: 13 }} placeholder="Etiqueta (opcional)" value={nr.lab} onChange={(ev) => setNr({ ...nr, lab: ev.target.value })} />
            <button style={s.primary} onClick={addRel}>Agregar relación</button>
          </div>

          {err && <div style={{ fontSize: 13, color: 'oklch(0.5 0.15 25)' }}>{err}</div>}

          <div style={s.card}>
            <div style={s.title}>Grupos</div>
            {G.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: `oklch(0.97 0.025 ${g.hue})`, border: `1.5px solid oklch(0.55 0.13 ${g.hue})` }} />
                {g.name}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...s.input, flex: 1, minWidth: 0, height: 32, fontSize: 13 }} placeholder="Nuevo grupo" value={ng} onChange={(ev) => setNg(ev.target.value)} />
              <button onClick={addGroup} style={{ height: 32, padding: '0 12px', border: '1px solid #1d1f22', background: '#fff', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Agregar</button>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.title}>Notación</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}><LegendGlyph><GlyphOne /></LegendGlyph>Exactamente uno — FK obligatoria</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}><LegendGlyph><GlyphZeroOne /></LegendGlyph>Cero o uno — FK opcional</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}><LegendGlyph><GlyphZeroMany /></LegendGlyph>Cero o muchos — lado con la FK</div>
          </div>

          <div style={s.card}>
            <div style={s.title}>Atajos</div>
            <div style={{ fontSize: 12, color: '#4a4d52', lineHeight: 1.7 }}>
              <b>Ctrl/Shift + clic</b> añadir o quitar de la selección<br />
              <b>Arrastrar en vacío</b> selección por área<br />
              <b>Espacio + arrastrar</b> o botón central: mover lienzo<br />
              <b>Ctrl + rueda</b> zoom · <b>Ctrl 0</b> 100%<br />
              <b>Shift 1</b> ajustar todo · <b>Shift 2</b> enfocar selección<br />
              <b>Ctrl A</b> seleccionar todo · <b>Supr</b> eliminar<br />
              <b>Flechas</b> mover selección (Shift: ×5) · <b>Esc</b> deseleccionar
            </div>
          </div>

          <button onClick={reset} style={{ flexShrink: 0, height: 34, border: '1px solid #d6d3cd', background: '#fff', borderRadius: 6, fontSize: 13, color: '#4a4d52', cursor: 'pointer' }}>Restablecer diagrama original</button>
        </aside>
      )}
    </div>
  );
}
