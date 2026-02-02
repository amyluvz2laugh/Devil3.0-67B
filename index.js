const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/devil-muse', async (req, res) => {
  try {
    const { payload } = req.body;
    
    if (!payload) {
      return res.status(400).json({ error: "No payload" });
    }
    
    res.json({
      ok: true,
      receivedChars: payload.length,
      message: "Devil Muse is awake."
    });
    
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: 'Devil Muse choked' });
  }
});

const PORT = 3333;
app.listen(PORT, () => {
  console.log(`🔥 Devil Muse listening on port ${PORT}`);  // ← FIXED
});