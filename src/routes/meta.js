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
router.post('/auth', (req, res) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  // Respond 200 immediately — Meta requires a fast acknowledgement
  res.sendStatus(200);

  // Process messages asynchronously
  (async () => {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        for (const message of change.value?.messages || []) {
          try {
            await handleMessage(message);
          } catch (err) {
            console.error('Error handling WhatsApp message:', err.message);
          }
        }
      }
    }
  })();
});

module.exports = router;
