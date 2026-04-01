const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 1242;
const HEIGHT = 2688;

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Screen 1: Login Screen
function drawLoginScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Status bar area
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, 120);

  // Logo area
  ctx.fillStyle = '#C4956A';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moveact', WIDTH / 2, 650);

  ctx.fillStyle = '#8B7355';
  ctx.font = '48px sans-serif';
  ctx.fillText('整体・美容鍼・ピラティス', WIDTH / 2, 750);

  // Email input
  drawRoundedRect(ctx, 120, 1000, WIDTH - 240, 130, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#D4C5B0';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#999999';
  ctx.font = '42px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('メールアドレス', 170, 1080);

  // Password input
  drawRoundedRect(ctx, 120, 1180, WIDTH - 240, 130, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#D4C5B0';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#999999';
  ctx.font = '42px sans-serif';
  ctx.fillText('パスワード', 170, 1260);

  // Login button
  drawRoundedRect(ctx, 120, 1400, WIDTH - 240, 140, 30);
  ctx.fillStyle = '#C4956A';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ログイン', WIDTH / 2, 1490);

  // Register link
  ctx.fillStyle = '#C4956A';
  ctx.font = '40px sans-serif';
  ctx.fillText('アカウントをお持ちでない方はこちら', WIDTH / 2, 1620);

  return canvas;
}

// Screen 2: Home Screen
function drawHomeScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = '#C4956A';
  ctx.fillRect(0, 0, WIDTH, 280);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moveact', WIDTH / 2, 200);

  // Welcome section
  ctx.fillStyle = '#333333';
  ctx.font = '46px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('こんにちは！', 80, 400);
  ctx.fillStyle = '#666666';
  ctx.font = '38px sans-serif';
  ctx.fillText('今日も美と健康をサポートします', 80, 470);

  // Quick action cards
  const cards = [
    { icon: '📅', title: '施術予約', desc: '整体・美容鍼', color: '#C4956A' },
    { icon: '🏋️', title: 'レッスン', desc: 'ピラティス予約', color: '#8BA89A' },
    { icon: '🎫', title: '回数券', desc: 'プラン一覧', color: '#A0937D' },
    { icon: '👤', title: 'マイページ', desc: 'プロフィール', color: '#B8A090' },
  ];

  cards.forEach((card, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 80 + col * (WIDTH / 2 - 40);
    const y = 560 + row * 340;
    const w = WIDTH / 2 - 120;
    const h = 300;

    // Card shadow
    drawRoundedRect(ctx, x + 6, y + 6, w, h, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    // Card
    drawRoundedRect(ctx, x, y, w, h, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Top accent bar
    drawRoundedRect(ctx, x, y, w, 12, 0);
    ctx.fillStyle = card.color;
    ctx.fill();

    // Icon
    ctx.font = '80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(card.icon, x + w / 2, y + 130);

    // Title
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(card.title, x + w / 2, y + 210);

    // Desc
    ctx.fillStyle = '#888888';
    ctx.font = '32px sans-serif';
    ctx.fillText(card.desc, x + w / 2, y + 265);
  });

  // News section
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('お知らせ', 80, 1380);

  const news = [
    '金光店 4月のスケジュール更新',
    '玉島店 新メニュー追加のお知らせ',
    'GW期間の営業時間について',
  ];

  news.forEach((item, i) => {
    const y = 1440 + i * 130;
    drawRoundedRect(ctx, 80, y, WIDTH - 160, 110, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = '#444444';
    ctx.font = '38px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item, 130, y + 70);
  });

  // Bottom tab bar
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, HEIGHT - 220, WIDTH, 220);
  ctx.strokeStyle = '#E0D8D0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT - 220);
  ctx.lineTo(WIDTH, HEIGHT - 220);
  ctx.stroke();

  const tabs = ['ホーム', '予約', '回数券', 'マイページ'];
  const tabIcons = ['🏠', '📅', '🎫', '👤'];
  tabs.forEach((tab, i) => {
    const x = (WIDTH / 4) * i + WIDTH / 8;
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tabIcons[i], x, HEIGHT - 130);
    ctx.fillStyle = i === 0 ? '#C4956A' : '#999999';
    ctx.font = '28px sans-serif';
    ctx.fillText(tab, x, HEIGHT - 75);
    ctx.fillStyle = '#333333';
  });

  return canvas;
}

// Screen 3: Booking Screen
function drawBookingScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = '#C4956A';
  ctx.fillRect(0, 0, WIDTH, 280);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ご予約', WIDTH / 2, 200);

  // Booking choice cards
  const bookings = [
    {
      title: '施術予約',
      desc: '整体・美容鍼のご予約は\nこちらからお申し込みいただけます',
      icon: '💆',
      color: '#C4956A',
    },
    {
      title: 'グループレッスン',
      desc: 'ピラティスレッスンの\nご予約・事前決済いただけます',
      icon: '🧘',
      color: '#8BA89A',
    },
  ];

  bookings.forEach((booking, i) => {
    const y = 380 + i * 500;

    // Card shadow
    drawRoundedRect(ctx, 86, y + 6, WIDTH - 160, 420, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fill();

    // Card
    drawRoundedRect(ctx, 80, y, WIDTH - 160, 420, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Left accent
    drawRoundedRect(ctx, 80, y, 16, 420, 0);
    ctx.fillStyle = booking.color;
    ctx.fill();

    // Icon
    ctx.font = '100px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(booking.icon, WIDTH / 2, y + 140);

    // Title
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(booking.title, WIDTH / 2, y + 250);

    // Description
    ctx.fillStyle = '#777777';
    ctx.font = '36px sans-serif';
    const lines = booking.desc.split('\n');
    lines.forEach((line, li) => {
      ctx.fillText(line, WIDTH / 2, y + 320 + li * 50);
    });
  });

  // Store selection
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('店舗を選択', 80, 1480);

  const stores = ['金光店', '玉島店'];
  stores.forEach((store, i) => {
    const y = 1530 + i * 160;
    drawRoundedRect(ctx, 80, y, WIDTH - 160, 130, 20);
    ctx.fillStyle = i === 0 ? '#C4956A' : '#FFFFFF';
    ctx.fill();
    if (i === 1) {
      ctx.strokeStyle = '#C4956A';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = i === 0 ? '#FFFFFF' : '#C4956A';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(store, WIDTH / 2, y + 85);
  });

  // Bottom tab bar
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, HEIGHT - 220, WIDTH, 220);
  ctx.strokeStyle = '#E0D8D0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT - 220);
  ctx.lineTo(WIDTH, HEIGHT - 220);
  ctx.stroke();

  const tabs = ['ホーム', '予約', '回数券', 'マイページ'];
  const tabIcons = ['🏠', '📅', '🎫', '👤'];
  tabs.forEach((tab, i) => {
    const x = (WIDTH / 4) * i + WIDTH / 8;
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tabIcons[i], x, HEIGHT - 130);
    ctx.fillStyle = i === 1 ? '#C4956A' : '#999999';
    ctx.font = '28px sans-serif';
    ctx.fillText(tab, x, HEIGHT - 75);
    ctx.fillStyle = '#333333';
  });

  return canvas;
}

async function main() {
  const screens = [
    { name: 'screenshot_login.png', draw: drawLoginScreen },
    { name: 'screenshot_home.png', draw: drawHomeScreen },
    { name: 'screenshot_booking.png', draw: drawBookingScreen },
  ];

  for (const screen of screens) {
    const canvas = screen.draw();
    const buffer = canvas.toBuffer('image/png');
    const outPath = path.join(__dirname, screen.name);
    fs.writeFileSync(outPath, buffer);
    console.log(`Created: ${outPath}`);
  }
}

main().catch(console.error);
