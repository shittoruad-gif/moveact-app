const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;

function generateIcon() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Navy blue background (#1B3A6B matching the logo)
  ctx.fillStyle = '#1B3A6B';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // White circle
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2 - 30, 340, 0, Math.PI * 2);
  ctx.stroke();

  // "Moveact" text along top of circle
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moveact', SIZE / 2 - 60, 230);

  // Stylized "Ma" - draw with bezier curves to mimic the handwritten style
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // M stroke - handwritten style
  ctx.beginPath();
  // Starting from left
  ctx.moveTo(200, 620);
  // Up stroke
  ctx.quadraticCurveTo(210, 400, 280, 350);
  // Down stroke (first valley of M)
  ctx.quadraticCurveTo(320, 420, 350, 550);
  // Up stroke (middle peak of M) - sharp peak like heartbeat
  ctx.quadraticCurveTo(370, 350, 400, 280);
  // Down stroke
  ctx.quadraticCurveTo(430, 380, 470, 550);
  // Up and over to 'a'
  ctx.quadraticCurveTo(510, 350, 560, 340);
  ctx.stroke();

  // 'a' character - cursive style
  ctx.beginPath();
  ctx.moveTo(560, 340);
  // Loop of 'a'
  ctx.quadraticCurveTo(650, 320, 680, 400);
  ctx.quadraticCurveTo(700, 500, 620, 540);
  ctx.quadraticCurveTo(540, 570, 530, 480);
  ctx.quadraticCurveTo(520, 400, 580, 370);
  ctx.stroke();

  // Tail of 'a'
  ctx.beginPath();
  ctx.moveTo(680, 400);
  ctx.quadraticCurveTo(720, 500, 780, 520);
  ctx.stroke();

  // Subtitle text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('chiropractic', SIZE / 2 + 60, 680);
  ctx.fillText('Beauty acupuncture', SIZE / 2 + 60, 725);
  ctx.fillText('Pilates', SIZE / 2 + 60, 770);

  return canvas;
}

const canvas = generateIcon();
const buffer = canvas.toBuffer('image/png');

// Save as app icon
const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(iconPath, buffer);
console.log('Icon saved to:', iconPath);

// Also save a copy for App Store (1024x1024)
const storePath = path.join(__dirname, '..', 'assets', 'appstore-icon.png');
fs.writeFileSync(storePath, buffer);
console.log('App Store icon saved to:', storePath);
