const fs = require('fs');
const src = fs.readFileSync('/home/user/Ven0Xdev/flydeal-israel/flydeal-standalone.html', 'utf8');

// שליפת ה-CSS
const style = src.match(/<style>[\s\S]*?<\/style>/)[0];

// שליפת תוכן ה-body (כולל תגי ה-script המוטמעים)
let body = src.match(/<body>([\s\S]*)<\/body>/)[1];

// הזרקת הגדרות שפה/כיוון על אלמנט השורש,
// כי עמוד מתארח מספק בעצמו את תגי <html>/<head>.
const bootstrap = `<script>
/* התאמה לעמוד מתארח: קובע עברית ו-RTL על אלמנט השורש.
   ה-theme נקבע ממילא ע"י applyTheme() באותה מוסכמה (data-theme). */
document.documentElement.setAttribute("lang", "he");
document.documentElement.setAttribute("dir", "rtl");
if (!document.documentElement.hasAttribute("data-theme")) {
  document.documentElement.setAttribute("data-theme", "light");
}
</script>`;

const out = bootstrap + '\n' + style + '\n' + body;
fs.writeFileSync('/home/user/Ven0Xdev/flydeal-israel/flydeal-artifact.html', out, 'utf8');

console.log('גודל:', (out.length/1024).toFixed(0)+' KB');
console.log('בקשות לפונטים חיצוניים שנותרו:', (out.match(/fonts\.(googleapis|gstatic)/g)||[]).length);
console.log('תגי מסמך שנותרו (html/head/body/doctype):',
  (out.match(/<\/?(html|head|body)[\s>]|<!DOCTYPE/gi)||[]).length);
console.log('תגי script:', (out.match(/<script>/g)||[]).length);
