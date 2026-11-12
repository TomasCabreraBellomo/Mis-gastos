(function (root) {
  'use strict';

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CATEGORIES = {
    gasto: [
      'Comida', 'Transporte', 'Hogar', 'Salud', 'Ocio', 'Educación', 'Ropa', 'Servicios',
      'Electrodomésticos', 'supermercado', 'expensas', 'Delivery', 'Salidas', 'regalos',
      'Bazar', 'Claro', 'Colaboración', 'Farmacia', 'seguros', 'Uber', 'verduleria y huevos',
      'arreglos', 'SAT', 'Productos de Limpieza', 'futbol', 'extras',
      'Facultad y capacitaciones', 'Postres y helado', 'Panadería', 'Netflix', 'spotify',
      'Naturgy', 'Chatgpt', 'Forrajeria', 'Naranja x mantenimiento', 'Jetsmart',
      'Viajes salta', 'Gimnasio', 'Otros'
    ],
    ingreso: ['Sueldo', 'Extra', 'Regalo', 'Otros']
  };
  const PAYMENTS = { efectivo: 'efectivo', debito: 'debito', credito: 'credito', 'sin especificar': 'sin_especificar', sin_especificar: 'sin_especificar' };
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const cents = value => Math.round(value * 100);

  // RFC-style quoted fields, including escaped quotes and embedded line breaks.
  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    function cell() { row.push(field); field = ''; closed = false; }
    function line() { cell(); rows.push(row); row = []; }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else field += char;
      } else if (char === delimiter) cell();
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        line();
      } else if (char === '"' && !field && !closed) quoted = true;
      else if (closed && /\s/.test(char)) continue;
      else if (closed || char === '"') throw new Error('Hay comillas mal cerradas en el CSV.');
      else field += char;
    }
    if (quoted) throw new Error('Hay comillas sin cerrar en el CSV.');
    if (field || row.length || closed) line();
    return rows;
  }

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    // Detect separators only outside quotes in the first nonempty record.
    let quoted = false;
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && (c === '\n' || c === '\r')) {
        if (Object.values(counts).some(Boolean)) break;
      } else if (!quoted && c in counts) counts[c]++;
    }
    const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return parseDelimited(text, delimiter);
  }

  function parseAmount(value) {
    let s = String(value ?? '').trim();
    if (!s) return null;
    const currency = /^(?:ARS|\$)/i.test(s);
    s = s.replace(/^(?:ARS\s*\$?|\$)\s*/i, '').replace(/\s/g, '');
    if (!/^\+?\d[\d.,]*$/.test(s)) return NaN;
    const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
      const decimal = dot > comma ? '.' : ',';
      const grouping = decimal === '.' ? ',' : '.';
      const parts = s.split(decimal);
      if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return NaN;
      const groups = parts[0].split(grouping);
      if (groups.length > 1 && (!/^\+?\d{1,3}$/.test(groups[0]) || groups.slice(1).some(g => !/^\d{3}$/.test(g)))) return NaN;
      s = groups.join('') + '.' + parts[1];
    } else if (comma >= 0) {
      if (s.split(',').length !== 2) return NaN;
      s = s.replace(',', '.');
    } else if ((s.match(/\./g) || []).length > 1 || (currency && /^\d{1,3}\.\d{3}$/.test(s))) {
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(s)) return NaN;
      s = s.replace(/\./g, '');
    }
    if (!/^\+?\d+(?:\.\d+)?$/.test(s)) return NaN;
    const n = Number(s);
    return Number.isFinite(n) && Number.isSafeInteger(Math.round(n * 100)) ? round(n) : NaN;
  }

  function parseDate(value) {
    const s = String(value ?? '').trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!match) {
      const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      if (local) match = [s, local[3], local[2], local[1]];
    }
    if (!match) return null;
    const [y, m, d] = match.slice(1).map(Number);
    const date = new Date(y, m - 1, d);
    if (y < 1900 || y > 9999 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const isSummary = value => /^(?:total|subtotal)\b|^gastos (?:fijos|variables|compras extras)$/.test(normalize(value));
  const isDetail = value => ['detalle', 'descripcion', 'concepto', 'nota'].includes(normalize(value));
  const isAmount = value => ['importe', 'monto', 'valor'].includes(normalize(value));

  function parseExpenses(text, options = {}) {
    const rows = parseCSV(text);
    const result = { format: '', records: [], issues: [], skipped: { summaries: 0, empty: 0, zero: 0 } };
    const monthHeader = rows.findIndex((row, i) => i < 6 && row.some((v, col) => MONTHS.includes(normalize(v)) && isDetail(rows[i + 1]?.[col]) && isAmount(rows[i + 1]?.[col + 1])));
    function add(detail, rawAmount, fields, rowNumber, period) {
      if (isSummary(detail) || isSummary(rawAmount)) { result.skipped.summaries++; return; }
      if (String(rawAmount ?? '').trim() === '') { result.skipped.empty++; return; }
      const monto = parseAmount(rawAmount);
      const nota = String(detail ?? '').trim();
      if (monto === 0) { result.skipped.zero++; return; }
      if (!Number.isFinite(monto) || monto < 0 || !nota) {
        result.issues.push({ row: rowNumber, period, detail: nota, reason: !nota ? 'Falta el detalle.' : 'Importe inválido: ' + rawAmount });
        return;
      }
      result.records.push({ tipo: 'gasto', categoria: 'Otros', medioPago: 'sin_especificar', ...fields, monto, nota, sourceRow: rowNumber });
    }
    if (monthHeader >= 0) {
      result.format = 'annual';
      const year = Number(options.year);
      if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Indicá un año válido para los meses del CSV.');
      const months = [];
      rows[monthHeader].forEach((v, col) => {
        const month = MONTHS.indexOf(normalize(v));
        if (month < 0) return;
        if (!isDetail(rows[monthHeader + 1]?.[col]) || !isAmount(rows[monthHeader + 1]?.[col + 1])) throw new Error(`Faltan las columnas Detalle e Importe de ${v}.`);
        if (months.some(m => m.month === month)) throw new Error(`El mes ${v} aparece más de una vez.`);
        months.push({ col, month });
      });
      rows.slice(monthHeader + 2).forEach((row, index) => {
        months.forEach(({ col, month }) => {
          const period = `${year}-${String(month + 1).padStart(2, '0')}`;
          add(row[col], row[col + 1], { fecha: period + '-01', periodoMensual: true }, index + monthHeader + 3, period);
        });
      });
    } else {
      result.format = 'table';
      const headerIndex = rows.findIndex((row, i) => i < 6 && row.some(v => normalize(v) === 'fecha') && row.some(isAmount));
      if (headerIndex < 0) throw new Error('No se reconoce el formato. Usá meses con Detalle/Importe, o una tabla con Fecha, Detalle e Importe.');
      const header = rows[headerIndex].map(normalize);
      const at = names => header.findIndex(v => names.includes(v));
      const dateCol = at(['fecha']), amountCol = header.findIndex(isAmount), detailCol = header.findIndex(isDetail);
      const catCol = at(['categoria']), typeCol = at(['tipo']), payCol = at(['medio_pago', 'medio de pago']), periodCol = at(['periodo_mensual']);
      if (detailCol < 0 && catCol < 0) throw new Error('Falta una columna Detalle, Nota o Categoría.');
      rows.slice(headerIndex + 1).forEach((row, index) => {
        if (row.every(v => !v.trim())) return;
        const line = headerIndex + index + 2;
        const detail = row[detailCol] || row[catCol] || '';
        if (isSummary(detail)) { result.skipped.summaries++; return; }
        const fecha = parseDate(row[dateCol]);
        const tipo = normalize(row[typeCol] || 'gasto');
        const payment = normalize(row[payCol] || 'sin_especificar');
        const category = CATEGORIES[tipo]?.find(c => normalize(c) === normalize(row[catCol] || 'Otros'));
        const period = normalize(row[periodCol] || 'false');
        if (!fecha || !category || !Object.hasOwn(PAYMENTS, payment) || !['true', 'false', '1', '0', 'si', 'no'].includes(period)) {
          result.issues.push({ row: line, detail, reason: 'Fecha, tipo, categoría, medio de pago o período inválido.' });
          return;
        }
        const periodoMensual = ['true', '1', 'si'].includes(period);
        if (periodoMensual && !fecha.endsWith('-01')) {
          result.issues.push({ row: line, detail, reason: 'Un registro mensual debe usar el día 01.' });
          return;
        }
        add(detail, row[amountCol], { fecha, tipo, categoria: category, medioPago: PAYMENTS[payment], periodoMensual }, line, fecha.slice(0, 7));
        // Keep an empty note empty when reimporting this app's CSV export.
        if (result.records.at(-1)?.sourceRow === line && detailCol >= 0) result.records.at(-1).nota = (row[detailCol] || '').trim();
      });
    }
    return result;
  }

  function fingerprint(m) {
    return JSON.stringify([m.fecha, !!m.periodoMensual, m.tipo, cents(m.monto), normalize(m.nota || m.categoria)]);
  }

  function planImport(records, existing) {
    const keys = new Set(), existingCounts = new Map(), incomingCounts = new Map();
    for (const m of existing) {
      const fp = fingerprint(m), n = (existingCounts.get(fp) || 0) + 1;
      existingCounts.set(fp, n);
      keys.add(fp + ':' + n);
      if (m.importKey) keys.add(m.importKey);
    }
    const pending = [], duplicates = [];
    for (const m of records) {
      const fp = fingerprint(m), n = (incomingCounts.get(fp) || 0) + 1;
      incomingCounts.set(fp, n);
      const importKey = fp + ':' + n;
      if (keys.has(importKey)) duplicates.push(m);
      else pending.push({ ...m, importKey });
    }
    return { pending, duplicates };
  }

  function monthComparison(data, key) {
    const [year, month] = key.split('-').map(Number);
    const previousKey = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    const current = data.filter(m => m.fecha.startsWith(key));
    const previous = data.filter(m => m.fecha.startsWith(previousKey));
    const total = rows => rows.filter(m => m.tipo === 'gasto').reduce((s, m) => s + cents(m.monto), 0) / 100;
    const currentTotal = total(current), previousTotal = total(previous);
    const comparable = current.length > 0 && previous.length > 0;
    const details = new Map();
    for (const [rows, side] of [[previous, 'previous'], [current, 'current']]) {
      for (const m of rows.filter(m => m.tipo === 'gasto')) {
        const label = m.nota?.trim() || m.categoria;
        const k = normalize(label);
        if (!details.has(k)) details.set(k, { label, current: 0, previous: 0 });
        const entry = details.get(k);
        entry[side] += cents(m.monto);
      }
    }
    return {
      previousKey, currentTotal, previousTotal, comparable,
      difference: comparable ? round(currentTotal - previousTotal) : null,
      percent: comparable && previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal * 100 : null,
      details: [...details.values()].map(d => ({ ...d, current: d.current / 100, previous: d.previous / 100,
        difference: comparable ? (d.current - d.previous) / 100 : null,
        percent: comparable && d.previous > 0 ? (d.current - d.previous) / d.previous * 100 : null
      })).sort((a, b) => b.current - a.current || a.label.localeCompare(b.label, 'es'))
    };
  }

  const api = { CATEGORIES, normalize, parseCSV, parseAmount, parseDate, parseExpenses, planImport, monthComparison };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpenseCSV = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
