(() => {
  'use strict';

  const CATS = ExpenseCSV.CATEGORIES;
  const PAGOS = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', sin_especificar: 'Sin especificar' };
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
  function save(next = data) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); data = next; return true; }
    catch { alert('No se pudo guardar en este navegador. Exportá un respaldo y revisá el espacio disponible.'); return false; }
  }

  const inMonth = (key) => data.filter(m => m.fecha.startsWith(key));
  const sum = (arr, tipo) => arr.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);

  function render() {
    const key = monthKey(current);
    const rows = inMonth(key).sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(!!a.periodoMensual) - Number(!!b.periodoMensual) || b.id.localeCompare(a.id));
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
      const day = m.periodoMensual ? m.fecha.slice(0, 7) : m.fecha;
      if (day !== lastDay) {
        lastDay = day;
        const h = document.createElement('div');
        h.className = 'day';
        h.textContent = m.periodoMensual ? 'Registros del mes · sin día especificado' : new Date(m.fecha + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
        list.appendChild(h);
      }
      const b = document.createElement('button');
      b.className = 'item';
      const dot = document.createElement('span'); dot.className = 'dot';
      dot.style.background = m.tipo === 'gasto' ? 'var(--neg)' : 'var(--pos)';
      const mid = document.createElement('span'); mid.className = 'mid';
      const t = document.createElement('b'); t.textContent = m.importKey && m.nota ? m.nota : m.categoria;
      const s = document.createElement('small'); s.textContent = PAGOS[m.medioPago] + (m.importKey ? ' · ' + m.categoria : (m.nota ? ' · ' + m.nota : ''));
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
    const map = Object.create(null);
    rows.filter(m => m.tipo === 'gasto').forEach(m => { map[m[field]] = (map[m[field]] || 0) + m.monto; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function renderSummary(rows) {
    rows = rows || inMonth(monthKey(current));
    renderComparison();
    const total = sum(rows, 'gasto');
    const cats = group(rows, 'categoria');
    breakdown($('catList'), cats, total);
    breakdown($('payList'), group(rows, 'medioPago').map(([k, v]) => [PAGOS[k], v]), total);
    $('pieEmpty').hidden = cats.length > 0;
    $('pieChart').parentElement.hidden = cats.length === 0;

    if (typeof Chart === 'undefined') return;
    if (pie) pie.destroy();
    pie = null;
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

  function signedAmount(value) { return (value > 0 ? '+' : value < 0 ? '−' : '') + fmt(Math.abs(value)); }
  function percentage(value) { return (value > 0 ? '+' : '') + value.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%'; }
  function appendCells(body, values) {
    const row = document.createElement('tr');
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); }
    body.appendChild(row);
    return row;
  }
  function renderComparison() {
    const c = ExpenseCSV.monthComparison(data, monthKey(current));
    const prior = new Date(c.previousKey + '-01T00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    $('comparisonPeriod').textContent = `Gastos respecto a ${prior}`;
    const diff = $('monthDifference');
    diff.className = c.comparable ? (c.difference > 0 ? 'neg' : c.difference < 0 ? 'pos' : '') : '';
    diff.textContent = c.comparable ? `${signedAmount(c.difference)}${c.percent === null ? ' · Sin base porcentual' : ' (' + percentage(c.percent) + ')'}` : 'Sin datos para comparar';
    $('comparisonNote').textContent = c.comparable
      ? `Mes anterior: ${fmt(c.previousTotal)}. Este mes: ${fmt(c.currentTotal)}. ${c.previousTotal === 0 ? 'El mes anterior no registra gastos; no se calcula porcentaje.' : 'Comparación de los gastos registrados en cada mes.'}`
      : 'Necesitás registros en ambos meses. Un mes vacío no se considera un mes con gasto cero.';
    $('detailComparison').hidden = !c.comparable;
    $('comparisonRows').textContent = '';
    if (c.comparable) c.details.forEach(d => {
      const tr = appendCells($('comparisonRows'), [d.label, fmt(d.previous), fmt(d.current), signedAmount(d.difference), d.percent === null ? 'Nuevo / sin base' : percentage(d.percent)]);
      tr.cells[3].className = d.difference > 0 ? 'neg' : d.difference < 0 ? 'pos' : '';
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
    $('periodoMensual').checked = !!m?.periodoMensual;
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
    if (!save(data.filter(m => m.id !== editingId))) return;
    dlg.close(); render();
  });
  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const monto = parseFloat($('monto').value);
    if (!(monto > 0)) return;
    const previous = data.find(x => x.id === editingId);
    const fecha = $('periodoMensual').checked ? $('fecha').value.slice(0, 7) + '-01' : $('fecha').value;
    const m = {
      ...previous,
      id: editingId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      tipo: document.querySelector('input[name=tipo]:checked').value,
      monto,
      categoria: $('categoria').value,
      medioPago: document.querySelector('input[name=pago]:checked').value,
      fecha,
      periodoMensual: $('periodoMensual').checked,
      nota: $('nota').value.trim()
    };
    if (!save(editingId ? data.map(x => x.id === editingId ? m : x) : [...data, m])) return;
    dlg.close();
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
    const lines = ['fecha,tipo,monto,categoria,medio_pago,nota,periodo_mensual',
      ...[...data].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m =>
        [m.fecha, m.tipo, m.monto, esc(m.categoria), m.medioPago, esc(m.nota), !!m.periodoMensual].join(','))];
    download(`gastos-${ymd(new Date())}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      const ok = Array.isArray(arr) && arr.every(m => m && typeof m.id === 'string' && typeof m.fecha === 'string' && ExpenseCSV.parseDate(m.fecha) === m.fecha && Number.isFinite(m.monto) && m.monto > 0 && CATS[m.tipo]?.includes(m.categoria) && Object.hasOwn(PAGOS, m.medioPago) && (m.nota === undefined || typeof m.nota === 'string') && (m.periodoMensual === undefined || typeof m.periodoMensual === 'boolean') && (!m.periodoMensual || m.fecha.endsWith('-01')) && (m.importKey === undefined || typeof m.importKey === 'string')) && new Set(arr.map(m => m.id)).size === arr.length;
      if (!ok) throw new Error('formato');
      if (!confirm(`Se importarán ${arr.length} movimientos y se reemplazarán los actuales. ¿Continuar?`)) return;
      if (save(arr)) render();
    } catch { alert('El archivo no es un respaldo válido.'); }
  });

  // ---- importar CSV: revisar primero, agregar sin reemplazar ----
  let csvText = '', csvResult = null, csvPlan = null, fileVersion = 0;
  const csvDialog = $('csvDlg');
  function csvButtonState() {
    $('csvConfirm').disabled = !csvPlan?.pending.length || (csvResult.issues.length > 0 && !$('csvPartial').checked);
  }
  function previewCSV() {
    csvResult = null; csvPlan = null;
    $('csvPreview').hidden = true; $('csvError').hidden = true;
    $('csvConfirm').disabled = true;
    if (!csvText) return;
    try {
      csvResult = ExpenseCSV.parseExpenses(csvText, { year: $('csvYear').value });
      csvPlan = ExpenseCSV.planImport(csvResult.records, data);
      const annual = csvResult.format === 'annual';
      $('csvYearField').hidden = !annual;
      $('csvYear').required = annual;
      $('csvCounts').textContent = `${csvPlan.pending.length} movimientos nuevos. ${csvPlan.duplicates.length} ya registrados. ${csvResult.issues.length} con errores.`;
      const skipped = csvResult.skipped;
      $('csvRules').textContent = `${annual ? 'Se registran como gastos mensuales, sin día exacto, en Otros y con medio de pago sin especificar. Las columnas de porcentajes no se importan. ' : ''}Se omiten ${skipped.summaries} totales/subtotales, ${skipped.zero} importes en cero y ${skipped.empty} celdas sin importe.`;
      $('csvRows').textContent = ''; $('csvMonths').textContent = '';
      const months = new Map();
      csvPlan.pending.forEach(m => {
        const key = m.fecha.slice(0, 7);
        const month = months.get(key) || { count: 0, amount: 0 };
        month.count++; month.amount += Math.round(m.monto * 100); months.set(key, month);
        appendCells($('csvRows'), [m.periodoMensual ? key : m.fecha, m.nota || m.categoria, fmt(m.monto)]);
      });
      [...months].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
        const li = document.createElement('li'), label = document.createElement('span'), amount = document.createElement('span');
        label.textContent = `${key} · ${value.count} registros`; amount.textContent = fmt(value.amount / 100);
        li.append(label, amount); $('csvMonths').appendChild(li);
      });
      $('csvIssues').hidden = !csvResult.issues.length;
      $('csvPartialLabel').hidden = !csvResult.issues.length;
      $('csvIssuesTitle').textContent = `Revisar ${csvResult.issues.length} errores`;
      $('csvIssueList').textContent = '';
      csvResult.issues.forEach(issue => {
        const li = document.createElement('li');
        li.textContent = `Fila ${issue.row}${issue.period ? ', ' + issue.period : ''}${issue.detail ? ', ' + issue.detail : ''}: ${issue.reason}`;
        $('csvIssueList').appendChild(li);
      });
      $('csvPreview').hidden = false;
      csvButtonState();
    } catch (error) { $('csvError').textContent = error.message; $('csvError').hidden = false; }
  }
  $('importCsvBtn').addEventListener('click', () => {
    $('csvForm').reset(); csvText = ''; csvResult = null; csvPlan = null; fileVersion++;
    $('csvYear').value = current.getFullYear(); $('csvYearField').hidden = false; $('csvYear').required = true;
    $('csvPreview').hidden = true; $('csvError').hidden = true; $('csvConfirm').disabled = true;
    csvDialog.showModal();
  });
  $('csvCancel').addEventListener('click', () => csvDialog.close());
  csvDialog.addEventListener('close', () => { fileVersion++; csvText = ''; csvPlan = null; csvResult = null; });
  $('csvPartial').addEventListener('change', csvButtonState);
  $('csvYear').addEventListener('input', () => { $('csvPartial').checked = false; previewCSV(); });
  $('csvFile').addEventListener('change', async e => {
    const version = ++fileVersion, file = e.target.files[0];
    csvText = ''; csvPlan = null; csvResult = null;
    $('csvPartial').checked = false; $('csvPreview').hidden = true; $('csvError').hidden = true; $('csvConfirm').disabled = true;
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El CSV debe pesar menos de 2 MB.');
      if (!file.size) throw new Error('El archivo está vacío.');
      const bytes = await file.arrayBuffer();
      if (version !== fileVersion) return;
      try { csvText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { csvText = new TextDecoder('windows-1252').decode(bytes); }
      const year = file.name.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/)?.[1];
      if (year) $('csvYear').value = year;
      $('csvYearField').hidden = false; $('csvYear').required = true;
      previewCSV();
    } catch (error) { if (version === fileVersion) { $('csvError').textContent = error.message; $('csvError').hidden = false; } }
  });
  $('csvForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!csvPlan?.pending.length || (csvResult.issues.length && !$('csvPartial').checked)) return;
    const records = csvPlan.pending.map(({ sourceRow, ...m }) => ({ ...m, id: crypto.randomUUID() }));
    if (!save([...data, ...records])) return;
    const last = records.map(m => m.fecha.slice(0, 7)).sort().at(-1);
    current = new Date(last + '-01T00:00');
    $('importStatus').textContent = `Se importaron ${records.length} movimientos. Se omitieron ${csvPlan.duplicates.length} ya registrados y ${csvResult.issues.length} con errores.`;
    $('importStatus').hidden = false;
    csvDialog.close(); render();
  });

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
