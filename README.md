# ScrapShop — ระบบจัดการร้านรับซื้อของเก่า

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)
![JWT](https://img.shields.io/badge/auth-JWT-000000?logo=jsonwebtokens&logoColor=white)
![POS](https://img.shields.io/badge/type-POS%20%2F%20inventory-orange)
![Thai language](https://img.shields.io/badge/language-Thai-red)
![Branch protection](https://img.shields.io/badge/main%20branch-protected-success?logo=github)

ระบบจัดการร้านรับซื้อของเก่า (scrap-buying shop) แบบครบวงจร ใช้งานเป็นภาษาไทยทั้งหมด ครอบคลุมตั้งแต่รับซื้อของหน้าร้าน ออกใบเสร็จ จัดการลูกค้า/สินค้า/สต็อก ไปจนถึงเงินเดือนพนักงานและรายงานสรุปยอด/ภาษี

## เทคโนโลยีที่ใช้

- **Frontend**: React 19 + Vite, React Router, state ผูกกับ `localStorage` ผ่าน React Context ต่อโดเมน (ไม่ใช้ backend database สำหรับข้อมูลธุรกิจ)
- **Backend** (`server/`): Express + better-sqlite3 — ใช้เฉพาะสำหรับยืนยันตัวตนของบัญชี "เจ้าของร้าน" (JWT + bcrypt) เท่านั้น
- Lint: `oxlint`

## ฟีเจอร์หลัก

- **รับซื้อของเก่า** — เพิ่มรายการสินค้า อ่านน้ำหนักจากเครื่องชั่ง (จำลอง) หักน้ำหนัก/ระบุเหตุผล ออกใบเสร็จ และบันทึกฉบับร่าง
- **ใบเสร็จรับเงิน** — ค้นหา แก้ไข ยกเลิก (คืนสต็อก/ยอดสะสมลูกค้า/ยอดหักน้ำหนักที่เกี่ยวข้องอัตโนมัติ)
- **ลูกค้า** — ประวัติการซื้อขาย ยอดสะสม การแจ้งเตือนบัตรประชาชนใกล้หมดอายุ
- **สินค้า/หมวดหมู่สินค้า** — ราคารับซื้อ สต็อกคงเหลือ แนวโน้มราคา จัดกลุ่มเป็นหมวดหมู่
- **หักน้ำหนัก/เหตุผล** — เหตุผลการหักน้ำหนักแบบกำหนดเอง (เปอร์เซ็นต์ หรือคงที่)
- **เครื่องชั่ง / ใบส่งสินค้า** — จัดการอุปกรณ์เครื่องชั่งดิจิทัลและการส่งสต็อกออกให้ผู้รับซื้อต่อ
- **เงินเดือน** — คำนวณเงินเดือนพนักงานรายสัปดาห์ตามการเข้างาน
- **รายงาน** — สรุปยอดประจำวัน/เดือน/ปี รายงานสินค้า และแบบสรุปภาษี ภงด.90/94
- **พิมพ์เอกสาร** — พิมพ์ใบเสร็จ สลิปเงินเดือน ป้ายราคา บัตรลูกค้า และรายงานต่างๆ
- **ผู้ใช้งาน/สิทธิ์การใช้งาน** — 4 ระดับสิทธิ์ (เจ้าของร้าน / ผู้จัดการ / แคชเชียร์ / พนักงานชั่งของ) บัญชี "admin" ล็อกอินด้วยรหัสผ่านจริงผ่าน backend ส่วนบัญชีอื่นล็อกอินด่วนด้วย PIN 4 หลักที่เครื่องหน้าร้าน

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependencies

```bash
npm install
cd server && npm install
```

### 2. ตั้งค่า backend

สร้างไฟล์ `server/.env` (ไม่ถูก commit เข้า git):

```env
PORT=4000
JWT_SECRET=<สุ่มค่าเองด้วย เช่น node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

สร้างบัญชี admin เริ่มต้น (username `admin` / password `shop1234` — **ควรเปลี่ยนรหัสผ่านทันทีหลังล็อกอินครั้งแรก**):

```bash
cd server && npm run seed
```

### 3. รันเซิร์ฟเวอร์ทั้งสองฝั่ง

```bash
# terminal 1 — backend (http://localhost:4000)
cd server && npm run dev

# terminal 2 — frontend (http://localhost:5173)
npm run dev
```

Vite proxy `/api/*` ไปที่ `http://localhost:4000` ให้อัตโนมัติ (ดู `vite.config.js`)

### คำสั่งอื่นๆ

```bash
npm run build   # build สำหรับ production
npm run lint     # ตรวจโค้ดด้วย oxlint
```

## โครงสร้างโปรเจกต์

```
src/
  context/    ผู้ให้บริการ state ต่อโดเมน (สินค้า, ลูกค้า, ใบเสร็จ, ...) — persist ลง localStorage
  pages/      หน้าเพจตามเมนูแต่ละอัน
  components/ ส่วนประกอบ UI ที่ใช้ร่วมกัน (Sidebar, Topbar, RowMenu, ...)
  lib/        ฟังก์ชันช่วยเหลือ (auth, สิทธิ์การใช้งาน, export CSV, ...)
server/
  src/index.js  Express API (login / เปลี่ยนรหัสผ่าน) — จำกัดจำนวนครั้งที่ลองผิด (rate limit) และจำกัด CORS เฉพาะ localhost
  src/db.js     การเชื่อมต่อ SQLite (better-sqlite3)
  src/seed.js   สคริปต์สร้างบัญชี admin เริ่มต้น
.claude/skills/audit-and-fix/  สกิลสำหรับตรวจสอบบั๊กที่พบซ้ำๆ ในโปรเจกต์นี้อัตโนมัติ (เรียกด้วย `/audit-and-fix`)
```

## การป้องกัน branch `main`

`main` ตั้งค่า branch protection ไว้แล้ว บังคับใช้กับทุกคนรวมถึงเจ้าของ repo ด้วย:

- ต้อง merge ผ่าน Pull Request เท่านั้น ห้าม push เข้า `main` โดยตรง
- ห้าม force-push
- ห้ามลบ branch

## หมายเหตุเรื่องข้อมูล

ข้อมูลธุรกิจ (สินค้า ลูกค้า ใบเสร็จ ฯลฯ) ทั้งหมดเก็บใน `localStorage` ของเบราว์เซอร์ ไม่ได้เก็บลงฐานข้อมูลฝั่งเซิร์ฟเวอร์ — ฐานข้อมูล SQLite (`server/shop.db`) ใช้เก็บเฉพาะบัญชีผู้ใช้งานสำหรับยืนยันตัวตนเท่านั้น
