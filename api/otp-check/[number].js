export default async function handler(req, res) {
  const { number } = req.query

  if (!number) {
    return res.status(400).json({ error: 'Hiányzó szám' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const targetUrl = `https://www.otpbank.hu/apps/composite/api/carsweepstakes/check/${encodeURIComponent(String(number))}`

    const response = await fetch(targetUrl, {
      headers: {
        accept: 'application/json',
      },
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OTP API hiba',
        details: data,
      })
    }

    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({
      error: 'Proxy hiba',
      details: error.message,
    })
  }
}
