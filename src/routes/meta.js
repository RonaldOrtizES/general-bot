const express = require('express');
const router = express.Router();

// Meta webhook verification (GET)
router.get('/auth', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
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

  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach((entry) => {
      entry.changes?.forEach((change) => {
        const messages = change.value?.messages;
        if (messages) {
          messages.forEach((message) => {
            console.log('Message from Meta:', message);
          });
        }
      });
    });

    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

module.exports = router;
