const REQUEST_FILTER_ORDER = ['All', 'Query', 'Body', 'Path', 'Auth', 'Variables', 'Cookies', 'Headers'];

const reorderRequestFilterTabs = () => {
  document.querySelectorAll('[role="tablist"].filter-hover').forEach((tablist) => {
    const container = tablist.firstElementChild;
    if (!container) return;

    const tabs = [...container.querySelectorAll('button[role="tab"]')];
    if (tabs.length < 2) return;

    const sortedTabs = [...tabs].sort((left, right) => {
      const leftLabel = left.textContent.trim();
      const rightLabel = right.textContent.trim();
      const leftIndex = REQUEST_FILTER_ORDER.indexOf(leftLabel);
      const rightIndex = REQUEST_FILTER_ORDER.indexOf(rightLabel);
      const leftOrder = leftIndex === -1 ? REQUEST_FILTER_ORDER.length + tabs.indexOf(left) : leftIndex;
      const rightOrder = rightIndex === -1 ? REQUEST_FILTER_ORDER.length + tabs.indexOf(right) : rightIndex;

      return leftOrder - rightOrder;
    });

    const currentOrder = tabs.map((tab) => tab.textContent.trim()).join('|');
    const nextOrder = sortedTabs.map((tab) => tab.textContent.trim()).join('|');

    if (currentOrder === nextOrder) return;

    sortedTabs.forEach((tab) => container.appendChild(tab));
  });
};

const setupRequestFilterTabOrder = () => {
  reorderRequestFilterTabs();

  const observer = new MutationObserver(() => {
    reorderRequestFilterTabs();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

export const createScalarConfig = (pageTitle) => ({
  theme: 'purple',
  persistAuth: true,
  pageTitle,
  onLoaded: () => {
    setupRequestFilterTabOrder();
  },
});
