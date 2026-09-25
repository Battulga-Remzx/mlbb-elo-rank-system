export default async function handler(req, res) {
  // CORS тохиргоо
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS хүсэлтийг зөвшөөрөх
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Зөвхөн GET хүсэлт зөвшөөрөх
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { matchId } = req.query;

  if (!matchId) {
    return res.status(400).json({ error: 'matchId parameter is required' });
  }

  // Moonton API руу хандах
  const apiUrl = `https://play.mobilelegends.com/match/api/get_match_detail?match_id=${matchId}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    // Хариуг буцаах
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch match data', details: error.message });
  }
}