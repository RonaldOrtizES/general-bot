const axios = require('axios');

const buildClient = () => {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('Missing Jira credentials: JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are required');
  }

  return axios.create({
    baseURL: `${JIRA_BASE_URL}/rest/api/3`,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    auth: {
      username: JIRA_EMAIL,
      password: JIRA_API_TOKEN,
    },
  });
};

const getIssue = async (issueKey) => {
  const client = buildClient();
  const { data } = await client.get(`/issue/${issueKey}`);
  return data;
};

const searchIssues = async ({ projectKey, issueType, status, assignee, maxResults = 50, startAt = 0 }) => {
  const client = buildClient();

  const conditions = [];
  if (projectKey) conditions.push(`project = "${projectKey}"`);
  if (issueType) conditions.push(`issuetype = "${issueType}"`);
  if (status) conditions.push(`status = "${status}"`);
  if (assignee) conditions.push(`assignee = "${assignee}"`);

  const jql = conditions.length > 0 ? conditions.join(' AND ') : 'ORDER BY created DESC';

  const { data } = await client.get('/search', {
    params: { jql, maxResults, startAt, fields: 'summary,status,issuetype,assignee,priority,description,project' },
  });
  return data;
};

const createIssue = async ({ projectKey, summary, description, issueType = 'Task', priority, assigneeId, labels = [] }) => {
  const client = buildClient();

  const fields = {
    project: { key: projectKey },
    summary,
    issuetype: { name: issueType },
    ...(description && {
      description: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
    }),
    ...(priority && { priority: { name: priority } }),
    ...(assigneeId && { assignee: { id: assigneeId } }),
    ...(labels.length > 0 && { labels }),
  };

  const { data } = await client.post('/issue', { fields });
  return data;
};

const updateIssue = async (issueKey, { summary, description, priority, assigneeId, labels }) => {
  const client = buildClient();

  const fields = {
    ...(summary && { summary }),
    ...(description && {
      description: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
    }),
    ...(priority && { priority: { name: priority } }),
    ...(assigneeId !== undefined && { assignee: assigneeId ? { id: assigneeId } : null }),
    ...(labels && { labels }),
  };

  await client.put(`/issue/${issueKey}`, { fields });
  return { updated: true, issueKey };
};

const deleteIssue = async (issueKey) => {
  const client = buildClient();
  await client.delete(`/issue/${issueKey}`);
  return { deleted: true, issueKey };
};

const getTransitions = async (issueKey) => {
  const client = buildClient();
  const { data } = await client.get(`/issue/${issueKey}/transitions`);
  return data.transitions;
};

const transitionIssue = async (issueKey, transitionId) => {
  const client = buildClient();
  await client.post(`/issue/${issueKey}/transitions`, { transition: { id: transitionId } });
  return { transitioned: true, issueKey, transitionId };
};

const addComment = async (issueKey, commentText) => {
  const client = buildClient();
  const { data } = await client.post(`/issue/${issueKey}/comment`, {
    body: {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: commentText }] }],
    },
  });
  return data;
};

const getProjects = async () => {
  const client = buildClient();
  const { data } = await client.get('/project');
  return data;
};

module.exports = {
  getIssue,
  searchIssues,
  createIssue,
  updateIssue,
  deleteIssue,
  getTransitions,
  transitionIssue,
  addComment,
  getProjects,
};
