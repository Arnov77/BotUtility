const express = require('express');
const playwright = require('playwright');
const dotenv = require('dotenv');
const axios = require('axios');
const FormData = require('form-data');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 7680;

// Middleware untuk memparsing request body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Utils
const utils = {
  getBrowser: (...opts) =>
    playwright.chromium.launch({
      args: [
        '--incognito',
        '--single-process',
        '--no-sandbox',
        '--no-zygote',
        '--no-cache',
      ],
      executablePath: process.env.CHROME_BIN,
      headless: true,
      ...opts,
    }),

  // Fungsi untuk mengunggah file ke tmpfiles.org
  uploadToTmpfiles: async (fileBuffer, fileName) => {
    const form = new FormData();
    form.append('file', fileBuffer, { filename: fileName });

    try {
      const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
        headers: {
          ...form.getHeaders(),
        },
      });

      // Pastikan mengakses data URL yang benar
      if (response.data.status === 'success') {
        return response.data.data.url; // URL publik dari tmpfiles.org
      } else {
        throw new Error('Upload gagal: ' + response.data.message);
      }
    } catch (error) {
      throw new Error('Gagal mengunggah ke tmpfiles.org: ' + error.message);
    }
  },

  generateBrat: async (text) => {
    const browser = await utils.getBrowser();
    try {
      const page = await browser.newPage();
      await page.goto('https://www.bratgenerator.com/');
      const consentButton = await page.$('button#onetrust-accept-btn-handler');
      if (consentButton) {
        await consentButton.click();
        await page.waitForSelector('.onetrust-pc-dark-filter', { hidden: true });
      }
      await page.click('#toggleButtonWhite');
      await page.locator('#textInput').fill(text);

      // Ambil screenshot sebagai Buffer
      const screenshotBuffer = await page.locator('#textOverlay').screenshot();

      // Upload Buffer ke tmpfiles.org
      const fileUrl = await utils.uploadToTmpfiles(screenshotBuffer, `${utils.randomName('.jpg')}`);
      console.log('File uploaded to:', fileUrl); // Logging URL untuk debugging
      return fileUrl;
    } catch (e) {
      console.error('Error during brat generation:', e.message); // Logging error
      throw e;
    } finally {
      if (browser) await browser.close();
    }
  },

  randomName: (suffix = '') => Math.random().toString(36).slice(2) + suffix,

  getError: (err) => (err.message || 'Unknown Error'),

  isTrue: (val) => val === true || val === 'true',
};

// Endpoint untuk brat
app.all(/^\/brat/, async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res
      .status(405)
      .json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const obj = req.method === 'GET' ? req.query : req.body;
    if (!obj.text) {
      return res
        .status(400)
        .json({ success: false, message: "Required parameter 'text'" });
    }

    const fileUrl = await utils.generateBrat(obj.text);

    res.json({ success: true, result: fileUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: true, message: utils.getError(e) });
  }
});

// Endpoint untuk download YouTube audio
app.all('/ytmp3', async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res
      .status(405)
      .json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const obj = req.method === 'GET' ? req.query : req.body;

    // Validasi input
    if (!obj.query) {
      return res
        .status(400)
        .json({ success: false, message: "Required parameter 'query'" });
    }

    const query = obj.query.trim();

    let videoUrl;

    // Jika input adalah URL, validasi URL YouTube
    if (ytdl.validateURL(query)) {
      videoUrl = query;
    } else {
      // Jika input adalah judul, cari video di YouTube
      const searchResult = await ytSearch(query);
      if (!searchResult || !searchResult.videos.length) {
        return res
          .status(404)
          .json({ success: false, message: 'Video tidak ditemukan.' });
      }

      // Ambil URL video pertama dari hasil pencarian
      videoUrl = searchResult.videos[0].url;
    }

    // Ambil info video
    const videoInfo = await ytdl.getInfo(videoUrl);
    const title = videoInfo.videoDetails.title;
    const thumbnail = videoInfo.videoDetails.thumbnails.pop().url;
    const size = `${(ytdl.chooseFormat(videoInfo.formats, { quality: 'highestaudio' }).contentLength / 1048576).toFixed(2)} MB`;

    // Unduh audio dalam format MP3
    const audioStream = ytdl(videoUrl, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });

    // Konversi stream audio ke buffer
    const fileBuffer = await streamToBuffer(audioStream);

    // Upload buffer ke tmpfiles.org
    const fileUrl = await utils.uploadToTmpfiles(fileBuffer, `${utils.randomName('.mp3')}`);

    // Kirim respons
    res.json({
      success: true,
      title: title,
      thumbnail: thumbnail,
      audio_url: fileUrl,
      size: size,
    });
  } catch (error) {
    console.error('Error processing YouTube audio:', error.message);
    res.status(500).json({ success: false, message: utils.getError(error) });
  }
});

// Fungsi utilitas untuk mengonversi stream ke buffer
const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
};

// Menjalankan server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});