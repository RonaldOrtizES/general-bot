const { sendTextMessage, sendInteractiveList, sendInteractiveButtons } = require('../services/whatsappService');
const { getSession, setSession, clearSession } = require('../services/conversationService');
const jira = require('../services/jiraService');

// ─── Gestión de timers de inactividad ────────────────────────────────────────

const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutos
const timers = new Map();

// Mensaje de despedida — razón: 'cancel' | 'timeout'
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
      try {
        await sendGoodbye(userId, 'timeout');
      } catch (err) {
        console.error(`[JiraBot] Error al enviar goodbye por timeout a ${userId}:`, err.message);
      }
    }
  }, INACTIVITY_MS);
  timers.set(userId, timer);
};

// Wrapper de setSession que siempre reinicia el timer de inactividad
const startSession = (to, state) => {
  setSession(to, state);
  scheduleExpiry(to);
};

// ─── Mensajes base ────────────────────────────────────────────────────────────

// Psicología: reciprocidad + liking + micro-sí + aviso de control (cancelar)
const GREETING_TEXT =
  `¡Hola! 👋 ¡Qué bueno tenerte aquí! 😊\n\n` +
  `Soy *JiraBot* 🤖, tu asistente personal de Jira — directo en WhatsApp, sin abrir el navegador. 💡\n\n` +
  `Con solo unos mensajes puedes:\n` +
  `🎫 *Consultar* cualquier issue al instante\n` +
  `🔎 *Buscar* y filtrar tareas de tu equipo\n` +
  `➕ *Crear* nuevos issues en segundos\n` +
  `✏️ *Actualizar* y gestionar issues existentes\n` +
  `🔄 *Cambiar estados* y mantener el flujo\n` +
  `💬 *Comentar* y colaborar con tu equipo\n\n` +
  `✨ _¡Todo desde la palma de tu mano!_\n\n` +
  `💡 _Escribe *cancelar* en cualquier momento para detener el proceso, o *menu* para volver al inicio._\n\n` +
  `👇 *Elige una opción para comenzar:*`;

const RETURN_TEXT = `🎯 ¿Qué más puedo hacer por ti hoy?\n\n👇 *Elige tu próxima acción:*`;

// ─── Menú ─────────────────────────────────────────────────────────────────────

const MENU_PAYLOAD = {
  header: '🤖 JiraBot — Tu asistente Jira',
  footer: '💡 Escribe *menu* para volver aquí',
  buttonText: '📋 Ver opciones',
  sections: [
    {
      title: '🔍 Consultas rápidas',
      rows: [
        { id: 'get_issue',     title: '🎫 Consultar issue',  description: 'Ver todos los detalles de un issue' },
        { id: 'search_issues', title: '🔎 Buscar issues',    description: 'Filtrar por proyecto, estado y más' },
        { id: 'get_projects',  title: '📁 Ver proyectos',    description: 'Listar todos los proyectos' },
      ],
    },
    {
      title: '⚙️ Gestión de issues',
      rows: [
        { id: 'create_issue',     title: '➕ Crear issue',      description: 'Crear un nuevo issue en tu proyecto' },
        { id: 'update_issue',     title: '✏️ Actualizar issue', description: 'Modificar datos de un issue existente' },
        { id: 'transition_issue', title: '🔄 Cambiar estado',   description: 'Mover un issue a otro estado del flujo' },
        { id: 'add_comment',      title: '💬 Comentar issue',   description: 'Añadir un comentario a un issue' },
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

// Psicología: progress indicators reducen abandono en flujos largos
const step = (current, total, label) =>
  `📍 _Paso ${current} de ${total}_ — ${label}\n`;

const formatIssue = (issue) => {
  const f        = issue.fields;
  const status   = f.status?.name          || 'N/A';
  const type     = f.issuetype?.name       || 'N/A';
  const priority = f.priority?.name        || 'N/A';
  const assignee = f.assignee?.displayName || '👤 Sin asignar';
  const project  = f.project?.name         || 'N/A';
  return (
    `🎫 *${issue.key}*\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `📝 ${f.summary}\n\n` +
    `📁 Proyecto: *${project}*\n` +
    `🔖 Tipo: *${type}*\n` +
    `📊 Estado: *${status}*\n` +
    `⚡ Prioridad: *${priority}*\n` +
    `👤 Asignado a: *${assignee}*`
  );
};

// Finaliza flujo: cancela timer, limpia sesión y vuelve al menú
const done = async (to) => {
  cancelExpiry(to);
  clearSession(to);
  await sendMainMenu(to);
};

// ─── Handlers de cada opción ──────────────────────────────────────────────────

const handleGetProjects = async (to) => {
  try {
    await sendTextMessage(to, `⏳ _Consultando proyectos en Jira..._`);
    const projects = await jira.getProjects();
    if (!projects.length) {
      await sendTextMessage(to, `📁 Hmm... no encontré proyectos disponibles por ahora. 🤔`);
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
        `¡Perfecto! 😊 Dime la *clave del issue* que deseas consultar y te traigo toda la información.\n\n` +
        `_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'search_issues':
      startSession(to, { flow: 'search_issues', step: 'await_project', data: {} });
      await sendTextMessage(
        to,
        `🔎 *Buscar Issues*\n\n` +
        `${step(1, 2, 'Proyecto')}\n` +
        `¿En qué *proyecto* quieres buscar?\n\n` +
        `_Ingresa la clave del proyecto (ej: *PROJ*) o escribe *omitir* para buscar en todos. 🌐_`,
      );
      break;

    case 'get_projects':
      await handleGetProjects(to);
      break;

    case 'create_issue':
      startSession(to, { flow: 'create_issue', step: 'await_project', data: {} });
      await sendTextMessage(
        to,
        `➕ *Crear Issue*\n\n` +
        `${step(1, 5, 'Proyecto')}\n` +
        `¡Vamos a crear tu issue! 🚀 ¿En qué *proyecto* lo quieres crear?\n\n` +
        `_Ingresa la clave del proyecto (ej: *PROJ*)_`,
      );
      break;

    case 'update_issue':
      startSession(to, { flow: 'update_issue', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `✏️ *Actualizar Issue*\n\n` +
        `${step(1, 3, 'Identificar issue')}\n` +
        `¿Cuál es la *clave del issue* que deseas actualizar?\n\n` +
        `_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'transition_issue':
      startSession(to, { flow: 'transition_issue', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `🔄 *Cambiar Estado*\n\n` +
        `${step(1, 2, 'Identificar issue')}\n` +
        `¿Cuál es la *clave del issue* al que quieres cambiarle el estado?\n\n` +
        `_Ejemplo: *PROJ-123*_`,
      );
      break;

    case 'add_comment':
      startSession(to, { flow: 'add_comment', step: 'await_key', data: {} });
      await sendTextMessage(
        to,
        `💬 *Agregar Comentario*\n\n` +
        `${step(1, 2, 'Identificar issue')}\n` +
        `¿A qué issue deseas agregar el comentario?\n\n` +
        `_Ejemplo: *PROJ-123*_`,
      );
      break;

    default:
      await sendWelcomeAndMenu(to);
  }
};

// ─── Manejo de cada paso del flujo ────────────────────────────────────────────

const handleFlowStep = async (to, session, text, interactiveId) => {
  const { flow, step: currentStep, data } = session;
  const input = (interactiveId || text || '').trim();

  // Reinicia el timer en cada interacción del flujo
  scheduleExpiry(to);

  // ── GET ISSUE ──────────────────────────────────────────────────────────────
  if (flow === 'get_issue' && currentStep === 'await_key') {
    await sendTextMessage(to, `⏳ _Buscando el issue *${input.toUpperCase()}*..._`);
    try {
      const issue = await jira.getIssue(input.toUpperCase());
      await sendTextMessage(to, `✅ ¡Lo encontré! Aquí tienes los detalles: 👇\n\n${formatIssue(issue)}`);
    } catch {
      await sendTextMessage(
        to,
        `😟 No encontré el issue *${input.toUpperCase()}*.\n\n` +
        `💡 _Verifica que la clave sea correcta (ej: PROJ-123) y que tengas acceso al proyecto._`,
      );
    }
    await done(to);
    return;
  }

  // ── SEARCH ISSUES ──────────────────────────────────────────────────────────
  if (flow === 'search_issues' && currentStep === 'await_project') {
    const projectKey = input.toLowerCase() === 'omitir' ? null : input.toUpperCase();
    startSession(to, { flow: 'search_issues', step: 'await_status', data: { projectKey } });
    await sendInteractiveButtons(to, {
      body:
        `🔎 *Buscar Issues*\n\n` +
        `${step(2, 2, 'Filtrar por estado')}\n` +
        `¡Ya casi! 🙌 ¿Quieres filtrar por algún *estado*?`,
      footer: '💡 Selecciona uno o escribe el estado',
      buttons: [
        { id: 'status_todo',       title: '⚪ To Do' },
        { id: 'status_inprogress', title: '🔵 In Progress' },
        { id: 'status_done',       title: '✅ Done' },
      ],
    });
    return;
  }

  if (flow === 'search_issues' && currentStep === 'await_status') {
    const statusMap = { status_todo: 'To Do', status_inprogress: 'In Progress', status_done: 'Done' };
    const status = statusMap[interactiveId] ?? (text?.toLowerCase() === 'omitir' ? null : text) ?? null;

    await sendTextMessage(to, `⏳ _Buscando issues${data.projectKey ? ` en *${data.projectKey}*` : ''}${status ? ` con estado *${status}*` : ''}..._`);
    try {
      const result = await jira.searchIssues({ projectKey: data.projectKey, status, maxResults: 10 });
      if (!result.issues.length) {
        await sendTextMessage(
          to,
          `🔍 No encontré issues con esos filtros. 🤷\n\n` +
          `💡 _Prueba con diferentes criterios o verifica que el proyecto tenga issues._`,
        );
      } else {
        const list = result.issues
          .map((i) => `• 🎫 *${i.key}* — ${i.fields.summary}\n  📊 _${i.fields.status.name}_`)
          .join('\n\n');
        await sendTextMessage(
          to,
          `✅ ¡Encontré *${result.total}* issue${result.total !== 1 ? 's' : ''}! ` +
          `${result.total > 10 ? `_(mostrando los primeros 10)_ 📋` : `🎯`}\n\n${list}`,
        );
      }
    } catch (err) {
      await sendTextMessage(to, `😟 Hubo un problema al buscar los issues.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── CREATE ISSUE ───────────────────────────────────────────────────────────
  if (flow === 'create_issue' && currentStep === 'await_project') {
    startSession(to, { flow: 'create_issue', step: 'await_summary', data: { projectKey: input.toUpperCase() } });
    await sendTextMessage(
      to,
      `➕ *Crear Issue en ${input.toUpperCase()}*\n\n` +
      `${step(2, 5, 'Resumen')}\n` +
      `¡Genial! 🎯 ¿Cuál es el *título o resumen* de tu issue?\n\n` +
      `_Sé conciso y descriptivo — un buen título ayuda a todo el equipo. 💡_`,
    );
    return;
  }

  if (flow === 'create_issue' && currentStep === 'await_summary') {
    startSession(to, { flow: 'create_issue', step: 'await_type', data: { ...data, summary: input } });
    await sendInteractiveButtons(to, {
      body:
        `➕ *Crear Issue*\n\n` +
        `${step(3, 5, 'Tipo de issue')}\n` +
        `¡Excelente resumen! ✍️ ¿Qué *tipo* de issue es?`,
      footer: '💡 Elige el tipo que mejor describa tu tarea',
      buttons: [
        { id: 'type_task',  title: '📋 Task' },
        { id: 'type_bug',   title: '🐛 Bug' },
        { id: 'type_story', title: '📖 Story' },
      ],
    });
    return;
  }

  if (flow === 'create_issue' && currentStep === 'await_type') {
    const typeMap = { type_task: 'Task', type_bug: 'Bug', type_story: 'Story' };
    const issueType = typeMap[interactiveId] || text || 'Task';
    startSession(to, { flow: 'create_issue', step: 'await_priority', data: { ...data, issueType } });
    await sendInteractiveButtons(to, {
      body:
        `➕ *Crear Issue*\n\n` +
        `${step(4, 5, 'Prioridad')}\n` +
        `¡Ya casi terminamos! 🏁 ¿Qué *prioridad* tiene este issue?`,
      footer: '💡 La prioridad ayuda al equipo a organizarse',
      buttons: [
        { id: 'priority_high',   title: '🔴 High' },
        { id: 'priority_medium', title: '🟡 Medium' },
        { id: 'priority_low',    title: '🟢 Low' },
      ],
    });
    return;
  }

  if (flow === 'create_issue' && currentStep === 'await_priority') {
    const priorityMap = { priority_high: 'High', priority_medium: 'Medium', priority_low: 'Low' };
    const priority = priorityMap[interactiveId] || text || 'Medium';
    startSession(to, { flow: 'create_issue', step: 'await_description', data: { ...data, priority } });
    await sendTextMessage(
      to,
      `➕ *Crear Issue*\n\n` +
      `${step(5, 5, 'Descripción')}\n` +
      `¡Último paso! 🎉 ¿Quieres agregar una *descripción* detallada?\n\n` +
      `_Escríbela aquí, o envía *omitir* si no es necesario. 👌_`,
    );
    return;
  }

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

  // ── UPDATE ISSUE ───────────────────────────────────────────────────────────
  if (flow === 'update_issue' && currentStep === 'await_key') {
    startSession(to, { flow: 'update_issue', step: 'await_field', data: { issueKey: input.toUpperCase() } });
    await sendInteractiveList(to, {
      body:
        `✏️ *Actualizar Issue ${input.toUpperCase()}*\n\n` +
        `${step(2, 3, 'Seleccionar campo')}\n` +
        `¿Qué campo deseas modificar? 🛠️`,
      footer: '💡 Puedes actualizar un campo a la vez',
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

  if (flow === 'update_issue' && currentStep === 'await_field') {
    const fieldMeta = {
      field_summary:     { key: 'summary',     label: 'nuevo resumen' },
      field_priority:    { key: 'priority',    label: 'nueva prioridad _(Low / Medium / High / Critical)_' },
      field_description: { key: 'description', label: 'nueva descripción' },
    }[interactiveId];

    if (!fieldMeta) {
      await sendTextMessage(to, `⚠️ Opción no reconocida. Por favor selecciona una opción válida del menú. 👆`);
      return;
    }
    startSession(to, { flow: 'update_issue', step: 'await_value', data: { ...data, field: fieldMeta.key } });
    await sendTextMessage(
      to,
      `✏️ *Actualizar Issue ${data.issueKey}*\n\n` +
      `${step(3, 3, 'Ingresar nuevo valor')}\n` +
      `¡Perfecto! 😊 Ingresa el ${fieldMeta.label}:`,
    );
    return;
  }

  if (flow === 'update_issue' && currentStep === 'await_value') {
    await sendTextMessage(to, `⏳ _Actualizando *${data.issueKey}*..._`);
    try {
      await jira.updateIssue(data.issueKey, { [data.field]: input });
      await sendTextMessage(
        to,
        `✅ *¡Issue actualizado exitosamente!* 🎯\n\n` +
        `🎫 *${data.issueKey}* — campo *${data.field}* actualizado correctamente. 👌`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude actualizar el issue.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── TRANSITION ISSUE ───────────────────────────────────────────────────────
  if (flow === 'transition_issue' && currentStep === 'await_key') {
    await sendTextMessage(to, `⏳ _Cargando estados de *${input.toUpperCase()}*..._`);
    try {
      const transitions = await jira.getTransitions(input.toUpperCase());
      if (!transitions.length) {
        await sendTextMessage(
          to,
          `ℹ️ El issue *${input.toUpperCase()}* no tiene transiciones disponibles.\n\n` +
          `💡 _Puede que ya esté en el estado final o no tengas permisos._`,
        );
        await done(to);
        return;
      }
      startSession(to, { flow: 'transition_issue', step: 'await_transition', data: { issueKey: input.toUpperCase(), transitions } });

      const body =
        `🔄 *Cambiar Estado: ${input.toUpperCase()}*\n\n` +
        `${step(2, 2, 'Seleccionar nuevo estado')}\n` +
        `¡Aquí están los estados disponibles! ¿A dónde lo movemos? 🚀`;

      if (transitions.length > 3) {
        await sendInteractiveList(to, {
          body,
          footer: '💡 Selecciona el estado al que deseas mover',
          buttonText: '🔄 Ver estados',
          sections: [{
            title: 'Estados disponibles',
            rows: transitions.slice(0, 10).map((t) => ({ id: `tr_${t.id}`, title: t.name })),
          }],
        });
      } else {
        await sendInteractiveButtons(to, {
          body,
          footer: '💡 Selecciona el nuevo estado del issue',
          buttons: transitions.map((t) => ({ id: `tr_${t.id}`, title: t.name })),
        });
      }
    } catch {
      await sendTextMessage(
        to,
        `😟 No encontré el issue *${input.toUpperCase()}*.\n\n` +
        `💡 _Verifica la clave (ej: PROJ-123) y que tengas acceso._`,
      );
      await done(to);
    }
    return;
  }

  if (flow === 'transition_issue' && currentStep === 'await_transition') {
    const transitionId = interactiveId?.replace('tr_', '');
    if (!transitionId) {
      await sendTextMessage(to, `⚠️ Por favor selecciona un estado válido del menú. 👆`);
      return;
    }
    await sendTextMessage(to, `⏳ _Cambiando estado..._`);
    try {
      await jira.transitionIssue(data.issueKey, transitionId);
      const transition = data.transitions.find((t) => String(t.id) === String(transitionId));
      await sendTextMessage(
        to,
        `🎉 *¡Estado actualizado exitosamente!*\n\n` +
        `🎫 *${data.issueKey}* movido a *${transition?.name || transitionId}* ✅\n\n` +
        `✨ _¡El equipo verá el cambio en tiempo real!_`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude cambiar el estado del issue.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // ── ADD COMMENT ────────────────────────────────────────────────────────────
  if (flow === 'add_comment' && currentStep === 'await_key') {
    startSession(to, { flow: 'add_comment', step: 'await_text', data: { issueKey: input.toUpperCase() } });
    await sendTextMessage(
      to,
      `💬 *Comentar en ${input.toUpperCase()}*\n\n` +
      `${step(2, 2, 'Escribir comentario')}\n` +
      `¡Perfecto! 😊 Escribe el *comentario* que deseas agregar:\n\n` +
      `_Será visible para todo el equipo con acceso al proyecto. 👥_`,
    );
    return;
  }

  if (flow === 'add_comment' && currentStep === 'await_text') {
    await sendTextMessage(to, `⏳ _Agregando tu comentario..._`);
    try {
      await jira.addComment(data.issueKey, input);
      await sendTextMessage(
        to,
        `🎉 *¡Comentario agregado exitosamente!* 💬\n\n` +
        `Tu comentario fue publicado en *${data.issueKey}* y ya es visible para el equipo. 👥✨`,
      );
    } catch (err) {
      await sendTextMessage(to, `😟 No pude agregar el comentario.\n\n_Error: ${err.message}_`);
    }
    await done(to);
    return;
  }

  // Fallback
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

  // Cancelar → despedida y cierra todo
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

  // Respuesta interactiva sin flujo activo → selección del menú principal
  if (interactiveId && (!session || !session.flow)) {
    await handleMenuSelection(to, interactiveId);
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
