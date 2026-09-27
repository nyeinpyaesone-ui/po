const $ = id => document.getElementById(id);
const health = $('health');
const prompt = $('prompt');
const type = $('type');
const result = $('result');
const tasks = $('tasks');

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

function render(items) {
  tasks.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No tasks yet.';
    tasks.append(empty);
    return;
  }
  for (const task of items) {
    const article = document.createElement('article');
    article.className = 'task';
    const title = document.createElement('strong');
    title.textContent = task.type;
    const text = document.createElement('span');
    text.textContent = task.prompt;
    const status = document.createElement('small');
    status.textContent = task.status;
    article.append(title, text, status);
    tasks.append(article);
  }
}

async function refresh() {
  const data = await api('/api/v1/tasks?limit=50');
  render(data.tasks);
}

async function checkHealth() {
  try {
    await api('/health');
    health.textContent = 'online';
    health.dataset.ok = 'true';
  } catch {
    health.textContent = 'offline';
    health.dataset.ok = 'false';
  }
}

$('submit').addEventListener('click', async () => {
  const value = prompt.value.trim();
  if (!value) return;
  $('submit').disabled = true;
  result.hidden = false;
  try {
    const body = { prompt: value };
    if (type.value) body.type = type.value;
    const task = await api('/api/v1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    result.textContent = JSON.stringify(task, null, 2);
    prompt.value = '';
    await refresh();
  } catch (error) {
    result.textContent = error.message;
  } finally {
    $('submit').disabled = false;
  }
});

$('refresh').addEventListener('click', refresh);

const stream = new EventSource('/api/v1/events/stream');
stream.addEventListener('task', refresh);
stream.addEventListener('error', () => stream.close());

checkHealth();
refresh().catch(() => render([]));
