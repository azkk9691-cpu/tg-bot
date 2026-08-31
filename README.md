# 🚀 BULDROP PM — Telegram Bot

Ushbu loyiha **BULDROP PM** promokodlarini avtomatlashtirilgan tarzda sotish, foydalanuvchilar balansini boshqarish, majburiy kanal obunasini tekshirish va admin panel orqali to'lovlarni tasdiqlash uchun mo'ljallangan professional, production-ready Telegram bot hisoblanadi.

---

## 🛠 Texnologiyalar

- **Runtime:** Node.js (v18+)
- **Telegram Bot Framework:** [Telegraf v4](https://telegraf.js.org/)
- **Database:** PostgreSQL
- **ORM:** [Prisma ORM](https://www.prisma.io/)
- **Environment:** `dotenv`
- **Architecture:** Clean Layered Architecture (Services, Handlers, Middlewares, Keyboards, Utils, Prisma)

---

## 📁 Loyiha Strukturasi

```
tg_bot/
├── prisma/
│   ├── schema.prisma          # Database modellari va sxemasi
│   └── seed.js                # Boshlang'ich kanallar, sozlamalar va namuna kodlar
├── src/
│   ├── bot/
│   │   └── bot.js             # Telegraf bot instansiyasi va sozlamalari
│   ├── config/
│   │   ├── constants.js       # Narxlar, kategoriyalar, karta va doimiy qiymatlar
│   │   └── index.js           # .env konfiguratsiyasi va validatsiya
│   ├── database/
│   │   └── prisma.js          # Prisma Client singleton va ulanish
│   ├── handlers/
│   │   ├── start.js           # /start, obuna tekshiruvi, bosh menyu
│   │   ├── balance.js         # Balansni ko'rish
│   │   ├── payment.js         # Balans to'ldirish, 5-daqiqalik hisob, chek yuborish
│   │   ├── promo.js           # Promokod sotib olish (Atomic/Race condition safe), tarix
│   │   ├── profile.js         # Foydalanuvchi profili va statistikasi
│   │   └── admin.js           # Admin paneli (promokod qo'shish, to'lov tasdiqlash, statistika, broadcast)
│   ├── keyboards/
│   │   ├── mainKeyboards.js   # Asosiy Reply tugmalar
│   │   ├── inlineKeyboards.js # Inline tugmalar (obuna, promokod tanlash, to'lov)
│   │   └── adminKeyboards.js  # Admin boshqaruv tugmalari
│   ├── middlewares/
│   │   ├── auth.js            # Foydalanuvchini DB bilan sinxronlash
│   │   ├── checkSubscription.js # Majburiy kanal a'zoligini tekshirish
│   │   ├── session.js         # Xotiradagi xavfsiz session boshqaruvi
│   │   └── errorHandler.js    # Xatoliklarni ushlovchi global handler
│   ├── services/
│   │   ├── adminService.js    # Dashboard statistikasi va sozlamalar
│   │   ├── broadcastService.js# Hammaga xabar tarqatish (Rate limit safe)
│   │   ├── channelService.js  # Majburiy kanallar tekshiruvi va boshqaruvi
│   │   ├── paymentService.js  # To'lov so'rovlari va atomik tasdiqlash
│   │   ├── promoService.js    # Promokodlar zaxirasi va xavfsiz tranzaksiya
│   │   └── userService.js     # Foydalanuvchi amallari va qidiruv
│   ├── utils/
│   │   ├── formatters.js      # Valyuta, sana va karta formatlovchilari
│   │   ├── logger.js          # Rangli tizim loglari
│   │   └── validators.js      # Summa va ID validatsiyalari
│   └── index.js               # Dastur kirish nuqtasi
├── .env.example               # Muhit o'zgaruvchilari namunasi
├── .env                       # Shaxsiy muhit o'zgaruvchilari
├── package.json
└── README.md
```

---

## ⚡ Qadamma-qadam o'rnatish va ishga tushirish

### 1. Node.js o'rnatish
Agar kompyuteringizda Node.js o'rnatilmagan bo'lsa, [Node.js rasmiy saytidan](https://nodejs.org/) (LTS versiyasini) yuklab oling va o'rnating.
Tekshirish:
```bash
node -v
npm -v
```

### 2. Bog'liqliklarni o'rnatish
Loyiha papkasida (`tg_bot`) terminalni oching va quyidagi buyruqni bajaring:
```bash
npm install
```

---

### 3. `.env` Faylini sozlash

Loyiha ildizidagi `.env` faylini oching va quyidagi ma'lumotlarni kiriting:

```env
# 1. Telegram Bot Token (@BotFather orqali olingan token)
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ

# 2. PostgreSQL ma'lumotlar bazasi havolasi
DATABASE_URL="postgresql://postgres:parol@localhost:5432/buldrop_pm_db?schema=public"

# 3. Asosiy Admin Telegram ID raqami (@userinfobot orqali aniqlanadi)
ADMIN_TELEGRAM_ID=123456789

# Admin username
ADMIN_USERNAME=yusupov_bro

# 4. Standart to'lov kartasi
PAYMENT_CARD_NUMBER=6262910202797114
PAYMENT_CARD_HOLDER=BULDROP PM
PAYMENT_EXPIRE_MINUTES=5

# 5. Muhit
NODE_ENV=production
LOG_LEVEL=info
```

> ⚠️ **Muhim:** Admin huquqi Telegram `username` orqali emas, faqat `ADMIN_TELEGRAM_ID` dagi raqamli ID orqali qat'iy tekshiriladi. Telegram ID raqamingizni bilish uchun Telegramda [@userinfobot](https://t.me/userinfobot) ga yozing.

---

### 4. PostgreSQL bazasini sozlash va Prisma Migratsiya

1. PostgreSQL serveringizda yangi ma'lumotlar bazasi (masalan, `buldrop_pm_db`) yarating.
2. Bazaga jadvallarni yuklash uchun quyidagi buyruqni bajaring:
```bash
npm run prisma:push
```
3. Boshlang'ich ma'lumotlarni (majburiy kanallar, sozlamalar va namuna promokodlar) bazaga kiritish uchun:
```bash
npm run prisma:seed
```

*(Ixtiyoriy)* Bazani qulay veb interfeys orqali ko'rish uchun:
```bash
npm run prisma:studio
```

---

### 5. Botni ishga tushirish

**Dasturlash (Development) rejimida:**
```bash
npm run dev
```

**Ishchi (Production) rejimida:**
```bash
npm start
```

---

## 💎 Bot Imkoniyatlari va Flow

### 1. Majburiy Obuna
- Foydalanuvchi botga kirganda quyidagi kanallarga a'zoligi tekshiriladi:
  - `https://t.me/BULXPM`
  - `https://t.me/yusupov_xalol`
- A'zo bo'lmagan foydalanuvchiga to'g'ridan-to'g'ri havolalar va `🔄 Obunani tekshirish` tugmasi chiqadi. Faqat obuna bo'lgandan keyingina bosh sahifa ochiladi.

### 2. Balans va Balans to'ldirish
- Foydalanuvchi `💳 Balans to'ldirish` tugmasini bosadi va summa kiritadi (Kamida 1 000 so'm).
- Bot 5 daqiqalik to'lov vaqti, karta raqami (`6262910202797114`) va chek yuborish bo'yicha ko'rsatma beradi.
- Foydalanuvchi to'lov chekini (rasm yoki fayl) yuborganida, so'rov avtomatik ravishda Admin chatiga yetkaziladi.
- Admin `✅ Tasdiqlash` tugmasini bossa, foydalanuvchi balansiga summa qo'shiladi va unga tabrik xabari boradi.

### 3. Promokod Sotib Olish (Race-Condition Protected)
- Markaziy narxlar:
  - ⚡ 24 PM — **2 000 so'm**
  - ⚡ 49 PM — **5 000 so'm**
  - ⚡ 99 PM — **9 000 so'm**
  - ⚡ 149 PM — **15 000 so'm**
  - ⚡ 199 PM — **19 000 so'm**
- **Xavfsizlik:** PostgreSQL tranzaksiyalari (`SELECT FOR UPDATE SKIP LOCKED`) orqali 100+ foydalanuvchi bir vaqtda xarid qilganda ham bitta promokod hech qachon ikki kishiga sotilmaydi yoki balans noto'g'ri yechilmaydi.
- Xarid qilingan kod darhol foydalanuvchiga taqdim etiladi va `📦 Mening promokodlarim` bo'limida saqlanadi.

### 4. Admin Panel (`/admin`)
- ➕ **Promokod qo'shish:** Kategoriya tanlanadi va bir nechta promokodlar har biri yangi qatordan yuboriladi. Dublikatlar avtomatik filtrlanadi.
- 📋 **Promokodlar:** Har bir kategoriya bo'yicha mavjud, sotilgan va jami promokodlar qoldig'i ko'rinadi.
- ⏳ **Kutilayotgan to'lovlar:** Barcha yuborilgan cheklar ro'yxati va bir klik bilan tasdiqlash/rad etish.
- 📊 **Statistika:** Jami foydalanuvchilar, bugungi yangi a'zolar, jami to'ldirishlar, jami savdo, bugungi daromad va qoldiqlar.
- 📢 **Hammaga xabar yuborish:** Xabar formatini buzmasdan barcha a'zolarga xavfsiz rate-limiting bilan tarqatish.
- ⚙️ **Sozlamalar:** To'lov kartasini o'zgartirish va majburiy kanallarni boshqarish.

---

## 🌐 Production Serverga (Linux / Ubuntu VPS) Deploy qilish

1. Serverga kiring:
```bash
ssh root@your_server_ip
```
2. Node.js va PM2 o'rnating:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
```
3. Loyihani yuklang va sozlang:
```bash
cd /var/www/tg_bot
npm install
npm run prisma:push
npm run prisma:seed
```
4. PM2 orqali botni 24/7 rejimida ishga tushiring:
```bash
pm2 start src/index.js --name "buldrop-pm-bot"
pm2 save
pm2 startup
```
5. Loglarni kuzatish:
```bash
pm2 logs buldrop-pm-bot
```
