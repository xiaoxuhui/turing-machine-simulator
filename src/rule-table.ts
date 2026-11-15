const virtualThreshold = 500;
const rowHeight = 44;
const overscan = 6;

export function renderRuleRows(host: HTMLElement, header: string, count: number, rowHtml: (index: number) => string): () => void {
  const position = host.scrollTop;
  if (count <= virtualThreshold) {
    host.innerHTML = header + Array.from({ length: count }, (_, index) => rowHtml(index)).join("");
    host.scrollTop = position;
    return () => {};
  }

  host.innerHTML = header + '<div class="rule-table-virtual-body"></div>';
  const body = host.lastElementChild as HTMLElement;
  body.style.height = `${count * rowHeight}px`;
  host.scrollTop = position;
  const mounted = new Map<number, HTMLElement>();
  const template = document.createElement("template");
  const update = () => {
    const firstVisible = Math.floor(host.scrollTop / rowHeight);
    const first = Math.max(0, firstVisible - overscan);
    const end = Math.min(count, firstVisible + Math.ceil(host.clientHeight / rowHeight) + overscan + 1);
    for (const [index, row] of mounted) {
      if ((index < first || index >= end) && !row.contains(document.activeElement)) {
        row.remove();
        mounted.delete(index);
      }
    }
    let next: Element | null = body.firstElementChild;
    for (let index = first; index < end; index++) {
      let row = mounted.get(index);
      while (next && Number((next as HTMLElement).dataset.index) < index) next = next.nextElementSibling;
      if (!row) {
        template.innerHTML = rowHtml(index);
        row = template.content.firstElementChild as HTMLElement;
        row.style.top = `${index * rowHeight}px`;
        row.style.height = `${rowHeight}px`;
        body.insertBefore(row, next);
        mounted.set(index, row);
      } else {
        next = row.nextElementSibling;
      }
    }
  };
  host.addEventListener("scroll", update, { passive: true });
  const resize = new ResizeObserver(update);
  resize.observe(host);
  update();
  return () => {
    host.removeEventListener("scroll", update);
    resize.disconnect();
  };
}
