module.exports = async (req, res) => {
  const expectedAuth = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expectedAuth && req.headers.authorization !== expectedAuth) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return res.status(500).json({ error: 'missing_env', has: { topic: false } });
  }

  const message = (req.query && req.query.msg) || 'Hello world from Pretzel Daily';
  const title = (req.query && req.query.title) || 'Test notification';

  const resp = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      'Title': title,
      'Priority': '4',
      'Tags': 'dog,test',
      'Click': 'https://pretzeldaily.vercel.app/',
    },
    body: String(message),
  });

  const text = await resp.text();
  return res.status(resp.ok ? 200 : 500).json({
    topic,
    title,
    message,
    ntfyStatus: resp.status,
    ntfyResponse: text.slice(0, 300),
  });
};
