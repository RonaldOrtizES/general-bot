const { sendTextMessage, sendInteractiveList, sendInteractiveButtons } = require('../services/whatsappService');
const { getSession, setSession, clearSession } = require('../services/conversationService');
const jira = require('../services/jiraService');

// ─── Timers de inactividad ────────────────────────────────────────────────────

const INACTIVITY_MS = 3 * 60 * 1000;
const timers = new Map();

const sendGoodbye = async (to, reason) => {
  if (reason === 'cancel') {
    await sendTextMessage(
      to,
      `✅ *¡Proceso cancelado!* 👍\n\n` +
      `No hay problema, ¡tú tienes el control! 😊\n\n` +
      `Fue un placer ayudarte. Cuando quieras retomar escribe *hola* y estaré listo. 🤖💙\n\n` +
      `¡Que tengas un día increíble! ☀️✨🌟`,
    );
  } else {
    await sendTextMessage(
      to,
      `⏰ *Sesión cerrada por inactividad*\n\n` +
      `Parece que te fuiste un rato — ¡sin problema! 😊\n\n` +
      `Cuando quieras continuar escribe *hola* o *menu* y estaré aquí. 🤖💙\n\n` +
      `¡Que tengas un excelente día! ☀️✨🌟`,
    );
  }
};

const cancelExpiry = (userId) => {
  if (timers.has(userId)) {
    clearTimeout(timers.get(userId));
    timers.delete(userId);
  }
};

const scheduleExpiry = (userId) => {
  cancelExpiry(userId);
  const timer = setTimeout(async () => {
    timers.delete(userId);
    if (getSession(userId)) {
      clearSession(userId);
      try { await sendGoodbye(userId, 'timeout'); } catch (e) {
        console.error(`[JiraBot] timeout goodbye error ${userId}:`, e.message);
      }
    }
  }, INACTIVITY_MS);
  timers.set(userId, timer);
};

const startSession = (to, state) => {
  setSession(to, state);
  scheduleExpiry(to);
};

// ─── IDs exclusivos del menú principal ───────────────────────────────────────
// Solo estos IDs deben llegar a handleMenuSelection
const MENU_IDS = new Set([
  'get_issue', 'search_issues', 'get_projects',
  'create_issue', 'update_issue', 'transition_issue', 'add_comment',
]);

// ─── Textos fijos ─────────────────────────────────────────────────────────────

const GREETING_TEXT =
  `¡Hola! 👋 ¡Qué bueno tenerte aquí! 😊\n\n` +
  `Soy *JiraBot* 🤖, tu asistente personal de Jira — directo en WhatsApp, sin abrir el navegador. 💡\n\n` +
  `Con solo unos mensajes puedes:\n` +
  `🎫 *Consultar* cualquier issue al instante\n` +
  `🔎 *Explorar* issues por proyecto\n` +
  `➕ *Crear* nuevos issues en segundos\n` +
  `✏️ *Actualizar* y gestionar issues existentes\n` +
  `🔄 *Cambiar estados* y mantener el flujo\n` +
  `💬 *Comentar* y colaborar con tu equipo\n\n` +
  `✨ _¡Todo desde la palma de tu mano!_\n\n` +
  `💡 _Escribe *cancelar* para detener el proceso o *menu* para volver al inicio._\n\n` +
  `👇 *Elige una opción para comenzar:*`;

const RETURN_TEXT = `🎯 ¿Qué más puedo hacer por ti hoy?\n\n👇 *Elige tu próxima acción:*`;

// ─── Menú ─────────────────────────────────────────────────────────────────────

const MENU_PAYLOAD = {
  header:     '🤖 JiraBot — Tu asistente Jira',
  footer:     '💡 Escribe *menu* para volver aquí',
  buttonText: '📋 Ver opciones',
  sections: [
    {
      title: '🔍 Consultas',
      rows: [
        { id: 'get_issue',     title: '🎫 Consultar issue',  description: 'Busca un issue por su clave' },
        { id: 'search_issues', title: '🔎 Explorar issues',  description: 'Explora issues por proyecto' },
        { id: 'get_projects',  title: '📁 Ver proyectos',    description: 'Lista todos los proyectos' },
      ],
    },
    {
      title: '⚙️ Gestión',
      rows: [
        { id: 'create_issue',     title: '➕ Crear issue',      description: 'Crear un nuevo issue' },
        { id: 'update_issue',     title: '✏️ Actualizar issue', description: 'Modificar un issue existente' },
        { id: 'transition_issue', title: '🔄 Cambiar estado',   description: 'Mover un issue a otro estado' },
        { id: 'add_comment',      title: '💬 Comentar issue',   description: 'Añadir comentario a un issue' },
      ],
    },
  ],
};

const sendMainMenu = async (to, bodyText = RETURN_TEXT) =>
  sendInteractiveList(to, { ...MENU_PAYLOAD, body: bodyText });

const sendWelcomeAndMenu = async (to) => {
  cancelExpiry(to);
  await sendTextMessage(to, GREETING_TEXT);
  await sendInteractiveList(to, { ...MENU_PAYLOAD, body: `👆 *Aquí tienes todo lo que puedo hacer por ti:*` });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stepLabel = (current, total, label) =>
  `📍 _Paso ${current} de ${total}_ — ${label}\n`;

const formatIssue = (issue) => {
  const f        = issue.fields;
  const status   = f.status?.name          || 'N/A';
  const type     = f.issuetype?.name       || 'N/A';
  const priority = f.priority?.name        || 'N/A';
  const assignee = f.assignee?.displayName || 'Sin asignar';
  const project  = f.project?.name         || 'N/A';
  return (
    `🎫 *${issue.key}*\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `📝 ${f.summary}\n\n` +
    `📁 Proyecto: *${project}*\n` +
    `🔖 Tipo: *${type}*\n` +
    `📊 Estado: *${status}*\n` +
    `⚡ Prioridad: *${priority}*\n` +
    `👤 Asignado: *${assignee}*`
  );
};

const done = async (to) => {
  cancelExpiry(to);
  clearSession(to);
  await sendMainMenu(to);
};

// ─── Selector de proyectos ────────────────────────────────────────────────────

const sendProjectPicker = async (to, { body }) => {
  await sendTextMessage(to, `⏳ _Cargando proyectos disponibles..._`);
  const projects = await jira.getProjects(); // deja lanzar si falla

  if (!projects.length) throw new Error('Sin proyectos disponibles');

  const items = projects.map((p) => ({ id: `proj_${p.key}`, name: p.name, key: p.key }));

  if (items.length <= 3) {
    await sendInteractiveButtons(to, {
      body,
      footer: '💡 Selecciona el proyecto',
      buttons: items.map((item) => ({
        id:    item.id,
        title: `📁 ${item.key}`.substring(0, 20),
      })),
    });
  } else {
    await sendInteractiveList(to, {
      body,
      footer: '💡 Selecciona el proyecto',
      buttonText: '📁 Ver proyectos',
      sections: [{
        title: 'Proyectos disponibles',
        rows: items.slice(0, 10).map((item) => ({
          id:          item.id,
          title:       item.name.substring(0, 24),
          description: `Clave: ${item.key}`,
        })),
      }],
    });
  }
};

// Extrae la project key desde un interactiveId tipo "proj_KEY" o desde texto libre
const extractProjectKey = (interactiveId, text) => {
  if (interactiveId?.startsWith('proj_')) return interactiveId.slice(5) || null;
  const raw = (text || '').trim().toUpperCase();
  return raw === 'OMITIR' || !raw ? null : raw;
};

// ─── Handlers del menú ────────────────────────────────────────────────────────

const handleGetProjects = async (to) => {
  try {
    await sendTextMessage(to, `⏳ _Consultando proyectos en Jira..._`);
    const projects = await jira.getProjects();
    if (!projects.length) {
      await sendTextMessage(to, `📁 No encontré proyectos disponibles por ahora. 🤔`);
    } else {
      const list = projects.slice(0, 20).map((p) => `• 📁 *${p.key}* — ${p.name}`).join('\n');
      await sendTextMessage(
        to,
        `✅ ¡Encontré *${projects.length}* proyecto${projects.length !== 1 ? 's' : ''}! 🎉\n\n${list}`,
      );
    }
  } catch (err) {
    await sendTextMessage(to, `😟 Algo salió mal al obtener los proyectos.\n\n_Error: ${err.message}_`);
  }
  await done(to);
};

const handleMenuSelection = async (to, selectedId) => {
  switch (selectedId) {

    case 'get_issue':
      startSession(to, { flow: 'get_issue', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `🔍 *Consultar Issue*\n\n` +
        `Dime la *clave del issue* que deseas consultar y te traigo todos los detalles. 😊\n\n` +
        `_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'search_issues':
      // Flujo: proyecto → lista de issues → detalle del issue
      startSession(to, { flow: 'search_issues', step: 'await_project', data: {} });
      try {
        await sendProjectPicker(to, {
          body: `🔎 *Explorar Issues*\n\n${stepLabel(1, 2, 'Proyecto')}\n¿En qué proyecto quieres explorar?`,
        });
      } catch {
        await sendTextMessage(
          to,
          `🔎 *Explorar Issues*\n\n${stepLabel(1, 2, 'Proyecto')}\n` +
          `Ingresa la clave del proyecto:\n\n_Ejemplo: *PROJ*_`,
        );
      }
      break;

    case 'get_projects':
      await handleGetProjects(to);
      break;

    case 'create_issue':
      startSession(to, { flow: 'create_issue', step: 'await_project', data: {} });
      try {
        await sendProjectPicker(to, {
          body: `➕ *Crear Issue*\n\n${stepLabel(1, 5, 'Proyecto')}\n¡Vamos a crear tu issue! 🚀 ¿En qué proyecto lo creamos?`,
        });
      } catch {
        await sendTextMessage(
          to,
          `➕ *Crear Issue*\n\n${stepLabel(1, 5, 'Proyecto')}\n` +
          `Ingresa la clave del proyecto:\n\n_Ejemplo: *PROJ*_`,
        );
      }
      break;

    case 'update_issue':
      startSession(to, { flow: 'update_issue', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `✏️ *Actualizar Issue*\n\n${stepLabel(1, 3, 'Clave del issue')}\n` +
        `¿Cuál es la clave del issue que deseas actualizar?\n\n_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'transition_issue':
      startSession(to, { flow: 'transition_issue', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `🔄 *Cambiar Estado*\n\n${stepLabel(1, 2, 'Clave del issue')}\n` +
        `¿Cuál es la clave del issue al que quieres cambiarle el estado?\n\n_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'add_comment':
      startSession(to, { flow: 'add_comment', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `💬 *Agregar Comentario*\n\n${stepLabel(1, 2, 'Clave del issue')}\n` +
        `¿A qué issue deseas agregar el comentario?\n\n_Ejemplo: *PROJ-123*_`,
      );
      break;

    default:
      await sendWelcomeAndMenu(to);
  }
};

// ─── Manejo paso a paso de cada flujo ─────────────────────────────────────────

const handleFlowStep = async (to, session, text, interactiveId) => {
  const { flow, step: currentStep, data } = session;

  // Si el usuario seleccionó del menú principal estando mid-flow → redirigir limpiamente
  if (interactiveId && MENU_IDS.has(interactiveId)) {
    cancelExpiry(to);
    clearSession(to);
    await handleMenuSelection(to, interactiveId);
    return;
  }

  const input = (interactiveId || text || '').trim();
  scheduleExpiry(to); // resetea el timer en cada interacción

  // ── GET ISSUE ──────────────────────────────────────────────────────────────
  if (flow === 'get_issue' && currentStep === 'await_key') {
    if (!input) { await sendTextMessage(to, `⚠️ Por favor ingresa la clave del issue. _Ejemplo: PROJ-123_`); return; }
    await sendTextMessage(to, `⏳ _Buscando *${input.toUpperCase()}*..._`);
    try {
      const issue = await jira.getIssue(input.toUpperCase());
      await sendTextMessage(to, `✅ ¡Aquí tienes los detalles! 👇\n\n${formatIssue(issue)}`);
    } catch {
      await sendTextMessage(
        to,
        `😟 No encontré el issue *${input.toUpperCase()}*.\n\n` +
        `💡 _Verifica que la clave sea correcta (ej: PROJ-123)._`,
      );
    }
    await done(to);
    return;
  }

  // ── SEARCH ISSUES: paso 1 — seleccionar proyecto ───────────────────────────
  if (flow === 'search_issues' && currentStep === 'await_project') {
    const projectKey = extractProjectKey(interactiveId, text);
    if (!projectKey) {
      await sendTextMessage(to, `⚠️ Por favor selecciona un proyecto. 👆`);
      return;
    }
    await sendTextMessage(to, `⏳ _Cargando issues del proyecto *${projectKey}*..._`);
    try {
      const result = await jira.searchIssues({ projectKey, maxResults: 10 });
      if (!result.issues.length) {
        await sendTextMessage(
          to,
          `🔍 El proyecto *${projectKey}* no tiene issues disponibles. 🤔\n\n` +
          `💡 _Intenta con otro proyecto._`,
        );
        await done(to);
        return;
      }
      startSession(to, { flow: 'search_issues', step: 'await_issue', data: { projectKey } });
      await sendInteractiveList(to, {
        body:
          `🔎 *Issues en ${projectKey}*\n\n` +
          `${stepLabel(2, 2, 'Seleccionar issue')}\n` +
          `¡Encontré *${result.total}* issue${result.total !== 1 ? 's' : ''}!` +
          `${result.total > 10 ? ' _(mostrando primeros 10)_' : ''}\n\n` +
          `Selecciona uno para ver el detalle: 👇`,
        footer: '💡 Toca un issue para ver sus detalles',
        buttonText: '🎫 Ver issues',
        sections: [{
          title: `Issues — ${projectKey}`,
          rows: result.issues.map((i) => ({
            id:          `issue_${i.key}`,
            title:       i.key.substring(0, 24),
            description: `[${i.fields.status.name}] ${i.fields.summary}`.substring(0, 72),
          })),
        }],
      });
    } catch (err) {
      await sendTextMessage(to, `😟 No pude cargar los issues.\n\n_Error: ${err.message}_`);
      await done(to);
    }
    return;
  }

  // ── SEARCH ISSUES: paso 2 — mostrar detalle del issue seleccionado ─────────
  if (flow === 'search_issues' && currentStep === 'await_issue') {
    if (!interactiveId?.startsWith('issue_')) {
      await sendTextMessage(to, `⚠️ Por favor selecciona un issue de la lista. 👆`);
      return;
    }
    const issueKey = interactiveId.slice(6);
    await sendTextMessage(to, `⏳ _Cargando detalles de *${issueKey}*..._`);
    try {
      const issue = await jira.getIssue(issueKey);
      await sendTextMessage(to, `✅ ¡Aquí tienes el detalle completo! 👇\n\n${formatIssue(issue)}`);
    } catch {
      await sendTextMessage(
        to,
        `😟 No pude cargar el issue *${issueKey}*.\n\n` +
        `💡 _Intenta de nuevo o escribe *menu* para volver._`,
      );
    }
    await done(to);
    return;
  }

  // ── CREATE ISSUE: paso 1 — proyecto ───────────────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_project') {
    const projectKey = extractProjectKey(interactiveId, text);
    if (!projectKey) {
      await sendTextMessage(to, `⚠️ Debes seleccionar un proyecto específico. 👆`);
      return;
    }
    startSession(to, { flow: 'create_issue', step: 'await_summary', data: { projectKey } });
    await sendTextMessage(
      to,
      `➕ *Crear Issue en ${projectKey}*\n\n${stepLabel(2, 5, 'Resumen')}\n` +
      `¡Genial! 🎯 ¿Cuál es el *título o resumen* de tu issue?\n\n` +
      `_Sé conciso y descriptivo — un buen título ayuda a todo el equipo. 💡_`,
    );
    return;
  }

  // ── CREATE ISSUE: paso 2 — resumen ────────────────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_summary') {
    if (!input) { await sendTextMessage(to, `⚠️ El resumen no puede estar vacío. Escribe el título del issue:`); return; }
    startSession(to, { flow: 'create_issue', step: 'await_type', data: { ...data, summary: input } });
    await sendInteractiveButtons(to, {
      body:   `➕ *Crear Issue*\n\n${stepLabel(3, 5, 'Tipo')}\n¡Excelente resumen! ✍️ ¿Qué *tipo* de issue es?`,
      footer: '💡 Elige el tipo que mejor describa tu tarea',
      buttons: [
        { id: 'type_task',  title: '📋 Task' },
        { id: 'type_bug',   title: '🐛 Bug' },
        { id: 'type_story', title: '📖 Story' },
      ],
    });
    return;
  }

  // ── CREATE ISSUE: paso 3 — tipo ───────────────────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_type') {
    const typeMap  = { type_task: 'Task', type_bug: 'Bug', type_story: 'Story' };
    const issueType = typeMap[interactiveId] || text || 'Task';
    startSession(to, { flow: 'create_issue', step: 'await_priority', data: { ...data, issueType } });
    await sendInteractiveButtons(to, {
      body:   `➕ *Crear Issue*\n\n${stepLabel(4, 5, 'Prioridad')}\n¡Ya casi! 🏁 ¿Qué *prioridad* tiene este issue?`,
      footer: '💡 La prioridad ayuda al equipo a organizarse',
      buttons: [
        { id: 'priority_high',   title: '🔴 High' },
        { id: 'priority_medium', title: '🟡 Medium' },
        { id: 'priority_low',    title: '🟢 Low' },
      ],
    });
    return;
  }

  // ── CREATE ISSUE: paso 4 — prioridad ─────────────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_priority') {
    const priorityMap = { priority_high: 'High', priority_medium: 'Medium', priority_low: 'Low' };
    const priority    = priorityMap[interactiveId] || text || 'Medium';
    startSession(to, { flow: 'create_issue', step: 'await_description', data: { ...data, priority } });
    await sendTextMessage(
      to,
      `➕ *Crear Issue*\n\n${stepLabel(5, 5, 'Descripción')}\n` +
      `¡Último paso! 🎉 ¿Quieres agregar una *descripción* detallada?\n\n` +
      `_Escríbela aquí, o envía *omitir* si no es necesario. 👌_`,
    );
    return;
  }

  // ── CREATE ISSUE: paso 5 — descripción → crear ────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_description') {
    const description = input.toLowerCase() === 'omitir' ? null : input;
    await sendTextMessage(to, `⏳ _Creando tu issue en Jira..._`);
    try {
      const created = await jira.createIssue({
        projectKey:  data.projectKey,
        summary:     data.summary,
        issueType:   data.issueType,
        priority:    data.priority,
        description,
      });
      await sendTextMessage(
        to,
        `🎉 *¡Issue creado exitosamente!* 🚀\n\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🎫 Clave: *${created.key}*\n` +
        `📝 ${data.summary}\n` +
        `🔖 Tipo: *${data.issueType}*\n` +
        `⚡ Prioridad: *${data.priority}*\n` +
        `━━━━━━━━━━━━━━━━━\n\n` +
        `✨ _¡Tu issue ya está disponible para el equipo!_`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude crear el issue.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── UPDATE ISSUE: paso 1 — clave ─────────────────────────────────────────
  if (flow === 'update_issue' && currentStep === 'await_key') {
    if (!input) { await sendTextMessage(to, `⚠️ Por favor ingresa la clave del issue. _Ejemplo: PROJ-123_`); return; }
    startSession(to, { flow: 'update_issue', step: 'await_field', data: { issueKey: input.toUpperCase() } });
    await sendInteractiveList(to, {
      body:       `✏️ *Actualizar Issue ${input.toUpperCase()}*\n\n${stepLabel(2, 3, 'Campo a modificar')}\n¿Qué campo deseas actualizar? 🛠️`,
      footer:     '💡 Puedes actualizar un campo a la vez',
      buttonText: '📋 Ver campos',
      sections: [{
        title: 'Campos disponibles',
        rows: [
          { id: 'field_summary',     title: '📝 Resumen',     description: 'Cambiar el título del issue' },
          { id: 'field_priority',    title: '⚡ Prioridad',    description: 'Low / Medium / High / Critical' },
          { id: 'field_description', title: '📄 Descripción', description: 'Cambiar la descripción detallada' },
        ],
      }],
    });
    return;
  }

  // ── UPDATE ISSUE: paso 2 — campo ─────────────────────────────────────────
  if (flow === 'update_issue' && currentStep === 'await_field') {
    const fieldMeta = {
      field_summary:     { key: 'summary',     label: 'nuevo resumen' },
      field_priority:    { key: 'priority',    label: 'nueva prioridad _(Low / Medium / High / Critical)_' },
      field_description: { key: 'description', label: 'nueva descripción' },
    }[interactiveId];

    if (!fieldMeta) {
      await sendTextMessage(to, `⚠️ Por favor selecciona un campo de la lista. 👆`);
      return;
    }
    startSession(to, { flow: 'update_issue', step: 'await_value', data: { ...data, field: fieldMeta.key } });
    await sendTextMessage(
      to,
      `✏️ *Actualizar ${data.issueKey}*\n\n${stepLabel(3, 3, 'Nuevo valor')}\n` +
      `¡Perfecto! 😊 Ingresa el ${fieldMeta.label}:`,
    );
    return;
  }

  // ── UPDATE ISSUE: paso 3 — nuevo valor → actualizar ──────────────────────
  if (flow === 'update_issue' && currentStep === 'await_value') {
    if (!input) { await sendTextMessage(to, `⚠️ El valor no puede estar vacío. Ingresa el nuevo ${data.field}:`); return; }
    await sendTextMessage(to, `⏳ _Actualizando *${data.issueKey}*..._`);
    try {
      await jira.updateIssue(data.issueKey, { [data.field]: input });
      await sendTextMessage(
        to,
        `✅ *¡Issue actualizado!* 🎯\n\n` +
        `🎫 *${data.issueKey}* — campo *${data.field}* actualizado correctamente. 👌`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude actualizar el issue.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── TRANSITION ISSUE: paso 1 — clave ─────────────────────────────────────
  if (flow === 'transition_issue' && currentStep === 'await_key') {
    if (!input) { await sendTextMessage(to, `⚠️ Por favor ingresa la clave del issue. _Ejemplo: PROJ-123_`); return; }
    await sendTextMessage(to, `⏳ _Cargando estados disponibles para *${input.toUpperCase()}*..._`);
    try {
      const transitions = await jira.getTransitions(input.toUpperCase());
      if (!transitions.length) {
        await sendTextMessage(
          to,
          `ℹ️ *${input.toUpperCase()}* no tiene transiciones disponibles.\n\n` +
          `💡 _Puede que ya esté en su estado final o no tengas permisos._`,
        );
        await done(to);
        return;
      }
      startSession(to, {
        flow: 'transition_issue',
        step: 'await_transition',
        data: { issueKey: input.toUpperCase(), transitions },
      });

      const body =
        `🔄 *Cambiar Estado: ${input.toUpperCase()}*\n\n${stepLabel(2, 2, 'Nuevo estado')}\n` +
        `¿A qué estado lo movemos? 🚀`;

      if (transitions.length > 3) {
        await sendInteractiveList(to, {
          body,
          footer:     '💡 Selecciona el estado destino',
          buttonText: '🔄 Ver estados',
          sections: [{
            title: 'Estados disponibles',
            rows:  transitions.slice(0, 10).map((t) => ({
              id:    `tr_${t.id}`,
              title: t.name.substring(0, 24),
            })),
          }],
        });
      } else {
        await sendInteractiveButtons(to, {
          body,
          footer:  '💡 Selecciona el nuevo estado',
          buttons: transitions.map((t) => ({ id: `tr_${t.id}`, title: t.name.substring(0, 20) })),
        });
      }
    } catch {
      await sendTextMessage(
        to,
        `😟 No encontré el issue *${input.toUpperCase()}*.\n\n` +
        `💡 _Verifica la clave (ej: PROJ-123)._`,
      );
      await done(to);
    }
    return;
  }

  // ── TRANSITION ISSUE: paso 2 — transición ────────────────────────────────
  if (flow === 'transition_issue' && currentStep === 'await_transition') {
    if (!interactiveId?.startsWith('tr_')) {
      await sendTextMessage(to, `⚠️ Por favor selecciona un estado del menú. 👆`);
      return;
    }
    const transitionId = interactiveId.slice(3);
    await sendTextMessage(to, `⏳ _Cambiando estado..._`);
    try {
      await jira.transitionIssue(data.issueKey, transitionId);
      const transition = data.transitions.find((t) => String(t.id) === String(transitionId));
      await sendTextMessage(
        to,
        `🎉 *¡Estado actualizado!*\n\n` +
        `🎫 *${data.issueKey}* movido a *${transition?.name || transitionId}* ✅\n\n` +
        `✨ _¡El equipo verá el cambio en tiempo real!_`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude cambiar el estado.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── ADD COMMENT: paso 1 — clave ───────────────────────────────────────────
  if (flow === 'add_comment' && currentStep === 'await_key') {
    if (!input) { await sendTextMessage(to, `⚠️ Por favor ingresa la clave del issue. _Ejemplo: PROJ-123_`); return; }
    startSession(to, { flow: 'add_comment', step: 'await_text', data: { issueKey: input.toUpperCase() } });
    await sendTextMessage(
      to,
      `💬 *Comentar en ${input.toUpperCase()}*\n\n${stepLabel(2, 2, 'Comentario')}\n` +
      `Escribe el *comentario* que deseas agregar: 😊\n\n` +
      `_Será visible para todo el equipo con acceso al proyecto. 👥_`,
    );
    return;
  }

  // ── ADD COMMENT: paso 2 — texto → agregar ────────────────────────────────
  if (flow === 'add_comment' && currentStep === 'await_text') {
    if (!input) { await sendTextMessage(to, `⚠️ El comentario no puede estar vacío. Escribe tu comentario:`); return; }
    await sendTextMessage(to, `⏳ _Agregando tu comentario..._`);
    try {
      await jira.addComment(data.issueKey, input);
      await sendTextMessage(
        to,
        `🎉 *¡Comentario agregado!* 💬\n\n` +
        `Tu comentario fue publicado en *${data.issueKey}* y ya es visible para el equipo. 👥✨`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude agregar el comentario.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // Fallback — step/flow desconocido
  cancelExpiry(to);
  clearSession(to);
  await sendWelcomeAndMenu(to);
};

// ─── Punto de entrada ─────────────────────────────────────────────────────────

const CANCEL_KEYWORDS = new Set(['cancelar', 'cancel']);
const RESET_KEYWORDS  = new Set(['menu', 'menú', 'inicio', 'hola', 'hi', 'hello', 'start', '/start']);

const handleMessage = async (message) => {
  const to = message.from;
  let text          = null;
  let interactiveId = null;

  if (message.type === 'text') {
    text = message.text?.body?.trim() || '';
  } else if (message.type === 'interactive') {
    const { type, list_reply, button_reply } = message.interactive;
    interactiveId = type === 'list_reply' ? list_reply?.id : button_reply?.id;
  }

  const lowerText = text?.toLowerCase();

  // Cancelar siempre cierra todo
  if (text && CANCEL_KEYWORDS.has(lowerText)) {
    cancelExpiry(to);
    clearSession(to);
    await sendGoodbye(to, 'cancel');
    return;
  }

  // Reset keywords → bienvenida + menú
  if (text && RESET_KEYWORDS.has(lowerText)) {
    cancelExpiry(to);
    clearSession(to);
    await sendWelcomeAndMenu(to);
    return;
  }

  const session = getSession(to);

  // Respuesta interactiva sin flujo activo
  if (interactiveId && (!session || !session.flow)) {
    if (MENU_IDS.has(interactiveId)) {
      // Selección válida del menú principal
      await handleMenuSelection(to, interactiveId);
    } else {
      // ID desconocido sin sesión (sesión expirada o servidor reiniciado)
      await sendWelcomeAndMenu(to);
    }
    return;
  }

  // Sin sesión y sin interactive → primer contacto o sesión expirada
  if (!session) {
    await sendWelcomeAndMenu(to);
    return;
  }

  await handleFlowStep(to, session, text, interactiveId);
};

module.exports = { handleMessage };
