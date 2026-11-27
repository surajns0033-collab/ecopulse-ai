import { makeAiHandler } from './aiCore.js';

const handler = makeAiHandler(process.env);

export default function serveAi(req, res) {
  return handler(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
