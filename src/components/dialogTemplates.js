/**
 * dialogTemplates.js — Plantillas modulares de cuadros de diálogo (<dialog>) de la aplicación
 * Inyecta los cuadros modales al DOM de forma limpia si no están presentes en el cascarón HTML.
 */

export const DIALOGS_HTML = `<dialog id="weight-dialog" class="entry-dialog" aria-labelledby="weight-dialog-title">
    <form id="weight-form" class="entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">PESO CORPORAL</div>
          <h2 id="weight-dialog-title">Registrar peso</h2>
        </div>
        <button type="button" class="close-button" id="btn-close-weight-dialog" aria-label="Cerrar">×</button>
      </div>

      <label class="form-label">
        Fecha de la medición
        <input id="w-date-input" type="date" required />
      </label>

      <label class="form-label">
        Peso corporal (kg)
        <input id="w-val-input" type="number" min="20" max="400" step="0.1" inputmode="decimal" placeholder="Ej.: 81.5" required />
      </label>

      <label class="form-label">
        Nota opcional (ej. en ayunas, post-entreno)
        <input id="w-note-input" type="text" maxlength="60" placeholder="Ej.: En ayunas" autocomplete="off" />
      </label>

      <div class="weight-tip-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/></svg>Se recomienda pesarse a la misma hora y bajo condiciones similares para evitar variaciones por retención de líquidos.
      </div>

      <button type="submit" id="btn-save-weight" class="primary-button wide-button">Guardar peso</button>
    </form>
  </dialog>

  <!-- DIÁLOGO: CONFIRMAR Y AJUSTAR META DESDE LA CALCULADORA -->
  <dialog id="goal-confirm-dialog" class="entry-dialog" aria-labelledby="goal-confirm-title">
    <form id="goal-confirm-form" class="entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">ESTABLECER META</div>
          <h2 id="goal-confirm-title">Confirmar objetivo calórico</h2>
        </div>
        <button type="button" class="close-button" id="btn-close-goal-dialog" aria-label="Cerrar">×</button>
      </div>

      <p class="muted" style="margin-top:0">Puedes aceptar la estimación calculada o ajustar la cifra manualmente a un número redondo de tu elección.</p>

      <label class="form-label">
        Calorías diarias deseadas (kcal/día)
        <input id="goal-confirm-input" type="number" min="500" max="15000" step="1" inputmode="numeric" required />
      </label>

      <div class="nutrition-preview-card" style="margin:10px 0 16px">
        <div class="preview-metric">
          <span class="preview-label">Meta propuesta</span>
          <strong id="goal-preview-display" class="preview-val-kcal">2,300 kcal</strong>
        </div>
      </div>

      <p class="warning-note" style="margin-bottom:16px">Esta acción solo actualizará tu meta de calorías en «Hoy». Tu meta de proteínas se conservará sin cambios.</p>

      <button type="submit" id="btn-confirm-set-goal" class="primary-button wide-button">Confirmar y activar meta</button>
    </form>
  </dialog>

  <!-- MODAL: REGISTRO RÁPIDO DE COMIDA -->
  <dialog id="quick-add-dialog" class="entry-dialog" aria-labelledby="quick-add-title">
    <div class="dialog-head">
      <div>
        <div class="eyebrow">REGISTRO RÁPIDO</div>
        <h2 id="quick-add-title">Agregar a comida</h2>
      </div>
      <button type="button" class="close-button" id="btn-close-quick-add" aria-label="Cerrar">×</button>
    </div>

    <!-- SELECTOR DE COMIDA -->
    <div class="meal-picker-bar" role="radiogroup" aria-label="Selecciona la comida">
      <button type="button" class="meal-chip active" data-meal-choice="desayuno">Desayuno</button>
      <button type="button" class="meal-chip" data-meal-choice="almuerzo">Almuerzo</button>
      <button type="button" class="meal-chip" data-meal-choice="cena">Cena</button>
      <button type="button" class="meal-chip" data-meal-choice="snack">Snack</button>
    </div>

    <!-- TABS DE MODO: DE BIBLIOTECA vs INGRESO MANUAL -->
    <div class="mode-tabs">
      <button type="button" class="mode-tab active" id="tab-mode-library">De Mis alimentos</button>
      <button type="button" class="mode-tab" id="tab-mode-manual">Ingreso manual</button>
    </div>

    <!-- SECCIÓN DE BIBLIOTECA -->
    <div id="quick-add-library-panel">
      <label class="search-field compact">
        <span aria-hidden="true">⌕</span>
        <input id="quick-search-input" type="search" placeholder="Buscar en mis alimentos..." autocomplete="off" />
      </label>

      <!-- LISTA DE ALIMENTOS DISPONIBLES EN LA BIBLIOTECA -->
      <div id="quick-foods-list" class="quick-foods-list"></div>

      <!-- PANEL DE CONFIGURACIÓN DEL ALIMENTO SELECCIONADO -->
      <div id="quick-selected-panel" class="selected-food-panel" hidden>
        <div class="selected-food-header">
          <div>
            <strong id="q-selected-name">Nombre del alimento</strong>
            <span id="q-selected-meta" class="selected-meta">120 kcal / scoop</span>
          </div>
          <button type="button" id="btn-clear-selection" class="text-button-mini">Cambiar</button>
        </div>

        <div class="quick-amount-row">
          <label class="form-label" style="margin-bottom:6px">
            Cantidad (<span id="q-selected-unit-label">scoop</span>)
            <input id="q-amount-input" type="number" min="0.01" max="100000" step="any" inputmode="decimal" value="1" required />
          </label>
        </div>

        <!-- CHIPS DE CANTIDAD RÁPIDA -->
        <div id="quick-amount-chips" class="quick-chips-row"></div>

        <div class="nutrition-preview-card">
          <div class="preview-metric">
            <span class="preview-label">Calorías</span>
            <strong id="q-preview-kcal" class="preview-val-kcal">0 kcal</strong>
          </div>
          <div class="preview-divider"></div>
          <div class="preview-metric">
            <span class="preview-label">Proteínas</span>
            <strong id="q-preview-protein" class="preview-val-protein">0 g</strong>
          </div>
        </div>

        <button type="button" id="btn-add-staged-item" class="primary-button wide-button">＋ Añadir a esta comida</button>
      </div>
    </div>

    <!-- SECCIÓN DE INGRESO MANUAL -->
    <form id="quick-add-manual-form" class="manual-entry-form" hidden>
      <label class="form-label">
        Nombre del ingrediente *
        <input id="manual-name" type="text" maxlength="120" placeholder="Ej.: Huevo cocido" required autocomplete="off" />
      </label>
      <label class="form-label">
        Marca (opcional)
        <input id="manual-brand" type="text" maxlength="80" placeholder="Ej.: La Calera" autocomplete="off" />
      </label>

      <div class="base-type-toggle tri-toggle">
        <label class="radio-pill">
          <input type="radio" name="manual-base-type" value="weight_volume" checked />
          <span>Por 100 g / ml</span>
        </label>
        <label class="radio-pill">
          <input type="radio" name="manual-base-type" value="portion" />
          <span>Por porción</span>
        </label>
        <label class="radio-pill">
          <input type="radio" name="manual-base-type" value="total_consumed" />
          <span>Valores totales</span>
        </label>
      </div>

      <!-- CAMPOS PARA BASE 100g/ml -->
      <div id="manual-weight-fields">
        <div class="form-grid">
          <label class="form-label">
            Cantidad *
            <input id="manual-w-amount" type="number" min="0.01" max="100000" step="any" inputmode="decimal" placeholder="100" />
          </label>
          <label class="form-label">
            Unidad *
            <select id="manual-w-unit">
              <option value="g">gramos (g)</option>
              <option value="ml">mililitros (ml)</option>
            </select>
          </label>
        </div>
        <div class="form-grid">
          <label class="form-label">
            Calorías por 100 <span class="manual-unit-txt">g</span> *
            <input id="manual-w-kcal" type="number" min="0" max="10000" step="any" inputmode="decimal" placeholder="170" />
          </label>
          <label class="form-label">
            Proteínas por 100 <span class="manual-unit-txt">g</span>
            <input id="manual-w-protein" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="Ej.: 25" />
          </label>
        </div>
      </div>

      <!-- CAMPOS PARA BASE PORCIÓN -->
      <div id="manual-portion-fields" hidden>
        <div class="form-grid">
          <label class="form-label">
            Cantidad de porciones *
            <input id="manual-p-amount" type="number" min="0.01" max="10000" step="any" inputmode="decimal" placeholder="1" />
          </label>
          <label class="form-label">
            Nombre de la porción *
            <input id="manual-p-unit" type="text" maxlength="40" placeholder="Ej.: scoop, lata, unidad" />
          </label>
        </div>
        <div class="form-grid">
          <label class="form-label">
            Calorías por porción *
            <input id="manual-p-kcal" type="number" min="0" max="10000" step="any" inputmode="decimal" placeholder="120" />
          </label>
          <label class="form-label">
            Proteínas por porción
            <input id="manual-p-protein" type="number" min="0" max="200" step="any" inputmode="decimal" placeholder="Ej.: 24" />
          </label>
        </div>
        <label class="form-label">
          Peso de 1 porción en gramos (opcional)
          <input id="manual-p-grams" type="number" min="0.1" max="5000" step="any" inputmode="decimal" placeholder="Ej.: 30" />
        </label>
      </div>

      <!-- CAMPOS PARA VALORES TOTALES CONSUMIDOS -->
      <div id="manual-total-fields" hidden>
        <div class="form-grid">
          <label class="form-label">
            Cantidad consumida *
            <input id="manual-t-amount" type="number" min="0.01" max="100000" step="any" inputmode="decimal" placeholder="Ej.: 600" />
          </label>
          <label class="form-label">
            Unidad *
            <select id="manual-t-unit">
              <option value="g">gramos (g)</option>
              <option value="ml">mililitros (ml)</option>
            </select>
          </label>
        </div>
        <div class="form-grid">
          <label class="form-label">
            Calorías totales consumidas *
            <input id="manual-t-kcal" type="number" min="0" max="20000" step="any" inputmode="decimal" placeholder="Ej.: 180" />
          </label>
          <label class="form-label">
            Proteínas totales (opcional)
            <input id="manual-t-protein" type="number" min="0" max="1000" step="any" inputmode="decimal" placeholder="Ej.: 0" />
          </label>
        </div>
        <div class="total-equivalence-hint" id="manual-t-equiv-hint" style="font-size:11.5px;color:var(--sub);margin:-6px 0 14px 2px;" hidden>
          Equivalencia: <span id="manual-t-equiv-text">—</span>
        </div>
      </div>

      <div class="nutrition-preview-card">
        <div class="preview-metric">
          <span class="preview-label">Calorías calculadas</span>
          <strong id="manual-preview-kcal" class="preview-val-kcal">0 kcal</strong>
        </div>
        <div class="preview-divider"></div>
        <div class="preview-metric">
          <span class="preview-label">Proteínas calculadas</span>
          <strong id="manual-preview-protein" class="preview-val-protein">0 g</strong>
        </div>
      </div>

      <label class="checkbox-line">
        <input id="manual-save-to-library" type="checkbox" checked />
        Guardar también en Mis alimentos para reutilizarlo
      </label>

      <button type="button" id="btn-add-manual-item" class="primary-button wide-button">＋ Añadir a esta comida</button>
    </form>

    <!-- INGREDIENTES ACUMULADOS EN ESTA SESIÓN (STAGED ITEMS) -->
    <div id="staged-section" class="staged-section" hidden>
      <div class="staged-head">
        <strong>Ingredientes para guardar en <span id="staged-meal-name">Desayuno</span>:</strong>
        <span id="staged-count" class="badge">0</span>
      </div>
      <div id="staged-items-list" class="staged-items-list"></div>

      <div class="staged-totals-bar">
        <div>
          <div class="staged-totals-title">TOTAL DE ESTA COMIDA</div>
          <div class="staged-totals-values">
            <span id="staged-total-kcal" class="total-kcal-val">0 kcal</span>
            <span class="sep">·</span>
            <span id="staged-total-protein" class="total-prot-val">0 g prot</span>
          </div>
        </div>
        <button type="button" id="btn-save-entire-meal" class="primary-button save-meal-btn">Guardar comida</button>
      </div>
    </div>
  </dialog>

  <!-- MODAL: CREAR / EDITAR ALIMENTO EN "MIS ALIMENTOS" -->
  <dialog id="food-dialog" class="entry-dialog" aria-labelledby="food-dialog-title">
    <form id="food-form" class="entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">BIBLIOTECA</div>
          <h2 id="food-dialog-title">Nuevo alimento</h2>
        </div>
        <button type="button" class="close-button" id="btn-close-food-dialog" aria-label="Cerrar">×</button>
      </div>

      <label class="form-label">
        Nombre del alimento *
        <input id="f-name" type="text" maxlength="120" placeholder="Ej.: Mi proteína Whey, Atún Primor, Avena..." required autocomplete="off" />
      </label>

      <label class="form-label">
        Marca o descripción (opcional)
        <input id="f-brand" type="text" maxlength="80" placeholder="Ej.: Bell's, Optimum Nutrition, Casero..." autocomplete="off" />
      </label>

      <label class="form-label" style="margin-bottom:8px">Base nutricional *</label>
      <div class="base-type-toggle">
        <label class="radio-pill">
          <input type="radio" name="f-base-type" value="weight_volume" checked />
          <span>Por 100 g / ml</span>
        </label>
        <label class="radio-pill">
          <input type="radio" name="f-base-type" value="portion" />
          <span>Por porción (scoop, lata, etc.)</span>
        </label>
      </div>

      <!-- CAMPOS BASE 100g/ml -->
      <div id="f-fields-weight">
        <div class="form-grid">
          <label class="form-label">
            Unidad habitual
            <select id="f-unit">
              <option value="g">Gramos (g)</option>
              <option value="ml">Mililitros (ml)</option>
            </select>
          </label>
          <label class="form-label">
            Cantidad predeterminada
            <input id="f-default-amount-w" type="number" min="0.01" max="10000" step="any" placeholder="100" />
          </label>
        </div>
        <div class="form-grid">
          <label class="form-label">
            Calorías por 100 <span class="f-unit-label">g</span> *
            <input id="f-kcal100" type="number" min="0" max="10000" step="any" inputmode="decimal" placeholder="Ej.: 170" />
          </label>
          <label class="form-label">
            Proteínas por 100 <span class="f-unit-label">g</span>
            <input id="f-protein100" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="Ej.: 25" />
          </label>
        </div>
      </div>

      <!-- CAMPOS BASE PORCIÓN -->
      <div id="f-fields-portion" hidden>
        <div class="form-grid">
          <label class="form-label">
            Nombre de la unidad/porción *
            <input id="f-portion-unit" type="text" maxlength="40" placeholder="Ej.: scoop, lata, rebanada, taza" />
          </label>
          <label class="form-label">
            Porciones predeterminadas
            <input id="f-default-amount-p" type="number" min="0.1" max="1000" step="any" placeholder="1" />
          </label>
        </div>
        <div class="form-grid">
          <label class="form-label">
            Calorías por porción *
            <input id="f-kcal-portion" type="number" min="0" max="10000" step="any" inputmode="decimal" placeholder="Ej.: 120" />
          </label>
          <label class="form-label">
            Proteínas por porción
            <input id="f-protein-portion" type="number" min="0" max="200" step="any" inputmode="decimal" placeholder="Ej.: 24" />
          </label>
        </div>
        <label class="form-label">
          Peso de la porción en gramos (opcional)
          <input id="f-portion-grams" type="number" min="0.1" max="5000" step="any" inputmode="decimal" placeholder="Ej.: 30" />
        </label>
      </div>

      <label class="checkbox-line" style="margin-top:10px">
        <input id="f-favorite" type="checkbox" />
        ⭐ Marcar como favorito (aparecerá primero al registrar)
      </label>

      <button type="submit" id="btn-save-food-item" class="primary-button wide-button">Guardar alimento</button>
    </form>
  </dialog>

  <!-- MODAL: EDITAR INGREDIENTE EN EL DIARIO -->
  <dialog id="entry-dialog" class="entry-dialog" aria-labelledby="entry-dialog-title">
    <form id="entry-form" class="entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">DIARIO</div>
          <h2 id="entry-dialog-title">Editar ingrediente</h2>
        </div>
        <button type="button" class="close-button" id="btn-close-entry-dialog" aria-label="Cerrar">×</button>
      </div>

      <label class="form-label">
        Comida
        <select id="edit-entry-meal" required>
          <option value="desayuno">Desayuno</option>
          <option value="almuerzo">Almuerzo</option>
          <option value="cena">Cena</option>
          <option value="snack">Snack</option>
        </select>
      </label>

      <label class="form-label">
        Nombre
        <input id="edit-entry-name" type="text" maxlength="120" required autocomplete="off" />
      </label>

      <label class="form-label">
        Marca (opcional)
        <input id="edit-entry-brand" type="text" maxlength="80" autocomplete="off" />
      </label>

      <div class="form-grid">
        <label class="form-label">
          Cantidad consumida
          <input id="edit-entry-amount" type="number" min="0.01" max="100000" step="any" inputmode="decimal" required />
        </label>
        <label class="form-label">
          Unidad
          <input id="edit-entry-unit" type="text" maxlength="30" required />
        </label>
      </div>

      <div class="form-grid">
        <label class="form-label" id="edit-kcal-label">
          Calorías base
          <input id="edit-entry-density-kcal" type="number" min="0" max="10000" step="any" inputmode="decimal" required />
        </label>
        <label class="form-label" id="edit-protein-label">
          Proteínas base (opcional)
          <input id="edit-entry-density-protein" type="number" min="0" max="500" step="any" inputmode="decimal" placeholder="—" />
        </label>
      </div>

      <div class="nutrition-preview-card">
        <div class="preview-metric">
          <span class="preview-label">Calorías calculadas</span>
          <strong id="edit-preview-kcal" class="preview-val-kcal">0 kcal</strong>
        </div>
        <div class="preview-divider"></div>
        <div class="preview-metric">
          <span class="preview-label">Proteínas calculadas</span>
          <strong id="edit-preview-protein" class="preview-val-protein">0 g</strong>
        </div>
      </div>

      <button type="submit" id="btn-save-entry-edit" class="primary-button wide-button">Guardar cambios</button>
    </form>
  </dialog>

  <!-- MODAL: USAR ALIMENTO DIRECTAMENTE DESDE MIS ALIMENTOS -->
  <dialog id="use-food-dialog" class="entry-dialog" aria-labelledby="use-food-title">
    <form id="use-food-form" class="entry-form">
      <div class="dialog-head">
        <div>
          <div class="eyebrow">AÑADIR AL DIARIO</div>
          <h2 id="use-food-title">Añadir a comida</h2>
        </div>
        <button type="button" class="close-button" id="btn-close-use-dialog" aria-label="Cerrar">×</button>
      </div>

      <div class="selected-food-header" style="margin-bottom:14px">
        <div>
          <strong id="u-food-name">Nombre</strong>
          <span id="u-food-meta" class="selected-meta">Detalle nutricional</span>
        </div>
      </div>

      <label class="form-label">
        Comida
        <select id="u-meal-select" required>
          <option value="desayuno">Desayuno</option>
          <option value="almuerzo">Almuerzo</option>
          <option value="cena">Cena</option>
          <option value="snack">Snack</option>
        </select>
      </label>

      <label class="form-label">
        Cantidad (<span id="u-unit-label">g</span>)
        <input id="u-amount-input" type="number" min="0.01" max="100000" step="any" inputmode="decimal" required />
      </label>

      <!-- CHIPS RÁPIDOS -->
      <div id="u-amount-chips" class="quick-chips-row"></div>

      <div class="nutrition-preview-card">
        <div class="preview-metric">
          <span class="preview-label">Calorías</span>
          <strong id="u-preview-kcal" class="preview-val-kcal">0 kcal</strong>
        </div>
        <div class="preview-divider"></div>
        <div class="preview-metric">
          <span class="preview-label">Proteínas</span>
          <strong id="u-preview-protein" class="preview-val-protein">0 g</strong>
        </div>
      </div>

      <button type="submit" id="btn-confirm-use-food" class="primary-button wide-button">Añadir a mi comida</button>
    </form>
  </dialog>`;

export function mountDialogTemplates() {
  if (typeof document === "undefined") return;
  if (document.getElementById("quick-add-dialog")) return;

  const container = document.createElement("div");
  container.id = "app-dialogs-container";
  container.innerHTML = DIALOGS_HTML;
  document.body.appendChild(container);
}
