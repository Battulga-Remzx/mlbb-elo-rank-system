const { checkRegion } = require('cekregml');

module.exports = async (req, res) => {
  // CORS тохиргоо (Frontend-ээс дуудахад алдаа заахаас сэргийлнэ)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Зөвхөн POST хүсэлт зөвшөөрөгдөнө.' });
  }

  const { mlbb_id, zone_id } = req.body || {};

  if (!mlbb_id || !zone_id) {
    return res.status(400).json({ success: false, message: 'ID болон Server ID-гаа оруулна уу.' });
  }

  try {
    const result = await checkRegion(mlbb_id, zone_id);

    if (result && result.success) {
      return res.status(200).json({
        success: true,
        username: result.username
      });
    } else {
      return res.status(404).json({
        success: false,
        message: result?.message || 'MLBB акаунт олдсонгүй. ID-гаа шалгана уу.'
      });
    }
  } catch (error) {
    console.error('MLBB Verify Error:', error);
    return res.status(500).json({ success: false, message: 'Серверийн алдаа гарлаа.' });
  }
};