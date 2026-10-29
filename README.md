# MiCalorías 2.0 — PWA local para iPhone (Calorías, Proteínas & Porciones)

Aplicación web progresiva gratuita, privada y 100% local, sin backend, sin cuentas de usuario, sin notificaciones y sin servicios externos. Todos los datos y registros se guardan en **IndexedDB** en el iPhone que la abre y funciona sin conexión mediante **Service Worker**.

## Novedades de la Versión 2.0
- **Seguimiento dual**: Registro de calorías y proteínas (en gramos) por ingrediente y comida.
- **Biblioteca "Mis alimentos"**: Guarda alimentos recurrentes (ej.: proteína Whey, atún, avena, huevos) con sus valores nutricionales y marca opcional.
- **Porciones personalizadas**: Soporte para unidades habituales como `scoop`, `lata`, `rebanada`, `unidad`, `porción`, `taza`, o pesaje en `g`/`ml`. Selección rápida de porciones (0.5, 1, 1.5, 2 scoops).
- **Registro rápido de comidas**: Busca en tu biblioteca, elige la cantidad en un toque, agrega múltiples ingredientes y guarda la comida completa evitando pulsaciones dobles.
- **Objetivos diarios personales**: Configuración de metas diarias de calorías (kcal) y proteínas (g) con barras de progreso visuales.
- **Congelamiento de datos históricos**: Al guardar una comida se congela una copia de los valores nutricionales utilizados; editar o eliminar un alimento en tu biblioteca nunca alterará tus comidas pasadas.
- **Retrocompatibilidad total**: Admite registros y respaldos de la versión 1.0 sin pérdida de datos.

## Instalación en iPhone desde Safari

1. Abre la URL en **Safari en tu iPhone**:
   `https://cristopherce08.github.io/AppCalorias/`
2. Deja que cargue por completo para registrar el Service Worker y guardar los archivos en caché.
3. Pulsa el botón **Compartir** de Safari (icono del cuadrado con flecha hacia arriba).
4. Selecciona **«Añadir a pantalla de inicio»** → pulsa **«Añadir»**.
5. Abre **MiCalorías** desde el icono en tu pantalla de inicio.
6. Para probar el modo sin conexión: activa el **Modo Avión** y comprueba que puedes registrar alimentos con normalidad.

## Dónde se almacenan los datos

Se almacenan exclusivamente en el **IndexedDB** de la PWA en tu iPhone. No se transmite ningún dato a servidores externos. Para proteger tu información ante limpiezas de almacenamiento de iOS, exporta periódicamente una copia desde **Ajustes → Exportar copia JSON** y guárdala en la app **Archivos** o en **iCloud Drive**.
