const express = require('express');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');

const app = express();

// --- Generic CSV to JSON reader (UTF-16 LE) ---
function readCsvToJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let content = fs.readFileSync(filePath, 'utf16le');

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF || content.charCodeAt(0) === 0xFFFE) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const splitCsvLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '\\"'; // Escape the double quote for JSON
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } 
      // NEW: Catch the Yen/Backslash and escape it for JSON
      else if (char === '\\') {
        current += '\\\\'; 
      }
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
};

  const headers = splitCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    const obj = {};
    headers.forEach((header, i) => {
      let value = values[i] !== undefined ? values[i] : null;
      if (typeof value === 'string') {
        value = value.replace(/^"|"$/g, '');
      }
      obj[header] = value;
    });
    return obj;
  });
}

app.get('/dashboard', (req, res) => {
  
  const csvDir = '\\\\03-kikai02-svr\\1.機械ロール事業部\\2.営業\\5.テキスト出力用'; //path.join(__dirname, 'csv');
  const QUERY_RECENT_ORDERS = readCsvToJson(path.join(csvDir, 'recent_orders.csv'));
  const QUERY_RECENT_QUOTES = readCsvToJson(path.join(csvDir, 'recent_quotes.csv'));
  const QUERY_SALES_REPS = readCsvToJson(path.join(csvDir, 'sales_reps.csv'));
  const QUERY_CONTRACT_AMOUNT = readCsvToJson(path.join(csvDir, 'contract_amount.csv'));
  // const QUERY_QUOTE_PREVIEW = readCsvToJson(path.join(csvDir, 'quote_preview.csv'));
  const QUERY_RECENT_UPCOMING_EVENTS = readCsvToJson(path.join(csvDir, 'recent_upcoming_events.csv'));
  console.log('CSV data loaded for dashboard');
  // --- Combined data for index.html ---
  const combinedData = {
    // curMonthDeliveries: QUERY,
    // upcomingArrivals: QUERY_ARRIVALS,
    recentOrders: QUERY_RECENT_ORDERS,
    recentQuotes: QUERY_RECENT_QUOTES,
    salesReps: QUERY_SALES_REPS,
    contractAmount: QUERY_CONTRACT_AMOUNT,
    // quotePreview: QUERY_QUOTE_PREVIEW,
    // quotePreviewDetails: QUERY_QUOTE_PREVIEW_DETAILS,
    recentUpcomingEvents: QUERY_RECENT_UPCOMING_EVENTS
  };
  
  const indexPath = path.join(__dirname, '../public/kikai', 'index.html');
  if (!fs.existsSync(indexPath)) return res.status(404).send('index.html not found');
  let html = fs.readFileSync(indexPath, 'utf8');
  const scriptTag = `<script>DASHBOARD_DATA = JSON.parse('${JSON.stringify(combinedData)}');</script>`;
  html = html.replace('</title>', `</title>\n${scriptTag}`);
  res.send(html);
});

app.use(express.static(path.join(__dirname, '../public/kikai')));

function serveJsonFromCSV(filePath) {
  return async (req, res) => {
    try {
      const buffer = fs.readFileSync(filePath);
      const content = iconv.decode(buffer, 'utf16le');
      const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        return res.json({ updated_at: new Date().toISOString(), deliveries: [] });
      }

      const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result.map(v => v.replace(/^"|"$/g, '').trim());
      };

      const header = parseLine(lines[0]);
      const deliveries = lines.slice(1).map(line => {
        const values = parseLine(line);
        const row = {};
        header.forEach((key, index) => {
          row[key] = values[index] || "";
        });
        return row;
      });

      res.json({ updated_at: new Date().toISOString(), deliveries });
    } catch (err) {
      console.error('CSV Read error:', err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

app.get('/api/upcoming_arrivals', serveJsonFromCSV('\\\\03-kikai02-svr\\1.機械ロール事業部\\chokkinnyuukayotei.txt'));

app.get('/api/cur_month_deliveries', serveJsonFromCSV('\\\\03-kikai02-svr\\1.機械ロール事業部\\tougetsushukkayotei.txt'));

module.exports = app;