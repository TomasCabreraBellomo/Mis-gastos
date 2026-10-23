(() => {
  'use strict';

  const CATS = {
    gasto: ['Comida', 'Transporte', 'Hogar', 'Salud', 'Ocio', 'Educación', 'Ropa', 'Servicios', 'Otros'],
    ingreso: ['Sueldo', 'Extra', 'Regalo', 'Otros']
  };
  const PAGOS = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito' };
  const COLORS = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#64748b'];
  const KEY = 'movimientos';

  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
  const fmt0 = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  let data = load();
  let current = new Date(); current.setDate(1);
  let editingId = null;
  let pie = null, bar = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { alert('No se pudo guardar en este navegador (¿modo privado?).'); }
  }

  const inMonth = (key) => data.filter(m => m.fecha.startsWith(key));
  const sum = (arr, tipo) => arr.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);

  function render() {
    const key = monthKey(current);
    const rows = inMonth(key).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
    const label = current.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    $('monthLabel').textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const inc = sum(rows, 'ingreso'), out = sum(rows, 'gasto');
    $('sumIn').textContent = fmt0(inc);
    $('sumOut').textContent = fmt0(out);
    const bal = $('sumBal');
    bal.textContent = fmt0(inc - out);
    bal.className = inc - out >= 0 ? 'pos' : 'neg';
    renderList(rows);
    if (!$('tab-summary').hidden) renderSummary(rows);
  }

  function renderList(rows) {
    const list = $('list');
    list.textContent = '';
    $('empty').hidden = rows.length > 0;
    let lastDay = '';
    for (const m of rows) {
      if (m.fecha !== lastDay) {
        lastDay = m.fecha;
        const h = document.createElement('div');
        h.className = 'day';
        h.textContent = new Date(m.fecha + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
        list.appendChild(h);
      }
      const b = document.createElement('button');
      b.className = 'item';
      const dot = document.createElement('span'); dot.className = 'dot';
      dot.style.background = m.tipo === 'gasto' ? 'var(--neg)' : 'var(--pos)';
      const mid = document.createElement('span'); mid.className = 'mid';
      const t = document.createElement('b'); t.textContent = m.categoria;
      const s = document.createElement('small'); s.textContent = PAGOS[m.medioPago] + (m.nota ? ' · ' + m.nota : '');
      mid.append(t, s);
      const amt = document.createElement('span'); amt.className = 'amt ' + (m.tipo === 'gasto' ? 'neg' : 'pos');
      amt.textContent = (m.tipo === 'gasto' ? '−' : '+') + fmt(m.monto);
      b.append(dot, mid, amt);
      b.addEventListener('click', () => openDialog(m));
      list.appendChild(b);
    }
  }

  function breakdown(ul, entries, total) {
    ul.textContent = '';
    entries.forEach(([name, val], i) => {
      const li = document.createElement('li');
      const l = document.createElement('span');
      const dot = document.createElement('i'); dot.style.background = COLORS[i % COLORS.length];
      l.append(dot, name);
      const r = document.createElement('span');
      r.textContent = `${fmt(val)} (${total ? Math.round(val / total * 100) : 0}%)`;
      li.append(l, r);
      ul.appendChild(li);
    });
  }

  function group(rows, field) {
    const map = {};
    rows.filter(m => m.tipo === 'gasto').forEach(m => { map[m[field]] = (map[m[field]] || 0) + m.monto; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function renderSummary(rows) {
    rows = rows || inMonth(monthKey(current));
    const total = sum(rows, 'gasto');
    const cats = group(rows, 'categoria');
    breakdown($('catList'), cats, total);
    breakdown($('payList'), group(rows, 'medioPago').map(([k, v]) => [PAGOS[k], v]), total);
    $('pieEmpty').hidden = cats.length > 0;
    $('pieChart').parentElement.hidden = cats.length === 0;

    if (typeof Chart === 'undefined') return;
    if (pie) pie.destroy();
    if (cats.length) {
      pie = new Chart($('pieChart'), {
        type: 'doughnut',
        data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1]), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }
    const labels = [], ins = [], outs = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      const r = inMonth(monthKey(d));
      labels.push(d.toLocaleDateString('es-AR', { month: 'short' }));
      ins.push(sum(r, 'ingreso')); outs.push(sum(r, 'gasto'));
    }
    if (bar) bar.destroy();
    bar = new Chart($('barChart'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Ingresos', data: ins, backgroundColor: '#15803d' },
        { label: 'Gastos', data: outs, backgroundColor: '#b91c1c' }
      ] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  }

  // ---- diálogo ----
  const dlg = $('dlg');
  function fillCats(tipo, selected) {
    const sel = $('categoria');
    sel.textContent = '';
    CATS[tipo].forEach(c => { const o = document.createElement('option'); o.textContent = c; sel.appendChild(o); });
    if (selected && CATS[tipo].includes(selected)) sel.value = selected;
  }
  function openDialog(m) {
    editingId = m ? m.id : null;
    $('dlgTitle').textContent = m ? 'Editar movimiento' : 'Nuevo movimiento';
    $('delBtn').hidden = !m;
    const tipo = m ? m.tipo : 'gasto';
    document.querySelector(`input[name=tipo][value=${tipo}]`).checked = true;
    document.querySelector(`input[name=pago][value=${m ? m.medioPago : 'efectivo'}]`).checked = true;
    fillCats(tipo, m && m.categoria);
    $('monto').value = m ? m.monto : '';
    const today = new Date();
    const inCurrent = monthKey(today) === monthKey(current);
    $('fecha').value = m ? m.fecha : ymd(inCurrent ? today : current);
    $('nota').value = m ? m.nota || '' : '';
    dlg.showModal();
    if (!m) $('monto').focus();
  }
  document.querySelectorAll('input[name=tipo]').forEach(r =>
    r.addEventListener('change', () => fillCats(r.value)));
  $('fab').addEventListener('click', () => openDialog(null));
  $('cancelBtn').addEventListener('click', () => dlg.close());
  $('delBtn').addEventListener('click', () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    data = data.filter(m => m.id !== editingId);
    save(); dlg.close(); render();
  });
  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const monto = parseFloat($('monto').value);
    if (!(monto > 0)) return;
    const m = {
      id: editingId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      tipo: document.querySelector('input[name=tipo]:checked').value,
      monto,
      categoria: $('categoria').value,
      medioPago: document.querySelector('input[name=pago]:checked').value,
      fecha: $('fecha').value,
      nota: $('nota').value.trim()
    };
    data = editingId ? data.map(x => x.id === editingId ? m : x) : [...data, m];
    save(); dlg.close();
    const [y, mo] = m.fecha.split('-').map(Number);
    current = new Date(y, mo - 1, 1);
    render();
  });

  // ---- navegación ----
  $('prev').addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() - 1, 1); render(); });
  $('next').addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() + 1, 1); render(); });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $('tab-list').hidden = b.dataset.tab !== 'list';
    $('tab-summary').hidden = b.dataset.tab !== 'summary';
    render();
  }));

  // ---- exportar / importar ----
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('exportJson').addEventListener('click', () => download(`gastos-${ymd(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json'));
  $('exportCsv').addEventListener('click', () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['fecha,tipo,monto,categoria,medio_pago,nota',
      ...[...data].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m =>
        [m.fecha, m.tipo, m.monto, esc(m.categoria), m.medioPago, esc(m.nota)].join(','))];
    download(`gastos-${ymd(new Date())}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      const ok = Array.isArray(arr) && arr.every(m => m && m.id && m.fecha && m.monto > 0 && CATS[m.tipo] && PAGOS[m.medioPago]);
      if (!ok) throw new Error('formato');
      if (!confirm(`Se importarán ${arr.length} movimientos y se reemplazarán los actuales. ¿Continuar?`)) return;
      data = arr; save(); render();
    } catch { alert('El archivo no es un respaldo válido.'); }
  });

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
