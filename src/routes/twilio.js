const express = require('express');
const router = express.Router();

router.post('/messages/webhook', (req, res) => {
  const { Body, From, To } = req.body;

  console.log(`Message from ${From} to ${To}: ${Body}`);

  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Message received</Message>
</Response>`);
});

router.post('/calls/webhook', (req, res) => {
  const { From, To, CallStatus } = req.body;

  console.log(`Call from ${From} to ${To} - Status: ${CallStatus}`);

  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>+50361273462</Dial>
</Response>`);
});

module.exports = router;
