const express = require('express');
const router = express.Router();
const jira = require('../services/jiraService');

const handleError = (res, err) => {
  const status = err.response?.status || 500;
  const message = err.response?.data?.errorMessages?.[0]
    || err.response?.data?.errors
    || err.message;
  res.status(status).json({ error: message });
};

// GET /jira/projects
router.get('/projects', async (req, res) => {
  try {
    const projects = await jira.getProjects();
    res.json(projects);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /jira/issues/search?projectKey=&issueType=&status=&assignee=&maxResults=&startAt=
router.get('/issues/search', async (req, res) => {
  try {
    const result = await jira.searchIssues(req.query);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /jira/issues/:issueKey
router.get('/issues/:issueKey', async (req, res) => {
  try {
    const issue = await jira.getIssue(req.params.issueKey);
    res.json(issue);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /jira/issues
// Body: { projectKey, summary, description?, issueType?, priority?, assigneeId?, labels?, storyPoints? }
router.post('/issues', async (req, res) => {
  const { projectKey, summary } = req.body;
  if (!projectKey || !summary) {
    return res.status(400).json({ error: 'projectKey and summary are required' });
  }
  try {
    const issue = await jira.createIssue(req.body);
    res.status(201).json(issue);
  } catch (err) {
    handleError(res, err);
  }
});

// PUT /jira/issues/:issueKey
// Body: { summary?, description?, priority?, assigneeId?, labels?, storyPoints? }
router.put('/issues/:issueKey', async (req, res) => {
  try {
    const result = await jira.updateIssue(req.params.issueKey, req.body);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /jira/issues/:issueKey
router.delete('/issues/:issueKey', async (req, res) => {
  try {
    const result = await jira.deleteIssue(req.params.issueKey);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /jira/issues/:issueKey/transitions
router.get('/issues/:issueKey/transitions', async (req, res) => {
  try {
    const transitions = await jira.getTransitions(req.params.issueKey);
    res.json(transitions);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /jira/issues/:issueKey/transitions
// Body: { transitionId }
router.post('/issues/:issueKey/transitions', async (req, res) => {
  const { transitionId } = req.body;
  if (!transitionId) {
    return res.status(400).json({ error: 'transitionId is required' });
  }
  try {
    const result = await jira.transitionIssue(req.params.issueKey, transitionId);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /jira/issues/:issueKey/comments
// Body: { text }
router.post('/issues/:issueKey/comments', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const comment = await jira.addComment(req.params.issueKey, text);
    res.status(201).json(comment);
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
