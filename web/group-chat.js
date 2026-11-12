// ---------- group trash-talk chat (shared by the NFL and NBA Bracket Challenge) ----------
// Needs from the host page: sb, user, ch, esc, toast, confirmTwice.
const chat = { group: null, msgs: [], sub: null, poll: null, draft: '', sending: false };
function chatAgo(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function chatListHtml() {
  if (!chat.msgs.length) return '<p class="hint chatempty">No trash talk yet. Somebody has to start it.</p>';
  const own = ch.group && user && ch.group.owner === user.id;
  let prev = null;
  return chat.msgs.map((m) => {
    const me = user && m.user_id === user.id, cont = prev && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 300000;
    prev = m;
    return `<div class="cmsg${me ? ' me' : ''}${cont ? ' cont' : ''}">${cont ? '' : `<div class="cwho">${esc(me ? 'You' : m.display_name)} <span>${chatAgo(m.created_at)}</span></div>`}
      <div class="cbody">${esc(m.body)}${me || own ? `<button class="cdel" data-chatdel="${m.id}" aria-label="Delete message" title="Delete">✕</button>` : ''}</div></div>`;
  }).join('');
}
function chatHtml() {
  setTimeout(() => { const el = document.getElementById('chatList'); if (el) el.scrollTop = el.scrollHeight; }, 0);
  return `<section class="card chatcard"><div class="section-head" style="margin:0 0 8px"><h3 style="margin:0">Trash talk</h3><span class="hint">Only this group can see it</span></div>
    <div class="chatlist" id="chatList">${chatListHtml()}</div>
    <form class="chatform" id="chatForm"><input type="text" id="chatInput" maxlength="500" autocomplete="off" placeholder="Say something you'll regret in April…" value="${esc(chat.draft)}"><button class="btn primary" type="submit">Send</button></form></section>`;
}
function chatPaint(scroll = true) {
  const el = document.getElementById('chatList'); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = chatListHtml();
  if (scroll || atBottom) el.scrollTop = el.scrollHeight;
}
async function chatLoad(groupId) {
  if (chat.group === groupId) return chatPaint();
  chatStop(); chat.group = groupId; chat.msgs = [];
  const { data } = await sb.from('group_messages').select('id,user_id,display_name,body,created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(150);
  if (chat.group !== groupId) return;
  chat.msgs = (data || []).reverse(); chatPaint();
  try {
    chat.sub = sb.channel('chat:' + groupId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` }, (p) => { if (!chat.msgs.some((m) => m.id === p.new.id)) { chat.msgs.push(p.new); chatPaint(false); } })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, (p) => { chat.msgs = chat.msgs.filter((m) => m.id !== p.old.id); chatPaint(false); })
      .subscribe();
  } catch {}
  // backstop in case live updates are blocked on this network
  chat.poll = setInterval(async () => {
    if (document.hidden || chat.group !== groupId) return;
    const since = chat.msgs.length ? chat.msgs[chat.msgs.length - 1].created_at : '1970-01-01';
    const { data: more } = await sb.from('group_messages').select('id,user_id,display_name,body,created_at').eq('group_id', groupId).gt('created_at', since).order('created_at');
    if (more && more.length) { for (const m of more) if (!chat.msgs.some((x) => x.id === m.id)) chat.msgs.push(m); chatPaint(false); }
  }, 20000);
}
function chatStop() {
  if (chat.sub) { try { sb.removeChannel(chat.sub); } catch {} chat.sub = null; }
  clearInterval(chat.poll); chat.poll = null; chat.group = null;
}
document.addEventListener('input', (e) => { if (e.target.id === 'chatInput') chat.draft = e.target.value; });
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'chatForm') return;
  e.preventDefault();
  const body = (chat.draft || '').trim();
  if (!body || chat.sending || !ch.group) return;
  chat.sending = true;
  const { data, error } = await sb.from('group_messages').insert({ group_id: ch.group.id, body }).select('id,user_id,display_name,body,created_at').single();
  chat.sending = false;
  if (error) return toast(/slow down/i.test(error.message) ? 'Slow down a little' : 'Could not send: ' + error.message);
  chat.draft = ''; const inp = document.getElementById('chatInput'); if (inp) { inp.value = ''; inp.focus(); }
  if (!chat.msgs.some((m) => m.id === data.id)) chat.msgs.push(data);
  chatPaint();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-chatdel]'); if (!b) return;
  if (!confirmTwice(b)) return;
  const id = +b.dataset.chatdel;
  const { error } = await sb.from('group_messages').delete().eq('id', id);
  if (error) return toast(error.message);
  chat.msgs = chat.msgs.filter((m) => m.id !== id); chatPaint(false);
});
