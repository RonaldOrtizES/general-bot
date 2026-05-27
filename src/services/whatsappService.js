const axios = require('axios');

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

const getClient = () => {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID env variables');
  }
  return {
    url: `${GRAPH_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
};

const sendTextMessage = async (to, text) => {
  const { url, headers } = getClient();
  const { data } = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  }, { headers });
  return data;
};

// sections: [{ title, rows: [{ id, title, description? }] }]
const sendInteractiveList = async (to, { header, body, footer, buttonText = '📋 Ver opciones', sections }) => {
  const { url, headers } = getClient();
  const { data } = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header && { header: { type: 'text', text: header } }),
      body: { text: body },
      ...(footer && { footer: { text: footer } }),
      action: { button: buttonText, sections },
    },
  }, { headers });
  return data;
};

// buttons: [{ id, title }] — máximo 3
const sendInteractiveButtons = async (to, { body, footer, buttons }) => {
  const { url, headers } = getClient();
  const { data } = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      ...(footer && { footer: { text: footer } }),
      action: {
        buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    },
  }, { headers });
  return data;
};

module.exports = { sendTextMessage, sendInteractiveList, sendInteractiveButtons };
