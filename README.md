# SOAR แผนกลยุทธ์สถานศึกษา

กรอก SOAR แล้วให้ AI (Gemini) วิเคราะห์รายข้อ เทียบแผน TSQM จังหวัดพิษณุโลก ก่อนสร้างแผนกลยุทธ์

## ตั้งค่าบน Vercel

| Environment Variable | ค่า | จำเป็น |
|---|---|---|
| `GEMINI_API_KEY` | API key จาก Google AI Studio | ต้องมี |
| `GEMINI_MODEL` | ชื่อโมเดล ถ้าไม่ใส่จะลอง `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-2.5-flash` | ไม่บังคับ |
| `RATE_LIMIT_PER_HOUR` | จำนวนครั้งที่เรียก AI ได้ต่อ IP ต่อชั่วโมง (ค่าเริ่มต้น 30) | ไม่บังคับ |

หลังเพิ่มหรือแก้ Environment Variable ต้องกด Redeploy หนึ่งครั้ง

## โครงสร้าง

- `index.html` หน้าเว็บทั้งหมด
- `api/ai.js` ฟังก์ชันฝั่งเซิร์ฟเวอร์ที่เรียก Gemini (API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งไปที่เบราว์เซอร์)
- `vercel.json` ให้ฟังก์ชันทำงานได้นานสุด 120 วินาที
