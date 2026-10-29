# MiCalorías — PWA local para iPhone

Aplicación gratuita, sin backend, sin cuentas de usuario, sin notificaciones y sin servicios de analítica. Todos los registros se guardan en **IndexedDB** en el dispositivo que la abre.

## Funciones incluidas
- Registro por fecha y comida (desayuno, almuerzo, cena, snacks).
- Cálculo automático: `kcal = cantidad × kcal_por_100 / 100`.
- Cantidades en g o ml, con densidades calóricas por cada 100 g o ml.
- Edición/eliminación de ingredientes y alimentos frecuentes.
- Historial diario y objetivo calórico opcional.
- Exportación de respaldo JSON desde compartir/descargar e importación con confirmación.
- Trabajo offline tras la instalación y primera carga completa de la aplicación.

## Instalación en iPhone (opción gratuita)

1. Sube **todos** los archivos de esta carpeta a un alojamiento de archivos estáticos con **HTTPS**. Puedes utilizar Cloudflare Pages, GitHub Pages o una ruta bajo un dominio HTTPS que ya tengas. No necesitas Node.js, base de datos ni funciones de servidor.
2. Abre la URL publicada con **Safari en el iPhone** y deja que cargue completamente.
3. Usa el botón Compartir de Safari → «Añadir a pantalla de inicio» → activa «Abrir como app» si aparece → «Añadir».
4. Abre **MiCalorías** desde el icono. Haz una prueba sin conexión (modo avión) después de la primera carga.

**Aviso:** el proyecto no funcionará correctamente como PWA offline si abres directamente `index.html` desde Archivos (`file://`). Requiere publicarse inicialmente en un origen HTTPS.

## Desarrollo local

Desde la carpeta del proyecto ejecuta `python3 -m http.server 8080` y abre `http://localhost:8080` en tu ordenador. Localhost permite el funcionamiento de Service Workers para pruebas. Para tu iPhone usa alojamiento HTTPS.

## Dónde se almacenan los datos

Se almacenan exclusivamente en el IndexedDB de la PWA instalada. No se transmiten registros personales a terceros. Cada instalación/navegador puede tener un almacenamiento independiente. El almacenamiento web puede perderse por desinstalación, limpieza de datos, restablecimiento o gestión de espacio; **exporta regularmente un JSON y guárdalo en Archivos/iCloud Drive u otro sitio de tu elección**. No se crea ninguna sincronización automática.

## Actualizaciones

Edita el código y cambia `CACHE_NAME` en `sw.js` al publicar una nueva versión, para que Safari descarte archivos anteriores. No elimines ni renombres arbitrariamente el origen (dominio/ruta) si quieres conservar los datos de esa instalación. Mantén `DB_NAME` y administra migraciones antes de alterar el esquema de datos.

## Importación

La importación **reemplaza por completo** los registros, el catálogo y los ajustes de esta instalación tras una confirmación. Haz un respaldo del estado actual antes de importar.

## Nutrientes

Esta versión calcula exclusivamente calorías. Los valores de densidad calórica los introduce el usuario, idealmente según las etiquetas de cada producto; la aplicación no inventa ni consulta valores nutricionales.

## Notas de compatibilidad

Usa `IndexedDB`, `Service Worker`, `Web Manifest`, `Web Share` (si existe) y `File API`. Safari iOS moderno es compatible. Las funciones opcionales tienen degradación gradual, excepto IndexedDB, que es obligatorio para el guardado.
