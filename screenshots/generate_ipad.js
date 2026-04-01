const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 2048;
const HEIGHT = 2732;

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

function drawLoginScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#C4956A';
  ctx.font = 'bold 140px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moveact', WIDTH / 2, 750);

  ctx.fillStyle = '#8B7355';
  ctx.font = '56px sans-serif';
  ctx.fillText('整体・美容鍼・ピラティス', WIDTH / 2, 860);

  drawRoundedRect(ctx, 500, 1050, WIDTH - 1000, 140, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#D4C5B0';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#999999';
  ctx.font = '46px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('メールアドレス', 560, 1135);

  drawRoundedRect(ctx, 500, 1240, WIDTH - 1000, 140, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#D4C5B0';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#999999';
  ctx.font = '46px sans-serif';
  ctx.fillText('パスワード', 560, 1325);

  drawRoundedRect(ctx, 500, 1460, WIDTH - 1000, 150, 30);
  ctx.fillStyle = '#C4956A';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ログイン', WIDTH / 2, 1555);

  ctx.fillStyle = '#C4956A';
  ctx.font = '44px sans-serif';
  ctx.fillText('アカウントをお持ちでない方はこちら', WIDTH / 2, 1700);

  return canvas;
}

function drawHomeScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#C4956A';
  ctx.fillRect(0, 0, WIDTH, 280);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moveact', WIDTH / 2, 200);

  ctx.fillStyle = '#333333';
  ctx.font = '52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('こんにちは！', 100, 420);
  ctx.fillStyle = '#666666';
  ctx.font = '42px sans-serif';
  ctx.fillText('今日も美と健康をサポートします', 100, 500);

  const cards = [
    { icon: '📅', title: '施術予約', desc: '整体・美容鍼', color: '#C4956A' },
    { icon: '🏋️', title: 'レッスン', desc: 'ピラティス予約', color: '#8BA89A' },
    { icon: '🎫', title: '回数券', desc: 'プラン一覧', color: '#A0937D' },
    { icon: '👤', title: 'マイページ', desc: 'プロフィール', color: '#B8A090' },
  ];

  cards.forEach((card, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 100 + col * (WIDTH / 2 - 50);
    const y = 600 + row * 380;
    const w = WIDTH / 2 - 150;
    const h = 340;

    drawRoundedRect(ctx, x + 6, y + 6, w, h, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    drawRoundedRect(ctx, x, y, w, h, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    drawRoundedRect(ctx, x, y, w, 12, 0);
    ctx.fillStyle = card.color;
    ctx.fill();

    ctx.font = '90px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(card.icon, x + w / 2, y + 150);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(card.title, x + w / 2, y + 240);

    ctx.fillStyle = '#888888';
    ctx.font = '36px sans-serif';
    ctx.fillText(card.desc, x + w / 2, y + 300);
  });

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('お知らせ', 100, 1520);

  const news = [
    '金光店 4月のスケジュール更新',
    '玉島店 新メニュー追加のお知らせ',
    'GW期間の営業時間について',
  ];

  news.forEach((item, i) => {
    const y = 1580 + i * 140;
    drawRoundedRect(ctx, 100, y, WIDTH - 200, 120, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = '#444444';
    ctx.font = '42px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item, 150, y + 76);
  });

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
    ctx.font = '56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tabIcons[i], x, HEIGHT - 130);
    ctx.fillStyle = i === 0 ? '#C4956A' : '#999999';
    ctx.font = '30px sans-serif';
    ctx.fillText(tab, x, HEIGHT - 70);
    ctx.fillStyle = '#333333';
  });

  return canvas;
}

function drawBookingScreen() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FAF7F5';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#C4956A';
  ctx.fillRect(0, 0, WIDTH, 280);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ご予約', WIDTH / 2, 200);

  const bookings = [
    { title: '施術予約', desc: '整体・美容鍼のご予約は\nこちらからお申し込みいただけます', icon: '💆', color: '#C4956A' },
    { title: 'グループレッスン', desc: 'ピラティスレッスンの\nご予約・事前決済いただけます', icon: '🧘', color: '#8BA89A' },
  ];

  bookings.forEach((booking, i) => {
    const y = 400 + i * 520;
    drawRoundedRect(ctx, 106, y + 6, WIDTH - 200, 440, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fill();

    drawRoundedRect(ctx, 100, y, WIDTH - 200, 440, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    drawRoundedRect(ctx, 100, y, 16, 440, 0);
    ctx.fillStyle = booking.color;
    ctx.fill();

    ctx.font = '110px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(booking.icon, WIDTH / 2, y + 150);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(booking.title, WIDTH / 2, y + 270);

    ctx.fillStyle = '#777777';
    ctx.font = '40px sans-serif';
    const lines = booking.desc.split('\n');
    lines.forEach((line, li) => {
      ctx.fillText(line, WIDTH / 2, y + 340 + li * 55);
    });
  });

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('店舗を選択', 100, 1520);

  const stores = ['金光店', '玉島店'];
  stores.forEach((store, i) => {
    const y = 1580 + i * 170;
    drawRoundedRect(ctx, 100, y, WIDTH - 200, 140, 20);
    ctx.fillStyle = i === 0 ? '#C4956A' : '#FFFFFF';
    ctx.fill();
    if (i === 1) {
      ctx.strokeStyle = '#C4956A';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = i === 0 ? '#FFFFFF' : '#C4956A';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(store, WIDTH / 2, y + 92);
  });

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
    ctx.font = '56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tabIcons[i], x, HEIGHT - 130);
    ctx.fillStyle = i === 1 ? '#C4956A' : '#999999';
    ctx.font = '30px sans-serif';
    ctx.fillText(tab, x, HEIGHT - 70);
    ctx.fillStyle = '#333333';
  });

  return canvas;
}

async function main() {
  const screens = [
    { name: 'ipad_login.png', draw: drawLoginScreen },
    { name: 'ipad_home.png', draw: drawHomeScreen },
    { name: 'ipad_booking.png', draw: drawBookingScreen },
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
