const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { google } = require('googleapis');

export default async function handler(req, res) {
  if (req.method!== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, niche, location, count = 50, fields = [] } = req.body;

  if (!url ||!niche ||!location) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let browser = null;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for results to load
    await page.waitForSelector('.Nv2PK', { timeout: 15000 });
    
    const results = [];
    let previousHeight = 0;
    
    // Scroll and scrape until we hit count or no more results
    while (results.length < count) {
      // Get all current cards
      const newCards = await page.$$eval('.Nv2PK', (cards, existingCount) => {
        return cards.slice(existingCount).map(card => {
          const nameEl = card.querySelector('.qBF1Pd');
          return {
            element: true,
            name: nameEl? nameEl.textContent.trim() : null
          };
        });
      }, results.length);

      if (newCards.length === 0) {
        // Scroll to load more
        const scrollable = await page.$('.m6QErb[role="main"]');
        if (scrollable) {
          await scrollable.evaluate(el => {
            el.scrollTop = el.scrollHeight;
          });
          await page.waitForTimeout(2000);
          
          const newHeight = await scrollable.evaluate(el => el.scrollHeight);
          if (newHeight === previousHeight) break; // No more results
          previousHeight = newHeight;
        } else {
          break;
        }
        continue;
      }

      // Click each new card and extract data
      const cards = await page.$$('.Nv2PK');
      for (let i = results.length; i < Math.min(cards.length, count); i++) {
        try {
          await cards[i].click();
          await page.waitForSelector('.Io6YTe', { timeout: 5000 });
          await page.waitForTimeout(800);

          const data = await page.evaluate((selectedFields) => {
            const getText = (selector) => {
              const el = document.querySelector(selector);
              return el? el.textContent.trim() : null;
            };

            const result = {};
            
            // Always scrape required fields
            result.companyName = getText('h1.DUwDvf');
            result.phone = getText('button[data-item-id*="phone"].Io6YTe');
            result.website = getText('a[data-item-id="authority"].Io6YTe');
            
            // Email + Social need to be extracted from website later or skipped
            result.email = null; // Placeholder - requires visiting website
            result.social = null; // Placeholder - requires visiting website
            
            // Optional fields
            if (selectedFields.includes('rating')) {
              result.rating = getText('div.F7nice span[aria-hidden="true"]');
            }
            if (selectedFields.includes('reviews')) {
              const reviewsEl = document.querySelector('div.F7nice span[aria-label*="reviews"]');
              result.reviews = reviewsEl? reviewsEl.textContent.replace(/[^\d]/g, '') : null;
            }
            if (selectedFields.includes('address')) {
              result.address = getText('button[data-item-id="address"].Io6YTe');
            }
            
            return result;
          }, fields);

          results.push(data);
          if (results.length >= count) break;
          
        } catch (err) {
          console.log('Error scraping card:', err.message);
          continue;
        }
      }
    }

    await browser.close();

    // Upload to Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    // Build headers based on fields
    const headers = ['Company Name', 'Phone', 'Email', 'Website', 'Social Media'];
    if (fields.includes('rating')) headers.push('Rating');
    if (fields.includes('reviews')) headers.push('Reviews');
    if (fields.includes('address')) headers.push('Address');
    
    // Build rows
    const rows = results.map(r => {
      const row = [r.companyName, r.phone, r.email, r.website, r.social];
      if (fields.includes('rating')) row.push(r.rating);
      if (fields.includes('reviews')) row.push(r.reviews);
      if (fields.includes('address')) row.push(r.address);
      return row;
    });

    // Clear sheet and write new data
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sheet1!A:Z',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers,...rows]
      }
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    return res.status(200).json({ 
      success: true, 
      count: results.length, 
      sheetUrl 
    });

  } catch (error) {
    console.error(error);
    if (browser) await browser.close();
    return res.status(500).json({ error: error.message });
  }
}
