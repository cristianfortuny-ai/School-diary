const $ = (s) => document.querySelector(s);
const authPanel = $('#auth-panel');
const appPanel = $('#app-panel');
const nav = $('#nav');
let currentUser = null;
let authMode = 'login';
let currentView = 'feed';
let currentConversation = null;

async function api(url, options = {}) {
  const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (options.body && !(options.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, opts);
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || data || 'Algo ha fallado.');
  return data;
}
function message(el, text, bad = false) {
  el.textContent = text;
  el.classList.toggle('error', bad);
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.toggle('active', b.dataset.authTab === mode));
  $('#name-wrap').classList.toggle('hidden', mode !== 'register');
  $('#auth-form [name=displayName]').required = mode === 'register';
  $('#auth-form [name=password]').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión';
  $('#auth-message').textContent = '';
}
document.querySelectorAll('[data-auth-tab]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.authTab)));

function showApp(user) {
  currentUser = user;
  authPanel.classList.add('hidden');
  appPanel.classList.remove('hidden');
  nav.classList.remove('hidden');
  $('#nav-user').textContent = user.displayName;
  $('#admin-link').classList.toggle('hidden', user.role !== 'admin');
  switchView('feed');
}
function showAuth() {
  currentUser = null;
  authPanel.classList.remove('hidden');
  appPanel.classList.add('hidden');
  nav.classList.add('hidden');
}
async function init() {
  const query = new URLSearchParams(location.search);
  if (query.has('auth')) {
    const messages = { failed: 'No se pudo iniciar sesión con Google.', suspended: 'Esta cuenta está suspendida.' };
    message($('#auth-message'), messages[query.get('auth')] || 'No se pudo iniciar sesión.', true);
    history.replaceState({}, '', '/');
  }
  try {
    const data = await api('/api/auth/me');
    if (data.user && !data.user.suspended) {
      showApp(data.user);
      await loadPosts();
      await loadStories();
    } else showAuth();
  } catch { showAuth(); }
}
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const body = { email: form.get('email'), password: form.get('password') };
  if (authMode === 'register') body.displayName = form.get('displayName');
  try {
    const result = await api(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body });
    showApp(result.user);
    await loadPosts();
    await loadStories();
  } catch (err) { message($('#auth-message'), err.message, true); }
});
$('#logout-btn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } finally { showAuth(); }
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
function switchView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ['feed','stories','chats'].forEach(v => $(`#${v}-view`).classList.toggle('hidden', v !== view));
  $('#view-title').textContent = ({feed:'Muro de memes',stories:'Estados',chats:'Tus chats'})[view];
  if (view === 'feed') loadPosts();
  if (view === 'stories') loadStories();
  if (view === 'chats') loadConversations();
}

async function loadPosts() {
  try {
    const { posts } = await api('/api/posts');
    $('#posts').innerHTML = posts.map(p => `
      <article class="post-card">
        <div class="post-author"><div class="avatar">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : '🙂'}</div><div><strong>${esc(p.displayName)}</strong><small>${new Date(p.createdAt).toLocaleString()}</small></div></div>
        ${p.mediaType === 'video' ? `<video class="post-media" controls preload="metadata" src="${esc(p.mediaPath)}"></video>` : `<img class="post-media" loading="lazy" src="${esc(p.mediaPath)}" alt="Meme compartido">`}
        ${p.caption ? `<p class="post-caption">${esc(p.caption)}</p>` : ''}
        <div class="post-actions">
          <button class="like-button ${p.likedByMe ? 'liked' : ''}" data-like="${p.id}">${p.likedByMe ? '♥' : '♡'} ${p.likes || 0}</button>
          <a class="download-link" href="${esc(p.mediaPath)}" download>↓ Descargar</a>
          ${String(p.userId) === String(currentUser.id) || currentUser.role === 'admin' ? `<button class="text-button danger" data-delete-post="${p.id}">Eliminar</button>` : ''}
        </div>
      </article>`).join('') || '<div class="empty-state">Todavía no hay memes. ¡Publica el primero!</div>';
  } catch (err) { $('#posts').innerHTML = `<p class="message error">${esc(err.message)}</p>`; }
}
$('#post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try {
    await api('/api/posts', { method:'POST', body:fd });
    e.currentTarget.reset();
    message($('#post-message'), '¡Meme publicado!');
    await loadPosts();
  } catch (err) { message($('#post-message'), err.message, true); }
});
$('#posts').addEventListener('click', async (e) => {
  const like = e.target.closest('[data-like]');
  const del = e.target.closest('[data-delete-post]');
  try {
    if (like) { await api(`/api/posts/${like.dataset.like}/like`, { method:'POST' }); await loadPosts(); }
    if (del && confirm('¿Eliminar esta publicación?')) { await api(`/api/posts/${del.dataset.deletePost}`, { method:'DELETE' }); await loadPosts(); }
  } catch (err) { alert(err.message); }
});

async function loadStories() {
  try {
    const { stories } = await api('/api/stories');
    $('#stories').innerHTML = stories.map(s => `
      <article class="story-card">
        <div class="post-author"><div class="avatar">${s.avatarUrl ? `<img src="${esc(s.avatarUrl)}" alt="">` : '✨'}</div><strong>${esc(s.displayName)}</strong></div>
        ${s.mediaType === 'video' ? `<video controls class="story-media" src="${esc(s.mediaPath)}"></video>` : `<img class="story-media" loading="lazy" src="${esc(s.mediaPath)}" alt="Estado">`}
        ${s.caption ? `<p>${esc(s.caption)}</p>` : ''}
        <small class="muted">Caduca: ${new Date(s.expiresAt).toLocaleString()}</small>
      </article>`).join('') || '<div class="empty-state">No hay estados activos.</div>';
  } catch (err) { $('#stories').innerHTML = `<p class="message error">${esc(err.message)}</p>`; }
}
$('#story-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/stories', { method:'POST', body:new FormData(e.currentTarget) });
    e.currentTarget.reset();
    message($('#story-message'), '¡Estado publicado!');
    await loadStories();
  } catch (err) { message($('#story-message'), err.message, true); }
});

async function loadConversations() {
  try {
    const { conversations } = await api('/api/messages/conversations');
    $('#conversations').innerHTML = conversations.map(c => `
      <button class="conversation ${String(c.id) === String(currentConversation) ? 'selected' : ''}" data-conversation="${c.id}">
        <strong>${esc((c.participants || []).map(p=>p.displayName).join(', ') || 'Chat')}</strong>
        <small>${esc(c.lastMessage || 'Sin mensajes todavía')}</small>
      </button>`).join('') || '<p class="muted tiny">No tienes conversaciones.</p>';
  } catch (err) { $('#conversations').innerHTML = `<p class="message error">${esc(err.message)}</p>`; }
}
$('#new-chat').addEventListener('click', async () => {
  const list = $('#people');
  list.classList.toggle('hidden');
  if (list.classList.contains('hidden')) return;
  try {
    const { users } = await api('/api/messages/users');
    list.innerHTML = users.map(u => `<button class="conversation" data-user="${u.id}">${esc(u.displayName)}</button>`).join('') || '<p class="tiny muted">No hay otros usuarios todavía.</p>';
  } catch (err) { list.textContent = err.message; }
});
$('#conversations').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-conversation]');
  if (btn) openConversation(btn.dataset.conversation);
});
$('#people').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-user]');
  if (!btn) return;
  try {
    const result = await api('/api/messages/conversations', { method:'POST', body:{userId:btn.dataset.user} });
    $('#people').classList.add('hidden');
    await loadConversations();
    await openConversation(result.conversationId);
  } catch (err) { alert(err.message); }
});
async function openConversation(id) {
  currentConversation = id;
  $('#chat-empty').classList.add('hidden');
  $('#chat-active').classList.remove('hidden');
  try {
    const { messages } = await api(`/api/messages/conversations/${id}`);
    $('#chat-messages').innerHTML = messages.map(m => `<div class="chat-bubble ${String(m.senderId) === String(currentUser.id) ? 'mine' : ''}"><p>${esc(m.body)}</p><small>${esc(m.senderName || (String(m.senderId) === String(currentUser.id) ? 'Tú' : ''))} · ${new Date(m.createdAt).toLocaleString()}</small></div>`).join('') || '<p class="muted">Empieza la conversación.</p>';
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    await loadConversations();
  } catch (err) { $('#chat-messages').textContent = err.message; }
}
$('#message-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentConversation) return;
  const input = e.currentTarget.elements.body;
  try {
    await api(`/api/messages/conversations/${currentConversation}`, { method:'POST', body:{body:input.value} });
    input.value = '';
    await openConversation(currentConversation);
  } catch (err) { alert(err.message); }
});

init();
