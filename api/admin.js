// api/admin.js — Penjaga kunci rahasia admin.
//
// Kunci Supabase & password admin TIDAK ditulis di file ini.
// Keduanya dibaca dari Environment Variables Vercel (server-side).
// Browser tidak pernah menerima kunci rahasia.

const SUPA_URL = 'https://nkeytmarkudwzilkmfde.supabase.co';

// Bandingkan dua string tanpa membocorkan panjang/waktu (anti timing attack)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_PASS  = process.env.ADMIN_PASS;
  const SUPA_SECRET = process.env.SUPA_SECRET;

  if (!ADMIN_PASS || !SUPA_SECRET) {
    return res.status(500).json({ error: 'Server belum dikonfigurasi (env var kurang)' });
  }

  // Vercel sudah parse JSON body, tapi amankan kalau string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const action = body.action;
  const pass   = body.pass;

  // Gerbang password
  if (!safeEqual(String(pass || ''), ADMIN_PASS)) {
    await new Promise(r => setTimeout(r, 400)); // perlambat percobaan brute-force
    return res.status(401).json({ error: 'Password salah' });
  }

  const H = {
    apikey: SUPA_SECRET,
    Authorization: 'Bearer ' + SUPA_SECRET,
    'Content-Type': 'application/json',
  };

  try {
    // ---------- login: hanya memverifikasi password ----------
    if (action === 'login') {
      return res.status(200).json({ ok: true });
    }

    // ---------- daftar member + lisensi ----------
    if (action === 'members') {
      const [uRes, lRes] = await Promise.all([
        fetch(`${SUPA_URL}/auth/v1/admin/users?page=1&per_page=1000`, { headers: H }),
        fetch(`${SUPA_URL}/rest/v1/licenses?select=*&order=slot.asc`, { headers: H }),
      ]);
      if (!uRes.ok) return res.status(502).json({ error: 'Gagal ambil member' });
      if (!lRes.ok) return res.status(502).json({ error: 'Gagal ambil lisensi' });

      const rawUsers  = (await uRes.json()).users || [];
      const licenses  = await lRes.json();

      // Kirim HANYA data yang dipakai tampilan (jangan bocorkan hash password dsb)
      const users = rawUsers.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: {
          nama: (u.user_metadata && u.user_metadata.nama) || null,
          wa:   (u.user_metadata && u.user_metadata.wa)   || null,
        },
      }));

      return res.status(200).json({ users, licenses });
    }

    // ---------- aktifkan lisensi (slot 1 & 2) ----------
    if (action === 'grant') {
      const memberId = body.memberId;
      const days     = parseInt(body.days, 10);
      if (!memberId || !days || days < 1) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
      }

      const expires = new Date();
      expires.setDate(expires.getDate() + days);
      const iso = expires.toISOString();

      for (let slot = 1; slot <= 2; slot++) {
        const check = await fetch(
          `${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.${slot}&select=id`,
          { headers: H }
        );
        const existing = await check.json();

        if (Array.isArray(existing) && existing.length > 0) {
          await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.${slot}`, {
            method: 'PATCH',
            headers: H,
            body: JSON.stringify({ expires_at: iso, is_active: true }),
          });
        } else {
          await fetch(`${SUPA_URL}/rest/v1/licenses`, {
            method: 'POST',
            headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
            body: JSON.stringify({ member_id: memberId, expires_at: iso, is_active: true, slot }),
          });
        }
      }
      return res.status(200).json({ ok: true });
    }

    // ---------- IB: tandai member sebagai IB (buat baris slot 3) ----------
    if (action === 'ibmark') {
      const memberId = body.memberId;
      if (!memberId) return res.status(400).json({ error: 'Data tidak lengkap' });

      // Member boleh berpindah ke jalur IB kapan saja (1 member 1 jalur):
      // slot berbayar dimatikan otomatis supaya tidak dobel jalur.
      const cek = await fetch(
        `${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=in.(1,2)`,
        { headers: H }
      );
      const ada = await cek.json();
      if (Array.isArray(ada) && ada.length > 0) {
        await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=in.(1,2)`, {
          method: 'PATCH',
          headers: H,
          body: JSON.stringify({ is_active: false, account_number: null }),
        });
      }

      // tolak kalau sudah ditandai IB
      const cek3 = await fetch(
        `${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3&select=id`,
        { headers: H }
      );
      const ada3 = await cek3.json();
      if (Array.isArray(ada3) && ada3.length > 0) {
        return res.status(409).json({ error: 'Member ini sudah ditandai IB' });
      }

      const r = await fetch(`${SUPA_URL}/rest/v1/licenses`, {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({
          member_id: memberId,
          slot: 3,
          expires_at: '2126-01-01T00:00:00.000Z',
          is_active: false,
          account_number: null,
        }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal menandai IB' });
      return res.status(200).json({ ok: true });
    }

    // ---------- IB: verifikasi & accept (nyalakan lisensi) ----------
    if (action === 'ibaccept') {
      const memberId = body.memberId;
      if (!memberId) return res.status(400).json({ error: 'Data tidak lengkap' });

      const cek = await fetch(
        `${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3&select=account_number`,
        { headers: H }
      );
      const rows = await cek.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'Baris IB tidak ditemukan' });
      }
      if (!rows[0].account_number) {
        return res.status(400).json({ error: 'Member belum mengisi nomor akun' });
      }

      const r = await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({
          is_active: true,
          expires_at: '2126-01-01T00:00:00.000Z',
          activated_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal accept IB' });
      return res.status(200).json({ ok: true });
    }

    // ---------- IB: tolak / batalkan (hapus baris slot 3) ----------
    if (action === 'ibreject') {
      const memberId = body.memberId;
      if (!memberId) return res.status(400).json({ error: 'Data tidak lengkap' });

      const r = await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3`, {
        method: 'DELETE', headers: H,
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal membatalkan IB' });
      return res.status(200).json({ ok: true });
    }

    // ---------- isi nomor akun IB (diisi admin) ----------
    if (action === 'ibset') {
      const memberId = body.memberId;
      const acc      = parseInt(body.accountNumber, 10);
      if (!memberId || !acc || acc < 100000) {
        return res.status(400).json({ error: 'Nomor akun tidak valid (minimal 6 digit)' });
      }

      const cek = await fetch(
        `${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3&select=id`,
        { headers: H }
      );
      const ada = await cek.json();
      if (!Array.isArray(ada) || ada.length === 0) {
        return res.status(409).json({ error: 'Member ini belum ditandai IB' });
      }

      const r = await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}&slot=eq.3`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ account_number: acc, activated_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal simpan nomor akun' });
      return res.status(200).json({ ok: true });
    }

    // ---------- revoke lisensi ----------
    if (action === 'revoke') {
      const memberId = body.memberId;
      if (!memberId) return res.status(400).json({ error: 'Data tidak lengkap' });

      const r = await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ is_active: false, account_number: null }),
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal revoke' });
      return res.status(200).json({ ok: true });
    }

    // ---------- hapus member + lisensinya ----------
    if (action === 'delete') {
      const memberId = body.memberId;
      if (!memberId) return res.status(400).json({ error: 'Data tidak lengkap' });

      await fetch(`${SUPA_URL}/rest/v1/licenses?member_id=eq.${memberId}`, {
        method: 'DELETE', headers: H,
      });
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${memberId}`, {
        method: 'DELETE', headers: H,
      });
      if (!r.ok) return res.status(502).json({ error: 'Gagal hapus akun' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Aksi tidak dikenal' });

  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
};
