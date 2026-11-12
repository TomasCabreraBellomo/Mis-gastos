const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV, parseAmount, parseExpenses, planImport, monthComparison } = require('../csv.js');

const annual = '\uFEFFENERO,,Febrero,,Diferencia mes a mes,Marzo,\r\n' +
  'Detalle,Importe,Detalle,Importe,,Detalle,Importe\r\n' +
  'Supermercado,100,supermercado,120,#DIV/0!,supermercado,90\r\n' +
  'Uber,25,Uber,10,#REF!,Uber,0\r\n' +
  'Uber,25,,,100%,,\r\n' +
  'total,150,Total,130,,Total,90\r\n' +
  ',,Regalos,30,,,\r\n' +
  ',,40,Total viaje,,,\r\n' +
  'Gastos fijos,150,,,,,\r\n' +
  ',,Gastos variables,130,,,\r\n';

test('annual layout preserves repeated expenses, ignores summaries and percentages, reads beyond totals', () => {
  const r = parseExpenses(annual, { year: 2026 });
  assert.equal(r.records.length, 7);
  assert.equal(r.issues.length, 0);
  assert.equal(r.skipped.summaries, 6);
  assert.equal(r.skipped.zero, 1);
  assert.deepEqual(r.records.filter(m => m.fecha === '2026-02-01').map(m => m.monto), [120, 10, 30]);
  assert.ok(r.records.every(m => m.periodoMensual && m.medioPago === 'sin_especificar'));
});

test('CSV parses BOM, semicolons, CRLF, quoted delimiters, quotes and multiline notes', () => {
  const text = '\uFEFFFecha;Detalle;Importe\r\n2026-02-02;"Cena; con \"\"amigos\"\"\nsegunda línea";"1.234,56"\r\n';
  const r = parseExpenses(text);
  assert.equal(r.records[0].monto, 1234.56);
  assert.equal(r.records[0].nota, 'Cena; con "amigos"\nsegunda línea');
  assert.equal(r.records[0].periodoMensual, false);
  assert.throws(() => parseCSV('a,b\n"sin cerrar,1'), /sin cerrar/);
  assert.throws(() => parseCSV('a,b\n"cerrada"texto,1'), /mal cerradas/);
});

test('amount parsing accepts decimal dot, decimal comma and localized currency without truncating invalid values', () => {
  for (const [input, expected] of [['160921.6', 160921.6], ['24666.66667', 24666.67], ['1.234,56', 1234.56], ['ARS 1.234,56', 1234.56], ['$ 1.234', 1234], ['1,234.56', 1234.56], ['1.234.567', 1234567], ['0', 0], ['', null]]) {
    assert.equal(parseAmount(input), expected, input);
  }
  for (const value of ['#DIV/0!', '#REF!', '123abc', '-100', '1.23.45', '12,34.56', '1,2,3', 'Infinity']) assert.ok(Number.isNaN(parseAmount(value)), value);
});

test('invalid records are reported individually; blanks and zeros are counted separately', () => {
  const r = parseExpenses('Fecha,Detalle,Importe\n31/02/2026,Uber,10\n01/02/2026,Farmacia,#REF!\n02/02/2026,,30\n03/02/2026,Vacío,\n04/02/2026,Cero,0\n05/02/2026,Real,12');
  assert.equal(r.issues.length, 3);
  assert.equal(r.skipped.empty, 1);
  assert.equal(r.skipped.zero, 1);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].fecha, '2026-02-05');
  assert.throws(() => parseExpenses(annual, { year: 0 }), /año válido/);
});

test('deduplication preserves multiplicity, skips a renamed reimport and remembers edited imported records', () => {
  const records = parseExpenses(annual, { year: 2026 }).records;
  const first = planImport(records, []);
  assert.equal(first.pending.length, 7);
  const second = planImport(records, first.pending);
  assert.equal(second.pending.length, 0);
  assert.equal(second.duplicates.length, 7);
  const edited = first.pending.map((m, i) => i === 0 ? { ...m, nota: 'Editado', monto: 222, categoria: 'Comida' } : m);
  assert.equal(planImport(records, edited).pending.length, 0);
  const oneUber = first.pending.filter(m => m.nota === 'Uber' && m.fecha === '2026-01-01').slice(0, 1);
  assert.equal(planImport(records, oneUber).pending.length, 6);
});

test('monthly comparison aggregates detail, uses previous month as denominator and handles disappearing expenses', () => {
  const rows = parseExpenses(annual, { year: 2026 }).records;
  const result = monthComparison(rows, '2026-02');
  assert.equal(result.currentTotal, 160);
  assert.equal(result.previousTotal, 150);
  assert.equal(result.difference, 10);
  assert.equal(result.percent, 10 / 150 * 100);
  const market = result.details.find(d => d.label.toLowerCase() === 'supermercado');
  assert.equal(market.percent, 20);
  assert.equal(result.details.find(d => d.label === 'Uber').difference, -40);
  assert.equal(result.details.find(d => d.label === 'Regalos').percent, null);
  const march = monthComparison(rows, '2026-03');
  assert.equal(march.details.find(d => d.label === 'Regalos').percent, -100);
});

test('comparison distinguishes a missing month from a zero expense base, including December/January', () => {
  const rows = [
    { fecha: '2025-12-03', monto: 100, tipo: 'ingreso', nota: 'Sueldo' },
    { fecha: '2026-01-03', monto: 50, tipo: 'gasto', nota: 'Comida' }
  ];
  const january = monthComparison(rows, '2026-01');
  assert.equal(january.previousKey, '2025-12');
  assert.equal(january.comparable, true);
  assert.equal(january.difference, 50);
  assert.equal(january.percent, null);
  const february = monthComparison(rows, '2026-02');
  assert.equal(february.comparable, false);
  assert.equal(february.difference, null);
});

test('exported table roundtrips income, payment, empty notes and monthly precision', () => {
  const result = parseExpenses('fecha,tipo,monto,categoria,medio_pago,nota,periodo_mensual\n2026-02-01,gasto,22.50,Otros,sin_especificar,"Servicio",true\n2026-02-05,ingreso,2000,Sueldo,debito,"",false');
  assert.equal(result.issues.length, 0);
  assert.equal(result.records[0].periodoMensual, true);
  assert.equal(result.records[1].nota, '');
  assert.equal(result.records[1].tipo, 'ingreso');
  assert.equal(planImport(result.records, result.records).pending.length, 0);
});

test('untrusted detail strings are literal data and cannot change grouping behavior', () => {
  const result = parseExpenses('Fecha,Detalle,Importe\n2026-01-01,__proto__,10\n2026-02-01,__proto__,20\n2026-02-02,"<img src=x onerror=alert(1)>",5');
  const comparison = monthComparison(result.records, '2026-02');
  assert.equal(comparison.details.find(d => d.label === '__proto__').difference, 10);
  assert.equal(result.records[2].nota, '<img src=x onerror=alert(1)>');
});
