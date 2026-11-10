// ==UserScript==
// @name         GitHub Top repositories 自定义
// @namespace    https://github.com/mojie126/GitHubTopRepositoriesCustom
// @version      2.5.2
// @description  自定义 GitHub 首页左侧 Top repositories 的仓库和排序，并支持搜索
// @author       mojie126
// @match        https://github.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const REPOSITORIES_KEY = 'github-top-repositories-v2';
  const LEGACY_REPOSITORIES_KEY = 'github-top-repositories-v1';
  const INITIALIZED_KEY = 'github-top-repositories-initialized-v2';
  const LEGACY_INITIALIZED_KEY = 'github-top-repositories-initialized-v1';
  const SEARCH_KEY = 'github-top-repositories-search-v2';
  const ROW_TEMPLATES_KEY = 'github-top-repositories-row-templates-v1';
  const SEARCH_SELECTOR = 'input[placeholder*="Find a repository" i], input[aria-label*="Find a repository" i]';
  const NATIVE_LIST_SELECTOR = 'ul.js-dashboard-repos-list';
  const NATIVE_ROW_SELECTOR = 'ul.js-dashboard-repos-list > li';
  const REPOSITORY_LINK_SELECTOR = 'a[data-hovercard-type="repository"][href], a[data-hydro-click*="repository"][href]';
  const STYLE_ID = 'gh-top-repositories-v2-style';
  const CARD_ATTRIBUTE = 'data-gh-top-repositories-card';
  const EDITOR_ATTRIBUTE = 'data-gh-top-repositories-editor';
  const ACTIONS_ATTRIBUTE = 'data-gh-top-repositories-actions';
  const SEARCH_WRAPPER_ATTRIBUTE = 'data-gh-top-repositories-search-wrapper';
  const SEARCH_CLEAR_ATTRIBUTE = 'data-gh-top-repositories-search-clear';
  const DROP_INDICATOR_ATTRIBUTE = 'data-gh-top-repositories-drop-indicator';
  const DROP_MARKER_ATTRIBUTE = 'data-gh-top-repositories-drop-marker';
  const VISIBLE_LIMIT = 7;
  let repositoryState = null;
  let lastRepositorySignature = '';
  const nativeRowCache = new Map();
  const RESERVED_OWNERS = new Set([
    'about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'customer-stories',
    'dashboard', 'enterprise', 'events', 'explore', 'features', 'issues', 'join', 'login',
    'marketplace', 'new', 'notifications', 'organizations', 'orgs', 'pricing', 'pulls',
    'search', 'security', 'settings', 'site', 'sponsors', 'topics', 'trending', 'users',
  ]);

  /**
   * @brief 规范化仓库地址为 owner/name
   * @param input 用户输入的仓库地址或 owner/name
   * @return 规范化结果，格式无效时返回 null
   */
  function normalizeRepository(input) {
    const value = String(input || '').trim();
    if (!value) {
      return null;
    }
    let path = value;
    if (/^(?:www\.)?github\.com\//i.test(path)) {
      path = `https://${path}`;
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
      try {
        const url = new URL(path);
        if (!/(^|\.)github\.com$/i.test(url.hostname)) {
          return null;
        }
        path = url.pathname;
      } catch {
        return null;
      }
    }
    const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    const owner = segments[0];
    const name = segments[1].replace(/\.git$/i, '');
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)
      || !/^[a-z\d._-]+$/i.test(name)
      || RESERVED_OWNERS.has(owner.toLowerCase())) {
      return null;
    }
    return `${owner}/${name}`;
  }

  /**
   * @brief 读取持久化仓库列表
   * @param key 存储键
   * @return 去重后的仓库列表
   */
  function readRepositoryList(key) {
    let stored;
    try {
      stored = GM_getValue(key, []);
    } catch {
      return [];
    }
    if (!Array.isArray(stored)) {
      return [];
    }
    const result = [];
    for (const value of stored) {
      const repository = normalizeRepository(value);
      if (repository && !result.includes(repository)) {
        result.push(repository);
      }
    }
    return result;
  }

  /**
   * @brief 读取新版仓库列表，并迁移旧版配置
   * @return 仓库列表
   */
  function loadRepositories() {
    const storedRepositories = readRepositoryList(REPOSITORIES_KEY);
    const storedSignature = JSON.stringify(storedRepositories);
    if (repositoryState && storedSignature === lastRepositorySignature) {
      return repositoryState.slice();
    }
    repositoryState = storedRepositories.slice();
    lastRepositorySignature = storedSignature;
    if (storedRepositories.length) {
      return storedRepositories;
    }
    if (isInitialized()) {
      repositoryState = [];
      return [];
    }
    const legacyRepositories = readRepositoryList(LEGACY_REPOSITORIES_KEY);
    if (legacyRepositories.length) {
      repositoryState = legacyRepositories.slice();
      lastRepositorySignature = JSON.stringify(repositoryState);
      saveRepositories(legacyRepositories);
    }
    return legacyRepositories;
  }

  /**
   * @brief 保存仓库列表
   * @param repositories 仓库列表
   */
  function saveRepositories(repositories) {
    repositoryState = repositories.slice();
    lastRepositorySignature = JSON.stringify(repositoryState);
    try {
      GM_setValue(REPOSITORIES_KEY, repositories);
    } catch (error) {
      console.warn('[GitHub Top repositories] Failed to save repositories:', error);
    }
  }

  /**
   * @brief 保存首次初始化状态
   */
  function markInitialized() {
    try {
      GM_setValue(INITIALIZED_KEY, true);
    } catch {
      // 初始化状态无法保存时保留仓库数据
    }
  }

  /**
   * @brief 判断是否已完成首次初始化
   * @return 初始化状态
   */
  function isInitialized() {
    try {
      return Boolean(GM_getValue(INITIALIZED_KEY, false));
    } catch {
      return false;
    }
  }

  /**
   * @brief 判断旧版是否已完成首次初始化
   * @return 旧版初始化状态
   */
  function isLegacyInitialized() {
    try {
      return Boolean(GM_getValue(LEGACY_INITIALIZED_KEY, false));
    } catch {
      return false;
    }
  }

  /**
   * @brief 读取搜索条件
   * @return 搜索条件
   */
  function loadSearchQuery() {
    try {
      return String(GM_getValue(SEARCH_KEY, '') || '').trim();
    } catch {
      return '';
    }
  }

  /**
   * @brief 保存搜索条件
   * @param query 搜索条件
   */
  function saveSearchQuery(query) {
    try {
      GM_setValue(SEARCH_KEY, String(query || '').trim());
    } catch {
      // 搜索条件无法保存时保留当前界面状态
    }
  }

  /**
   * @brief 读取缓存的仓库行模板
   * @return 仓库全名到行模板的映射
   */
  function loadRowTemplates() {
    try {
      const stored = GM_getValue(ROW_TEMPLATES_KEY, {});
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch {
      return {};
    }
  }

  /**
   * @brief 保存缓存的仓库行模板
   * @param templates 仓库全名到行模板的映射
   */
  function saveRowTemplates(templates) {
    try {
      GM_setValue(ROW_TEMPLATES_KEY, templates);
    } catch {
      // 行模板无法保存时仍使用完整回退行
    }
  }

  /**
   * @brief 创建界面元素
   * @param tag 标签名称
   * @param className 类名
   * @param text 文本内容
   * @return 元素
   */
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  /**
   * @brief 查找 Top repositories 卡片
   * @return 卡片元素
   */
  function findRepositoryCard() {
    const titles = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    for (const title of titles) {
      if (!/^top repositories$/i.test((title.textContent || '').trim())) {
        continue;
      }
      let card = title.closest('[role="navigation"]') || title.parentElement;
      while (card && card !== document.body) {
        if (card.querySelector(SEARCH_SELECTOR)) {
          return card;
        }
        card = card.parentElement;
      }
    }
    return null;
  }

  /**
   * @brief 从 GitHub 原生链接读取仓库
   * @param card 卡片元素
   * @return 仓库列表
   */
  function readNativeRepositories(card) {
    const result = [];
    const links = card.querySelectorAll('a[href]');
    for (const link of links) {
      if (link.getAttribute('data-hovercard-type') !== 'repository') {
        continue;
      }
      const repository = normalizeRepository(link.getAttribute('href') || '');
      if (repository && !result.includes(repository)) {
        result.push(repository);
      }
    }
    return result;
  }

  /**
   * @brief 注入界面样式
   */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .js-header-wrapper {
        position: sticky !important;
        top: 0 !important;
        z-index: 999 !important;
      }
      aside.feed-left-sidebar {
        position: sticky !important;
        top: 64px !important;
        align-self: flex-start !important;
        height: calc(100vh - 64px) !important;
        overflow: hidden !important;
      }
      aside.feed-left-sidebar .dashboard-sidebar,
      aside.feed-left-sidebar .js-left-column-scroll-container {
        height: 100% !important;
      }
      [${CARD_ATTRIBUTE}="true"] ${SEARCH_SELECTOR} {
        width: 100%;
      }
      [${SEARCH_WRAPPER_ATTRIBUTE}] {
        position: relative;
      }
      [${SEARCH_WRAPPER_ATTRIBUTE}] ${SEARCH_SELECTOR} {
        padding-right: 34px;
      }
      [${SEARCH_CLEAR_ATTRIBUTE}] {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        display: none;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--fgColor-muted, #8c959f);
        font: inherit;
        font-size: 17px;
        line-height: 1;
        cursor: pointer;
      }
      [${SEARCH_WRAPPER_ATTRIBUTE}][data-has-query="true"] [${SEARCH_CLEAR_ATTRIBUTE}] {
        display: inline-flex;
      }
      [${SEARCH_CLEAR_ATTRIBUTE}]:hover {
        color: var(--fgColor-default, #e6edf3);
        background: var(--button-default-bgColor-hover, #30363d);
      }
      [${EDITOR_ATTRIBUTE}] {
        display: none;
        width: auto;
        max-width: 100%;
        box-sizing: border-box;
        margin: 10px 0 4px;
        padding: 9px;
        border: 1px solid var(--borderColor-default, #30363d);
        border-radius: 8px;
        background: var(--bgColor-muted, #161b22);
      }
      [${EDITOR_ATTRIBUTE}][data-open="true"] {
        display: block;
      }
      [${EDITOR_ATTRIBUTE}] .gh-trc-editor-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 6px;
      }
      [${EDITOR_ATTRIBUTE}] .gh-trc-editor-row > button {
        flex: none;
        white-space: nowrap;
      }
      [${EDITOR_ATTRIBUTE}] input {
        min-width: 0;
        width: 100%;
        flex: 1;
        padding: 5px 8px;
        border: 1px solid var(--borderColor-default, #30363d);
        border-radius: 6px;
        background: var(--bgColor-default, #0d1117);
        color: var(--fgColor-default, #e6edf3);
        font: inherit;
        text-overflow: ellipsis;
      }
      [${EDITOR_ATTRIBUTE}] button {
        min-height: 28px;
        padding: 3px 9px;
        border: 1px solid var(--borderColor-default, #30363d);
        border-radius: 6px;
        background: var(--button-default-bgColor-rest, #21262d);
        color: var(--fgColor-default, #e6edf3);
        font: inherit;
        cursor: pointer;
      }
      [${EDITOR_ATTRIBUTE}] button:hover {
        background: var(--button-default-bgColor-hover, #30363d);
      }
      [${EDITOR_ATTRIBUTE}] .gh-trc-editor-error {
        margin-top: 5px;
        color: var(--fgColor-danger, #f85149);
        font-size: 12px;
      }
      [${EDITOR_ATTRIBUTE}] .gh-trc-editor-error:empty {
        display: none;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-list] {
        display: block;
        margin: 0;
        padding: 0;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-item] {
        position: relative;
        display: list-item;
        min-width: 0;
        padding: 0 28px 0 13px;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-item] .gh-trc-drag {
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        height: 28px;
        cursor: grab;
        color: var(--fgColor-muted, #8c959f);
        font-size: 12px;
        user-select: none;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-item] > .gh-trc-link {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 3px 2px;
        color: var(--fgColor-default, #e6edf3);
        text-decoration: none;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-item] > .gh-trc-link:hover {
        text-decoration: underline;
      }
      [${CARD_ATTRIBUTE}="true"] .gh-trc-icon {
        flex: 0 0 20px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
      }
      [${CARD_ATTRIBUTE}="true"] .gh-trc-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-remove] {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--fgColor-muted, #8c959f);
        font: inherit;
        font-size: 17px;
        line-height: 1;
        cursor: pointer;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-remove]:hover {
        color: var(--fgColor-danger, #f85149);
        background: var(--button-danger-bgColor-hover, rgba(248, 81, 73, 0.15));
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-actions] {
        display: block;
        margin-top: 0;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-actions] > button {
        margin-right: 6px;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-actions] button {
        min-height: 26px;
        padding: 2px 8px;
        border: 1px solid var(--borderColor-default, #30363d);
        border-radius: 6px;
        background: transparent;
        color: var(--fgColor-muted, #8c959f);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-add] {
        flex: none;
        margin-left: auto;
        margin-right: 6px;
        min-height: 26px;
        padding: 2px 8px;
        border: 1px solid var(--borderColor-default, #30363d);
        border-radius: 6px;
        background: transparent;
        color: var(--fgColor-muted, #8c959f);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-add]:hover {
        color: var(--fgColor-default, #e6edf3);
        background: var(--button-default-bgColor-hover, #30363d);
      }
      [${CARD_ATTRIBUTE}="true"] [data-gh-top-repositories-actions] button:hover {
        color: var(--fgColor-default, #e6edf3);
        background: var(--button-default-bgColor-hover, #30363d);
      }
      [${CARD_ATTRIBUTE}="true"] .gh-trc-empty {
        padding: 8px 0;
        color: var(--fgColor-muted, #8c959f);
        font-size: 12px;
      }
      [${CARD_ATTRIBUTE}="true"] .gh-trc-dragging {
        opacity: 0.45;
      }
      [${DROP_MARKER_ATTRIBUTE}="true"] {
        background: rgba(56, 139, 253, 0.12) !important;
        box-shadow: 0 2px 0 0 #388bfd, 0 -2px 0 0 #388bfd !important;
      }
      [${CARD_ATTRIBUTE}="true"] [${DROP_INDICATOR_ATTRIBUTE}] {
        position: absolute;
        z-index: 20;
        top: 0;
        left: 0;
        display: none;
        padding: 5px 10px;
        border: 1px solid #388bfd;
        border-radius: 8px;
        background: var(--bgColor-muted, #161b22);
        color: var(--fgColor-default, #e6edf3);
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 8px 24px rgba(1, 4, 9, 0.35);
      }
      [${DROP_INDICATOR_ATTRIBUTE}][data-visible="true"] {
        display: block;
      }
      [${DROP_INDICATOR_ATTRIBUTE}] strong {
        color: #58a6ff;
      }
    `;
    document.documentElement.appendChild(style);
  }

  /**
   * @brief 创建仓库链接，保留 GitHub 悬停浮层属性
   * @param repository 仓库全名
   * @return 链接元素
   */
  function createRepositoryLink(repository) {
    const link = createElement('a', 'gh-trc-link');
    link.href = `/${repository}`;
    link.dataset.hovercardType = 'repository';
    link.dataset.hovercardUrl = `https://github.com/${repository}/hovercard`;
    link.setAttribute('data-hovercard-type', 'repository');
    link.setAttribute('data-hovercard-url', `/${repository}/hovercard`);
    link.setAttribute('data-turbo', 'false');
    const image = createElement('img', 'avatar avatar-user avatar-small circle');
    image.src = `https://avatars.githubusercontent.com/${repository.split('/')[0]}?s=16&v=4`;
    image.alt = '';
    image.width = 16;
    image.height = 16;
    image.setAttribute('aria-label', 'Repository');
    image.alt = repository.split('/')[1];
    link.append(image);
    return link;
  }

  /**
   * @brief 创建可排序仓库条目
   * @param repository 仓库全名
   * @return 条目元素
   */
  function createRepositoryItem(repository) {
    let source = nativeRowCache.get(repository);
    if (!source) {
      const template = loadRowTemplates()[repository];
      if (typeof template === 'string') {
        const parser = new DOMParser();
        const parsed = parser.parseFromString(template, 'text/html');
        const parsedRow = parsed.body.firstElementChild;
        if (parsedRow instanceof HTMLElement) {
          source = parsedRow;
          nativeRowCache.set(repository, source);
        } else {
          source = null;
        }
      }
    }
    if (!source) {
      source = nativeRowCache.values().next().value;
    }
    const item = source ? source.cloneNode(true) : createElement('li', 'public source');
    if (!source) {
      item.append(createElement('div', 'width-full d-flex mt-2'));
    }
    item.draggable = true;
    item.dataset.ghTopRepositoriesItem = repository;
    item.dataset.repository = repository;
    let body = item.querySelector(':scope > div');
    if (!body) {
      body = createElement('div', 'width-full d-flex mt-2');
      item.append(body);
    }
    const drag = createElement('span', 'gh-trc-drag', '⠿');
    drag.setAttribute('aria-hidden', 'true');
    item.prepend(drag);
    if (!source) {
      body.append(createRepositoryLink(repository));
      const titleContainer = createElement('div', 'wb-break-word');
      const title = createElement('a', 'color-fg-default lh-0 mb-2 markdown-title');
      title.href = `/${repository}`;
      title.setAttribute('data-hovercard-type', 'repository');
      title.setAttribute('data-hovercard-url', `/${repository}/hovercard`);
      const [owner, name] = repository.split('/');
      title.append(document.createTextNode(owner));
      title.append(createElement('span', 'color-fg-muted', '/'));
      title.append(document.createTextNode(name));
      titleContainer.append(title);
      body.append(titleContainer);
    } else {
      for (const link of item.querySelectorAll('a[data-hovercard-type="repository"][href]')) {
        link.href = `/${repository}`;
        link.setAttribute('data-hovercard-url', `/${repository}/hovercard`);
      }
      const image = item.querySelector('img');
      if (image) {
        image.src = `https://avatars.githubusercontent.com/${repository.split('/')[0]}?s=16&v=4`;
        image.alt = repository.split('/')[1];
      }
      const textLinks = [...item.querySelectorAll('a[data-hovercard-type="repository"][href]')];
      const title = textLinks.find((link) => link.textContent.trim());
      if (title) {
        const [owner, name] = repository.split('/');
        title.replaceChildren(document.createTextNode(owner), createElement('span', 'color-fg-muted', '/'), document.createTextNode(name));
      }
    }
    const remove = createElement('button', '', '×');
    remove.type = 'button';
    remove.dataset.ghTopRepositoriesRemove = repository;
    remove.setAttribute('aria-label', `删除 ${repository}`);
    item.append(remove);
    return item;
  }

  /**
   * @brief 创建添加仓库编辑器
   * @return 编辑器元素
   */
  function createEditor() {
    const editor = createElement('form');
    editor.setAttribute(EDITOR_ATTRIBUTE, '');
    editor.dataset.open = 'false';
    const row = createElement('div', 'gh-trc-editor-row');
    const input = createElement('input');
    input.type = 'text';
    input.placeholder = '仓库全名或 GitHub 地址';
    input.setAttribute('aria-label', '仓库地址');
    const submit = createElement('button', '', '加入');
    submit.type = 'submit';
    const cancel = createElement('button', '', '取消');
    cancel.type = 'button';
    cancel.dataset.ghTopRepositoriesCancel = 'true';
    const error = createElement('div', 'gh-trc-editor-error');
    row.append(input, submit, cancel);
    editor.append(row, error);
    editor.addEventListener('submit', (event) => {
      event.preventDefault();
      const repository = normalizeRepository(input.value);
      if (!repository) {
        error.textContent = '请输入有效的 owner/repository 或 GitHub 仓库地址';
        input.focus();
        return;
      }
      const repositories = loadRepositories().slice();
      if (repositories.includes(repository)) {
        error.textContent = '该仓库已在自定义列表中';
        input.select();
        return;
      }
      repositories.push(repository);
      saveRepositories(repositories);
      input.value = '';
      error.textContent = '';
      editor.dataset.open = 'false';
      renderCard(document.querySelector(`[${CARD_ATTRIBUTE}="true"]`));
    });
    cancel.addEventListener('click', () => {
      editor.dataset.open = 'false';
      error.textContent = '';
    });
    return editor;
  }

  /**
   * @brief 渲染卡片仓库和管理按钮
   * @param card 卡片元素
   */
  function renderCard(card) {
    if (!card) {
      return;
    }
    const list = card.querySelector('[data-gh-top-repositories-list]');
    if (!list) {
      return;
    }
    const search = card.querySelector('#dashboard-repos-filter-left')
      || card.querySelector(SEARCH_SELECTOR);
    const query = String(search?.value || loadSearchQuery()).trim().toLowerCase();
    const repositories = loadRepositories();
    const nativeList = card.querySelector(`${NATIVE_LIST_SELECTOR}:not([data-gh-top-repositories-list])`);
    if (nativeList) {
      nativeList.hidden = true;
      const templates = loadRowTemplates();
      let templatesChanged = false;
      for (const row of nativeList.querySelectorAll('li')) {
        const link = row.querySelector('a[data-hovercard-type="repository"][href]');
        const repository = normalizeRepository(link?.getAttribute('href') || '');
        if (repository && !nativeRowCache.has(repository)) {
          nativeRowCache.set(repository, row.cloneNode(true));
          templates[repository] = row.outerHTML;
          templatesChanged = true;
        }
      }
      if (templatesChanged) {
        saveRowTemplates(templates);
      }
    }
    const expanded = true;
    const activeQuery = repositories.length ? query : '';
    let visible = activeQuery
      ? repositories.filter((repository) => repository.toLowerCase().includes(query))
      : repositories;
    if (!expanded && !activeQuery) {
      visible = visible.slice(0, VISIBLE_LIMIT);
    }
    const renderSignature = `${expanded}|${activeQuery}|${visible.join('|')}`;
    if (card.dataset.ghTopRepositoriesRenderSignature === renderSignature
      && list.querySelector('[data-gh-top-repositories-item], .gh-trc-empty')) {
      return;
    }
    card.dataset.ghTopRepositoriesRenderSignature = renderSignature;
    list.replaceChildren();
    if (!visible.length) {
      list.append(createElement('div', 'gh-trc-empty',
        repositories.length ? '没有匹配的仓库' : '尚未添加仓库，点击“添加仓库”开始设置'));
    } else {
      for (const repository of visible) {
        list.append(createRepositoryItem(repository));
      }
    }
    card.querySelectorAll('form.js-more-repos-form').forEach((form) => {
      form.hidden = true;
      form.style.display = 'none';
    });
  }

  /**
   * @brief 处理卡片内的点击操作
   * @param event 点击事件
   */
  function handleCardClick(event) {
    if (event.target.closest('form.js-more-repos-form')) {
      return;
    }
    const button = event.target.closest('button');
    if (!button || !button.closest(`[${CARD_ATTRIBUTE}="true"]`)) {
      return;
    }
    event.stopPropagation();
    const card = button.closest(`[${CARD_ATTRIBUTE}="true"]`);
    if (button.matches('[data-gh-top-repositories-add]')) {
      const editor = card.querySelector(`[${EDITOR_ATTRIBUTE}]`);
      editor.dataset.open = 'true';
      delete card.dataset.ghTopRepositoriesRenderSignature;
      const input = editor.querySelector('input');
      input.value = '';
      input.focus();
      return;
    }
    if (button.matches('[data-gh-top-repositories-remove]')) {
      event.preventDefault();
      const repository = button.dataset.ghTopRepositoriesRemove;
      if (!window.confirm(`确定从自定义列表删除 ${repository} 吗？`)) {
        return;
      }
      const repositories = loadRepositories().filter((value) => value !== repository);
      saveRepositories(repositories);
      renderCard(card);
      return;
    }
  }

  /**
   * @brief 绑定卡片的搜索和拖拽
   * @param card 卡片元素
   */
  function bindCard(card) {
    function clearDropMarker(list) {
      list.querySelectorAll(`[${DROP_MARKER_ATTRIBUTE}="true"]`).forEach((element) => {
        element.removeAttribute(DROP_MARKER_ATTRIBUTE);
      });
      const indicator = card.querySelector(`[${DROP_INDICATOR_ATTRIBUTE}]`);
      if (indicator) {
        indicator.dataset.visible = 'false';
        indicator.hidden = true;
      }
    }

    function updateDropMarker(list, target) {
      clearDropMarker(list);
      if (!target) {
        return;
      }
      target.setAttribute(DROP_MARKER_ATTRIBUTE, 'true');
      const indicator = card.querySelector(`[${DROP_INDICATOR_ATTRIBUTE}]`);
      if (!indicator) {
        return;
      }
      const items = [...list.querySelectorAll('[data-gh-top-repositories-item]')];
      const position = items.indexOf(target) + 1;
      indicator.replaceChildren(document.createTextNode('放到第 '), createElement('strong', '', String(position)), document.createTextNode(' 位'));
      const cardRect = card.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      indicator.hidden = false;
      indicator.dataset.visible = 'true';
      indicator.style.left = `${Math.max(0, targetRect.left - cardRect.left + 18)}px`;
      indicator.style.top = `${Math.max(0, targetRect.top - cardRect.top + 2)}px`;
    }

    const search = card.querySelector('#dashboard-repos-filter-left')
      || card.querySelector(SEARCH_SELECTOR);
    if (search && !search.parentElement?.hasAttribute(SEARCH_WRAPPER_ATTRIBUTE)) {
      const wrapper = createElement('div');
      wrapper.setAttribute(SEARCH_WRAPPER_ATTRIBUTE, '');
      search.insertAdjacentElement('beforebegin', wrapper);
      wrapper.append(search);
      const clear = createElement('button', '', '×');
      clear.type = 'button';
      clear.setAttribute(SEARCH_CLEAR_ATTRIBUTE, '');
      clear.setAttribute('aria-label', '清空仓库搜索');
      wrapper.append(clear);
    }
    if (search && search.dataset.ghTopRepositoriesSearchBound !== 'true') {
      search.dataset.ghTopRepositoriesSearchBound = 'true';
      const updateClear = () => {
        const wrapper = search.parentElement;
        if (wrapper) {
          wrapper.dataset.hasQuery = search.value ? 'true' : 'false';
        }
      };
      const clearSearch = () => {
        search.value = '';
        saveSearchQuery('');
        updateClear();
        renderCard(card);
      };
      const clearButton = search.parentElement?.querySelector(`[${SEARCH_CLEAR_ATTRIBUTE}]`);
      if (clearButton && clearButton.dataset.ghTopRepositoriesClearBound !== 'true') {
        clearButton.dataset.ghTopRepositoriesClearBound = 'true';
        clearButton.addEventListener('click', () => {
          clearSearch();
          search.focus();
        });
      }
      search.addEventListener('input', () => {
        saveSearchQuery(search.value);
        updateClear();
        renderCard(card);
      });
      search.addEventListener('search', () => {
        saveSearchQuery(search.value);
        updateClear();
        renderCard(card);
      });
      search.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !search.value) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        clearSearch();
        search.blur();
      });
      updateClear();
    }
    const list = card.querySelector('[data-gh-top-repositories-list]');
    if (list && list.dataset.ghTopRepositoriesDragBound !== 'true') {
      list.dataset.ghTopRepositoriesDragBound = 'true';
      if (!card.querySelector(`[${DROP_INDICATOR_ATTRIBUTE}]`)) {
        const indicator = createElement('div');
        indicator.setAttribute(DROP_INDICATOR_ATTRIBUTE, '');
        indicator.hidden = true;
        card.append(indicator);
      }
      list.addEventListener('dragstart', (event) => {
        const item = event.target.closest('[data-gh-top-repositories-item]');
        if (!item) {
          return;
        }
        item.classList.add('gh-trc-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-gh-top-repositories', item.dataset.repository);
      });
      list.addEventListener('dragend', (event) => {
        event.target.closest('[data-gh-top-repositories-item]')?.classList.remove('gh-trc-dragging');
        clearDropMarker(list);
      });
      list.addEventListener('dragover', (event) => {
        const target = event.target.closest('[data-gh-top-repositories-item]');
        if (target) {
          event.preventDefault();
          updateDropMarker(list, target);
        }
      });
      list.addEventListener('dragleave', (event) => {
        if (!list.contains(event.relatedTarget)) {
          clearDropMarker(list);
        }
      });
      list.addEventListener('drop', (event) => {
        const target = event.target.closest('[data-gh-top-repositories-item]');
        if (!target) {
          return;
        }
        event.preventDefault();
        clearDropMarker(list);
        const repositories = loadRepositories().slice();
        const source = event.dataTransfer.getData('application/x-gh-top-repositories');
        const targetRepository = target.dataset.repository;
        const sourceIndex = repositories.indexOf(source);
        const targetIndex = repositories.indexOf(targetRepository);
        if (sourceIndex < 0 || targetIndex < 0 || source === targetRepository) {
          return;
        }
        repositories.splice(sourceIndex, 1);
        repositories.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, source);
        saveRepositories(repositories);
        renderCard(card);
      });
    }
  }

  /**
   * @brief 将 GitHub 卡片接入自定义管理
   * @param card 卡片元素
   */
  function enhanceCard(card) {
    const search = card.querySelector('#dashboard-repos-filter-left')
      || card.querySelector(SEARCH_SELECTOR);
    if (!search) {
      return;
    }
    if (card.dataset.ghTopRepositoriesEnhanced === 'true') {
      if (!card.querySelector('[data-gh-top-repositories-list]')) {
        card.dataset.ghTopRepositoriesEnhanced = 'false';
        delete card.dataset.ghTopRepositoriesRenderSignature;
      } else {
        bindCard(card);
        renderCard(card);
        return;
      }
    }
    const repositories = loadRepositories();
    if (!isInitialized() && !isLegacyInitialized() && !repositories.length) {
      const nativeRepositories = readNativeRepositories(card);
      if (nativeRepositories.length) {
        saveRepositories(nativeRepositories);
        markInitialized();
      }
    } else if (!isInitialized() && isLegacyInitialized()) {
      markInitialized();
    }
    const nativeList = card.querySelector(`${NATIVE_LIST_SELECTOR}:not([data-gh-top-repositories-list])`);
    const templates = loadRowTemplates();
    let templatesChanged = false;
    for (const row of nativeList?.querySelectorAll('li') || []) {
      const link = row.querySelector('a[data-hovercard-type="repository"][href]');
      const repository = normalizeRepository(link?.getAttribute('href') || '');
      if (repository && !nativeRowCache.has(repository)) {
        nativeRowCache.set(repository, row.cloneNode(true));
        templates[repository] = row.outerHTML;
        templatesChanged = true;
      }
    }
    if (templatesChanged) {
      saveRowTemplates(templates);
    }
    let list = card.querySelector('[data-gh-top-repositories-list]');
    if (!list) {
      list = createElement('ul', 'list-style-none js-dashboard-repos-list');
      list.dataset.ghTopRepositoriesList = '';
      list.dataset.filterableFor = 'dashboard-repos-filter-left';
      list.dataset.filterableType = 'substring';
      if (nativeList) {
        nativeList.insertAdjacentElement('afterend', list);
      } else {
        search.insertAdjacentElement('afterend', list);
      }
    }
    if (nativeList) {
      nativeList.hidden = true;
      nativeList.dataset.ghTopRepositoriesNativeList = 'true';
    }
    card.dataset.ghTopRepositoriesEnhanced = 'true';
    card.setAttribute(CARD_ATTRIBUTE, 'true');
    const existingActions = [...card.querySelectorAll(`[${ACTIONS_ATTRIBUTE}]`)];
    const actions = existingActions.shift() || createElement('div');
    for (const duplicate of existingActions) {
      duplicate.remove();
    }
    card.querySelectorAll(`[${EDITOR_ATTRIBUTE}]`).forEach((node) => {
      if (!actions.contains(node)) {
        node.remove();
      }
    });
    card.querySelectorAll('[data-gh-top-repositories-more]').forEach((button) => button.remove());
    actions.setAttribute(ACTIONS_ATTRIBUTE, '');
    const existingAddButtons = [...card.querySelectorAll('[data-gh-top-repositories-add]')];
    const add = existingAddButtons.shift() || createElement('button', '', '添加仓库');
    for (const duplicate of existingAddButtons) {
      duplicate.remove();
    }
    add.type = 'button';
    add.dataset.ghTopRepositoriesAdd = '';
    let editor = actions.querySelector(`[${EDITOR_ATTRIBUTE}]`);
    if (!editor) {
      editor = createEditor();
      actions.append(editor);
    }
    const headingRow = document.getElementById('dashboard-top-repositories-heading')?.closest('div');
    if (headingRow) {
      const nativeButton = headingRow.querySelector('a[href="/new"], a[href^="https://github.com/new"]');
      if (nativeButton) {
        nativeButton.insertAdjacentElement('beforebegin', add);
      } else {
        headingRow.append(add);
      }
      headingRow.insertAdjacentElement('afterend', actions);
    } else {
      if (!actions.contains(add)) {
        actions.prepend(add);
      }
      if (actions.previousElementSibling !== list) {
        list.insertAdjacentElement('afterend', actions);
      }
    }
    bindCard(card);
    renderCard(card);
  }

  /**
   * @brief 扫描并更新 GitHub 卡片
   */
  function scan() {
    const card = findRepositoryCard();
    if (!card) {
      return;
    }
    if (!card.querySelector(`${NATIVE_LIST_SELECTOR}:not([data-gh-top-repositories-list])`)) {
      return;
    }
    injectStyles();
    enhanceCard(card);
  }

  /**
   * @brief 监听页面局部更新
   */
  function observePage() {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  try {
    GM_registerMenuCommand('清空 Top repositories 自定义列表', () => {
      if (window.confirm('确定清空所有自定义仓库吗？')) {
        saveRepositories([]);
        markInitialized();
        scan();
      }
    });
  } catch {
    // 非用户脚本管理器环境不提供菜单命令
  }

  try {
    GM_addValueChangeListener(REPOSITORIES_KEY, (_key, _oldValue, nextValue) => {
      if (Array.isArray(nextValue)) {
        repositoryState = null;
        scan();
      }
    });
  } catch {
    // 脚本管理器不提供值变更监听时仍支持当前页面内的增删
  }

  document.addEventListener('click', handleCardClick);
  window.addEventListener('gh-top-repositories-refresh', scan);
  scan();
  observePage();
  document.addEventListener('turbo:load', scan);
  document.addEventListener('pjax:end', scan);
})();
