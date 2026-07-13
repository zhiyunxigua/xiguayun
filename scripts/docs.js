(function () {
    'use strict';

    const DOCS_DIRECTORY = 'docs/';
    const DOCUMENT_INDEX_URL = 'docs/index.json';
    const GITHUB_TREE_URL = 'https://api.github.com/repos/zhiyunxigua/xiguayun/git/trees/master?recursive=1';
    const FALLBACK_DOCUMENTS = ['docs/thepit.md', 'docs/守护进程设计.md'];

    const listView = document.getElementById('document-list-view');
    const readerView = document.getElementById('document-reader-view');
    const documentList = document.getElementById('document-list');
    const markdownContent = document.getElementById('markdown-content');
    const documentPath = document.getElementById('document-path');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const backButton = document.getElementById('back-button');
    const siteHeader = document.querySelector('.site-header');

    init();

    async function init() {
        configureBackButton();

        const requestedDocument = getRequestedDocument();
        if (requestedDocument) {
            await renderDocument(requestedDocument);
        } else if (readerView.hidden) {
            await renderDocumentList();
        }

        renderIcons();
    }

    function configureBackButton() {
        const listUrl = new URL(window.location.href);
        listUrl.search = '';
        listUrl.hash = '';
        backButton.href = listUrl.href;
    }

    function getRequestedDocument() {
        const path = new URLSearchParams(window.location.search).get('doc');
        if (!path) {
            return '';
        }

        const normalizedPath = normalizeDocumentPath(path);
        if (!normalizedPath) {
            showReaderError('文档地址无效，只能读取 docs 目录中的 Markdown 文件。');
            return '';
        }

        return normalizedPath;
    }

    function normalizeDocumentPath(path) {
        const normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '');
        const segments = normalizedPath.split('/');
        const isMarkdown = /\.md$/i.test(normalizedPath);
        const isInsideDocs = normalizedPath.startsWith(DOCS_DIRECTORY);
        const isSafePath = !segments.includes('..') && !segments.includes('.');

        return isMarkdown && isInsideDocs && isSafePath ? normalizedPath : '';
    }

    async function renderDocumentList() {
        document.body.classList.remove('reader-page');
        siteHeader.hidden = false;
        listView.hidden = false;
        readerView.hidden = true;

        const documents = await discoverDocuments();

        if (documents.length === 0) {
            documentList.innerHTML = '<div class="status-message">docs 目录中暂无 Markdown 文档。</div>';
            return;
        }

        documentList.innerHTML = '';
        for (const path of documents) {
            const link = document.createElement('a');
            const url = new URL(window.location.href);
            url.search = new URLSearchParams({ doc: path }).toString();
            url.hash = '';

            link.className = 'button document-button';
            link.href = url.href;
            link.title = path;

            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'file-text');
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.textContent = getDocumentLabel(path);

            link.append(icon, label);
            documentList.appendChild(link);
        }
    }

    async function discoverDocuments() {
        const isLocalServer = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        const scanners = isLocalServer
            ? [scanDocumentIndex, scanLocalDirectory, scanGitHubRepository]
            : [scanDocumentIndex, scanGitHubRepository];
        const results = await Promise.allSettled(scanners.map((scan) => scan()));
        const documents = results.flatMap((result) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }

            console.warn(`文档扫描失败：${result.reason.message}`);
            return [];
        });

        return sortDocuments(documents.length > 0 ? documents : FALLBACK_DOCUMENTS);
    }

    async function scanDocumentIndex() {
        const response = await fetch(DOCUMENT_INDEX_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`文档索引读取失败 (HTTP ${response.status})`);
        }

        const result = await response.json();
        if (!Array.isArray(result)) {
            throw new Error('文档索引格式无效');
        }

        return result.map(normalizeDocumentPath).filter(Boolean);
    }

    async function scanGitHubRepository() {
        const response = await fetch(GITHUB_TREE_URL, {
            headers: { Accept: 'application/vnd.github+json' }
        });

        if (!response.ok) {
            throw new Error(`GitHub 仓库扫描失败 (HTTP ${response.status})`);
        }

        const result = await response.json();
        if (!Array.isArray(result.tree)) {
            throw new Error('GitHub 仓库返回了无效的目录数据');
        }

        return result.tree
            .filter((item) => item.type === 'blob')
            .map((item) => normalizeDocumentPath(item.path))
            .filter(Boolean);
    }

    async function scanLocalDirectory() {
        const documents = [];
        const visitedDirectories = new Set();
        await scanDirectoryIndex(new URL(DOCS_DIRECTORY, window.location.href), documents, visitedDirectories);
        return documents;
    }

    async function scanDirectoryIndex(directoryUrl, documents, visitedDirectories) {
        const directoryKey = directoryUrl.href;
        if (visitedDirectories.has(directoryKey)) {
            return;
        }
        visitedDirectories.add(directoryKey);

        const response = await fetch(directoryUrl, { cache: 'no-store' });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('text/html')) {
            throw new Error(`本地目录扫描失败 (HTTP ${response.status})`);
        }

        const html = await response.text();
        const directoryDocument = new DOMParser().parseFromString(html, 'text/html');
        const links = Array.from(directoryDocument.querySelectorAll('a[href]'));

        for (const link of links) {
            const childUrl = new URL(link.getAttribute('href'), directoryUrl);
            if (childUrl.origin !== window.location.origin || !childUrl.pathname.startsWith(directoryUrl.pathname)) {
                continue;
            }

            if (childUrl.pathname.endsWith('/')) {
                await scanDirectoryIndex(childUrl, documents, visitedDirectories);
                continue;
            }

            if (/\.md$/i.test(childUrl.pathname)) {
                const relativePath = decodeUrlPath(childUrl.pathname)
                    .replace(/^\//, '')
                    .replace(/^.*?docs\//, DOCS_DIRECTORY);
                const normalizedPath = normalizeDocumentPath(relativePath);
                if (normalizedPath) {
                    documents.push(normalizedPath);
                }
            }
        }
    }

    function sortDocuments(documents) {
        return [...new Set(documents)].sort((left, right) =>
            left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
        );
    }

    function getDocumentLabel(path) {
        const fileName = path.split('/').pop().replace(/\.md$/i, '');
        return fileName.replace(/[-_]+/g, ' ');
    }

    async function renderDocument(path) {
        document.body.classList.add('reader-page');
        siteHeader.hidden = true;
        listView.hidden = true;
        readerView.hidden = false;
        documentPath.textContent = path;
        pageTitle.textContent = getDocumentLabel(path);
        pageSubtitle.textContent = 'Markdown 文档';
        document.title = `${getDocumentLabel(path)} - 文档`;

        try {
            ensureRendererAvailable();

            const response = await fetch(encodeDocumentUrl(path));
            if (!response.ok) {
                throw new Error(`无法获取文档 (HTTP ${response.status})`);
            }

            const markdown = await response.text();
            const renderedHtml = window.marked.parse(markdown, {
                gfm: true,
                breaks: true
            });

            markdownContent.innerHTML = window.DOMPurify.sanitize(renderedHtml);
            prepareRenderedDocument(path);
            scrollToInitialAnchor();
        } catch (error) {
            showReaderError(error.message);
        }
    }

    function ensureRendererAvailable() {
        if (!window.marked || !window.DOMPurify) {
            throw new Error('Markdown 渲染组件加载失败，请检查网络后刷新页面。');
        }
    }

    function encodeDocumentUrl(path) {
        return path.split('/').map(encodeURIComponent).join('/');
    }

    function decodeUrlPath(path) {
        try {
            return decodeURIComponent(path);
        } catch (error) {
            return path;
        }
    }

    function prepareRenderedDocument(path) {
        assignHeadingIds();
        resolveDocumentResources(path);

        if (window.hljs) {
            markdownContent.querySelectorAll('pre code').forEach((block) => {
                window.hljs.highlightElement(block);
            });
        }

        const firstHeading = markdownContent.querySelector('h1');
        if (firstHeading && firstHeading.textContent.trim()) {
            const title = firstHeading.textContent.trim();
            pageTitle.textContent = title;
            document.title = `${title} - 文档`;
        }
    }

    function assignHeadingIds() {
        const usedIds = new Map();

        markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
            const baseId = createSlug(heading.textContent) || 'section';
            const count = usedIds.get(baseId) || 0;
            usedIds.set(baseId, count + 1);
            heading.id = count === 0 ? baseId : `${baseId}-${count}`;
        });
    }

    function createSlug(value) {
        return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u3400-\u9fff\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }

    function resolveDocumentResources(path) {
        const documentUrl = new URL(encodeDocumentUrl(path), window.location.href);

        markdownContent.querySelectorAll('img[src]').forEach((image) => {
            const source = image.getAttribute('src');
            if (isRelativeUrl(source)) {
                image.src = new URL(source, documentUrl).href;
            }
            image.loading = 'lazy';
        });

        markdownContent.querySelectorAll('a[href]').forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#')) {
                return;
            }

            if (isRelativeUrl(href)) {
                const targetUrl = new URL(href, documentUrl);
                const targetPath = decodeUrlPath(targetUrl.pathname)
                    .replace(/^\//, '')
                    .replace(/^.*?docs\//, DOCS_DIRECTORY);
                const normalizedPath = normalizeDocumentPath(targetPath);

                if (normalizedPath) {
                    const readerUrl = new URL(window.location.href);
                    readerUrl.search = new URLSearchParams({ doc: normalizedPath }).toString();
                    readerUrl.hash = targetUrl.hash;
                    link.href = readerUrl.href;
                } else {
                    link.href = targetUrl.href;
                }
            }

            if (/^https?:\/\//i.test(link.href) && new URL(link.href).origin !== window.location.origin) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        });
    }

    function isRelativeUrl(value) {
        return value && !/^(?:[a-z]+:|\/|#)/i.test(value);
    }

    function scrollToInitialAnchor() {
        if (!window.location.hash) {
            return;
        }

        requestAnimationFrame(() => {
            const id = decodeURIComponent(window.location.hash.slice(1));
            const target = document.getElementById(id);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    function showReaderError(message) {
        document.body.classList.add('reader-page');
        siteHeader.hidden = true;
        listView.hidden = true;
        readerView.hidden = false;
        markdownContent.innerHTML = '';

        const error = document.createElement('div');
        error.className = 'status-message error-message';
        error.textContent = `文档加载失败：${message}`;
        markdownContent.appendChild(error);
    }

    function renderIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}());
