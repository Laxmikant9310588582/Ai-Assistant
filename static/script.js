// =====================================
// PRO CONNECT CONFIG
// =====================================
const PRO_CONNECT_URL = '/pro-connect/';

// =====================================
// COOKIE HELPERS
// =====================================
function setCookie(name, value) {
    const cookieValue = encodeURIComponent(JSON.stringify(value));
    document.cookie = `${name}=${cookieValue}; path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
            try { return JSON.parse(decodeURIComponent(c.substring(nameEQ.length))); }
            catch (e) { return null; }
        }
    }
    return null;
}

// =====================================
// SESSION VALIDATION
// =====================================
(async function validateSession() {
    const sessionInfo = getCookie('userInfo');
    if (sessionInfo && sessionInfo.token) {
        console.log("✓ Session valid for user:", sessionInfo.email || sessionInfo.name);
    } else {
        console.log("⚠️ No valid session found");
    }
})();

// =====================================
// STATE
// =====================================
let currentFeature   = null;

// Multi-file support
let uploadedFiles    = [];   // [{ filename, origName }]
let activeFileIndex  = -1;

let historyAllData       = [];
let historyCurrentPage   = 1;
let historyPerPage       = 10;
let historyCurrentFilter = 'all';
let localRecentChats     = [];

let inlineHistoryOpen = false;

// ── DOCS DROPDOWN STATE ──
let docsOpen      = false;
let docsSearch    = '';
let docsPage      = 1;
const DOCS_PER_PAGE = 5;   // pagination after 5 files

// =====================================
// ACTIVE FILE HELPER
// =====================================
function getActiveFile() {
    return activeFileIndex >= 0 ? uploadedFiles[activeFileIndex] : null;
}

// =====================================
// FILE LOCAL STORAGE HELPERS
// =====================================
function saveFileMap(filename, originalName) {
    const map = getFileMap();
    map[filename] = originalName;
    localStorage.setItem('file_map', JSON.stringify(map));
}

function getFileMap() {
    try { return JSON.parse(localStorage.getItem('file_map') || '{}'); } catch { return {}; }
}

function getOrigName(fn) {
    return fn ? (getFileMap()[fn] || fn) : '';
}

function saveUploadedFiles() {
    localStorage.setItem('uploaded_files', JSON.stringify(uploadedFiles));
}

function getSavedUploadedFiles() {
    try { return JSON.parse(localStorage.getItem('uploaded_files') || '[]'); } catch { return []; }
}

// =====================================
// DOM REFS
// =====================================
let chatTitle, chatSubtitle, uploadSection, uploadArea, fileUpload,
    chatMessages, chatInputContainer, chatInput, sendBtn,
    summaryButtonContainer, generateSummaryBtn;

// Pro Connect panel refs (set in DOMContentLoaded)
let mainChatPanel, proConnectPanel, proConnectFrame;

// =====================================
// FEATURE CONFIG
// =====================================
const featureConfig = {
    qna: {
        title: 'QnA',
        subtitle: 'Ask questions based on the uploaded document',
        requiresFile: true,
        placeholder: 'Ask a question about the document...'
    },
    chatbot: {
        title: 'Chatbot',
        subtitle: 'Interactive AI chatbot',
        requiresFile: false,
        placeholder: 'Coming soon...'
    },
    'doc-summary': {
        title: 'Document Summary',
        subtitle: 'Generate a structured summary of the document',
        requiresFile: true,
        placeholder: ''
    }
};

// =====================================
// DOCS DROPDOWN OPEN / CLOSE / TOGGLE
// =====================================
function openDocsDropdown() {
    docsOpen = true;
    document.getElementById('docsItemList')?.classList.add('open');
    document.getElementById('docsDropdownBtn')?.classList.add('open');
    document.getElementById('docsChevron')?.classList.add('open');
}

function closeDocsDropdown() {
    docsOpen = false;
    document.getElementById('docsItemList')?.classList.remove('open');
    document.getElementById('docsDropdownBtn')?.classList.remove('open');
    document.getElementById('docsChevron')?.classList.remove('open');
}

function toggleDocsDropdown() {
    docsOpen ? closeDocsDropdown() : openDocsDropdown();
}

// =====================================
// DOCS FILTER HELPER
// =====================================
function getFilteredDocs() {
    const q = docsSearch.trim().toLowerCase();
    if (!q) return uploadedFiles.map((f, i) => ({ ...f, realIdx: i }));
    return uploadedFiles
        .map((f, i) => ({ ...f, realIdx: i }))
        .filter(f => f.origName.toLowerCase().includes(q));
}

// =====================================
// RENDER DOCS DROPDOWN  (search + pagination)
// =====================================
function renderDocsList() {
    const wrapDiv  = document.getElementById('docsDropdownWrap');
    const countEl  = document.getElementById('docsCount');
    const listBody = document.getElementById('docsListBody');
    const paginEl  = document.getElementById('docsPagination');
    const prevBtn  = document.getElementById('docsPrevBtn');
    const nextBtn  = document.getElementById('docsNextBtn');
    const pageInfo = document.getElementById('docsPageInfo');

    if (!uploadedFiles.length) {
        if (wrapDiv) wrapDiv.style.display = 'none';
        closeDocsDropdown();
        return;
    }

    if (wrapDiv) wrapDiv.style.display = 'block';
    if (countEl) countEl.textContent = uploadedFiles.length;
    if (!listBody) return;

    const filtered   = getFilteredDocs();
    const totalPages = Math.max(1, Math.ceil(filtered.length / DOCS_PER_PAGE));
    if (docsPage > totalPages) docsPage = totalPages;
    if (docsPage < 1)          docsPage = 1;

    if (paginEl) {
        paginEl.style.display = filtered.length > DOCS_PER_PAGE ? 'flex' : 'none';
        if (pageInfo) pageInfo.textContent = `${docsPage} / ${totalPages}`;
        if (prevBtn)  prevBtn.disabled = docsPage <= 1;
        if (nextBtn)  nextBtn.disabled = docsPage >= totalPages;
    }

    const pageItems = filtered.slice((docsPage - 1) * DOCS_PER_PAGE, docsPage * DOCS_PER_PAGE);

    if (!pageItems.length) {
        listBody.innerHTML = `<div class="docs-empty">
            <i class="fas fa-search" style="display:block;margin-bottom:6px;font-size:18px;color:#ddd;"></i>
            No files found
        </div>`;
        return;
    }

    listBody.innerHTML = pageItems.map(f => `
        <div class="doc-list-item ${f.realIdx === activeFileIndex ? 'active' : ''}" data-real-idx="${f.realIdx}">
            <div class="doc-radio"></div>
            <div class="doc-name-wrap">
                <div class="doc-name" title="${escapeHtml(f.origName)}">${highlightMatch(f.origName, docsSearch)}</div>
                ${f.realIdx === activeFileIndex ? '<div class="doc-active-label">Active</div>' : ''}
            </div>
            <button class="doc-remove-btn" data-remove="${f.realIdx}" title="Remove">✕</button>
        </div>`).join('');

    listBody.querySelectorAll('.doc-list-item').forEach(el => {
        el.addEventListener('click', function(e) {
            if (e.target.closest('[data-remove]')) return;
            activeFileIndex = parseInt(this.dataset.realIdx);
            saveUploadedFiles();
            renderDocsList();
            openDocsDropdown();
            const af = getActiveFile();
            addAssistantMessage(`📄 Active document switched to: "${af.origName}"`);
            renderInlineHistory();
        });
    });

    listBody.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const idx     = parseInt(this.dataset.remove);
            const removed = uploadedFiles[idx];
            uploadedFiles.splice(idx, 1);
            if (activeFileIndex >= uploadedFiles.length) activeFileIndex = uploadedFiles.length - 1;
            const newFiltered   = getFilteredDocs();
            const newTotalPages = Math.max(1, Math.ceil(newFiltered.length / DOCS_PER_PAGE));
            if (docsPage > newTotalPages) docsPage = newTotalPages;
            saveUploadedFiles();
            renderDocsList();
            renderInlineHistory();
            if (removed) addAssistantMessage(`🗑️ Removed "${removed.origName}".`);
            if (!uploadedFiles.length) addAssistantMessage('No documents uploaded. Please upload a new document.');
        });
    });
}

function highlightMatch(text, query) {
    if (!query.trim()) return escapeHtml(text);
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(text).replace(
        new RegExp(`(${safe})`, 'gi'),
        '<mark style="background:#fff3cd;padding:0 1px;border-radius:2px;">$1</mark>'
    );
}

// =====================================
// DOCS SEARCH + PAGINATION SETUP
// =====================================
function initDocsSearch() {
    const input    = document.getElementById('docsSearchInput');
    const clearBtn = document.getElementById('docsSearchClear');
    const icon     = document.getElementById('docsSearchIcon');

    input?.addEventListener('input', function () {
        docsSearch = this.value;
        docsPage   = 1;
        if (clearBtn) clearBtn.style.display = docsSearch ? 'block' : 'none';
        if (icon)     icon.style.display     = docsSearch ? 'none'  : 'block';
        renderDocsList();
    });

    clearBtn?.addEventListener('click', function () {
        if (input) input.value = '';
        docsSearch = '';
        docsPage   = 1;
        if (clearBtn) clearBtn.style.display = 'none';
        if (icon)     icon.style.display     = 'block';
        if (input)    input.focus();
        renderDocsList();
    });

    document.getElementById('docsPrevBtn')?.addEventListener('click', function () {
        docsPage--;
        renderDocsList();
    });
    document.getElementById('docsNextBtn')?.addEventListener('click', function () {
        docsPage++;
        renderDocsList();
    });
}

// =====================================
// SAVE CHAT TO DB
// =====================================
async function saveChatToDB(feature, filename, userMessage, botResponse) {
    const sessionInfo = getCookie('userInfo');
    if (!sessionInfo || !sessionInfo.user_id) return;
    try {
        await fetch('/AI_Assistant/save-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id:      sessionInfo.user_id,
                project_code: sessionInfo.selected_code || '',
                feature,
                filename:     filename || null,
                user_message: userMessage || null,
                bot_response: botResponse
            })
        });
    } catch (err) {
        console.error('saveChatToDB error:', err);
    }
}

// =====================================
// LOAD RECENT CHATS FROM SERVER
// =====================================
async function loadRecentChats() {
    const sessionInfo = getCookie('userInfo');
    if (!sessionInfo || !sessionInfo.user_id) return;
    try {
        const url = `/AI_Assistant/recent-chats`
            + `?user_id=${encodeURIComponent(sessionInfo.user_id)}`
            + `&project_code=${encodeURIComponent(sessionInfo.selected_code || '')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const conversations = await res.json();
        localRecentChats = conversations || [];
        renderRecentChats();
        if (getActiveFile()) renderInlineHistory();
    } catch (err) {
        console.error('loadRecentChats error:', err);
    }
}

// =====================================
// RENDER RECENT CHATS - SIDEBAR
// =====================================
function renderRecentChats() {
    const listEl = document.getElementById('recentHistoryList');
    if (!listEl) return;

    if (!localRecentChats.length) {
        listEl.innerHTML = '<div class="recent-empty"><i class="fas fa-comments" style="font-size:24px; color:#ddd; display:block; margin-bottom:8px;"></i>No recent chats</div>';
        return;
    }

    listEl.innerHTML = localRecentChats.map((conv, index) => {
        const title    = conv.title || conv.filename || 'Chat';
        const filename = conv.filename || '';
        const feature  = conv.feature || 'qna';
        const badge    = feature === 'doc-summary'
            ? '<span style="font-size:10px; background:#f3e5f5; color:#6a1b9a; padding:1px 6px; border-radius:8px; font-weight:600;">SUMMARY</span>'
            : '<span style="font-size:10px; background:#e3f2fd; color:#1565c0; padding:1px 6px; border-radius:8px; font-weight:600;">QnA</span>';

        return `
            <div class="recent-item" data-index="${index}">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">${badge}</div>
                <div class="recent-title">${escapeHtml(title)}</div>
                <div class="recent-file">📎 ${escapeHtml(filename)}</div>
            </div>`;
    }).join('');

    document.querySelectorAll('.recent-item').forEach(el => {
        el.addEventListener('click', function () {
            document.querySelectorAll('.recent-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            loadRecentLocalChat(parseInt(this.dataset.index));
        });
    });
}

function loadRecentLocalChat(index) {
    const conv = localRecentChats[index];
    if (!conv) return;

    chatMessages.innerHTML = '';
    initializeFeature(conv.feature || 'qna');

    if (conv.filename) {
        const exists = uploadedFiles.find(f => f.filename === conv.filename);
        if (!exists) {
            const origName = conv.originalName || getOrigName(conv.filename) || conv.filename;
            uploadedFiles.push({ filename: conv.filename, origName });
            activeFileIndex = uploadedFiles.length - 1;
        } else {
            activeFileIndex = uploadedFiles.indexOf(exists);
        }
        saveUploadedFiles();
        renderDocsList();
        renderInlineHistory();
    }

    addAssistantMessage(`📂 Loaded: ${conv.filename || 'previous chat'}`);
    (conv.messages || []).forEach(m => {
        if (m.user_message) addUserMessage(m.user_message);
        if (m.bot_response) addAssistantMessage(m.bot_response);
    });
    scrollToBottom();
}

// =====================================
// INLINE HISTORY DROPDOWN
// =====================================
function getInlineChatsForCurrentFile() {
    const af = getActiveFile();
    if (!af || !currentFeature) return [];
    return localRecentChats.filter(c =>
        c.filename === af.filename && c.feature === currentFeature
    );
}

function renderInlineHistory() {
    const old = document.getElementById('inlineHistoryDropdown');
    if (old) old.remove();

    if (!getActiveFile() || !currentFeature || currentFeature === 'chatbot' || currentFeature === 'pro-connect') return;

    const chats     = getInlineChatsForCurrentFile();
    const totalMsgs = chats.reduce((acc, c) => acc + (c.messages || []).length, 0);

    const wrapper = document.createElement('div');
    wrapper.id = 'inlineHistoryDropdown';
    wrapper.style.cssText = `margin-top:8px; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden; font-size:13px; background:#fff;`;

    const featureLabel = currentFeature === 'doc-summary' ? 'Summary History' : 'Previous Q&A';
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'inlineHistoryToggle';
    toggleBtn.style.cssText = `width:100%; display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f5f5f5; border:none; cursor:pointer; font-size:12px; color:#555; font-family:inherit;`;
    toggleBtn.innerHTML = `
        <span style="display:flex; align-items:center; gap:6px;">
            <i class="fas ${currentFeature === 'doc-summary' ? 'fa-file-alt' : 'fa-history'}" style="font-size:11px;"></i>
            ${featureLabel}
            <span style="background:#e3f2fd; color:#1565c0; border-radius:10px; padding:0 6px; font-size:11px; font-weight:600; min-width:18px; text-align:center;">${totalMsgs}</span>
        </span>
        <i class="fas fa-chevron-${inlineHistoryOpen ? 'up' : 'down'}" id="inlineHistoryChevron" style="font-size:10px;"></i>`;
    toggleBtn.addEventListener('click', toggleInlineHistory);
    wrapper.appendChild(toggleBtn);

    const panel = document.createElement('div');
    panel.id = 'inlineHistoryPanel';
    panel.style.cssText = `display:${inlineHistoryOpen ? 'block' : 'none'}; max-height:280px; overflow-y:auto; background:#fff;`;

    if (totalMsgs === 0) {
        panel.innerHTML = `<div style="padding:12px; color:#aaa; text-align:center; font-size:12px;">No history yet for this file</div>`;
    } else {
        const allMessages = [];
        chats.forEach(chat => { (chat.messages || []).forEach(m => allMessages.push(m)); });
        allMessages.reverse();

        allMessages.forEach((m, idx) => {
            const item = document.createElement('div');
            item.style.cssText = `padding:8px 12px; border-top:1px solid #f0f0f0; cursor:pointer; transition:background 0.15s;`;
            item.onmouseenter = () => item.style.background = '#f9f9f9';
            item.onmouseleave = () => item.style.background = '';

            if (currentFeature === 'qna') {
                const question = m.user_message || '';
                const answer   = m.bot_response || '';
                item.innerHTML = `
                    <div style="font-weight:500; color:#333; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(question)}</div>
                    <div style="color:#888; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(answer.substring(0, 80))}${answer.length > 80 ? '...' : ''}</div>`;
                item.addEventListener('click', () => {
                    inlineHistoryOpen = false;
                    renderInlineHistory();
                    chatMessages.innerHTML = '';
                    addAssistantMessage('📂 Loaded from history');
                    if (m.user_message) addUserMessage(m.user_message);
                    if (m.bot_response) addAssistantMessage(m.bot_response);
                    scrollToBottom();
                });
            } else {
                const summary = m.bot_response || '';
                const label   = `Summary ${allMessages.length - idx}`;
                item.innerHTML = `
                    <div style="font-weight:500; color:#333; margin-bottom:3px;">${escapeHtml(label)}</div>
                    <div style="color:#888; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(summary.substring(0, 100))}${summary.length > 100 ? '...' : ''}</div>`;
                item.addEventListener('click', () => {
                    inlineHistoryOpen = false;
                    renderInlineHistory();
                    chatMessages.innerHTML = '';
                    addAssistantMessage('📂 Loaded from history');
                    if (m.bot_response) addAssistantMessage(m.bot_response);
                    scrollToBottom();
                });
            }
            panel.appendChild(item);
        });
    }

    wrapper.appendChild(panel);

    const anchor = document.getElementById('docsDropdownWrap') || document.getElementById('uploadArea');
    if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
    }
}

function toggleInlineHistory() {
    inlineHistoryOpen = !inlineHistoryOpen;
    const panel   = document.getElementById('inlineHistoryPanel');
    const chevron = document.getElementById('inlineHistoryChevron');
    if (panel)   panel.style.display = inlineHistoryOpen ? 'block' : 'none';
    if (chevron) {
        chevron.classList.toggle('fa-chevron-down', !inlineHistoryOpen);
        chevron.classList.toggle('fa-chevron-up',    inlineHistoryOpen);
    }
}

// =====================================
// HISTORY MODAL
// =====================================
function openHistoryModal() {
    document.getElementById('historyModal').style.display = 'flex';
    historyCurrentPage   = 1;
    historyCurrentFilter = 'all';
    document.querySelectorAll('.history-filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
    });
    fetchAndRenderHistory();
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

async function fetchAndRenderHistory() {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = `<div class="history-loading"><i class="fas fa-spinner fa-spin"></i> Loading history...</div>`;

    const sessionInfo = getCookie('userInfo');
    if (!sessionInfo || !sessionInfo.user_id) {
        listEl.innerHTML = `<div class="history-empty"><i class="fas fa-user-slash"></i><br>Please login to see history.</div>`;
        return;
    }

    try {
        const url = `/AI_Assistant/chat-history`
                  + `?user_id=${encodeURIComponent(sessionInfo.user_id)}`
                  + `&project_code=${encodeURIComponent(sessionInfo.selected_code || '')}`
                  + `&limit=200`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        historyAllData = await res.json();
        if (!historyAllData.length) {
            listEl.innerHTML = `<div class="history-empty"><i class="fas fa-comments"></i><br>No chat history found.</div>`;
            updateHistoryPagination();
            return;
        }
        renderHistoryCards();
        updateHistoryPagination();
    } catch (err) {
        listEl.innerHTML = `<div class="history-empty"><i class="fas fa-exclamation-triangle"></i><br>Failed to load history.</div>`;
    }
}

function getFilteredHistory() {
    if (historyCurrentFilter === 'all') return historyAllData;
    return historyAllData.filter(r => r.feature === historyCurrentFilter);
}

function filterHistory(filter, btn) {
    historyCurrentFilter = filter;
    historyCurrentPage   = 1;
    document.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderHistoryCards();
    updateHistoryPagination();
}

function changeHistoryPage(direction) {
    const filtered   = getFilteredHistory();
    const totalPages = Math.ceil(filtered.length / historyPerPage);
    const newPage    = historyCurrentPage + direction;
    if (newPage < 1 || newPage > totalPages) return;
    historyCurrentPage = newPage;
    renderHistoryCards();
    updateHistoryPagination();
}

function renderHistoryCards() {
    const listEl   = document.getElementById('historyList');
    const filtered = getFilteredHistory();

    if (!filtered.length) {
        listEl.innerHTML = `<div class="history-empty"><i class="fas fa-inbox"></i><br>No records for this filter.</div>`;
        return;
    }

    const start    = (historyCurrentPage - 1) * historyPerPage;
    const pageData = filtered.slice(start, start + historyPerPage);

    listEl.innerHTML = pageData.map((r, idx) => {
        const globalIdx    = start + idx;
        const featureBadge = r.feature === 'doc-summary'
            ? `<span class="history-badge doc-summary"><i class="fas fa-file-alt"></i> Doc Summary</span>`
            : `<span class="history-badge qna"><i class="fas fa-question-circle"></i> QnA</span>`;
        const timeStr = r.created_at
            ? new Date(r.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
            : '';
        const questionHTML = r.user_message
            ? `<div class="history-card-question"><div class="history-card-question-label">Question</div>${escapeHtml(r.user_message)}</div>`
            : '';
        const hasLongAnswer = (r.bot_response || '').length > 200;

        return `
        <div class="history-card">
            <div class="history-card-meta">
                ${featureBadge}
                <span class="history-card-filename"><i class="fas fa-paperclip"></i> ${escapeHtml(r.filename || 'No file')}</span>
                <span class="history-card-time">${timeStr}</span>
            </div>
            ${questionHTML}
            <div class="history-card-answer">
                <div class="history-card-answer-label">Response</div>
                <div class="history-card-answer-text" id="ans-${globalIdx}">${escapeHtml(r.bot_response || '')}</div>
                ${hasLongAnswer ? `<button class="history-expand-btn" id="expbtn-${globalIdx}" onclick="toggleExpand(${globalIdx})">Show more <i class="fas fa-chevron-down"></i></button>` : ''}
            </div>
            <button class="history-load-btn" onclick="loadHistoryIntoChat(${globalIdx})">
                <i class="fas fa-arrow-up"></i> Load into chat
            </button>
        </div>`;
    }).join('');
}

function toggleExpand(idx) {
    const ansEl = document.getElementById(`ans-${idx}`);
    const btn   = document.getElementById(`expbtn-${idx}`);
    if (!ansEl || !btn) return;
    const expanded = ansEl.classList.toggle('expanded');
    btn.innerHTML  = expanded ? 'Show less <i class="fas fa-chevron-up"></i>' : 'Show more <i class="fas fa-chevron-down"></i>';
}

function loadHistoryIntoChat(globalIdx) {
    const filtered = getFilteredHistory();
    const record   = filtered[globalIdx];
    if (!record) return;

    closeHistoryModal();
    initializeFeature(record.feature);

    if (record.filename) {
        const exists = uploadedFiles.find(f => f.filename === record.filename);
        if (!exists) {
            const origName = getOrigName(record.filename) || record.filename;
            uploadedFiles.push({ filename: record.filename, origName });
            activeFileIndex = uploadedFiles.length - 1;
        } else {
            activeFileIndex = uploadedFiles.indexOf(exists);
        }
        saveUploadedFiles();
        renderDocsList();
        renderInlineHistory();
    }

    const sepDiv = document.createElement('div');
    sepDiv.className = 'message bot';
    sepDiv.style.cssText = 'background:#e8f5e9; border:1px dashed #a5d6a7; color:#2e7d32; text-align:center; font-size:13px;';
    sepDiv.innerHTML = `<div class="message-content">📂 Loaded from history — ${escapeHtml(record.filename || 'No file')}</div>`;
    chatMessages.appendChild(sepDiv);

    if (record.user_message) addUserMessage(record.user_message);
    addAssistantMessage(record.bot_response);
    scrollToBottom();
}

function updateHistoryPagination() {
    const filtered   = getFilteredHistory();
    const totalPages = Math.max(1, Math.ceil(filtered.length / historyPerPage));
    const pageInfoEl = document.getElementById('historyPageInfo');
    const prevBtn    = document.getElementById('historyPrevBtn');
    const nextBtn    = document.getElementById('historyNextBtn');
    if (pageInfoEl) pageInfoEl.textContent = `Page ${historyCurrentPage} / ${totalPages}`;
    if (prevBtn)    prevBtn.disabled = historyCurrentPage <= 1;
    if (nextBtn)    nextBtn.disabled = historyCurrentPage >= totalPages;
}

// =====================================
// CHANGE PASSWORD
// =====================================
function openChangePasswordModal() {
    document.getElementById('cpCurrentPassword').value = '';
    document.getElementById('cpNewPassword').value = '';
    document.getElementById('cpConfirmPassword').value = '';
    document.getElementById('cpCurrentError').style.display = 'none';
    document.getElementById('cpNewError').style.display = 'none';
    document.getElementById('cpConfirmError').style.display = 'none';
    document.getElementById('cpSuccess').style.display = 'none';
    document.getElementById('cpSubmitBtn').disabled = false;
    document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

function toggleEye(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon  = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

async function submitChangePassword() {
    const currentPw = document.getElementById('cpCurrentPassword').value.trim();
    const newPw     = document.getElementById('cpNewPassword').value.trim();
    const confirmPw = document.getElementById('cpConfirmPassword').value.trim();

    document.getElementById('cpCurrentError').style.display = 'none';
    document.getElementById('cpNewError').style.display = 'none';
    document.getElementById('cpConfirmError').style.display = 'none';
    document.getElementById('cpSuccess').style.display = 'none';

    let hasError = false;
    if (!currentPw) {
        document.getElementById('cpCurrentError').textContent = 'Current password is required.';
        document.getElementById('cpCurrentError').style.display = 'block';
        hasError = true;
    }
    if (!newPw || newPw.length < 8) {
        document.getElementById('cpNewError').textContent = 'Password must be at least 8 characters.';
        document.getElementById('cpNewError').style.display = 'block';
        hasError = true;
    }
    if (newPw !== confirmPw) {
        document.getElementById('cpConfirmError').textContent = 'Passwords do not match.';
        document.getElementById('cpConfirmError').style.display = 'block';
        hasError = true;
    }
    if (hasError) return;

    const submitBtn = document.getElementById('cpSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

    const sessionInfo = getCookie('userInfo');
    try {
        const res = await fetch('/AI_Assistant/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${sessionInfo?.token || ''}` },
            body: JSON.stringify({ user_id: sessionInfo?.user_id || '', current_password: currentPw, new_password: newPw })
        });
        const data = await res.json();
        if (!res.ok) {
            const errMsg = data.error || data.detail || 'Failed to change password.';
            document.getElementById('cpCurrentError').textContent = errMsg;
            document.getElementById('cpCurrentError').style.display = 'block';
        } else {
            document.getElementById('cpSuccess').style.display = 'block';
            document.getElementById('cpCurrentPassword').value = '';
            document.getElementById('cpNewPassword').value = '';
            document.getElementById('cpConfirmPassword').value = '';
            setTimeout(() => closeChangePasswordModal(), 2000);
        }
    } catch (err) {
        document.getElementById('cpCurrentError').textContent = 'Network error. Please try again.';
        document.getElementById('cpCurrentError').style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
    }
}

// =====================================
// PROJECT DROPDOWN
// =====================================
function fetchSelectProject(user_id, selected_code, first_name, last_name, email, token, db_url) {
    const url = `http://34.4.25.166:8080/AI_Assistant/selectproject?user_id=${encodeURIComponent(user_id)}&selected_code=${encodeURIComponent(selected_code)}&first_name=${encodeURIComponent(first_name)}&last_name=${encodeURIComponent(last_name)}&email=${encodeURIComponent(email)}&db_url=${encodeURIComponent(db_url)}`;
    fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` } })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => console.log('Backend response:', d))
        .catch(e => console.error('Error notifying backend:', e));
}

async function getSessionInfo() {
    return new Promise((resolve) => {
        const storedData = getCookie('userInfo');
        if (!storedData || !storedData.token) { resolve(null); return; }
        resolve(storedData);
    });
}

async function populateProjectDropdown() {
    const sessionInfo    = await getSessionInfo();
    const projectMenu    = document.getElementById('project-menu');
    const selectedProjEl = document.getElementById('selectedProject');
    if (!projectMenu) return;
    projectMenu.innerHTML = '';

    if (sessionInfo && sessionInfo.project_codes && sessionInfo.project_codes.length > 0) {
        sessionInfo.project_codes.forEach((projectCode) => {
            const li = document.createElement('li');
            const a  = document.createElement('a');
            a.classList.add('dropdown-item');
            a.href = '#';
            a.textContent = projectCode;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                selectProject(projectCode);
                document.querySelectorAll('#project-menu .dropdown-item').forEach(i => i.classList.remove('is-active'));
                a.classList.add('is-active');
            });
            li.appendChild(a);
            projectMenu.appendChild(li);
        });
        if (selectedProjEl) selectedProjEl.textContent = 'Select Project';
    } else {
        if (selectedProjEl) selectedProjEl.textContent = 'Select Project';
    }
}

function selectProject(projectCode) {
    const spinner        = document.getElementById('projectSpinner');
    const selectedProjEl = document.getElementById('selectedProject');
    if (spinner)         spinner.style.display = 'inline-block';
    if (selectedProjEl)  selectedProjEl.textContent = 'Loading...';

    const storedData = getCookie('userInfo') || {};
    const token      = storedData.token || "";
    const url        = `http://34.4.25.166:8080/api/auth/get-db-url?project_code=${projectCode}`;

    const fetchWithTimeout = (url, timeout = 7000) =>
        Promise.race([
            fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` } }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
        ]);

    fetchWithTimeout(url)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
            if (data && data.db_url) {
                storedData.selected_code = projectCode;
                storedData.db_url        = data.db_url;
                setCookie('userInfo', storedData);
                if (selectedProjEl) selectedProjEl.textContent = projectCode;
                if (spinner)        spinner.style.display = 'none';
                fetchSelectProject(storedData.user_id || "default_user", projectCode, storedData.first_name || "Guest", storedData.last_name || "Guest", storedData.email || "", token, data.db_url);
                document.querySelectorAll('#project-menu .dropdown-item').forEach(i => {
                    i.classList.toggle('is-active', i.textContent.trim() === projectCode);
                });
            } else {
                throw new Error("No db_url received");
            }
        })
        .catch(() => {
            if (spinner)        spinner.style.display = 'none';
            if (selectedProjEl) selectedProjEl.textContent = 'Select Project';
            alert(`Failed to load project "${projectCode}". Please try again.`);
        });
}

function loadSelectedProject() {
    const sessionInfo    = getCookie('userInfo');
    if (!sessionInfo) return;
    const selectedCode   = sessionInfo.selected_code;
    const db_url         = sessionInfo.db_url;
    const selectedProjEl = document.getElementById('selectedProject');

    if (!selectedCode || !db_url) {
        if (selectedProjEl) selectedProjEl.textContent = 'Select Project';
        return;
    }
    if (selectedProjEl) selectedProjEl.textContent = selectedCode;
    document.querySelectorAll('#project-menu .dropdown-item').forEach(i => {
        i.classList.toggle('is-active', i.textContent.trim() === selectedCode);
    });
    const token = sessionInfo.token || "";
    if (token && db_url) {
        fetchSelectProject(sessionInfo.user_id || "default_user", selectedCode, sessionInfo.first_name || "Guest", sessionInfo.last_name || "Guest", sessionInfo.email || "", token, db_url);
    }
}

// =====================================
// NAVBAR FUNCTIONS
// =====================================
function selectModule(name, el) {
    document.getElementById('selectedModule').textContent = name;
    document.querySelectorAll('#module-btn + .dropdown-menu .dropdown-item').forEach(i => i.classList.remove('is-active'));
    el.classList.add('is-active');
}

function handleLogout() {
    window.location.href = `http://34.4.25.166:8080/auth/logout`;
}

function selectSubModule(name, feature, el) {
    document.getElementById('selectedSubModule').textContent = name;
    document.querySelectorAll('#submodule-btn + .dropdown-menu .dropdown-item').forEach(i => i.classList.remove('is-active'));
    el.classList.add('is-active');
    if (feature) initializeFeature(feature);
}

// =====================================
// FEATURE SWITCH
// =====================================
function initializeFeature(feature) {
    currentFeature = feature;

    // ── PRO CONNECT BRANCH ──────────────────────────────────────
    // Handled first and returns early — Pro Connect just shows an
    // iframe, it doesn't use the upload/chat/summary UI at all.
    if (feature === 'pro-connect') {
        if (mainChatPanel)   mainChatPanel.style.display = 'none';
        if (uploadSection)   uploadSection.style.display = 'none';

        inlineHistoryOpen = false;
        const oldInline = document.getElementById('inlineHistoryDropdown');
        if (oldInline) oldInline.remove();

        if (proConnectPanel) proConnectPanel.style.display = 'flex';

        // Only set src once (or if it was reset to blank) so switching
        // back and forth doesn't reload Pro Connect every time.
        if (proConnectFrame) {
            const cur = proConnectFrame.getAttribute('src');
            if (!cur || cur === 'about:blank') {
                proConnectFrame.src = PRO_CONNECT_URL;
            }
        }
        return;
    }

    // ── Coming from Pro Connect back to a normal feature ────────
    if (proConnectPanel) proConnectPanel.style.display = 'none';
    if (mainChatPanel)   mainChatPanel.style.display = 'flex';

    // Reset files & dropdown state on feature switch
    uploadedFiles   = [];
    activeFileIndex = -1;
    localStorage.removeItem('uploaded_files');

    // Reset docs search/page state
    docsSearch = '';
    docsPage   = 1;
    const si = document.getElementById('docsSearchInput');
    if (si) si.value = '';
    const clearBtn = document.getElementById('docsSearchClear');
    if (clearBtn) clearBtn.style.display = 'none';
    const icon = document.getElementById('docsSearchIcon');
    if (icon) icon.style.display = 'block';

    closeDocsDropdown();
    renderDocsList();
    chatMessages.innerHTML = '';

    // Reset inline history
    inlineHistoryOpen = false;
    const old = document.getElementById('inlineHistoryDropdown');
    if (old) old.remove();

    if (feature === 'chatbot') {
        chatTitle.textContent    = 'Chatbot';
        chatSubtitle.textContent = 'Coming Soon';
        uploadSection.style.display          = 'none';
        chatInputContainer.style.display     = 'none';
        summaryButtonContainer.style.display = 'none';
        addAssistantMessage('🚧 Chatbot is coming soon.\n\nPlease use QnA or Doc Summary for now.');
        return;
    }

    const config             = featureConfig[feature];
    chatTitle.textContent    = config.title;
    chatSubtitle.textContent = config.subtitle;
    uploadSection.style.display = 'block';

    if (feature === 'doc-summary') {
        chatInputContainer.style.display     = 'none';
        summaryButtonContainer.style.display = 'block';
        addAssistantMessage('📄 Please upload a document to generate a summary.');
    } else {
        chatInputContainer.style.display     = 'block';
        summaryButtonContainer.style.display = 'none';
        chatInput.placeholder = config.placeholder;
        chatInput.disabled    = false;
        chatInput.value       = '';
        addAssistantMessage(config.subtitle);
    }
}

// =====================================
// FILE UPLOAD
// =====================================
function setupFileUpload() {
    uploadArea.addEventListener('click', () => fileUpload.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#a5d6a7';
        uploadArea.style.background  = '#f5f5f5';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#c8e6c9';
        uploadArea.style.background  = '#fafafa';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#c8e6c9';
        uploadArea.style.background  = '#fafafa';
        if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
    });

    fileUpload.addEventListener('change', e => {
        if (e.target.files.length) handleFileUpload(e.target.files[0]);
        fileUpload.value = '';
    });
}

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/AI_Assistant/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Upload failed');
        }
        const data = await res.json();
        saveFileMap(data.filename, file.name);

        uploadedFiles.push({ filename: data.filename, origName: file.name });
        activeFileIndex = uploadedFiles.length - 1;
        docsPage = Math.ceil(uploadedFiles.length / DOCS_PER_PAGE);
        saveUploadedFiles();
        renderDocsList();
        openDocsDropdown();

        addAssistantMessage(`✓ "${file.name}" uploaded successfully.${uploadedFiles.length > 1 ? ` You now have ${uploadedFiles.length} documents — select from the dropdown above.` : ''}`);
        if (currentFeature === 'doc-summary') {
            addAssistantMessage('Click "Generate Summary" button to create summary.');
        }

        renderInlineHistory();

    } catch (err) {
        console.error('Upload error:', err);
        addAssistantMessage(`Upload failed: ${err.message}`);
    }
}

// =====================================
// QnA SEND
// =====================================
async function sendMessage() {
    if (currentFeature !== 'qna') return;
    const msg = chatInput.value.trim();
    if (!msg) return;

    addUserMessage(msg);
    chatInput.value = '';

    const af = getActiveFile();
    if (!af) {
        addAssistantMessage('⚠️ Please upload a document first.');
        return;
    }

    sendBtn.disabled = true;
    showTypingIndicator();

    try {
        const res = await fetch('/AI_Assistant/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: msg, filename: af.filename })
        });
        const data = await res.json();
        removeTypingIndicator();

        if (!res.ok) {
            addAssistantMessage(`${data.error || 'Error getting response.'}`);
        } else {
            addAssistantMessage(data.answer || 'No answer received.');
            if (data.answer) {
                await saveChatToDB('qna', af.filename, msg, data.answer);
                let existing = localRecentChats.find(c => c.filename === af.filename && c.feature === 'qna');
                if (!existing) {
                    existing = {
                        filename: af.filename,
                        feature:  'qna',
                        messages: [],
                        title:    msg.length > 40 ? msg.substring(0, 40) + '...' : msg
                    };
                    localRecentChats.unshift(existing);
                }
                existing.messages.push({ user_message: msg, bot_response: data.answer });
                renderRecentChats();
                renderInlineHistory();
            }
        }
    } catch (err) {
        removeTypingIndicator();
        addAssistantMessage('Request failed');
    } finally {
        sendBtn.disabled = false;
    }
}

// =====================================
// DOC SUMMARY
// =====================================
async function generateDocSummary() {
    const af = getActiveFile();
    if (!af) {
        addAssistantMessage('Please upload a document first.');
        return;
    }
    generateSummaryBtn.disabled = true;
    addAssistantMessage('⏳ Generating document summary...');
    showTypingIndicator();

    try {
        const res = await fetch('/AI_Assistant/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: af.filename })
        });
        const data = await res.json();
        removeTypingIndicator();

        if (!res.ok) {
            addAssistantMessage(`${data.error || 'Failed to generate summary.'}`);
        } else {
            addAssistantMessage(data.summary || 'No summary received.');
            if (data.summary) {
                await saveChatToDB('doc-summary', af.filename, null, data.summary);
                let existing = localRecentChats.find(c => c.filename === af.filename && c.feature === 'doc-summary');
                if (!existing) {
                    existing = {
                        filename: af.filename,
                        feature:  'doc-summary',
                        messages: [],
                        title:    'Summary: ' + af.origName
                    };
                    localRecentChats.unshift(existing);
                }
                existing.messages.push({ user_message: null, bot_response: data.summary });
                renderRecentChats();
                renderInlineHistory();
            }
        }
    } catch (err) {
        removeTypingIndicator();
        addAssistantMessage(`Error generating summary: ${err.message}`);
    } finally {
        generateSummaryBtn.disabled = false;
    }
}

// =====================================
// UI HELPERS
// =====================================
function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function addAssistantMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function showTypingIndicator() {
    const existing = document.getElementById('typingIndicator');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'typingIndicator';
    div.className = 'message bot';
    div.innerHTML = `<em>Typing...</em>`;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

function scrollToBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML.replace(/\n/g, '<br>');
}

// =====================================
// INIT
// =====================================
document.addEventListener('DOMContentLoaded', function () {

    chatTitle              = document.getElementById('chatTitle');
    chatSubtitle           = document.getElementById('chatSubtitle');
    uploadSection          = document.getElementById('uploadSection');
    uploadArea             = document.getElementById('uploadArea');
    fileUpload             = document.getElementById('fileUpload');
    chatMessages           = document.getElementById('chatMessages');
    chatInputContainer     = document.getElementById('chatInputContainer');
    chatInput              = document.getElementById('chatInput');
    sendBtn                = document.getElementById('sendBtn');
    summaryButtonContainer = document.getElementById('summaryButtonContainer');
    generateSummaryBtn     = document.getElementById('generateSummaryBtn');

    // Pro Connect refs
    mainChatPanel   = document.getElementById('mainChatPanel');
    proConnectPanel = document.getElementById('proConnectPanel');
    proConnectFrame = document.getElementById('proConnectFrame');

    // Docs dropdown toggle
    document.getElementById('docsDropdownBtn')?.addEventListener('click', toggleDocsDropdown);

    // Close docs dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('docsDropdownWrap');
        if (wrap && !wrap.contains(e.target)) closeDocsDropdown();
    });

    // Init docs search + pagination
    initDocsSearch();

    document.querySelectorAll('[data-module]').forEach(el => {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            selectModule(this.dataset.module, this);
        });
    });

    document.querySelectorAll('[data-submodule]').forEach(el => {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            selectSubModule(this.dataset.submodule, this.dataset.feature, this);
        });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); handleLogout(); });

    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) changePasswordBtn.addEventListener('click', e => { e.preventDefault(); openChangePasswordModal(); });

    document.getElementById('cpCloseBtn')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('cpCancelBtn')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('cpSubmitBtn')?.addEventListener('click', submitChangePassword);

    ['cpCurrentPassword', 'cpNewPassword', 'cpConfirmPassword'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') submitChangePassword(); });
    });

    document.getElementById('changePasswordModal')?.addEventListener('click', function (e) {
        if (e.target === this) closeChangePasswordModal();
    });

    const historyCloseBtn = document.getElementById('historyCloseBtn');
    if (historyCloseBtn) historyCloseBtn.addEventListener('click', closeHistoryModal);
    document.getElementById('historyPrevBtn')?.addEventListener('click', () => changeHistoryPage(-1));
    document.getElementById('historyNextBtn')?.addEventListener('click', () => changeHistoryPage(1));

    document.querySelectorAll('.history-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () { filterHistory(this.dataset.filter, this); });
    });

    document.getElementById('historyModal')?.addEventListener('click', function (e) {
        if (e.target === this) closeHistoryModal();
    });

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    generateSummaryBtn.addEventListener('click', generateDocSummary);

    setupFileUpload();

    // Restore previously uploaded files from localStorage
    const savedFiles = getSavedUploadedFiles();
    if (savedFiles.length) {
        uploadedFiles   = savedFiles;
        activeFileIndex = savedFiles.length - 1;
        renderDocsList();
    }

    initializeFeature('qna');

    populateProjectDropdown().then(() => {
        loadSelectedProject();
        loadRecentChats().then(() => {
            if (getActiveFile()) renderInlineHistory();
        });
    });
});