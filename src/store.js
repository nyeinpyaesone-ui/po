import crypto from 'node:crypto';

export function createStore({ maxTasks, maxAuditEvents }) {
  const tasks = new Map();
  const audit = [];
  const clients = new Set();

  function emit(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try { client.write(payload); } catch { clients.delete(client); }
    }
  }

  function addAudit(event) {
    const item = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...event };
    audit.push(item);
    while (audit.length > maxAuditEvents) audit.shift();
    emit('audit', item);
    return item;
  }

  function addTask(task) {
    tasks.set(task.id, task);
    while (tasks.size > maxTasks) tasks.delete(tasks.keys().next().value);
    emit('task', task);
    return task;
  }

  function updateTask(id, patch) {
    const current = tasks.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    tasks.set(id, updated);
    emit('task', updated);
    return updated;
  }

  return {
    tasks, audit, clients, addTask, updateTask, addAudit, emit,
    recentTasks(limit = 50) { return [...tasks.values()].slice(-limit).reverse(); },
    getTask(id) { return tasks.get(id); }
  };
}
