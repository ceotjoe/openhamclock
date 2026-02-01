/**
 * ITURHFProp Service
 * 
 * REST API wrapper for the ITURHFProp HF propagation prediction engine
 * Implements ITU-R P.533-14 "Method for the prediction of the performance of HF circuits"
 * 
 * Endpoints:
 *   GET /api/predict - Single point prediction
 *   GET /api/predict/hourly - 24-hour prediction
 *   GET /api/health - Health check
 */

const express = require('express');
const cors = require('cors');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths to ITURHFProp
const ITURHFPROP_PATH = process.env.ITURHFPROP_PATH || '/opt/iturhfprop/Linux/ITURHFProp';
const ITURHFPROP_DATA = process.env.ITURHFPROP_DATA || '/opt/iturhfprop/Data';

// Temp directory for input/output files
const TEMP_DIR = '/tmp/iturhfprop';

// Middleware
app.use(cors());
app.use(express.json());

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// HF band frequencies (MHz)
const HF_BANDS = {
  '160m': 1.9,
  '80m': 3.5,
  '60m': 5.3,
  '40m': 7.1,
  '30m': 10.1,
  '20m': 14.1,
  '17m': 18.1,
  '15m': 21.1,
  '12m': 24.9,
  '10m': 28.1,
  '6m': 50.1
};

/**
 * Generate ITURHFProp input file
 */
function generateInputFile(params) {
  const {
    txLat, txLon, rxLat, rxLon,
    year, month, hour,
    ssn = 100,
    txPower = 100,  // Watts
    txGain = 0,     // dBi
    rxGain = 0,     // dBi
    frequencies = Object.values(HF_BANDS),
    manMadeNoise = 'RESIDENTIAL',  // CITY, RESIDENTIAL, RURAL, QUIET
    requiredReliability = 90,
    requiredSNR = 15  // dB for SSB
  } = params;

  // Convert coordinates to ITURHFProp format (decimal degrees)
  const txLatStr = txLat >= 0 ? `${txLat.toFixed(2)} N` : `${Math.abs(txLat).toFixed(2)} S`;
  const txLonStr = txLon >= 0 ? `${txLon.toFixed(2)} E` : `${Math.abs(txLon).toFixed(2)} W`;
  const rxLatStr = rxLat >= 0 ? `${rxLat.toFixed(2)} N` : `${Math.abs(rxLat).toFixed(2)} S`;
  const rxLonStr = rxLon >= 0 ? `${rxLon.toFixed(2)} E` : `${Math.abs(rxLon).toFixed(2)} W`;

  // Format frequencies
  const freqList = frequencies.map(f => f.toFixed(3)).join(' ');
  
  // ITURHFProp input file format
  const input = `PathName "OpenHamClock Prediction"
PathTXName "TX"
Path.L_tx.lat ${txLat.toFixed(4)}
Path.L_tx.lng ${txLon.toFixed(4)}
PathRXName "RX"
Path.L_rx.lat ${rxLat.toFixed(4)}
Path.L_rx.lng ${rxLon.toFixed(4)}
Path.year ${year}
Path.month ${month}
Path.hour ${hour}
Path.SSN ${ssn}
Path.frequency ${freqList}
Path.txpower ${(10 * Math.log10(txPower / 1000)).toFixed(1)}
Path.BW 3000
Path.SNRr ${requiredSNR}
Path.Relr ${requiredReliability}
Path.ManMadeNoise ${manMadeNoise}
Path.Modulation ANALOG
Path.SorL SHORTPATH
TXAntFilePath ${ITURHFPROP_DATA}/Isotropic.ant
RXAntFilePath ${ITURHFPROP_DATA}/Isotropic.ant
TXAnt.Alt 0.0
TXAnt.Gain ${txGain.toFixed(1)}
RXAnt.Alt 0.0
RXAnt.Gain ${rxGain.toFixed(1)}
DataFilePath ${ITURHFPROP_DATA}/
`;

  return input;
}

/**
 * Parse ITURHFProp output file
 */
function parseOutputFile(outputPath) {
  try {
    const output = fs.readFileSync(outputPath, 'utf8');
    const lines = output.split('\n');
    
    const results = {
      frequencies: [],
      raw: output
    };
    
    let inDataSection = false;
    
    for (const line of lines) {
      // Look for frequency results
      // Format varies but typically: Freq, MUF, E-layer MUF, reliability, SNR, etc.
      if (line.includes('Freq') && line.includes('MUF')) {
        inDataSection = true;
        continue;
      }
      
      if (inDataSection && line.trim()) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4 && !isNaN(parseFloat(parts[0]))) {
          results.frequencies.push({
            freq: parseFloat(parts[0]),
            muf: parseFloat(parts[1]) || null,
            reliability: parseFloat(parts[2]) || 0,
            snr: parseFloat(parts[3]) || null,
            sdbw: parseFloat(parts[4]) || null
          });
        }
      }
    }
    
    // Extract MUF from output
    const mufMatch = output.match(/MUF\s*[=:]\s*([\d.]+)/i);
    if (mufMatch) {
      results.muf = parseFloat(mufMatch[1]);
    }
    
    // Extract E-layer MUF
    const emufMatch = output.match(/E[-\s]*MUF\s*[=:]\s*([\d.]+)/i);
    if (emufMatch) {
      results.eMuf = parseFloat(emufMatch[1]);
    }
    
    return results;
  } catch (err) {
    console.error('[Parse Error]', err.message);
    return { error: err.message, frequencies: [] };
  }
}

/**
 * Run ITURHFProp prediction
 */
async function runPrediction(params) {
  const id = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(TEMP_DIR, `input_${id}.txt`);
  const outputPath = path.join(TEMP_DIR, `output_${id}.txt`);
  
  try {
    // Generate input file
    const inputContent = generateInputFile(params);
    fs.writeFileSync(inputPath, inputContent);
    
    console.log(`[ITURHFProp] Running prediction ${id}`);
    console.log(`[ITURHFProp] TX: ${params.txLat}, ${params.txLon} -> RX: ${params.rxLat}, ${params.rxLon}`);
    
    // Run ITURHFProp
    const startTime = Date.now();
    
    try {
      execSync(`${ITURHFPROP_PATH} ${inputPath} ${outputPath}`, {
        timeout: 30000,  // 30 second timeout
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (execError) {
      console.error('[ITURHFProp] Execution error:', execError.message);
      // Try to get any output that was generated
      if (!fs.existsSync(outputPath)) {
        throw new Error('ITURHFProp failed to produce output');
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[ITURHFProp] Completed in ${elapsed}ms`);
    
    // Parse output
    const results = parseOutputFile(outputPath);
    results.elapsed = elapsed;
    results.params = {
      txLat: params.txLat,
      txLon: params.txLon,
      rxLat: params.rxLat,
      rxLon: params.rxLon,
      hour: params.hour,
      month: params.month,
      ssn: params.ssn
    };
    
    return results;
    
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  const binaryExists = fs.existsSync(ITURHFPROP_PATH);
  const dataExists = fs.existsSync(ITURHFPROP_DATA);
  
  res.json({
    status: binaryExists && dataExists ? 'healthy' : 'degraded',
    service: 'iturhfprop',
    version: '1.0.0',
    engine: 'ITURHFProp (ITU-R P.533-14)',
    binary: binaryExists ? 'found' : 'missing',
    data: dataExists ? 'found' : 'missing',
    timestamp: new Date().toISOString()
  });
});

/**
 * Single point prediction
 * 
 * GET /api/predict?txLat=40&txLon=-74&rxLat=51&rxLon=0&month=1&hour=12&ssn=100
 */
app.get('/api/predict', async (req, res) => {
  try {
    const {
      txLat, txLon, rxLat, rxLon,
      month, hour, ssn,
      year = new Date().getFullYear(),
      txPower, frequencies
    } = req.query;
    
    // Validate required params
    if (!txLat || !txLon || !rxLat || !rxLon) {
      return res.status(400).json({ error: 'Missing required coordinates (txLat, txLon, rxLat, rxLon)' });
    }
    
    const params = {
      txLat: parseFloat(txLat),
      txLon: parseFloat(txLon),
      rxLat: parseFloat(rxLat),
      rxLon: parseFloat(rxLon),
      year: parseInt(year),
      month: parseInt(month) || new Date().getMonth() + 1,
      hour: parseInt(hour) || new Date().getUTCHours(),
      ssn: parseInt(ssn) || 100,
      txPower: parseInt(txPower) || 100
    };
    
    if (frequencies) {
      params.frequencies = frequencies.split(',').map(f => parseFloat(f));
    }
    
    const results = await runPrediction(params);
    
    res.json({
      model: 'ITU-R P.533-14',
      engine: 'ITURHFProp',
      ...results
    });
    
  } catch (err) {
    console.error('[API Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 24-hour prediction
 * 
 * GET /api/predict/hourly?txLat=40&txLon=-74&rxLat=51&rxLon=0&month=1&ssn=100
 */
app.get('/api/predict/hourly', async (req, res) => {
  try {
    const {
      txLat, txLon, rxLat, rxLon,
      month, ssn,
      year = new Date().getFullYear()
    } = req.query;
    
    // Validate required params
    if (!txLat || !txLon || !rxLat || !rxLon) {
      return res.status(400).json({ error: 'Missing required coordinates (txLat, txLon, rxLat, rxLon)' });
    }
    
    const baseParams = {
      txLat: parseFloat(txLat),
      txLon: parseFloat(txLon),
      rxLat: parseFloat(rxLat),
      rxLon: parseFloat(rxLon),
      year: parseInt(year),
      month: parseInt(month) || new Date().getMonth() + 1,
      ssn: parseInt(ssn) || 100
    };
    
    // Run predictions for each hour (0-23 UTC)
    const hourlyResults = [];
    
    for (let hour = 0; hour < 24; hour++) {
      const params = { ...baseParams, hour };
      try {
        const result = await runPrediction(params);
        hourlyResults.push({
          hour,
          muf: result.muf,
          frequencies: result.frequencies
        });
      } catch (err) {
        hourlyResults.push({
          hour,
          error: err.message
        });
      }
    }
    
    res.json({
      model: 'ITU-R P.533-14',
      engine: 'ITURHFProp',
      path: {
        tx: { lat: baseParams.txLat, lon: baseParams.txLon },
        rx: { lat: baseParams.rxLat, lon: baseParams.rxLon }
      },
      month: baseParams.month,
      year: baseParams.year,
      ssn: baseParams.ssn,
      hourly: hourlyResults
    });
    
  } catch (err) {
    console.error('[API Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Band conditions (simplified format for OpenHamClock)
 * 
 * GET /api/bands?txLat=40&txLon=-74&rxLat=51&rxLon=0
 */
app.get('/api/bands', async (req, res) => {
  try {
    const {
      txLat, txLon, rxLat, rxLon,
      month, hour, ssn
    } = req.query;
    
    if (!txLat || !txLon || !rxLat || !rxLon) {
      return res.status(400).json({ error: 'Missing required coordinates' });
    }
    
    const params = {
      txLat: parseFloat(txLat),
      txLon: parseFloat(txLon),
      rxLat: parseFloat(rxLat),
      rxLon: parseFloat(rxLon),
      year: new Date().getFullYear(),
      month: parseInt(month) || new Date().getMonth() + 1,
      hour: parseInt(hour) ?? new Date().getUTCHours(),
      ssn: parseInt(ssn) || 100,
      frequencies: Object.values(HF_BANDS)
    };
    
    const results = await runPrediction(params);
    
    // Map to band names
    const bands = {};
    const bandFreqs = Object.entries(HF_BANDS);
    
    for (const freqResult of results.frequencies) {
      const bandEntry = bandFreqs.find(([name, freq]) => 
        Math.abs(freq - freqResult.freq) < 1
      );
      
      if (bandEntry) {
        const [bandName] = bandEntry;
        bands[bandName] = {
          freq: freqResult.freq,
          reliability: freqResult.reliability,
          snr: freqResult.snr,
          sdbw: freqResult.sdbw,
          status: freqResult.reliability >= 70 ? 'GOOD' :
                  freqResult.reliability >= 40 ? 'FAIR' : 'POOR'
        };
      }
    }
    
    res.json({
      model: 'ITU-R P.533-14',
      muf: results.muf,
      bands,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('[API Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`ITURHFProp Service running on port ${PORT}`);
  console.log(`Binary: ${ITURHFPROP_PATH}`);
  console.log(`Data: ${ITURHFPROP_DATA}`);
});
