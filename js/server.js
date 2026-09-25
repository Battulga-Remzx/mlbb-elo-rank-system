const express = require('express');
const cors = require('cors');
const { checkRegion } = require('cekregml');

const app = express();
app.use(cors());
app.use(express.json());

// MLBB ID баталгаажуулах Endpoint
app.post('/api/verify-mlbb', async (req, res) => {
  const { mlbb_id, zone_id } = req.body;

  if (!mlbb_id || !zone_id) {
    return res.status(400).json({ success: false, message: 'ID болон Server ID-гаа оруулна уу.' });
  }

  try {
    // cekregml сангаар MLBB нэрийг татаж авах
    const result = await checkRegion(mlbb_id, zone_id);

    if (result && result.success) {
      return res.json({
        success: true,
        username: result.username // Автоматаар олдсон тоглоомын нэр
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
});

app.listen(3000, () => console.log('MLBB Verify API 3000 порт дээр ажиллаж байна...'));