import { BACKGROUNDS, LABEL_COLORS, validateState } from './model.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const uid = () => crypto.randomUUID();
const paths = {
  board:'M3 3h18v18H3z M9 3v18 M15 3v12', plus:'M12 5v14 M5 12h14',
  search:'m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu:'M4 6h16 M4 12h16 M4 18h16', chevron:'m9 5 7 7-7 7', down:'m6 9 6 6 6-6',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  more:'M5 12h.01 M12 12h.01 M19 12h.01', close:'m6 6 12 12 M6 18 18 6',
  filter:'M4 6h16 M7 12h10 M10 18h4', image:'M3 3h18v18H3z m0 13 5-5 5 5 4-4 4 4 M15 7h.01',
  table:'M3 4h18v16H3z M3 9h18 M3 14h18 M9 4v16',
  check:'m5 12 4 4L19 6', checklist:'M9 5h12 M9 12h12 M9 19h12 M3 5h.01 M3 12h.01 M3 19h.01',
  clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  comment:'M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z',
  description:'M4 5h16 M4 10h16 M4 15h16 M4 20h10',
  archive:'M3 3h18v5H3z M5 8v13h14V8 M10 12h4', download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  upload:'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5', trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  edit:'m4 16-1 5 5-1L21 7l-4-4z M14 6l4 4', lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  folder:'M3 6h7l2 3h9v12H3z', help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.board}"/></svg>`;
const btn = (action, label, extra = '', css = 'ghost') => `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`;
const ibtn = (action, name, label, extra = '') => btn(action, icon(name), `aria-label="${esc(label)}" title="${esc(label)}" ${extra}`, 'icon-btn');
const backgroundNames = { ocean:'Ocean', violet:'Violet', forest:'Forest', sunset:'Sunset', slate:'Slate', rose:'Rose' };
const app = $('#app'), modal = $('#modal');
let state, revision, activeWorkspace, activeBoard, page = 'board', view = 'board';
let query = '', selectedLabels = new Set(), dueFilter = 'all', showFilters = false;
let sidebarClosed = false, mobileSidebar = false, composerList = null, addingList = false;
let draft = null, draftBoardId = null, modalKind = '', newBackground = 'ocean';
let cardUI = { comment:'', checklistTitle:'', items:new Map() };
let writes = Promise.resolve(), toastTimer, draggingId;
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('trellis-preferences') || '{}'); } catch { /* Preferences never own work data. */ }
function preferences() {
  try { localStorage.setItem('trellis-preferences', JSON.stringify({ activeWorkspace, activeBoard, page, view })); } catch { /* Work data persists on the server. */ }
}
const board = () => state.boards.find(item => item.id === activeBoard);
const workspace = () => state.workspaces.find(item => item.id === activeWorkspace);
const cardById = id => board()?.cards.find(card => card.id === id);
function toast(message, error = false) {
  const element = $('#toast'); element.textContent = message; element.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.className = ''; }, error ? 9000 : 3500);
}
function ensureSelection() {
  if (!state.workspaces.some(item => item.id === activeWorkspace)) activeWorkspace = state.workspaces[0]?.id;
  if (!state.boards.some(item => item.id === activeBoard && item.workspaceId === activeWorkspace)) activeBoard = state.boards.find(item => item.workspaceId === activeWorkspace)?.id;
  if (!activeBoard) page = 'gallery';
}
function mutate(change, message) {
  const result = writes.then(async () => {
    const next = structuredClone(state);
    change(next); validateState(next);
    const status = $('#save-status'); if (status) status.textContent = 'Saving…';
    const response = await fetch('/api/state', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ revision, state:next }) });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 409) throw new Error('Another window changed this workspace. Reload before saving; your open card edits are still here.');
      throw new Error(payload.error || 'Could not save your changes.');
    }
    state = payload.state; revision = payload.revision; ensureSelection(); preferences(); render();
    if (message) toast(message);
    return true;
  }).catch(error => { toast(error.message, true); const status = $('#save-status'); if (status) status.textContent = 'Save failed'; return false; });
  writes = result.then(() => {}); return result;
}
function openBoard(id) {
  const selected = state.boards.find(item => item.id === id); if (!selected) return;
  activeWorkspace = selected.workspaceId; activeBoard = id; page = 'board'; query = ''; selectedLabels.clear(); dueFilter = 'all';
  composerList = null; addingList = false; mobileSidebar = false; preferences(); render();
}
function render() {
  app.innerHTML = `<header class="topbar">
    ${ibtn('toggle-sidebar','menu','Toggle sidebar')}
    <button class="brand" data-action="gallery" aria-label="Trellis boards"><img src="/icon.svg" alt="">Trellis</button>
    <span class="badge">Local</span>
    ${btn('workspaces',`Workspaces ${icon('down')}`,'','top-workspaces row')}
    ${btn('create-board',`${icon('plus')} <span>Create</span>`,'','new-button row')}
    <div class="search-box">${icon('search')}<input id="search" aria-label="Search cards and boards" placeholder="Search your ${page === 'board' ? 'cards' : 'boards'}…" value="${esc(query)}" autocomplete="off"></div>
    <span class="saving" id="save-status">Saved locally</span>
    ${btn('settings','Y','aria-label="Local data and settings" title="Local data and settings"','avatar')}
  </header>
  <div class="shell"><aside class="sidebar ${sidebarClosed ? 'collapsed' : ''} ${mobileSidebar ? 'mobile-open' : ''}" aria-label="Workspace navigation">
    <button class="workspace-switch row" data-action="workspaces"><span class="workspace-icon">${esc(workspace()?.name.slice(0,1).toUpperCase() || 'W')}</span><span class="flex-1"><div class="eyebrow">Workspace</div><div class="workspace-name">${esc(workspace()?.name || 'Your workspace')}</div></span>${icon('down')}</button>
    <nav>${btn('gallery',`${icon('board')} All boards`,'',`nav-item ${page === 'gallery' ? 'active' : ''}`)}${btn('workspaces',`${icon('folder')} Workspaces`,'','nav-item')}</nav>
    <section><div class="row spread sidebar-heading">Your boards ${ibtn('create-board','plus','Create a board')}</div>
    ${state.boards.filter(item => item.workspaceId === activeWorkspace).map(item => btn('open-board',`<span class="board-thumb ${item.background}"></span><span class="name flex-1">${esc(item.name)}</span>${item.starred ? icon('star') : ''}`,`data-id="${esc(item.id)}"`,`nav-item board-nav ${page === 'board' && activeBoard === item.id ? 'active' : ''}`)).join('') || '<p class="small muted" style="padding:0 10px">Your first board starts here.</p>'}
    </section><div class="sidebar-footer"><div class="row">${icon('lock')} Private by default</div>Everything stays on this computer.<br>No accounts. No subscriptions.
    ${btn('settings',`${icon('download')} Backup & settings`,'','nav-item small')}</div>
  </aside><main id="main" class="main"></main></div>`;
  renderMain();
}
function filteredCards() {
  const today = new Date(); today.setHours(0,0,0,0);
  const week = new Date(today); week.setDate(week.getDate()+7);
  return (board()?.cards || []).filter(card => {
    if (card.archived) return false;
    const text = [card.title, card.description, ...card.comments.map(item => item.text), ...card.checklists.flatMap(list => [list.title,...list.items.map(item => item.text)])].join(' ').toLocaleLowerCase();
    if (query && !text.includes(query.toLocaleLowerCase())) return false;
    if (selectedLabels.size && !card.labels.some(label => selectedLabels.has(label))) return false;
    if (dueFilter === 'completed') return card.completed;
    if (dueFilter === 'open') return !card.completed;
    if (dueFilter === 'none') return !card.dueDate;
    if (dueFilter === 'overdue') return !!card.dueDate && !card.completed && new Date(`${card.dueDate}T00:00:00`) < today;
    if (dueFilter === 'week') return !!card.dueDate && !card.completed && new Date(`${card.dueDate}T00:00:00`) >= today && new Date(`${card.dueDate}T00:00:00`) <= week;
    return true;
  });
}
function labelsHTML(labels) { return `<div class="labels">${labels.map(color => `<span class="label ${color}" title="${color} label" aria-label="${color} label"></span>`).join('')}</div>`; }
function dueHTML(card) {
  if (!card.dueDate) return '';
  const date = new Date(`${card.dueDate}T00:00:00`), today = new Date(); today.setHours(0,0,0,0);
  return `<span class="due ${card.completed ? 'done' : date < today ? 'overdue' : ''}" title="Due ${card.dueDate}">${icon('clock')}${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</span>`;
}
function progress(card) { const items = card.checklists.flatMap(list => list.items); return { total:items.length, done:items.filter(item => item.done).length }; }
function cardHTML(card) {
  const counts = progress(card);
  return `<article class="card ${card.completed ? 'is-done' : ''}" draggable="true" data-card="${esc(card.id)}" data-id="${esc(card.id)}" data-action="open-card" tabindex="0" role="button" aria-label="Open card: ${esc(card.title)}">
    ${card.labels.length ? labelsHTML(card.labels) : ''}<div class="card-title">${esc(card.title)}</div>
    ${btn('complete-card',icon('check'),`data-id="${esc(card.id)}" aria-label="${card.completed ? 'Mark incomplete' : 'Mark complete'}: ${esc(card.title)}"`,'card-complete')}
    ${card.dueDate || card.description || card.comments.length || counts.total ? `<div class="card-meta">${dueHTML(card)}${card.description ? `<span title="Has description">${icon('description')}</span>` : ''}${counts.total ? `<span class="row" title="Checklist progress">${icon('checklist')}${counts.done}/${counts.total}</span>` : ''}${card.comments.length ? `<span class="row" title="Comments">${icon('comment')}${card.comments.length}</span>` : ''}</div>` : ''}
  </article>`;
}
function renderMain() {
  const main = $('#main'); if (!main) return;
  if (page === 'gallery' || !board()) {
    main.className = 'main';
    const boards = state.boards.filter(item => item.workspaceId === activeWorkspace && (!query || item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    main.innerHTML = `<div class="gallery"><div class="gallery-top"><div><div class="eyebrow">A little structure. A lot of possibility.</div><h1>Your work, in view.</h1><p>A home for your projects, plans, and next big thing.</p></div>${btn('create-board',`${icon('plus')} Create board`,'','primary row')}</div>
      <div class="workspace-heading"><span class="workspace-icon">${esc(workspace()?.name.slice(0,1).toUpperCase() || 'W')}</span><h2>${esc(workspace()?.name)}</h2>${ibtn('rename-workspace','edit','Rename workspace')}</div>
      <div class="board-grid">${boards.map(item => `<article class="board-tile"><button class="board-tile-cover ${item.background}" data-action="open-board" data-id="${esc(item.id)}" aria-label="Open ${esc(item.name)}">${[3,2,2].map(n => `<span class="mini-list">${'<span></span>'.repeat(n)}</span>`).join('')}</button><div class="board-tile-footer">${btn('open-board',`${esc(item.name)}<small>${item.lists.length} lists · ${item.cards.filter(card => !card.archived).length} cards</small>`,`data-id="${esc(item.id)}"`)}${ibtn('star-board','star',item.starred ? 'Unstar board' : 'Star board',`data-id="${esc(item.id)}" ${item.starred ? 'style="color:#b38600"' : ''}`)}</div></article>`).join('')}${btn('create-board',`<span>${icon('plus')} Create a new board</span>`,'','create-tile')}</div>
      ${query && !boards.length ? '<p class="muted" style="margin-top:20px">No boards match your search.</p>' : ''}</div>`;
    return;
  }
  const current = board(), cards = filteredCards(), all = current.cards.filter(card => !card.archived);
  main.className = `main board-main ${current.background}`;
  main.innerHTML = `<div class="board-bar"><button class="board-title" data-action="rename-board" title="Rename board">${esc(current.name)}</button>
    ${ibtn('star-board','star',current.starred ? 'Unstar board' : 'Star board',`data-id="${esc(current.id)}" ${current.starred ? 'style="color:#f5cd47"' : ''}`)}<span class="divider"></span>
    <div class="view-tabs" aria-label="Board view">${btn('view-board',`${icon('board')} Board`,`aria-pressed="${view === 'board'}"`,view === 'board' ? 'selected' : '')}${btn('view-table',`${icon('table')} Table`,`aria-pressed="${view === 'table'}"`,view === 'table' ? 'selected' : '')}</div>
    <div class="toolbar-right">${btn('filters',`${icon('filter')}<span class="button-text">Filters${selectedLabels.size || dueFilter !== 'all' ? ' •' : ''}</span>`,`aria-pressed="${showFilters}"`,'toolbar-button')}${btn('background',`${icon('image')}<span class="button-text">Background</span>`,'','toolbar-button')}${ibtn('board-menu','more','Board menu')}</div>
  </div><div class="board-subline"><span class="status-dot"></span><span>${all.length} cards · ${all.filter(card => card.completed).length} complete</span><span style="opacity:.5">/</span><span>${esc(workspace()?.name)}</span></div>
  ${showFilters ? `<div class="filter-bar"><strong class="small">Filter cards</strong><div class="row">${LABEL_COLORS.map(color => btn('filter-label','',`style="background:var(--label-${color},${colorHex(color)})" data-color="${color}" aria-label="Filter ${color} label" aria-pressed="${selectedLabels.has(color)}"`,`label-filter ${selectedLabels.has(color) ? 'selected' : ''}`)).join('')}</div><select id="due-filter" aria-label="Filter by due date or completion">${[['all','All cards'],['open','Incomplete'],['completed','Completed'],['overdue','Overdue'],['week','Due in 7 days'],['none','No due date']].map(([value,label]) => `<option value="${value}" ${dueFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select>${btn('clear-filters','Clear filters','','ghost small')}</div>` : ''}
  ${query || selectedLabels.size || dueFilter !== 'all' ? `<div class="filter-summary" role="status">Showing ${cards.length} of ${all.length} cards${query ? ` matching “${esc(query)}”` : ''}</div>` : ''}
  ${view === 'table' ? `<div class="table-wrap"><table class="card-table"><thead><tr><th>Card</th><th>List</th><th>Labels</th><th>Due date</th><th>Checklist</th><th>Status</th></tr></thead><tbody>${cards.map(card => { const counts = progress(card); return `<tr><td>${btn('open-card',esc(card.title),`data-id="${esc(card.id)}"`)}</td><td>${esc(current.lists.find(list => list.id === card.listId)?.name)}</td><td>${labelsHTML(card.labels)}</td><td>${dueHTML(card) || '—'}</td><td>${counts.total ? `${counts.done}/${counts.total}` : '—'}</td><td>${btn('complete-card',card.completed ? '✓ Complete' : 'Mark complete',`data-id="${esc(card.id)}"`)}</td></tr>`; }).join('')}</tbody></table>${cards.length ? '' : '<div class="empty-state">No cards to show. Add a card from the Board view or adjust your filters.</div>'}</div>` : `<div class="board-lists">${current.lists.map(list => `<section class="list" data-list="${esc(list.id)}" aria-label="${esc(list.name)} list"><header class="list-header"><h2>${esc(list.name)}</h2><span class="list-count">${cards.filter(card => card.listId === list.id).length}</span>${ibtn('list-menu','more',`List options: ${list.name}`,`data-id="${esc(list.id)}"`)}</header><div class="list-body" data-drop-list="${esc(list.id)}">${cards.filter(card => card.listId === list.id).map(cardHTML).join('')}</div>
      ${composerList === list.id ? `<form id="add-card-form" class="composer" data-list="${esc(list.id)}"><textarea id="new-card-title" aria-label="Card title" placeholder="What needs to be done?" required maxlength="500"></textarea><div class="row"><button class="primary" type="submit">Add card</button>${ibtn('cancel-card','close','Cancel adding card')}</div></form>` : btn('add-card',`${icon('plus')} Add a card`,`data-list="${esc(list.id)}"`,'add-card')}
    </section>`).join('')}<div class="add-list-wrap">${addingList ? `<form id="add-list-form" class="new-list-form"><input id="new-list-name" aria-label="List name" placeholder="Enter list title…" required maxlength="150"><div class="row"><button type="submit" class="primary">Add list</button>${ibtn('cancel-list','close','Cancel adding list')}</div></form>` : btn('add-list',`${icon('plus')} Add ${current.lists.length ? 'another' : 'a'} list`,'','add-list-button')}</div></div>`}`;
}
function colorHex(color) { return {green:'#4bce97',yellow:'#e2b203',orange:'#faa53d',red:'#f87462',purple:'#b8acf6',blue:'#579dff'}[color]; }
function showModal(title, body, kind = '', css = '') {
  modalKind = kind; modal.className = css;
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${esc(title)}</h2>${ibtn('close-modal','close','Close dialog')}</div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
}
function formError(message) {
  let element = $('.form-error', modal); if (!element) { element = document.createElement('div'); element.className = 'form-error'; element.setAttribute('role','alert'); $('.modal-body',modal).append(element); }
  element.textContent = message;
}
function captureDraft() {
  if (!draft || modalKind !== 'card') return;
  draft.title = $('#card-title').value; draft.description = $('#card-description').value;
  draft.listId = $('#card-list').value; draft.dueDate = $('#card-date').value; draft.completed = $('#card-completed').checked;
  cardUI.comment = $('#new-comment').value;
  cardUI.checklistTitle = $('#new-checklist').value;
  for (const list of draft.checklists) cardUI.items.set(list.id, document.getElementById(`check-input-${list.id}`)?.value || '');
}
function finishCardDraft() {
  captureDraft();
  if (cardUI.comment.trim()) draft.comments.push({id:uid(),text:cardUI.comment.trim(),createdAt:new Date().toISOString()});
  if (cardUI.checklistTitle.trim()) draft.checklists.push({id:uid(),title:cardUI.checklistTitle.trim(),items:[]});
  for (const list of draft.checklists) {
    const text = cardUI.items.get(list.id)?.trim();
    if (text) list.items.push({id:uid(),text,done:false});
  }
  cardUI = {comment:'',checklistTitle:'',items:new Map()};
}
function closeModal(force = false) {
  if (!force && modalKind === 'card' && draft) {
    captureDraft(); const original = state.boards.find(item => item.id === draftBoardId)?.cards.find(item => item.id === draft.id);
    if ((JSON.stringify(original) !== JSON.stringify(draft) || cardUI.comment || cardUI.checklistTitle || [...cardUI.items.values()].some(Boolean)) && !confirm('Discard your unsaved card changes?')) return;
  }
  modal.close(); modalKind = ''; draft = null; draftBoardId = null;
}
function backgroundsHTML() { return `<div class="background-grid">${BACKGROUNDS.map(name => btn('choose-background',`${newBackground === name ? '✓ ' : ''}${backgroundNames[name]}`,`data-background="${name}" aria-pressed="${newBackground === name}"`,`background-choice ${name} ${newBackground === name ? 'selected' : ''}`)).join('')}</div>`; }
function openCreateBoard() {
  newBackground = 'ocean';
  showModal('Create a board',`<form id="create-board-form" class="stack"><label class="field">Board title<input name="name" placeholder="e.g. Product launch" required maxlength="150" autofocus></label><label class="field">Workspace<select name="workspace">${state.workspaces.map(item => `<option value="${esc(item.id)}" ${activeWorkspace === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label class="field">Background</label><div id="background-options">${backgroundsHTML()}</div><div class="modal-actions">${btn('close-modal','Cancel')}<button type="submit" class="primary">Create board</button></div></form>`,'create-board');
}
function openWorkspaces() {
  showModal('Your workspaces',`<div class="stack">${state.workspaces.map(item => btn('switch-workspace',`<span class="workspace-icon">${esc(item.name.slice(0,1).toUpperCase())}</span><span class="flex-1"><strong>${esc(item.name)}</strong><br><span class="small muted">${state.boards.filter(b => b.workspaceId === item.id).length} boards</span></span>${item.id === activeWorkspace ? icon('check') : icon('chevron')}`,`data-id="${esc(item.id)}"`,`workspace-option ${item.id === activeWorkspace ? 'selected' : ''}`)).join('')}</div><hr class="separator"><form id="create-workspace-form" class="stack"><h3 style="margin:0">Create a workspace</h3><label class="field">Workspace name<input name="name" placeholder="e.g. Personal projects" required maxlength="150"></label><button class="primary" type="submit">Create workspace</button></form>`,'workspaces');
}
function renameModal(type, id) {
  const item = type === 'board' ? board() : type === 'workspace' ? workspace() : board().lists.find(list => list.id === id);
  showModal(`Rename ${type}`,`<form id="rename-form" data-type="${type}" data-id="${esc(item.id)}"><label class="field">Name<input name="name" value="${esc(item.name)}" maxlength="150" required autofocus></label><div class="modal-actions">${btn('close-modal','Cancel')}<button type="submit" class="primary">Save name</button></div></form>`,'rename');
  $('input[name=name]',modal).select();
}
function openCard(id) { draft = structuredClone(cardById(id)); draftBoardId = activeBoard; cardUI = { comment:'', checklistTitle:'', items:new Map() }; renderCard(); }
function renderCard() {
  const current = state.boards.find(item => item.id === draftBoardId);
  modalKind = 'card'; modal.className = 'card-dialog';
  modal.innerHTML = `<form id="card-form"><div class="modal-header">${icon('board')}<div class="flex-1"><h2 id="modal-title" class="small muted" style="margin:0 9px">Card details</h2><input id="card-title" class="title-input" aria-label="Card title" value="${esc(draft.title)}" required maxlength="500"></div>${ibtn('close-modal','close','Close card')}</div>
    <div class="modal-body"><div class="card-details"><div class="card-fields"><label class="field">In list<select id="card-list" aria-label="Move card to list">${current.lists.map(list => `<option value="${esc(list.id)}" ${list.id === draft.listId ? 'selected' : ''}>${esc(list.name)}</option>`).join('')}</select></label><label class="field">Due date<input id="card-date" aria-label="Due date" type="date" value="${esc(draft.dueDate)}"></label></div>
    <div class="row spread"><label class="completed-control"><input id="card-completed" type="checkbox" ${draft.completed ? 'checked' : ''}>Mark as complete</label>${btn('clear-date','Clear date','','ghost small')}</div>
    <div class="section-heading">${icon('filter')} Labels</div><div class="label-options">${LABEL_COLORS.map(color => btn('card-label',draft.labels.includes(color) ? icon('check') : '',`style="background:${colorHex(color)}" data-color="${color}" aria-label="${color} label" aria-pressed="${draft.labels.includes(color)}"`,`label-option ${draft.labels.includes(color) ? 'selected' : ''}`)).join('')}</div>
    <label class="field"><span class="section-heading">${icon('description')} Description</span><textarea id="card-description" placeholder="Add more detail, a useful link, or a little context…" rows="4">${esc(draft.description)}</textarea></label>
    <div id="checklists">${draft.checklists.map(list => {
      const done = list.items.filter(item => item.done).length, percent = list.items.length ? Math.round(done/list.items.length*100) : 0;
      return `<section><div class="checklist-head">${icon('checklist')}<strong>${esc(list.title)}</strong>${ibtn('delete-checklist','trash','Delete checklist',`data-id="${esc(list.id)}"`)}</div><div class="progress-row"><span>${percent}%</span><div class="progress-track" role="progressbar" aria-label="${esc(list.title)} progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div></div></div>${list.items.map(item => `<div class="check-item ${item.done ? 'checked' : ''}"><input type="checkbox" id="item-${esc(item.id)}" data-checklist="${esc(list.id)}" data-item="${esc(item.id)}" ${item.done ? 'checked' : ''}><label for="item-${esc(item.id)}">${esc(item.text)}</label>${ibtn('delete-check-item','close','Delete checklist item',`data-checklist="${esc(list.id)}" data-id="${esc(item.id)}"`)}</div>`).join('')}<div class="inline-input"><input id="check-input-${esc(list.id)}" aria-label="New item in ${esc(list.title)}" placeholder="Add an item…" value="${esc(cardUI.items.get(list.id) || '')}">${btn('add-check-item','Add',`data-id="${esc(list.id)}"`)}</div></section>`;
    }).join('')}</div>
    <div class="inline-input" style="margin-top:22px"><input id="new-checklist" aria-label="New checklist title" placeholder="New checklist title…" value="${esc(cardUI.checklistTitle)}">${btn('add-checklist',`${icon('plus')} Checklist`)}</div></div>
    <aside class="card-activity"><div class="section-heading">${icon('comment')} Activity & comments</div>
    <textarea id="new-comment" aria-label="New comment" placeholder="Write a comment…" rows="2" style="width:100%">${esc(cardUI.comment)}</textarea><div style="margin-top:7px">${btn('add-comment','Add comment','','primary')}</div>
    ${draft.comments.slice().reverse().map(comment => `<div class="comment"><span class="comment-avatar">Y</span><div class="comment-body"><div class="row spread"><span><strong class="small">You</strong> <small>${esc(new Date(comment.createdAt).toLocaleString())}</small></span>${ibtn('delete-comment','close','Delete comment',`data-id="${esc(comment.id)}"`)}</div><p>${esc(comment.text)}</p></div></div>`).join('')}
    </aside></div><footer class="card-footer">${btn('archive-card',`${icon('archive')} Archive`,`data-id="${esc(draft.id)}"`)}<span class="muted small">Changes save when you click Save.</span><div class="row">${btn('close-modal','Cancel')}<button class="primary" type="submit">Save changes</button></div></footer></form>`;
  if (!modal.open) modal.showModal();
}
function boardMenu() {
  showModal('Board menu',`<div class="menu-section">${btn('rename-board',`${icon('edit')} Rename board`)}${btn('background',`${icon('image')} Change background`)}${btn('archived',`${icon('archive')} Archived cards (${board().cards.filter(card => card.archived).length})`)}</div><div class="menu-section">${btn('export-board',`${icon('download')} Export this board (JSON)`)}${btn('settings',`${icon('upload')} Import, backup & local data`)}</div><div class="menu-section">${btn('delete-board',`${icon('trash')} Delete board`,'','danger')}</div>`,'board-menu');
}
function listMenu(id) {
  const current = board(), index = current.lists.findIndex(list => list.id === id), list = current.lists[index];
  showModal('List options',`<p class="muted">${esc(list.name)}</p><div class="menu-section">${btn('rename-list',`${icon('edit')} Rename list`,`data-id="${esc(id)}"`)}${btn('list-left','← Move list left',`data-id="${esc(id)}" ${index === 0 ? 'disabled' : ''}`)}${btn('list-right','Move list right →',`data-id="${esc(id)}" ${index === current.lists.length-1 ? 'disabled' : ''}`)}</div><div class="menu-section">${btn('archive-list-completed',`${icon('archive')} Archive completed cards`,`data-id="${esc(id)}"`)}${btn('delete-list',`${icon('trash')} Delete list and its cards`,`data-id="${esc(id)}"`,'danger')}</div>`,'list-menu');
}
function archivedModal() {
  const cards = board().cards.filter(card => card.archived);
  showModal('Archived cards',cards.length ? cards.map(card => `<div class="archive-card"><span class="flex-1">${esc(card.title)}</span>${btn('restore-card','Restore',`data-id="${esc(card.id)}"`)}${ibtn('delete-card','trash','Permanently delete card',`data-id="${esc(card.id)}"`)}</div>`).join('') : '<p class="muted">No archived cards. Archived cards can be restored here.</p>','archived');
}
function settingsModal() {
  showModal('Your data, on your computer',`<p class="muted">Trellis is an independent local app inspired by Trello. Your work is saved in this project’s <code>.data/state.json</code>. No account or external service is used.</p><div class="notice">Changes survive browser and server restarts. Keep this project folder to keep your data. Download a backup before moving to another computer.</div><div class="menu-section">${btn('export-all',`${icon('download')} Download full backup (JSON)`)}</div><div class="menu-section"><h3>Import a backup or exported board</h3><p class="small muted">Import adds new workspaces and boards. Existing work is preserved. Trellis JSON exports are supported; Trello’s native export format is not supported.</p><input id="import-file" class="file-input" type="file" accept=".json,application/json" aria-label="Select Trellis JSON backup to import"></div><p class="small muted" style="margin-top:18px">No real-time sharing, Trello account sync, or third-party integrations are included. The supported workflows are boards, lists, cards, comments, checklists, labels, dates, backgrounds, search and local persistence.</p>`,'settings');
}
function download(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),10000);
}
function remapImport(imported) {
  const copy = structuredClone(imported), ids = new Map();
  for (const item of copy.workspaces) { ids.set(item.id,uid()); item.id = ids.get(item.id); }
  for (const current of copy.boards) {
    current.id = uid(); current.workspaceId = ids.get(current.workspaceId);
    for (const list of current.lists) { ids.set(list.id,uid()); list.id = ids.get(list.id); }
    for (const card of current.cards) {
      card.id = uid(); card.listId = ids.get(card.listId);
      for (const comment of card.comments) comment.id = uid();
      for (const checklist of card.checklists) { checklist.id = uid(); for (const item of checklist.items) item.id = uid(); }
    }
  }
  return copy;
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
  const {action,id,list,color} = target.dataset;
  try {
    switch (action) {
      case 'toggle-sidebar': if (innerWidth <= 720) mobileSidebar = !mobileSidebar; else sidebarClosed = !sidebarClosed; render(); break;
      case 'gallery': page = 'gallery'; query = ''; mobileSidebar = false; preferences(); render(); break;
      case 'open-board': closeModal(true); openBoard(id); break;
      case 'create-board': openCreateBoard(); break;
      case 'workspaces': openWorkspaces(); break;
      case 'switch-workspace': activeWorkspace = id; page = 'gallery'; query = ''; ensureSelection(); preferences(); closeModal(true); render(); break;
      case 'rename-workspace': renameModal('workspace'); break;
      case 'rename-board': renameModal('board'); break;
      case 'rename-list': renameModal('list',id); break;
      case 'star-board': await mutate(next => { const b = next.boards.find(b => b.id === id); b.starred = !b.starred; }); break;
      case 'view-board': view = 'board'; preferences(); renderMain(); break;
      case 'view-table': view = 'table'; preferences(); renderMain(); break;
      case 'filters': showFilters = !showFilters; renderMain(); break;
      case 'filter-label': selectedLabels.has(color) ? selectedLabels.delete(color) : selectedLabels.add(color); renderMain(); break;
      case 'clear-filters': query = ''; selectedLabels.clear(); dueFilter = 'all'; render(); break;
      case 'background': newBackground = board().background; showModal('Board background',`<p class="muted">Set the mood for your next great idea.</p><div id="background-options">${backgroundsHTML()}</div>`,'background'); break;
      case 'choose-background': {
        newBackground = target.dataset.background;
        if (modalKind === 'background' && !await mutate(next => { next.boards.find(b => b.id === activeBoard).background = newBackground; })) newBackground = board().background;
        $('#background-options',modal).innerHTML = backgroundsHTML(); break;
      }
      case 'board-menu': boardMenu(); break;
      case 'list-menu': listMenu(id); break;
      case 'add-list': addingList = true; renderMain(); $('#new-list-name').focus(); break;
      case 'cancel-list': addingList = false; renderMain(); break;
      case 'add-card': composerList = list; renderMain(); $('#new-card-title').focus(); break;
      case 'cancel-card': composerList = null; renderMain(); break;
      case 'open-card': openCard(id); break;
      case 'complete-card': await mutate(next => { const card = next.boards.find(b => b.id === activeBoard).cards.find(c => c.id === id); card.completed = !card.completed; }); break;
      case 'card-label': captureDraft(); draft.labels = draft.labels.includes(color) ? draft.labels.filter(item => item !== color) : [...draft.labels,color]; renderCard(); break;
      case 'clear-date': $('#card-date').value = ''; break;
      case 'add-checklist': {
        const title = $('#new-checklist').value.trim(); if (!title) { $('#new-checklist').focus(); return; }
        captureDraft(); cardUI.checklistTitle = ''; draft.checklists.push({id:uid(),title,items:[]}); renderCard(); document.getElementById(`check-input-${draft.checklists.at(-1).id}`).focus(); break;
      }
      case 'delete-checklist': captureDraft(); if (confirm('Delete this checklist?')) { draft.checklists = draft.checklists.filter(item => item.id !== id); cardUI.items.delete(id); renderCard(); } break;
      case 'add-check-item': {
        const input = document.getElementById(`check-input-${id}`), text = input.value.trim(); if (!text) { input.focus(); return; }
        captureDraft(); cardUI.items.set(id, ''); draft.checklists.find(item => item.id === id).items.push({id:uid(),text,done:false}); renderCard(); document.getElementById(`check-input-${id}`).focus(); break;
      }
      case 'delete-check-item': captureDraft(); { const checklist = draft.checklists.find(item => item.id === target.dataset.checklist); checklist.items = checklist.items.filter(item => item.id !== id); renderCard(); } break;
      case 'add-comment': {
        const text = $('#new-comment').value.trim(); if (!text) { $('#new-comment').focus(); return; }
        captureDraft(); cardUI.comment = ''; draft.comments.push({id:uid(),text,createdAt:new Date().toISOString()}); renderCard(); break;
      }
      case 'delete-comment': captureDraft(); draft.comments = draft.comments.filter(item => item.id !== id); renderCard(); break;
      case 'archive-card': finishCardDraft(); { const updated = structuredClone(draft), boardId = draftBoardId; updated.archived = true; if (await mutate(next => { const b = next.boards.find(b => b.id === boardId); b.cards[b.cards.findIndex(c => c.id === id)] = updated; },'Card archived')) closeModal(true); else renderCard(); } break;
      case 'archived': archivedModal(); break;
      case 'restore-card': if (await mutate(next => { next.boards.find(b => b.id === activeBoard).cards.find(c => c.id === id).archived = false; },'Card restored')) archivedModal(); break;
      case 'delete-card': if (confirm('Permanently delete this archived card?')) { if (await mutate(next => { const b = next.boards.find(b => b.id === activeBoard); b.cards = b.cards.filter(c => c.id !== id); },'Card deleted')) archivedModal(); } break;
      case 'list-left': case 'list-right': if (await mutate(next => { const lists = next.boards.find(b => b.id === activeBoard).lists, index = lists.findIndex(item => item.id === id), other = index + (action === 'list-left' ? -1 : 1); [lists[index],lists[other]] = [lists[other],lists[index]]; })) closeModal(true); break;
      case 'archive-list-completed': if (await mutate(next => { next.boards.find(b => b.id === activeBoard).cards.filter(card => card.listId === id && card.completed).forEach(card => { card.archived = true; }); },'Completed cards archived')) closeModal(true); break;
      case 'delete-list': if (confirm('Delete this list and all its cards? This cannot be undone.')) { if (await mutate(next => { const b = next.boards.find(b => b.id === activeBoard); b.lists = b.lists.filter(item => item.id !== id); b.cards = b.cards.filter(card => card.listId !== id); },'List deleted')) closeModal(true); } break;
      case 'delete-board': if (confirm(`Delete “${board().name}” and all its cards? This cannot be undone.`)) { if (await mutate(next => { next.boards = next.boards.filter(item => item.id !== activeBoard); },'Board deleted')) { page = 'gallery'; preferences(); closeModal(true); render(); } } break;
      case 'settings': settingsModal(); break;
      case 'export-all': download(state,`trellis-backup-${new Date().toISOString().slice(0,10)}.json`); toast('Backup downloaded'); break;
      case 'export-board': download({version:1,workspaces:[workspace()],boards:[board()]},'trellis-board.json'); toast('Board exported'); break;
      case 'close-modal': closeModal(); break;
    }
  } catch (error) { toast(error.message,true); }
});

document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target;
  try {
    switch (form.id) {
      case 'create-workspace-form': {
        const name = form.elements.name.value.trim(); if (!name) return formError('Enter a workspace name.');
        const id = uid(); if (await mutate(next => { next.workspaces.push({id,name}); },'Workspace created')) { activeWorkspace = id; activeBoard = undefined; page = 'gallery'; preferences(); closeModal(true); render(); } break;
      }
      case 'create-board-form': {
        const name = form.elements.name.value.trim(), workspaceId = form.elements.workspace.value, id = uid(); if (!name) return formError('Enter a board title.');
        const background = newBackground;
        if (await mutate(next => { next.boards.push({id,name,workspaceId,background,starred:false,lists:['To do','Doing','Done'].map(name => ({id:uid(),name})),cards:[]}); },'Board created')) { closeModal(true); openBoard(id); } break;
      }
      case 'rename-form': {
        const name = form.elements.name.value.trim(), {type,id} = form.dataset; if (!name) return formError('Enter a name.');
        if (await mutate(next => { const item = type === 'workspace' ? next.workspaces.find(w => w.id === id) : type === 'board' ? next.boards.find(b => b.id === id) : next.boards.find(b => b.id === activeBoard).lists.find(l => l.id === id); item.name = name; },'Name updated')) closeModal(true); break;
      }
      case 'add-list-form': {
        const name = $('#new-list-name').value.trim(); if (!name) return;
        if (await mutate(next => { next.boards.find(b => b.id === activeBoard).lists.push({id:uid(),name}); },'List added')) { addingList = false; renderMain(); } break;
      }
      case 'add-card-form': {
        const title = $('#new-card-title').value.trim(), listId = form.dataset.list; if (!title) return;
        if (await mutate(next => { next.boards.find(b => b.id === activeBoard).cards.push({id:uid(),listId,title,description:'',labels:[],dueDate:'',completed:false,archived:false,comments:[],checklists:[]}); },'Card added')) { composerList = null; renderMain(); } break;
      }
      case 'card-form': {
        finishCardDraft(); if (!draft.title.trim()) { renderCard(); return formError('A card needs a title.'); }
        const updated = structuredClone(draft), boardId = draftBoardId;
        if (await mutate(next => { const b = next.boards.find(b => b.id === boardId), index = b.cards.findIndex(c => c.id === updated.id); b.cards[index] = updated; },'Card saved')) closeModal(true); else renderCard(); break;
      }
    }
  } catch (error) { formError(error.message); }
});
document.addEventListener('input', event => { if (event.target.id === 'search') { query = event.target.value; composerList = null; renderMain(); } });
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'due-filter') { dueFilter = target.value; renderMain(); }
  if (target.dataset.checklist && target.dataset.item) {
    captureDraft(); draft.checklists.find(list => list.id === target.dataset.checklist).items.find(item => item.id === target.dataset.item).done = target.checked; renderCard();
  }
  if (target.id === 'import-file' && target.files[0]) {
    try {
      if (target.files[0].size > 16*1024*1024) throw new Error('This file exceeds the 16 MiB local data request limit.');
      const imported = JSON.parse(await target.files[0].text()); validateState(imported);
      const copy = remapImport(imported);
      if (await mutate(next => { next.workspaces.push(...copy.workspaces); next.boards.push(...copy.boards); },'Backup imported. Existing data preserved.')) { activeWorkspace = copy.workspaces[0]?.id || activeWorkspace; page = 'gallery'; ensureSelection(); preferences(); closeModal(true); render(); }
    } catch (error) { formError(`Import failed: ${error.message}`); }
  }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); $('#search')?.focus(); }
  if (event.target.matches('.card') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openCard(event.target.dataset.id); }
  if (modalKind === 'card' && event.key === 'Enter' && event.target.tagName === 'INPUT' && !['card-title','card-date'].includes(event.target.id)) {
    event.preventDefault(); const input = event.target;
    if (input.id === 'new-checklist') $('[data-action=add-checklist]',modal).click();
    else if (input.id.startsWith('check-input-')) input.nextElementSibling.click();
  }
});
modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
modal.addEventListener('click', event => { const rect = modal.getBoundingClientRect(); if (event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeModal(); });
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-card]'); if (!card) return;
  draggingId = card.dataset.card; event.dataTransfer.setData('text/plain',draggingId); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging');
});
document.addEventListener('dragend', () => { draggingId = undefined; document.querySelectorAll('.dragging,.drag-over').forEach(el => el.classList.remove('dragging','drag-over')); });
document.addEventListener('dragover', event => {
  const list = event.target.closest('[data-drop-list],.list'); if (!list || !draggingId) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const body = list.matches('[data-drop-list]') ? list : $('.list-body',list); body?.classList.add('drag-over');
});
document.addEventListener('dragleave', event => { const body = event.target.closest('[data-drop-list]'); if (body && !body.contains(event.relatedTarget)) body.classList.remove('drag-over'); });
document.addEventListener('drop', async event => {
  const section = event.target.closest('.list'); if (!section || !draggingId) return;
  event.preventDefault(); const id = draggingId, listId = section.dataset.list, before = event.target.closest('[data-card]'), beforeId = before?.dataset.card;
  const after = before && event.clientY > before.getBoundingClientRect().top + before.getBoundingClientRect().height/2;
  draggingId = undefined;
  await mutate(next => {
    const b = next.boards.find(b => b.id === activeBoard), index = b.cards.findIndex(c => c.id === id); if (index < 0 || beforeId === id) return;
    const [card] = b.cards.splice(index,1); card.listId = listId;
    if (beforeId) { const destination = b.cards.findIndex(c => c.id === beforeId); b.cards.splice(destination + (after ? 1 : 0),0,card); }
    else b.cards.push(card);
  },'Card moved');
});

try {
  const response = await fetch('/api/state'); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Cannot load workspace');
  validateState(payload.state); state = payload.state; revision = payload.revision;
  activeWorkspace = prefs.activeWorkspace || state.workspaces[0]?.id; activeBoard = prefs.activeBoard || state.boards[0]?.id;
  page = prefs.page === 'gallery' ? 'gallery' : 'board'; view = prefs.view === 'table' ? 'table' : 'board'; ensureSelection(); render();
} catch (error) {
  app.innerHTML = `<div class="loading"><h1>Couldn’t open your workspace</h1><p>${esc(error.message)}</p><p>Check the server window, then reload this page. Existing data has not been replaced.</p><button type="button" id="reload">Try again</button></div>`;
  $('#reload').addEventListener('click', () => location.reload());
}
