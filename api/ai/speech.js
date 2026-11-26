import { makeSpeechHandler } from '../../server/speech.js'

const handler = makeSpeechHandler(process.env)

export default function speech(req, res) {
  return handler(req, res, () => {
    res.statusCode = 404
    res.end()
  })
}
