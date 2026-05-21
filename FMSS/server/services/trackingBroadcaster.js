const clientsByLoad = new Map();

const writeEvent = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const subscribeToLoadTracking = (loadId, res) => {
  const key = String(loadId);
  const clients = clientsByLoad.get(key) || new Set();
  clients.add(res);
  clientsByLoad.set(key, clients);

  const keepAlive = setInterval(() => {
    writeEvent(res, { type: "heartbeat", sentAt: new Date().toISOString() });
  }, 25000);

  return () => {
    clearInterval(keepAlive);
    const currentClients = clientsByLoad.get(key);
    if (!currentClients) return;

    currentClients.delete(res);
    if (currentClients.size === 0) {
      clientsByLoad.delete(key);
    }
  };
};

const publishTrackingUpdate = (loadId, type, data) => {
  const key = String(loadId);
  const clients = clientsByLoad.get(key);
  if (!clients || clients.size === 0) return;

  const payload = {
    type,
    data,
    sentAt: new Date().toISOString(),
  };

  for (const client of clients) {
    writeEvent(client, payload);
  }
};

module.exports = {
  publishTrackingUpdate,
  subscribeToLoadTracking,
};
