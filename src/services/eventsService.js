const axios = require('axios');

const DEFAULT_BASE_URL = 'https://mesonbots-events-api.vercel.app';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const getConfig = () => ({
  baseURL: (process.env.MESONBOTS_EVENTS_API_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
  tenantId: process.env.MESONBOTS_TENANT_ID || DEFAULT_TENANT_ID,
});

const postEvent = async (path, payload) => {
  const { baseURL } = getConfig();
  const { data } = await axios.post(`${baseURL}${path}`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
  });
  return data;
};

const startConversation = async ({ telefonoOrigen, nombreCliente, contenido, messageType }) => {
  const { tenantId } = getConfig();
  return postEvent('/api/conversaciones/iniciar', {
    tenantId,
    telefonoOrigen,
    nombreCliente,
    contenido,
    messageType,
  });
};

const closeConversationAutomatically = async ({ telefonoOrigen, aiHandledFully = true }) => {
  const { tenantId } = getConfig();
  return postEvent('/api/conversaciones/cerrar-automatico', {
    tenantId,
    telefonoOrigen,
    aiHandledFully,
  });
};

module.exports = {
  startConversation,
  closeConversationAutomatically,
};
