(function () {
  'use strict';

  // ===== Icons sprite =====
  async function loadIcons() {
    const res = await fetch('./assets/icons.svg', { cache: 'no-store' });
    const text = await res.text();
    document.getElementById('icons-host').innerHTML = text;
  }

  // ===== Markdown parser =====
  function parseMarkdown(text) {
    const lines = text.split(/\r?\n/);
    let i = 0;

    let chats = [];
    if (lines[i] && lines[i].trim() === '---') {
      i++;
      const fmLines = [];
      while (i < lines.length && lines[i].trim() !== '---') {
        fmLines.push(lines[i]);
        i++;
      }
      i++;
      chats = parseFrontmatter(fmLines);
    }

    const messages = {};
    let currentChat = null;
    let buf = null;

    function flush() {
      if (buf && currentChat) {
        messages[currentChat] = messages[currentChat] || [];
        messages[currentChat].push(buf);
      }
      buf = null;
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      const hMatch = trimmed.match(/^#\s+([a-z0-9-]+)\s*$/);
      if (hMatch) {
        flush();
        currentChat = hMatch[1];
        messages[currentChat] = messages[currentChat] || [];
        i++;
        continue;
      }

      if (!currentChat) { i++; continue; }

      const dMatch = trimmed.match(/^---\s*(.+?)\s*---$/);
      if (dMatch) {
        flush();
        messages[currentChat].push({ type: 'divider', label: dMatch[1] });
        i++;
        continue;
      }

      if (line.startsWith('[')) {
        flush();
        const close = line.indexOf(']');
        if (close < 0) { i++; continue; }
        const header = line.slice(1, close);
        buf = parseMessageHeader(header);
        buf.bodyLines = [];
        const trailing = line.slice(close + 1);
        if (trailing.trim().length > 0) buf.bodyLines.push(trailing.replace(/^\s/, ''));
        i++;
        continue;
      }

      if (trimmed === '') {
        if (buf && buf.bodyLines.length > 0) buf.bodyLines.push('');
        i++;
        continue;
      }

      if (buf) {
        let bodyLine = line;
        if (bodyLine.startsWith('\\[')) bodyLine = bodyLine.slice(1);
        buf.bodyLines.push(bodyLine);
      }
      i++;
    }
    flush();

    for (const cid in messages) {
      for (const m of messages[cid]) {
        if (m.bodyLines) {
          while (m.bodyLines.length && m.bodyLines[m.bodyLines.length - 1].trim() === '') m.bodyLines.pop();
          m.body = m.bodyLines.join('\n');
          delete m.bodyLines;
        }
        if (!m.type) {
          if (m.who === 'system') m.type = 'system';
          else if (m.who === 'status') m.type = 'status';
          else m.type = 'text';
        }
      }
    }

    return { chats, messages };
  }

  function parseFrontmatter(lines) {
    const chats = [];
    let cur = null;
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === 'chats:') continue;
      const dash = line.match(/^\s*-\s+(\w+):\s*(.*)$/);
      if (dash) {
        if (cur) chats.push(cur);
        cur = {};
        cur[dash[1]] = parseValue(dash[2]);
        continue;
      }
      const kv = line.match(/^\s+(\w+):\s*(.*)$/);
      if (kv && cur) cur[kv[1]] = parseValue(kv[2]);
    }
    if (cur) chats.push(cur);
    return chats;
  }

  function parseValue(raw) {
    raw = raw.trim();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  function parseMessageHeader(header) {
    const msg = { who: '', time: null };
    const quotedRe = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = quotedRe.exec(header)) !== null) msg[m[1]] = m[2];
    const stripped = header.replace(quotedRe, '').trim();
    const tokens = stripped.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return msg;
    msg.who = tokens[0];
    let idx = 1;
    if (tokens[idx] && /^\d{1,2}:\d{2}$/.test(tokens[idx])) {
      msg.time = tokens[idx];
      idx++;
    }
    while (idx < tokens.length) {
      const t = tokens[idx];
      const eq = t.indexOf('=');
      if (eq > 0) msg[t.slice(0, eq)] = t.slice(eq + 1);
      idx++;
    }
    return msg;
  }

  // ===== Helpers =====
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function inlineMd(s) {
    let t = escapeHtml(s);
    t = t.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    t = t.replace(/_([^_\n]+)_/g, '<i>$1</i>');
    t = t.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\n/g, '<br>');
    return t;
  }

  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('') || '?';
  }

  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const AVATAR_COLORS = ['#5A8B8B','#8B5A8B','#5A8B5A','#8B8B5A','#5A5A8B','#8B5A5A','#5A8B7A','#7A5A8B','#5A7A8B','#8B7A5A','#7A8B5A','#5A8B6A'];
  const SENDER_COLORS = ['#06CF9C','#53BDEB','#FFAB91','#CE93D8','#80CBC4','#FFD54F','#A5D6A7','#90CAF9','#F48FB1','#BCAAA4','#FFE082','#B39DDB'];

  function colorForName(name, palette) {
    return palette[hashStr(name || '') % palette.length];
  }

  function svgIcon(name, cls) {
    return `<svg class="icon ${cls || ''}"><use href="./assets/icons.svg#${name}"/></svg>`;
  }

  // ===== Renderers =====
  function renderAvatar(chat) {
    if (chat.avatar) {
      return `<div class="avatar"><img src="${escapeHtml(chat.avatar)}" alt="" onerror="this.parentElement.innerHTML='${escapeHtml(initials(chat.name))}'; this.parentElement.style.background='${colorForName(chat.name, AVATAR_COLORS)}'"></div>`;
    }
    if (chat.group) {
      return `<div class="avatar group-fallback">${svgIcon('people')}</div>`;
    }
    const color = colorForName(chat.name, AVATAR_COLORS);
    return `<div class="avatar" style="background:${color}">${escapeHtml(initials(chat.name))}</div>`;
  }

  function derivePreview(chat, messages) {
    if (chat.lastPreview !== undefined) return chat.lastPreview;
    const list = messages[chat.id] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.type === 'text') {
        const body = (m.body || '').split('\n')[0];
        if (chat.group && m.who !== 'me' && m.who !== 'them') return `${m.who}: ${body}`;
        return body;
      }
      if (m.type === 'status') return m.body || m.caption || '';
    }
    return '';
  }

  function deriveTime(chat, messages) {
    if (chat.lastTime !== undefined) return chat.lastTime;
    const list = messages[chat.id] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].time) return list[i].time;
    }
    return '';
  }

  function renderList(data) {
    const rows = data.chats.map(c => `
      <div class="chat-row" data-chat-id="${escapeHtml(c.id)}">
        ${renderAvatar(c)}
        <div class="body">
          <div class="row-top">
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="time">${escapeHtml(deriveTime(c, data.messages))}</div>
          </div>
          <div class="row-bottom">
            <div class="preview">${inlineMd(derivePreview(c, data.messages))}</div>
            ${c.muted ? svgIcon('mute-bell', 'mute') : ''}
          </div>
        </div>
      </div>`).join('');

    return `
      <div class="list-header">
        <div class="brand">WhatsApp</div>
        <div class="actions">
          ${svgIcon('camera')}
          ${svgIcon('more-vert')}
        </div>
      </div>
      <div class="search-wrap">
        <div class="search-bar">
          ${svgIcon('search')}
          <div class="placeholder">Ask Meta AI or Search</div>
        </div>
      </div>
      <div class="chips">
        <div class="chip selected">All</div>
        <div class="chip">Unread</div>
        <div class="chip">Favourites</div>
        <div class="chip">Groups</div>
        <div class="chip">Other</div>
      </div>
      <div class="archived-row">
        <div class="icon-wrap">${svgIcon('archived')}</div>
        <div class="label">Archived</div>
      </div>
      <div class="chat-list">${rows}</div>
      <div class="fab">${svgIcon('fab-plus')}</div>
      <div class="bottom-nav">
        <div class="tab selected"><div class="icon-pill">${svgIcon('tab-chats')}</div><div class="label">Chats</div></div>
        <div class="tab updates"><div class="icon-pill">${svgIcon('tab-updates')}</div><div class="label">Updates</div></div>
        <div class="tab"><div class="icon-pill">${svgIcon('tab-communities')}</div><div class="label">Communities</div></div>
        <div class="tab"><div class="icon-pill">${svgIcon('tab-calls')}</div><div class="label">Calls</div></div>
      </div>`;
  }

  function renderTicks(status) {
    if (status === 'sent') return svgIcon('tick-single', 'ticks unread');
    if (status === 'delivered') return svgIcon('tick-double', 'ticks unread');
    if (status === 'read') return svgIcon('tick-double', 'ticks read');
    return '';
  }

  function renderMessage(m, chat, prev) {
    if (m.type === 'divider') return `<div class="divider">${escapeHtml(m.label)}</div>`;
    if (m.type === 'system') return `<div class="divider">${inlineMd(m.body)}</div>`;
    if (m.type === 'status') {
      const fromYou = (m.from || '') === 'You';
      const barColor = fromYou ? 'var(--accent-green-bright)' : colorForName(m.from || '', SENDER_COLORS);
      return `
        <div class="status-share" style="border-left-color:${barColor}">
          <div class="header" style="color:${barColor}">${escapeHtml(m.from || '')} &middot; Status</div>
          <div class="caption">
            ${svgIcon('status-camera')}
            <span>${escapeHtml(m.caption || '')}</span>
            ${m.duration ? `<span class="duration">(${escapeHtml(m.duration)})</span>` : ''}
          </div>
          ${m.body ? `<div class="response">${inlineMd(m.body)}</div>` : ''}
          ${m.time ? `<div class="time">${escapeHtml(m.time)}</div>` : ''}
        </div>`;
    }
    const isOut = m.who === 'me';
    const isGroupOther = chat.group && !isOut && m.who !== 'them';
    const sameAsPrev = prev && prev.type === 'text' && prev.who === m.who;
    const showSender = isGroupOther && !sameAsPrev;
    const replyBlock = m.replyFrom ? `
      <div class="reply" style="border-left-color:${colorForName(m.replyFrom, SENDER_COLORS)}">
        <div class="reply-from" style="color:${colorForName(m.replyFrom, SENDER_COLORS)}">${escapeHtml(m.replyFrom)}</div>
        <div class="reply-body">${escapeHtml(m.replyBody || '')}</div>
      </div>` : '';
    const senderBlock = showSender ? `<span class="sender" style="color:${colorForName(m.who, SENDER_COLORS)}">${escapeHtml(m.who)}</span>` : '';
    const reactionEmojis = m.reactions ? m.reactions.replace(/×\d+/g, '').replace(/,/g, ' ').trim() : '';
    const reactionsBlock = reactionEmojis ? `<div class="reactions">${escapeHtml(reactionEmojis)}</div>` : '';
    const metaTime = m.time ? escapeHtml(m.time) : '';
    const metaSep = (m.time && m.status) ? ' ' : '';
    const meta = (metaTime || m.status) ? `<span class="meta">${metaTime}${metaSep}${renderTicks(m.status)}</span>` : '';
    return `
      <div class="bubble ${isOut ? 'out' : 'in'}">
        ${senderBlock}
        ${replyBlock}
        <span class="body">${inlineMd(m.body || '')}</span>
        ${meta}
        ${reactionsBlock}
      </div>`;
  }

  function renderConv(data, chatId) {
    const chat = data.chats.find(c => c.id === chatId);
    if (!chat) return `<div style="padding:24px;color:#888">Chat not found: ${escapeHtml(chatId)}</div>`;
    const list = data.messages[chatId] || [];
    let html = '';
    let prev = null;
    for (const m of list) {
      html += renderMessage(m, chat, prev);
      prev = m;
    }
    const subtitle = chat.online ? 'online' : '';
    return `
      <div class="conv-header">
        <div class="back" data-action="back">${svgIcon('back')}</div>
        <div class="peer">
          ${renderAvatar(chat)}
          <div class="meta">
            <div class="name">${escapeHtml(chat.name)}</div>
            ${subtitle ? `<div class="status">${escapeHtml(subtitle)}</div>` : ''}
          </div>
        </div>
        <div class="actions">
          <div class="icon-btn">${svgIcon('video')}</div>
          <div class="icon-btn">${svgIcon('phone')}</div>
          <div class="icon-btn">${svgIcon('more-vert')}</div>
        </div>
      </div>
      <div class="messages">${html}</div>
      <div class="input-bar">
        <div class="pill">
          ${svgIcon('emoji', 'emoji')}
          <div class="placeholder">Message</div>
          ${svgIcon('attach', 'attach')}
          ${svgIcon('camera', 'camera-input')}
        </div>
        <div class="mic">${svgIcon('mic')}</div>
      </div>`;
  }

  // ===== Router =====
  let DATA = null;

  function route() {
    const hash = location.hash || '#/';
    const listView = document.getElementById('view-list');
    const convView = document.getElementById('view-conv');
    if (!DATA) return;
    if (hash === '#/' || hash === '' || hash === '#') {
      listView.innerHTML = renderList(DATA);
      attachListHandlers(listView);
      listView.classList.add('active');
      convView.classList.remove('active');
      convView.innerHTML = '';
    } else if (hash.startsWith('#/chat/')) {
      const id = decodeURIComponent(hash.slice('#/chat/'.length));
      convView.innerHTML = renderConv(DATA, id);
      attachConvHandlers(convView);
      convView.classList.add('active');
      listView.classList.remove('active');
      listView.innerHTML = '';
      // scroll the messages area to the bottom (newest messages visible) like real WhatsApp
      const msgs = convView.querySelector('.messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function attachListHandlers(root) {
    root.querySelectorAll('.chat-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-chat-id');
        location.hash = `#/chat/${encodeURIComponent(id)}`;
      });
    });
  }

  function attachConvHandlers(root) {
    const back = root.querySelector('[data-action="back"]');
    if (back) back.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.hash = '#/';
    });
  }

  // ===== Boot =====
  async function loadData() {
    const res = await fetch('./chats.md?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`chats.md returned HTTP ${res.status}`);
    const text = await res.text();
    return parseMarkdown(text);
  }

  async function boot() {
    try {
      await loadIcons();
      DATA = await loadData();
    } catch (e) {
      document.body.innerHTML = `<pre style="padding:24px;color:#f88;font-family:monospace">Failed to boot:\n${escapeHtml(e.message)}</pre>`;
      return;
    }
    window.addEventListener('hashchange', route);
    route();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  boot();
})();
