export const BACKGROUNDS = ['ocean', 'violet', 'forest', 'sunset', 'slate', 'rose'];
export const LABEL_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue'];

function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}

function string(value, path, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && value.trim().length === 0)) {
    throw new Error(`${path} must be ${nonempty ? 'a nonempty' : 'a'} string.`);
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
}

export function validateState(value) {
  const state = object(value, 'State');
  if (state.version !== 1) throw new Error('Unsupported data version. Expected version 1.');
  const ids = new Set();
  const takeId = (entry, path) => {
    object(entry, path);
    string(entry.id, `${path}.id`, true);
    // Application identities are generated UUIDs or seeded ASCII identifiers.
    // Reject unsupported identities; never normalize or merge caller values.
    if (!/^[A-Za-z0-9_-]+$/.test(entry.id)) {
      throw new Error(`${path}.id must contain only ASCII letters, digits, underscores or hyphens.`);
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate ID at ${path}.id.`);
    ids.add(entry.id);
    return entry.id;
  };
  const workspaceIds = new Set();
  for (const [index, workspace] of array(state.workspaces, 'workspaces').entries()) {
    const path = `workspaces[${index}]`;
    workspaceIds.add(takeId(workspace, path));
    string(workspace.name, `${path}.name`, true);
  }
  for (const [boardIndex, board] of array(state.boards, 'boards').entries()) {
    const path = `boards[${boardIndex}]`;
    takeId(board, path);
    string(board.name, `${path}.name`, true);
    if (!workspaceIds.has(board.workspaceId)) throw new Error(`${path}.workspaceId does not identify a workspace.`);
    if (!BACKGROUNDS.includes(board.background)) throw new Error(`${path}.background is not supported.`);
    boolean(board.starred, `${path}.starred`);
    const listIds = new Set();
    for (const [listIndex, list] of array(board.lists, `${path}.lists`).entries()) {
      const listPath = `${path}.lists[${listIndex}]`;
      listIds.add(takeId(list, listPath));
      string(list.name, `${listPath}.name`, true);
    }
    for (const [cardIndex, card] of array(board.cards, `${path}.cards`).entries()) {
      const cardPath = `${path}.cards[${cardIndex}]`;
      takeId(card, cardPath);
      if (!listIds.has(card.listId)) throw new Error(`${cardPath}.listId does not identify a list on its board.`);
      string(card.title, `${cardPath}.title`, true);
      string(card.description, `${cardPath}.description`);
      const colors = array(card.labels, `${cardPath}.labels`);
      if (colors.some((color) => !LABEL_COLORS.includes(color)) || new Set(colors).size !== colors.length) {
        throw new Error(`${cardPath}.labels must contain distinct supported colors.`);
      }
      string(card.dueDate, `${cardPath}.dueDate`);
      if (card.dueDate !== '') {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(card.dueDate) ? new Date(`${card.dueDate}T00:00:00.000Z`) : null;
        if (date === null || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== card.dueDate) {
          throw new Error(`${cardPath}.dueDate must be an actual calendar date in YYYY-MM-DD format, or empty.`);
        }
      }
      boolean(card.completed, `${cardPath}.completed`);
      boolean(card.archived, `${cardPath}.archived`);
      for (const [commentIndex, comment] of array(card.comments, `${cardPath}.comments`).entries()) {
        const commentPath = `${cardPath}.comments[${commentIndex}]`;
        takeId(comment, commentPath);
        string(comment.text, `${commentPath}.text`, true);
        string(comment.createdAt, `${commentPath}.createdAt`, true);
        const time = new Date(comment.createdAt);
        if (!Number.isFinite(time.getTime()) || time.toISOString() !== comment.createdAt) {
          throw new Error(`${commentPath}.createdAt must be a canonical ISO timestamp.`);
        }
      }
      for (const [checklistIndex, checklist] of array(card.checklists, `${cardPath}.checklists`).entries()) {
        const checklistPath = `${cardPath}.checklists[${checklistIndex}]`;
        takeId(checklist, checklistPath);
        string(checklist.title, `${checklistPath}.title`, true);
        for (const [itemIndex, item] of array(checklist.items, `${checklistPath}.items`).entries()) {
          const itemPath = `${checklistPath}.items[${itemIndex}]`;
          takeId(item, itemPath);
          string(item.text, `${itemPath}.text`, true);
          boolean(item.done, `${itemPath}.done`);
        }
      }
    }
  }
  return state;
}

export function createInitialState() {
  const date = (offset) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const card = (id, listId, title, extra = {}) => ({
    id, listId, title, description: '', labels: [], dueDate: '', completed: false,
    archived: false, comments: [], checklists: [], ...extra,
  });
  return {
    version: 1,
    workspaces: [{ id: 'ws-studio', name: 'Studio' }],
    boards: [{
      id: 'board-launch', workspaceId: 'ws-studio', name: 'Product launch', background: 'ocean', starred: true,
      lists: [
        { id: 'list-ideas', name: 'Ideas' },
        { id: 'list-todo', name: 'To do' },
        { id: 'list-progress', name: 'In progress' },
        { id: 'list-done', name: 'Done' },
      ],
      cards: [
        card('card-research', 'list-ideas', 'Collect inspiration for our next chapter', { labels: ['purple'], description: 'A space for the ideas that will shape what comes next. Add notes, links, or a checklist.' }),
        card('card-feedback', 'list-ideas', 'What are our customers telling us?', { labels: ['blue'] }),
        card('card-story', 'list-todo', 'Write the launch story', { labels: ['green'], dueDate: date(3), description: 'Bring the new product to life with a clear story about who it helps and why it matters.' }),
        card('card-assets', 'list-todo', 'Prepare social media assets', { labels: ['orange'], dueDate: date(5) }),
        card('card-design', 'list-progress', 'Design the landing page', { labels: ['purple', 'blue'], dueDate: date(2), checklists: [{ id: 'checklist-design', title: 'Design checklist', items: [
          { id: 'item-wireframes', text: 'Explore wireframes', done: true },
          { id: 'item-visual', text: 'Create the visual direction', done: true },
          { id: 'item-review', text: 'Review with the team', done: false },
        ] }], comments: [{ id: 'comment-design', text: 'The first direction is ready for a closer look.', createdAt: new Date().toISOString() }] }),
        card('card-prototype', 'list-progress', 'Build an interactive prototype', { labels: ['yellow'] }),
        card('card-kickoff', 'list-done', 'Kick off the project', { labels: ['green'], completed: true, description: 'We are all aligned on the vision. Time to make it happen.' }),
      ],
    }],
  };
}
