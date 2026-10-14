const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FitParser = require('fit-file-parser').default;
const { normalizeFitData } = require('./services/fitNormalizer');

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/parse-fit', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      console.error('Keine Datei oder kein Buffer vorhanden');
      return res.status(400).json({ error: 'Keine FIT-Datei hochgeladen.' });
    }

    const fitParser = new FitParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'cascade'
    });

    fitParser.parse(req.file.buffer, (error, data) => {
      if (error) {
        console.error('Parserfehler:', error);
        return res.status(400).json({
          error: `FIT-Datei konnte nicht geparst werden: ${error.message}`
        });
      }

      try {
        const normalized = normalizeFitData(data);
        return res.json(normalized);
      } catch (innerError) {
        console.error('Fehler in normalizeFitData oder danach:', innerError);
        return res.status(500).json({
          error: `Fehler in der Daten-Normalisierung: ${innerError.message}`
        });
      }
    });
  } catch (outerError) {
    console.error('Äußerer Serverfehler:', outerError);
    return res.status(500).json({
      error: `Interner Serverfehler beim Verarbeiten der Datei: ${outerError.message}`
    });
  }
});

app.listen(port, () => {
  console.log(`garmin-fit2-backend listening on port ${port}`);
});
