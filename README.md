# Mis Gastos

PWA para llevar gastos e ingresos mes a mes. Los datos se guardan solo en el dispositivo.

## Descargar y abrir en Windows

Con Git instalado, ejecutá en PowerShell dentro de una carpeta vacía:

```powershell
Set-Location 'C:\Mis gastos'
git clone https://github.com/MatuM02-m/mis-gastos.git .
```

El punto clona directamente en la carpeta actual. Este paso ya está hecho en esta copia local; no hace falta repetirlo. Las mejoras locales no estarán en GitHub hasta que se haga commit y push.

Con Node.js 20 o posterior:

```powershell
npm start
```

Abrí <http://localhost:5173>. No hace falta ejecutar `npm install`: no hay dependencias de ejecución locales. Para detener el servidor, presioná Ctrl+C. Usá siempre la misma dirección y navegador para acceder a los datos guardados. El servidor escucha únicamente en la computadora local.

## Importar CSV

1. Tocá **Importar CSV** y elegí el archivo.
2. Para una planilla anual, verificá el año. Se propone el del nombre del archivo, si aparece.
3. Revisá la cantidad de registros, el detalle y los importes por mes. Si hay errores, se muestran por fila y se requiere elegir explícitamente si querés omitirlos.
4. Tocá **Importar**. Se agregan registros sin reemplazar los actuales y se abre el último mes importado.

Formatos admitidos:

- **Planilla anual:** primera fila con meses en español, segunda fila con pares `Detalle,Importe`. Admite columnas intercaladas de diferencias o porcentajes. Cada par se convierte en gastos del mes. Se conserva el detalle en la nota, con categoría `Otros` y medio de pago `Sin especificar`, editables después. El día 01 es una clave interna: los registros se muestran como mensuales sin día exacto.
- **Tabla de movimientos:** encabezados `Fecha,Detalle,Importe` o el CSV exportado por la app (`fecha,tipo,monto,categoria,medio_pago,nota,periodo_mensual`). Acepta fechas `AAAA-MM-DD` y `DD/MM/AAAA`. Tipo, categoría y medio de pago son opcionales; sus valores deben corresponder a los disponibles en la app.

Admite separadores coma, punto y coma o tabulación, campos entre comillas, UTF-8 y Windows-1252. Los importes admiten punto decimal (`160921.6`) o formato argentino (`1.234,56`); con coma como separador del archivo, un importe con coma decimal debe ir entre comillas. Un punto aislado sin símbolo de moneda se interpreta como decimal; para miles usá `1234`, `1.234,00` o `$ 1.234`. Los importes se redondean a dos decimales.

Se omiten celdas sin importe, ceros, filas cuyo detalle empieza con `Total` o `Subtotal`, y los resúmenes `Gastos fijos`, `Gastos variables` y `Gastos compras extras`. También se reconoce un subtotal cuyo rótulo esté en la columna de importe. Se siguen leyendo los gastos que estén debajo de esos resúmenes. Las columnas de diferencias se ignoran: nunca se usan sus porcentajes ni sus errores de fórmula para calcular los resultados.

La reimportación del mismo contenido omite coincidencias de fecha/período, tipo, importe y detalle, incluso si cambia el nombre del archivo. Conserva la cantidad de filas idénticas legítimas del CSV. Editar un registro importado mantiene su identificación de origen. Es una importación por agregado, no una sincronización: un importe modificado en el archivo puede agregar un nuevo gasto. Revisá la vista previa y corregí o eliminá el anterior cuando corresponda.

## Comparación mensual

En **Resumen** se muestran la diferencia de gastos en pesos y el porcentaje respecto al mes anterior, junto con una tabla por detalle:

```text
Diferencia = gastos del mes − gastos del mes anterior
Porcentaje = diferencia / gastos del mes anterior × 100
```

Los detalles repetidos se suman, ignorando mayúsculas, acentos y espacios sobrantes. Los nombres distintos se mantienen separados. Si no hay nota, se usa la categoría. Un mes sin registros se considera sin datos; una base de cero se muestra sin porcentaje. Se comparan los totales registrados, por lo que un mes todavía incompleto se compara con todo lo registrado del anterior.

## Respaldo y pruebas

Se mantienen el alta, edición y eliminación de movimientos, ingresos, gráficos, navegación mensual y respaldos JSON. El CSV exportado agrega `periodo_mensual` para conservar los registros sin día exacto. La importación JSON sigue reemplazando los movimientos, con confirmación; la importación CSV los agrega.

Los archivos CSV se procesan en el navegador. No se envían a un servidor y no se incluyen en el repositorio. Exportá un respaldo JSON antes de borrar datos del navegador o cambiar de dispositivo. Chart.js se carga desde su CDN y se almacena en caché cuando está disponible. La app y las nuevas funciones CSV pueden funcionar sin conexión después de la primera carga.

```powershell
npm test
```

Las pruebas usan datos ficticios y cubren formatos CSV, importes, errores, duplicados, respaldos CSV y comparación mensual.
