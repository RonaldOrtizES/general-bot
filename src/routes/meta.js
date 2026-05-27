const express = require('express');
const router = express.Router();
const { handleMessage } = require('../handlers/whatsappFlowHandler');

// Meta webhook verification (GET)
router.get('/auth', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});


// Meta webhook events (POST)
router.post('/auth', async (req, res) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  // Iteramos de forma secuencial y esperamos que las promesas terminen
  if (body.entry) {
    for (const entry of body.entry) {
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.value?.messages) {
            for (const message of change.value.messages) {
              try {
                // Forzamos a la función a esperar la ejecución completa
                await handleMessage(message);
              } catch (err) {
                console.error('Error handling WhatsApp message:', err.message);
              }
            }
          }
        }
      }
    }
  }

  // Respondemos con el 200 OK ÚNICAMENTE cuando todo el procesamiento terminó
  res.sendStatus(200);
});

module.exports = router;
