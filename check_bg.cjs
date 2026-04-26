const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

(async () => {
  try {
    const img = await loadImage('public/sprites/Worms/wwalk.png');
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    console.log(`Top-left pixel: rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3]})`);
  } catch(e) {
    console.error("Canvas not installed or error:", e);
  }
})();
