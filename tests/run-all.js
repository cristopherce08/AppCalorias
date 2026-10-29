/**
 * run-all.js — Ejecutor central de pruebas unitarias y de integración
 */
console.log('====================================================');
console.log('   MICALORÍAS 4.0 — SUITE DE PRUEBAS AUTOMATIZADAS  ');
console.log('====================================================\n');

try {
  await import('./unit/utils.test.js');
  console.log('');
  await import('./unit/energy.test.js');
  console.log('');
  await import('./unit/validation.test.js');
  console.log('');
  await import('./integration/database.test.js');
  console.log('\n====================================================');
  console.log('  ✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE (100%)    ');
  console.log('====================================================');
} catch (error) {
  console.error('\n✖ FALLO EN LA EJECUCIÓN DE PRUEBAS:', error);
  process.exit(1);
}
