# Naskah Demonstrasi — Routing Lab, Security Suite & Obrolan Dokumen

---

## 1. Routing Lab — Simulasi Hybrid Router

**Visual:** Buka halaman Routing Lab dari sidebar. Tampak tiga toggle Quantum Rule Configuration di bagian atas, dropdown Routing Profile, textarea prompt, dan tombol "Simulate Route".

> **Narasi:**
>
> Routing Lab adalah simulator interaktif yang memperlihatkan cara kerja hybrid router GreatAegis tanpa perlu backend sungguhan. Semua simulasi berjalan murni di sisi klien.
>
> Di sini kita memiliki tiga **Quantum Rule Configuration** yang bisa diaktifkan atau dinonaktifkan:
>
> 1. **Enforce Client-Side ML-KEM/Kyber Key Wrapping** — memaksa enkripsi post-quantum sebelum prompt meninggalkan browser.
> 2. **Zero-Trust Data-in-Transit Payload Encapsulation** — memastikan semua traffic melewati pod AMD privat.
> 3. **Strict Safe-Compute Pod Isolation** — memblokir fallback otomatis ke penyedia eksternal jika pod offline.
>
> Ketiga aturan ini disimpan di localStorage dan dibagikan dengan halaman Security Suite serta Workspace Chat — jadi sekali diatur, berlaku di mana saja.
>
> **Visual:** Klik dropdown Routing Profile, pilih "Auto", "Compliance", lalu "Deep Inference".
>
> Kita bisa memilih **Routing Profile**: **Auto** (klasifikasi otomatis dari isi prompt), **Compliance** (memaksa jalur kepatuhan), atau **Deep Inference** (memaksa jalur komputasi berat).
>
> **Visual:** Ketik prompt contoh: *"What is the Q4 financial forecast for the merger acquisition?"* lalu klik Simulate.
>
> Setelah disimulasikan, panel hasil menampilkan:
>
> - **Risk Score** — lingkaran gauge animasi dari 0–100 dengan warna: hijau (Low), oranye (Elevated), merah (Critical).
> - **Matched Keywords** — kata-kata sensitif yang terdeteksi, misalnya "forecast", "merger", "acquisition", masing-masing dengan badge merah.
> - **Workload Classification** — apakah prompt ini termasuk *Compliance*, *Deep Inference*, atau *General*.
> - **Condition Evaluation Table** — tabel evaluasi kondisi seperti `force_private`, `score < 40`, `effective_encryption`. Setiap baris menunjukkan apakah kondisi terpenuhi (centang hijau) atau tidak (silang merah).
> - **Final Verdict** — keputusan akhir: **public_fireworks** (rute publik), **private_route** (pod AMD privat), atau **secure_fallback** (tunnel terenkripsi jika pod offline).
> - **Routing Reason** — penjelasan tekstual mengapa router mengambil keputusan tersebut.
>
> **Visual:** Tunjukkan saat prompt sensitif mendapat verdict "private_route", lalu nonaktifkan aturan pod isolation dan tunjukkan verdict berubah menjadi "secure_fallback".
>
> Ini alat yang sangat berguna untuk memahami dan menguji kebijakan routing sebelum deployment ke produksi.

---

## 2. Security Suite — Panel Kontrol Keamanan Post-Quantum

**Visual:** Buka halaman Security Suite dari sidebar. Tampak banner status AMD Secure Pod, konfigurasi aturan kuantum, dan tabel Threat Capture Log.

> **Narasi:**
>
> Security Suite adalah pusat kendali keamanan post-quantum GreatAegis. Di sini kita bisa memantau status infrastruktur dan meninjau log dokumentasi terenkripsi.
>
> **Visual:** Arahkan kursor ke banner "AMD Secure Pod & vLLM Hub Status".
>
> Di bagian paling atas, terdapat **Realtime AMD Secure Pod & vLLM Hub Status** — banner yang menunjukkan:
> - Status hardware: **ONLINE** (hijau dengan animasi breathing), **SIMULATED** (biru untuk mode demo), atau **OFFLINE** (merah).
> - Model vLLM yang tersedia di hub.
> - Mode aplikasi: *simulated* atau *production*.
>
> **Visual:** Tunjukkan ketiga toggle Quantum Rule Configuration.
>
> Selanjutnya, **Quantum Rule Configuration** — tiga toggle yang sama persis dengan yang ada di Routing Lab. Ini memastikan konsistensi kebijakan keamanan di seluruh aplikasi.
>
> **Visual:** Scroll ke tabel Threat Capture Log. Klik tombol Inspect pada salah satu baris.
>
> Bagian utama adalah **Threat Capture Log Explorer** — tabel yang mencatat setiap peristiwa ingest dokumen. Setiap baris menampilkan:
> - **Timestamp** — waktu kejadian.
> - **File Name** — nama dokumen yang diunggah.
> - **Classification** — badge klasifikasi, misalnya **"Highly Confidential"** (merah) atau **"Public"** (hijau).
> - **Size** — ukuran file.
> - **Details / Inspect** — tombol untuk memperluas baris.
>
> **Visual:** Tampilkan baris yang diperluas dengan ciphertext.
>
> Saat baris diperluas, kita bisa melihat **Event Summary Ciphertext** — payload terenkripsi ML-KEM yang menunjukkan bahwa dokumen telah diamankan dengan kriptografi post-quantum sebelum disimpan ke vector database. Ini adalah bukti kriptografis bahwa data tidak pernah berada dalam bentuk plaintext di server.

---

## 3. Obrolan Dokumen (Enterprise Chat Workspace) — Unggah, Tanya, Dapatkan Jawaban Terkutip

**Visual:** Buka tab Workspace (Obrolan Dokumen) dari sidebar. Tampak antarmuka chat dengan kolom input dan tombol paperclip.

> **Narasi:**
>
> Ini adalah fitur **Obrolan Dokumen** — antarmuka AI chat enterprise yang dilengkapi dengan kemampuan **RAG (Retrieval-Augmented Generation)** di atas penyimpanan vektor terenkripsi.
>
> **Visual:** Klik ikon paperclip, pilih file PDF.
>
> Prosesnya dimulai dengan **unggah dokumen**. Klik ikon paperclip, pilih file — format yang didukung: `.txt`, `.pdf`, `.doc`, `.docx`, `.csv`, `.json`, `.md`, maksimal 10 MB.
>
> **Visual:** Tunjukkan proses upload dan notifikasi "Document ingested successfully".
>
> Setelah file dipilih, teks diekstrak di sisi klien menggunakan **pdf.js** (untuk PDF) atau **FileReader** (untuk file teks). Teks kemudian dienkripsi dengan **AES-256-GCM** yang kuncinya dibungkus dengan **ML-KEM-768** — semuanya di browser sebelum dikirim ke server. Potongan teks terenkripsi ini kemudian diingest ke **Qdrant vector database** melalui endpoint `POST /api/v1/gateway/vector/ingest`.
>
> **Visual:** Ketik pertanyaan di kolom chat, kirim, dan tunjukkan respons mengalir (streaming).
>
> Sekarang kita **ajukan pertanyaan**. Begitu tombol kirim ditekan:
> 1. Prompt dienkripsi di sisi klien dengan **ML-KEM-768** (jika aturan kuantum aktif).
> 2. Prompt terenkripsi dikirim ke backend melalui **SSE streaming** (`POST /api/v1/gateway/chat/stream`).
> 3. Hybrid router mengklasifikasikan prompt dan memutuskan rute — apakah ke **Fireworks AI** (publik) atau ke **AMD Instinct GPU pod** (privat).
> 4. Dilakukan semantic search di atas **vector store terenkripsi** — chunk yang relevan didekripsi hanya di dalam pod aman.
> 5. LLM menghasilkan jawaban yang **dikutip** dari chunk dokumen asli.
>
> **Visual:** Tunjukkan badge routing pada pesan asisten — misalnya "Routed: private_route | ML-KEM-768 | 3 rules applied".
>
> Hasilnya adalah **jawaban yang kontekstual dan terverifikasi**, lengkap dengan badge routing yang menunjukkan:
> - **Verdict** (rute yang dipilih)
> - **Quantum rules** yang diterapkan
> - **Algoritma PQC** yang digunakan
>
> **Visual:** Tunjukkan tombol suggestion, tombol scroll to bottom, dan fitur salin kode.
>
> Fitur tambahan meliputi: **suggestion buttons** untuk pertanyaan cepat, **Markdown rendering** dengan sintaks highlight dan tombol salin kode, **auto-scroll** ke pesan terbaru, serta **riwayat percakapan** yang bisa dibuat, diganti nama, dan dihapus.
>
> **Visual:** Tutup dengan menunjukkan status "Gateway Live" atau "Demo Mode" di pojok.
>
> Yang paling penting: **data tidak pernah dalam bentuk plaintext di server**. Dokumen dan prompt dienkripsi di browser, didekripsi hanya di pod aman untuk inferensi, dan hasilnya dikembalikan melalui saluran terenkripsi. Ini memastikan **data sovereignty** penuh bagi enterprise.

---

**Total durasi:** ~6-7 menit (jika dipresentasikan lengkap)
**Gaya:** Narasi demonstrasi langsung, cocok untuk video walkthrough atau presentasi live demo.
