const $ = (s) => document.querySelector(s);
async function api(url, options = {}) {
  const res = await fetch(url, { credentials:'same-origin', ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No autorizado o error del servidor.');
  return data;
}
function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function setMessage(text, bad=false) {
  $('#admin-message').textContent = text;
  $('#admin-message').classList.toggle('error', bad);
}
async function loadUsers() {
  try {
    const { users } = await api('/api/admin/users');
    $('#users-table').innerHTML = users.map(u => `<tr>
      <td>${esc(u.displayName)}</td><td>${esc(u.email)}</td><td><span class="pill">${esc(u.role)}</span></td>
      <td>${u.suspended ? '<span class="status suspended">Suspendida</span>' : '<span class="status active-status">Activa</span>'}</td>
      <td class="actions">
        <button class="button button-small ${u.suspended ? 'button-primary' : 'button-light'}" data-suspend="${u.id}" data-next="${!u.suspended}">${u.suspended ? 'Reactivar' : 'Suspender'}</button>
        <button class="button button-small button-light" data-role="${u.id}" data-next="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
      </td></tr>`).join('');
  } catch (err) {
    setMessage(err.message, true);
    if (err.message.toLowerCase().includes('admin') || err.message.toLowerCase().includes('autorizado')) {
      setTimeout(() => location.href = '/', 1800);
    }
  }
}
$('#users-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  try {
    if (btn.dataset.suspend) {
      const next = btn.dataset.next === 'true';
      if (!confirm(`${next ? '¿Suspender' : '¿Reactivar'} esta cuenta?`)) return;
      await api(`/api/admin/users/${btn.dataset.suspend}`, { method:'PATCH', body:JSON.stringify({suspended:next}) });
    } else if (btn.dataset.role) {
      const role = btn.dataset.next;
      if (!confirm(`${role === 'admin' ? '¿Dar permisos de administrador' : '¿Quitar permisos de administrador'}?`)) return;
      await api(`/api/admin/users/${btn.dataset.role}`, { method:'PATCH', body:JSON.stringify({role}) });
    }
    setMessage('Cambios guardados.');
    await loadUsers();
  } catch (err) { setMessage(err.message, true); }
});
loadUsers();
