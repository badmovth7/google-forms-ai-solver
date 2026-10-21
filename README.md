# 🚀 Google Forms AI Auto-Solver (v3.3)

**Google Forms AI Auto-Solver** adalah script konsol browser berbasis AI yang memanfaatkan **Google Gemini API** untuk menjawab soal ujian di Google Forms secara otomatis, presisi, dan cepat.

Script ini dirancang khusus untuk menangani kuis skala besar (300+ soal) dengan fitur anti *rate-limit*, deteksi gambar (*multimodal*), serta rotasi model otomatis.

---

## ✨ Fitur Utama

- **📷 Dukungan Soal Bergambar (Multimodal):** Otomatis mendeteksi dan mengonversi gambar pada soal maupun opsi jawaban ke format Base64 untuk dianalisis oleh Gemini AI.
- **☑️ Multiple Choice & Single Choice:** Mendukung tipe pilihan tunggal (*radio button*) dan pilihan ganda lebih dari satu (*checkbox*).
- **🛡️ Anti Rate-Limit (429) & Auto-Heal (404):** Dilengkapi mekanisme *Exponential Backoff Retry* dan *Auto-Discovery Model* untuk mendeteksi serta melewati model API yang mati/limit.
- **⚡ Smart Batching:** Mengelompokkan hingga 5–10 soal teks dalam satu kali panggilan API untuk menghemat kuota dan mempercepat proses penjaawaban.
- **🎯 Auto-Skip Biodata:** Mengabaikan kolom isian identitas seperti Nama, NIM/NPM, Kelas, Prodi, Email, dan Token secara otomatis.
- **📊 Interactive HUD & Console Logs:** Dilengkapi panel melayang (*Floating Status HUD*) di layar serta log penjelasan (*reasoning*) jawaban yang rapi di Console DevTools.
- **🔒 Bebas Auto-Submit:** Script **TIDAK** pernah menekan tombol Kirim/Submit secara otomatis agar Anda bisa memeriksa ulang jawaban terlebih dahulu.

---

## 🛠️ Cara Penggunaan

1. Buka halaman **Google Forms** yang ingin dikerjakan pada browser (Google Chrome, Edge, Brave, dll).
2. Tekan `F12` atau `Ctrl + Shift + I` (Cmd + Option + I di Mac) untuk membuka **Developer Tools**.
3. Pilih tab **Console**.
4. Salin (*copy*) seluruh isi script `auto_jawab_google_forms.js`.
5. Ubah bagian `CONFIG.API_KEY` dengan API Key Gemini milik Anda:
   ```javascript
   const CONFIG = {
     API_KEY: "PASTE_API_KEY_GEMINI_ANDA_DI_SINI",
     // ...
   };
