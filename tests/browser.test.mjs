import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from '../server.mjs';
import { createInitialState } from '../public/model.js';

const require = createRequire(import.meta.url);
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, '@playwright/test', process.platform === 'win32' && process.env.APPDATA ? join(process.env.APPDATA,'npm','node_modules','@playwright/test') : undefined]) {
  if (!candidate) continue;
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Playwright is required for browser verification. Set PLAYWRIGHT_MODULE to an installed @playwright/test module. The application itself needs no dependencies.');
const { chromium, expect } = playwright;
const directory = await mkdtemp(join(tmpdir(), 'trellis-browser-'));
const artifacts = process.env.QA_ARTIFACTS || resolve('test-results/browser');
await mkdir(artifacts, { recursive:true });
const app = await startServer({ port:0, dataDirectory:directory });
let browser;
const errors = [];
let checks = 0;
const log = message => { console.log(`PASS ${++checks}: ${message}`); };
try {
  browser = await chromium.launch({ headless:true, timeout:10000 });
  const context = await browser.newContext({ viewport:{width:1440,height:960}, acceptDownloads:true });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin === app.url) await route.continue();
    else await route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(app.url);
  await expect(page.locator('.board-title')).toHaveText('Product launch');
  await page.screenshot({path:join(artifacts,'local-desktop.png'),fullPage:true});
  log('Initial desktop board loads without external services');

  const action = (name, root = page) => root.locator(`[data-action="${name}"]`).first();
  const modal = page.locator('#modal');
  const state = async () => (await (await fetch(`${app.url}/api/state`)).json()).state;
  const saveCard = async () => {
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(modal).not.toBeVisible();
  };
  await action('workspaces').first().click();
  await modal.locator('#create-workspace-form input').fill('QA Studio');
  await modal.getByRole('button',{name:'Create workspace',exact:true}).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.workspace-heading h2')).toHaveText('QA Studio');
  await action('create-board').first().click();
  await modal.locator('input[name=name]').fill('Website release');
  await modal.locator('[data-background=violet]').click();
  await modal.getByRole('button',{name:'Create board',exact:true}).click();
  await expect(page.locator('.board-title')).toHaveText('Website release');
  await expect(page.locator('#main')).toHaveClass(/violet/);
  log('Workspace and board creation, selected board background');

  await action('add-list').click();
  await page.getByRole('textbox',{name:'List name',exact:true}).fill('Review');
  await page.getByRole('button',{name:'Add list',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review',exact:true})).toBeVisible();
  const todo = page.locator('.list').filter({has:page.getByRole('heading',{name:'To do',exact:true})});
  await todo.locator('[data-action=add-card]').click();
  await page.getByRole('textbox',{name:'Card title',exact:true}).fill('Ship the homepage');
  await page.getByRole('button',{name:'Add card',exact:true}).click();
  const card = page.locator('.card').filter({hasText:'Ship the homepage'});
  await expect(card).toBeVisible();
  await card.click();
  await page.locator('#card-description').fill('Prepare the release.\nKeep keyboard and mobile flows working.');
  await page.getByRole('textbox',{name:'Due date',exact:true}).fill('2026-12-12');
  await modal.locator('[data-action=card-label][data-color=green]').click();
  await page.getByRole('textbox',{name:'New checklist title',exact:true}).fill('Release checks');
  await action('add-checklist',modal).click();
  await page.getByRole('textbox',{name:'New item in Release checks',exact:true}).fill('Check desktop');
  await modal.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('textbox',{name:'New item in Release checks',exact:true}).fill('Check mobile');
  await modal.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('checkbox',{name:'Check desktop',exact:true}).check();
  await expect(page.getByRole('progressbar',{name:'Release checks progress'})).toHaveAttribute('aria-valuenow','50');
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('Ready for a focused review.');
  await action('add-comment',modal).click();
  await expect(modal.getByText('Ready for a focused review.',{exact:true})).toBeVisible();
  await page.screenshot({path:join(artifacts,'local-card.png'),fullPage:true});
  await saveCard();
  await card.click();
  await expect(page.locator('#card-description')).toHaveValue('Prepare the release.\nKeep keyboard and mobile flows working.');
  await expect(page.locator('#card-date')).toHaveValue('2026-12-12');
  await expect(modal.locator('[data-color=green]')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('checkbox',{name:'Check desktop',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Check mobile',exact:true})).not.toBeChecked();
  await expect(modal.getByText('Ready for a focused review.',{exact:true})).toBeVisible();
  await action('close-modal',modal).click();
  log('Card creation, description, due date, label, comment, checklist and progress save/reopen');

  await card.click();
  await page.getByRole('textbox',{name:'New comment',exact:true}).fill('Pending comment survives controls and direct Save.');
  await page.getByRole('textbox',{name:'New checklist title',exact:true}).fill('Pending checklist');
  await page.getByRole('textbox',{name:'New item in Release checks',exact:true}).fill('Pending release item');
  await modal.locator('[data-action=card-label][data-color=blue]').click();
  await expect(page.getByRole('textbox',{name:'New comment',exact:true})).toHaveValue('Pending comment survives controls and direct Save.');
  await expect(page.getByRole('textbox',{name:'New checklist title',exact:true})).toHaveValue('Pending checklist');
  await expect(page.getByRole('textbox',{name:'New item in Release checks',exact:true})).toHaveValue('Pending release item');
  await saveCard();
  await card.click();
  await expect(modal.getByText('Pending comment survives controls and direct Save.',{exact:true})).toBeVisible();
  await expect(modal.getByText('Pending checklist',{exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Pending release item',exact:true})).toBeVisible();
  await action('clear-date',modal).click();
  await expect(page.locator('#card-date')).toHaveValue('');
  await action('close-modal',modal).click();
  await card.click();
  await expect(page.locator('#card-date')).toHaveValue('2026-12-12');
  await action('close-modal',modal).click();
  log('Pending comment/checklist/item survives label rerender and direct Save; Cancel discards date edit');

  const doing = page.locator('.list').filter({has:page.getByRole('heading',{name:'Doing',exact:true})});
  await card.dragTo(doing.locator('.list-body'));
  await expect(doing.locator('.card')).toContainText('Ship the homepage');
  const addInDoing = async title => {
    await doing.locator('[data-action=add-card]').click();
    await page.getByRole('textbox',{name:'Card title',exact:true}).fill(title);
    await page.getByRole('button',{name:'Add card',exact:true}).click();
    await expect(doing.locator('.card').filter({hasText:title})).toBeVisible();
  };
  await addInDoing('Second task');
  const second = doing.locator('.card').filter({hasText:'Second task'});
  await second.dragTo(doing.locator('.card').filter({hasText:'Ship the homepage'}),{targetPosition:{x:15,y:3}});
  await expect(doing.locator('.card').first()).toContainText('Second task');
  log('Native drag-and-drop between lists and reorder within a list');

  await page.locator('#search').fill('keyboard');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('Ship the homepage');
  await page.locator('#search').fill('no-such-card');
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#search').fill('');
  await action('filters').click();
  await page.getByRole('button',{name:'Filter green label',exact:true}).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await action('clear-filters').click();
  await page.locator('#due-filter').selectOption('none');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('Second task');
  await action('clear-filters').click();
  await action('view-table').click();
  await expect(page.locator('.card-table tbody tr')).toHaveCount(2);
  await page.locator('.card-table tbody tr').filter({hasText:'Second task'}).getByRole('button',{name:'Mark complete',exact:true}).click();
  await page.locator('#due-filter').selectOption('completed');
  await expect(page.locator('.card-table tbody tr')).toHaveCount(1);
  await action('clear-filters').click();
  await action('view-board').click();
  log('Search text, no results, label/date/completion filtering and table interactions');

  await action('background').click();
  await modal.locator('[data-background=forest]').click();
  await expect(page.locator('#main')).toHaveClass(/forest/);
  await action('close-modal',modal).click();
  await page.locator('.board-title').click();
  await modal.locator('input[name=name]').fill('Launch board');
  await modal.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(page.locator('.board-title')).toHaveText('Launch board');
  await action('list-menu',doing).click();
  await action('rename-list',modal).click();
  await modal.locator('input[name=name]').fill('In review');
  await modal.getByRole('button',{name:'Save name',exact:true}).click();
  const review = page.locator('.list').filter({has:page.getByRole('heading',{name:'In review',exact:true})});
  await action('list-menu',review).click();
  await action('list-left',modal).click();
  await expect(page.locator('.list').first().getByRole('heading')).toHaveText('In review');
  await page.reload();
  await expect(page.locator('.board-title')).toHaveText('Launch board');
  await expect(page.locator('#main')).toHaveClass(/forest/);
  await expect(page.locator('.list').first().getByRole('heading')).toHaveText('In review');
  await expect(page.locator('.card')).toHaveCount(2);
  log('Background change, board/list rename, list reordering and reload persistence');

  await page.locator('.card').filter({hasText:'Ship the homepage'}).click();
  await action('archive-card',modal).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.card')).toHaveCount(1);
  await action('board-menu').click();
  await action('archived',modal).click();
  await expect(modal.getByText('Ship the homepage',{exact:true})).toBeVisible();
  await action('restore-card',modal).click();
  await expect(modal.getByText('No archived cards. Archived cards can be restored here.',{exact:true})).toBeVisible();
  await action('close-modal',modal).click();
  await expect(page.locator('.card')).toHaveCount(2);
  log('Archive and restore cards');

  await action('settings').first().click();
  const downloadPromise = page.waitForEvent('download');
  await action('export-all',modal).click();
  const download = await downloadPromise;
  const downloaded = await download.path();
  const data = JSON.parse(await readFile(downloaded,'utf8'));
  assert(data.workspaces.some(item => item.name === 'QA Studio'));
  const before = await state();
  await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(modal).not.toBeVisible();
  const after = await state();
  assert.equal(after.workspaces.length,before.workspaces.length*2);
  assert.equal(after.boards.length,before.boards.length*2);
  log('JSON backup download and additive import preserving existing data');

  await action('rename-workspace').click();
  await modal.locator('input[name=name]').fill('Imported Studio');
  await modal.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(page.locator('.workspace-heading h2')).toHaveText('Imported Studio');
  await action('settings').first().click();
  await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"wrong":true}')});
  await expect(modal.locator('.form-error')).toContainText('Import failed');
  assert.equal((await state()).boards.length,after.boards.length);
  await action('close-modal',modal).click();
  log('Workspace rename and malformed import preserve saved state');

  const originalBoard = (await state()).boards.find(item => item.name === 'Launch board');
  await action('workspaces').click();
  await modal.locator(`[data-action=switch-workspace][data-id="${originalBoard.workspaceId}"]`).click();
  await page.locator(`.gallery [data-action=open-board][data-id="${originalBoard.id}"]`).first().click();
  const extra = page.locator('.list').filter({has:page.getByRole('heading',{name:'Review',exact:true})});
  await action('list-menu',extra).click();
  await action('delete-list',modal).click();
  await expect(page.getByRole('heading',{name:'Review',exact:true})).toHaveCount(0);
  await page.locator('.card').filter({hasText:'Second task'}).click();
  await action('archive-card',modal).click();
  await action('board-menu').click();
  await action('archived',modal).click();
  await action('delete-card',modal).click();
  await expect(modal.getByText('No archived cards. Archived cards can be restored here.',{exact:true})).toBeVisible();
  await action('close-modal',modal).click();
  log('Confirmed list deletion and permanent archived card deletion');

  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.board-title')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Mobile page should not overflow horizontally');
  await action('toggle-sidebar').click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await action('gallery',page.locator('.sidebar')).click();
  await expect(page.locator('.gallery')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await page.screenshot({path:join(artifacts,'local-mobile-gallery.png'),fullPage:true});
  await page.locator(`.gallery [data-action=open-board][data-id="${originalBoard.id}"]`).first().click();
  await page.screenshot({path:join(artifacts,'local-mobile.png'),fullPage:true});
  await page.locator('.card').filter({hasText:'Ship the homepage'}).click();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeVisible();
  await page.screenshot({path:join(artifacts,'local-mobile-card.png'),fullPage:true});
  await action('close-modal',modal).click();
  log('390px mobile board, card dialog, gallery and sidebar remain usable without page overflow');

  await page.setViewportSize({width:1440,height:960});
  await action('toggle-sidebar').click();
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await action('toggle-sidebar').click();
  await expect(page.locator('.sidebar')).toBeVisible();
  const previousStar = (await state()).boards.find(item => item.id === originalBoard.id).starred;
  await action('star-board',page.locator('.board-bar')).click();
  await expect.poll(async () => (await state()).boards.find(item => item.id === originalBoard.id).starred).toBe(!previousStar);
  log('Desktop sidebar collapse/expand and persisted board starring');

  await page.locator('.card').filter({hasText:'Ship the homepage'}).click();
  const pendingComment = modal.locator('.comment').filter({hasText:'Pending comment survives controls and direct Save.'});
  await action('delete-comment',pendingComment).click();
  const pendingItem = modal.locator('.check-item').filter({hasText:'Pending release item'});
  await action('delete-check-item',pendingItem).click();
  const pendingChecklist = modal.locator('#checklists section').filter({hasText:'Pending checklist'});
  await action('delete-checklist',pendingChecklist).click();
  await action('clear-date',modal).click();
  await saveCard();
  await page.locator('.card').filter({hasText:'Ship the homepage'}).click();
  await expect(modal.getByText('Pending comment survives controls and direct Save.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'Pending release item',exact:true})).toHaveCount(0);
  await expect(modal.getByText('Pending checklist',{exact:true})).toHaveCount(0);
  await expect(page.locator('#card-date')).toHaveValue('');
  await expect(page.getByRole('progressbar',{name:'Release checks progress'})).toHaveAttribute('aria-valuenow','50');
  await action('close-modal',modal).click();
  log('Comment, checklist item and checklist deletion, plus cleared date, persist after Save');

  const inReview = page.locator('.list').filter({has:page.getByRole('heading',{name:'In review',exact:true})});
  await action('add-card',inReview).click();
  await page.getByRole('textbox',{name:'Card title',exact:true}).fill('Archive this completed task');
  await page.getByRole('button',{name:'Add card',exact:true}).click();
  const completed = page.locator('.card').filter({hasText:'Archive this completed task'});
  await action('complete-card',completed).click();
  await expect(completed).toHaveClass(/is-done/);
  await action('list-menu',inReview).click();
  await action('archive-list-completed',modal).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.card').filter({hasText:'Archive this completed task'})).toHaveCount(0);
  await expect(page.locator('.card').filter({hasText:'Ship the homepage'})).toBeVisible();
  await action('board-menu').click();
  await action('archived',modal).click();
  await expect(modal.getByText('Archive this completed task',{exact:true})).toBeVisible();
  await action('close-modal',modal).click();
  log('List menu archives completed cards while preserving incomplete siblings');

  await action('board-menu').click();
  const boardDownloadPromise = page.waitForEvent('download');
  await action('export-board',modal).click();
  const boardDownload = await boardDownloadPromise;
  const boardExport = JSON.parse(await readFile(await boardDownload.path(),'utf8'));
  assert.equal(boardExport.workspaces.length,1);
  assert.equal(boardExport.boards.length,1);
  assert.equal(boardExport.boards[0].name,'Launch board');
  const beforeBoardImport = await state();
  await action('settings',modal).click();
  await page.locator('#import-file').setInputFiles({name:'board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(boardExport))});
  await expect(modal).not.toBeVisible();
  const afterBoardImport = await state();
  assert.equal(afterBoardImport.workspaces.length,beforeBoardImport.workspaces.length+1);
  assert.equal(afterBoardImport.boards.length,beforeBoardImport.boards.length+1);
  const oldIds = new Set(beforeBoardImport.boards.map(item => item.id));
  const importedBoard = afterBoardImport.boards.find(item => !oldIds.has(item.id));
  await page.locator(`.gallery [data-action=open-board][data-id="${importedBoard.id}"]`).first().click();
  await expect(page.locator('.board-title')).toHaveText('Launch board');
  await expect(page.locator('.card')).toHaveCount(1);
  await action('board-menu').click();
  await action('delete-board',modal).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.gallery')).toBeVisible();
  assert(!(await state()).boards.some(item => item.id === importedBoard.id));
  assert.equal((await state()).boards.length,beforeBoardImport.boards.length);
  await expect(page.locator('.create-tile')).toBeVisible();
  log('Board-only export/import round-trip and board deletion recover to usable gallery');

  const marker = '"><img src="/__identity_audit_missing" onerror="window.__identityAudit=1">';
  const textState = createInitialState();
  textState.workspaces[0].name = marker;
  textState.boards[0].name = marker;
  textState.boards[0].lists[0].name = marker;
  const textCard = textState.boards[0].cards[0];
  textCard.title = marker;
  textCard.description = marker;
  textCard.comments = [{id:'audit-comment',text:marker,createdAt:new Date().toISOString()}];
  textCard.checklists = [{id:'__proto__',title:marker,items:[{id:'audit-item',text:marker,done:false}]}];
  const beforeText = await (await fetch(`${app.url}/api/state`)).json();
  const textSave = await fetch(`${app.url}/api/state`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:beforeText.revision,state:textState})});
  assert.equal(textSave.status,200);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.board-title')).toHaveText(marker);
  await expect(page.locator('.card-title').first()).toHaveText(marker);
  await page.locator('.card').first().click();
  await expect(page.locator('#card-description')).toHaveValue(marker);
  assert.equal(await page.evaluate(() => !!window.__identityAudit),false);
  assert.equal(await page.locator('img[src="/__identity_audit_missing"]').count(),0);
  log('HTML-like names, titles, descriptions, comments and checklist text remain literal text');

  await page.locator('#check-input-__proto__').fill('An opaque identity still works');
  await modal.getByRole('button',{name:'Add',exact:true}).click();
  await saveCard();
  await page.locator('.card').first().click();
  await expect(page.getByRole('checkbox',{name:'An opaque identity still works',exact:true})).toBeVisible();
  await action('close-modal',modal).click();
  log('Valid opaque identities preserve checklist data without object-property interpretation');

  const corruptions = [
    s => {const old=s.workspaces[0].id;s.workspaces[0].id=marker;s.boards.forEach(b=>{if(b.workspaceId===old)b.workspaceId=marker;});},
    s => {s.boards[0].id=marker;},
    s => {const old=s.boards[0].lists[0].id;s.boards[0].lists[0].id=marker;s.boards[0].cards.forEach(c=>{if(c.listId===old)c.listId=marker;});},
    s => {s.boards[0].cards[0].id=marker;},
    s => {s.boards[0].cards[0].comments=[{id:marker,text:'Synthetic comment',createdAt:new Date().toISOString()}];},
    s => {s.boards[0].cards[0].checklists=[{id:marker,title:'Synthetic checklist',items:[]}];},
    s => {s.boards[0].cards[0].checklists=[{id:'audit-list',title:'Synthetic checklist',items:[{id:marker,text:'Synthetic item',done:false}]}];},
  ];
  for (const corrupt of corruptions) {
    const candidate = createInitialState(); corrupt(candidate);
    const isolated = await context.newPage();
    isolated.on('pageerror',error=>errors.push(error.message));
    await isolated.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:0,state:candidate})}));
    await isolated.goto(app.url);
    await expect(isolated.getByRole('heading',{name:'Couldn’t open your workspace',exact:true})).toBeVisible();
    assert.equal(await isolated.evaluate(()=>!!window.__identityAudit),false);
    assert.equal(await isolated.locator('img[src="/__identity_audit_missing"]').count(),0);
    await isolated.close();
  }
  log('Browser rejects malformed identities from all seven owners before rendering state');

  assert.deepEqual(errors,[],'No browser JavaScript or console errors');
  log('No browser JavaScript or console errors');
  console.log(`Browser verification finished: ${checks} workflow groups passed. Artifacts: ${artifacts}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => app.server.close(resolve));
  await rm(directory,{recursive:true,force:true});
}
