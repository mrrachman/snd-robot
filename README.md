# SND ROBOT — Membership Stack

Dibangun otomatis oleh skill `tool-membership-stack`.

## File
| File | Isi |
|---|---|
| `index.html` | **landing jualan — BELUM ADA. Isi sendiri.** |
| `register.html` | daftar member |
| `login.html` | login member |
| `dashboard.html` | dashboard member (lisensi + IB) |
| `ib.html` | halaman arahan daftar gratis via IB |
| `admin-531f48.html` | dashboard admin (nama diacak) |
| `api/admin.js` | fungsi server — kunci rahasia ada di sini |
| `EA/` | taruh file EA di sini |

## Langkah lanjut
1. Buat project Supabase baru -> jalankan `scripts/supabase_setup.sql`
2. Ambil Project URL + kunci publik + kunci rahasia
3. Set di Vercel (Environment Variables):
   - `SUPA_SECRET` = kunci rahasia Supabase
   - `ADMIN_PASS`  = password admin pilihanmu
4. Upload file EA ke folder `EA/`
5. Push ke GitHub -> sambungkan ke Vercel

## Kunci rahasia TIDAK ada di file mana pun
Hanya di Environment Variables Vercel. Itu memang tujuannya.
