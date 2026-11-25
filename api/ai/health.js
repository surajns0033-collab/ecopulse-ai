import { makeAiHandler } from '../../server/aiCore.js'

const handler = makeAiHandler(process.env)

export default function health(req, res) {
  return handler(req, res, () => {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  })
}
