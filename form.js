Object.defineProperty(process, 'platform', { get: () => 'linux' });

const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealthPlugin);
const fs = require('fs');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScwRgTUTkP0AfMXvyitMH18x0x8gr_QRzKXVZomM_jSCoE51w/viewform';
const JAWABAN  = [1, 1, 2, 0, 1, 2, 1];

function readPairs(file) {
  const lines = fs.readFileSync(file, 'utf-8')
    .split('\n')
    .map(l => l.trim());
  const pairs = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i]) { i++; continue; }
    const first  = lines[i];
    const second = lines[i + 1] ? lines[i + 1].trim() : '';
    if (first && second) pairs.push([first, second]);
    i += 2;
  }
  return pairs;
}

async function submitForm(email, password, dcId, dcUsername) {
  const browser = await chromium.launch({
    executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log(`[${email}] Login...`);
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#identifierId', { timeout: 30000 });
    await page.fill('#identifierId', email);
    await page.click('#identifierNext');
    await page.waitForSelector('input[type="password"]:not([aria-hidden="true"])', { timeout: 10000 });
    await page.fill('input[type="password"]:not([aria-hidden="true"])', password);
    await page.click('#passwordNext');
    await page.waitForURL(/myaccount|google\.com\/(?!accounts)/, { timeout: 15000 });
    console.log(`[${email}] Login berhasil!`);

    await page.goto(FORM_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const textInputs = [];
    for (const input of await page.$$('input[type="text"]')) {
      if (await input.isVisible()) textInputs.push(input);
    }
    if (textInputs[0]) await textInputs[0].fill(dcId);
    if (textInputs[1]) await textInputs[1].fill(dcUsername);
    console.log(`[${email}] DC ID: ${dcId} | Username: ${dcUsername}`);

    const radioGroups = await page.$$('[role="radiogroup"]');
    for (let i = 0; i < radioGroups.length; i++) {
      const options = await radioGroups[i].$$('[role="radio"]');
      const idx = JAWABAN[i] ?? 0;
      if (options[idx]) {
        await options[idx].click();
        await page.waitForTimeout(400);
      }
    }
    console.log(`[${email}] Semua jawaban dipilih`);

    const submitBtn = await page.$('[jsname="M2UYVd"]') || await page.$('text=Submit');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(3000);
    console.log(`[${email}] ✅ Submitted!`);

  } catch (err) {
    console.error(`[${email}] ❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  const emails = readPairs('email.txt');
  const dcs    = readPairs('dc.txt');
  const total  = Math.min(emails.length, dcs.length);
  console.log(`Total akun: ${total}`);

  console.log('\nPilih mode:');
  console.log('1. 1 akun tertentu');
  console.log('2. Semua akun');
  console.log('3. Dari akun X sampai akhir');
  const mode = (await ask('Pilihan (1/2/3): ')).trim();

  let start = 0, end = total;

  if (mode === '1') {
    const idx = parseInt(await ask(`Nomor akun (1-${total}): `)) - 1;
    start = idx; end = idx + 1;
  } else if (mode === '3') {
    start = parseInt(await ask(`Mulai dari akun nomor (1-${total}): `)) - 1;
  }

  rl.close();

  for (let i = start; i < end; i++) {
    const [email, password]  = emails[i];
    const [dcId, dcUsername] = dcs[i];
    await submitForm(email, password, dcId, dcUsername);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("Semua akun selesai.");
})();
