// إنشاء أو إعادة تعيين حساب مدير من سطر الأوامر
// الاستخدام: npm run create-admin -- اسم_المستخدم كلمة_السر
require('dotenv').config();
const { db } = require('../src/db');
const { hashPassword } = require('../src/auth');

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.log('الاستخدام: npm run create-admin -- username password   (كلمة السر 8 أحرف أو أكثر)');
  process.exit(1);
}
const exists = db.prepare('SELECT id FROM admins WHERE username=?').get(username);
if (exists) {
  db.prepare('UPDATE admins SET pass_hash=? WHERE id=?').run(hashPassword(password), exists.id);
  db.prepare('DELETE FROM sessions WHERE admin_id=?').run(exists.id);
  console.log(`تم تغيير كلمة سر ${username}`);
} else {
  db.prepare("INSERT INTO admins(username, pass_hash, name, role) VALUES (?,?,?,'owner')").run(username, hashPassword(password), username);
  console.log(`تم إنشاء المدير ${username}`);
}
