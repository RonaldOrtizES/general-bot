const express = require('express');
const twilioRoutes = require('./routes/twilio');
const metaRoutes = require('./routes/meta');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/twilio', twilioRoutes);
app.use('/meta', metaRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
