const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Set download behavior
  const downloadPath = path.resolve('./public');
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  console.log("Navigating to URL...");
  await page.goto('https://quickshare.samsungcloud.com/fXc5vnyAMQxp', { waitUntil: 'networkidle2' });
  
  console.log("Waiting for button...");
  await page.waitForSelector('button');
  
  // Find download button
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Download') || text.includes('Скачать')) {
      console.log("Clicking download...");
      await btn.click();
      break;
    }
  }

  // Wait for file to appear in ./public
  console.log("Waiting for download to finish...");
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const files = fs.readdirSync(downloadPath);
    const zip = files.find(f => f.endsWith('.zip') && !f.endsWith('.crdownload'));
    if (zip) {
      console.log("Downloaded:", zip);
      break;
    }
  }

  await browser.close();
})();
