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
  console.log('--- /api/parse-fit aufgerufen ---');

  try {
    console.log('Datei vorhanden:', !!req.file);
    console.log('Dateiname:', req.file?.originalname);
    console.log('Dateigröße:', req.file?.size);
    console.log('Buffer vorhanden:', !!req.file?.buffer);

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
      console.log('Parser-Callback erreicht');

      if (error) {
        console.error('Parserfehler:', error);
        return res.status(400).json({
          error: `FIT-Datei konnte nicht geparst werden: ${error.message}`
        });
      }

      try {
        console.log('Parser data keys:', Object.keys(data || {}));
        console.log('Sessions:', data?.sessions?.length);
        console.log('Records:', data?.records?.length);
        console.log('First raw record:', data?.records?.[0]);

        const normalized = normalizeFitData(data);

        console.log('Normalized keys:', Object.keys(normalized || {}));
        console.log('Normalized record count:', normalized?.records?.length);
        console.log('First normalized record:', normalized?.records?.[0]);
        console.log('maxMeanPower:', normalized?.maxMeanPower);
        console.log('maxMeanPower keys:', Object.keys(normalized?.maxMeanPower || {}));
        
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
