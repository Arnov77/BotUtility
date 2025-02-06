# Menggunakan image Node.js sebagai dasar
FROM node:18

# Instal Chromium dan dependensinya
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-noto-color-emoji \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set path untuk Chromium
ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Mengatur direktori kerja di dalam container
WORKDIR /app

# Menyalin file package.json dan package-lock.json ke container
COPY package*.json ./

# Instal dependensi
RUN npm install

# Salin seluruh file proyek ke container
COPY . .

# Pastikan folder tmp ada untuk menyimpan file sementara
RUN mkdir -p /app/tmp

# Menambahkan ffmpeg ke dalam image
RUN apt-get update && apt-get install -y ffmpeg

# Expose port 3000 (atau port lain yang Anda gunakan)
EXPOSE 7860

# Menjalankan aplikasi
CMD ["node", "index.js"]
