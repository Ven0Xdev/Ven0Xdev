const fs = require('fs');
const path = require('path');

const root = '/home/user/Ven0Xdev/flydeal-israel';
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 1. הטמעת ה-CSS
const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
html = html.replace(
  '<link rel="stylesheet" href="css/styles.css" />',
  '<style>\n' + css + '\n  </style>'
);

// 2. הטמעת כל קובצי ה-JS לפי סדר הופעתם
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (js.includes('</script')) throw new Error('closing script tag inside ' + src);
  return '<script>\n/* ===== ' + src + ' ===== */\n' + js + '\n  </script>';
});

// 3. הערה בראש הקובץ
html = html.replace('<head>',
  '<head>\n  <!-- FlyDeal Israel — גרסת קובץ יחיד עצמאית (כל ה-CSS וה-JS מוטמעים).\n' +
  '       פשוט לפתוח קובץ זה בדפדפן — אין צורך בשום קובץ נוסף.\n' +
  '       נוצר אוטומטית מקבצי המקור; לעריכה השתמשו בפרויקט המלא. -->');

const out = path.join(root, 'flydeal-standalone.html');
fs.writeFileSync(out, html, 'utf8');
console.log('נוצר:', out, '—', (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
console.log('script tags נותרו חיצוניים:', (html.match(/<script src=/g) || []).length);
console.log('link stylesheet נותרו:', (html.match(/<link rel="stylesheet"/g) || []).length);
