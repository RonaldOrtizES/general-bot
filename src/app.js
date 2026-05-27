const express = require('express');
const twilioRoutes = require('./routes/twilio');
const metaRoutes = require('./routes/meta');
const jiraRoutes = require('./routes/jira');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/twilio', twilioRoutes);
app.use('/meta', metaRoutes);
app.use('/jira', jiraRoutes);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'general-bot' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
