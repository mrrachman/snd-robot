// API pendaftaran member SND ROBOT
// Akun dibuat lewat admin API Supabase dan LANGSUNG dikonfirmasi,
// supaya anggota tidak tertahan "cek email dulu" yang belum disetel.

const SUPA_URL = 'https://nkeytmarkudwzilkmfde.supabase.co';

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SECRET = process.env.SUPA_SECRET;
  if (!SECRET) {
    return res.status(500).json({ error: 'Server belum dikonfigurasi (env var kurang)' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const nama  = String(body.nama || '').trim();
  const wa    = String(body.wa || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const pass  = String(body.pass || '');

  if (!nama || !wa || !email || !pass) {
    return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }
  if (pass.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const H = {
    apikey: SECRET,
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Buat akun + langsung konfirmasi (tanpa perlu klik email)
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        email: email,
        password: pass,
        email_confirm: true,
        user_metadata: { nama: nama, wa: wa }
      })
    });
    const data = await r.json();

    if (!r.ok) {
      const msg = String(data.msg || data.error_description || data.error || '');
      if (/already|exists|registered/i.test(msg)) {
        return res.status(409).json({ error: 'Email ini sudah terdaftar. Coba masuk atau pakai email lain.' });
      }
      return res.status(400).json({ error: msg || 'Pendaftaran gagal' });
    }

    // 2. Akun siap dipakai; lisensi diaktifkan admin dari halaman admin.
    return res.status(200).json({ ok: true, email: email });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + String(e && e.message || e) });
  }
};
