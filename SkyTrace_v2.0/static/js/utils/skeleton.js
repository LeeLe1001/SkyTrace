/**
 * SkyTrace v2.0 Sprint 4 — 骨架屏管理
 * 
 * 在数据加载期间显示骨架屏占位，数据到达后自动替换
 */
export function showSkeleton(container, type = 'card', count = 3) {
  container.innerHTML = '';
  const cls = `skeleton skeleton-${type}`;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = cls;
    container.appendChild(el);
  }
  container.setAttribute('data-skeleton', 'true');
}

export function hideSkeleton(container) {
  container.removeAttribute('data-skeleton');
}

/**
 * 异步加载包装器：自动显示/隐藏骨架屏
 */
export async function withSkeleton(container, type, count, asyncFn) {
  showSkeleton(container, type, count);
  try {
    const result = await asyncFn();
    return result;
  } finally {
    container.innerHTML = '';
    container.removeAttribute('data-skeleton');
  }
}

export default { showSkeleton, hideSkeleton, withSkeleton };
