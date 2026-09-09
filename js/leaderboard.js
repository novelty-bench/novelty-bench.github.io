// Leaderboard rendering for NoveltyBench.
//
// "All" is a single global ranking, so a sort applies to every row. A raw model
// sampled ten times and a scaffold making many calls per prompt are not the same
// kind of thing, so non-raw rows are labelled where they sit; the segmented
// control still ranks a single category on its own.

const K = 10; // generations per prompt; distinct is a count out of this

class LeaderboardManager {
  constructor() {
    this.models = [];
    this.categories = [];
    this.filter = 'all';
    this.sort = { column: 'utility', direction: 'desc' };
  }

  async init() {
    await this.loadLeaderboardData();
    this.buildControls();
    this.bindSorting();
    this.render();
  }

  async loadLeaderboardData() {
    try {
      const response = await fetch('leaderboard_data.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.models = data.models || [];
      this.categories = data.categories || [];
    } catch (error) {
      console.error('Could not load leaderboard data:', error);
      this.models = [];
      this.categories = [];
    }
  }

  // Categories that actually have entries, in the order the generator fixed.
  activeCategories() {
    return this.categories.filter((c) =>
      this.models.some((m) => m.category === c.id)
    );
  }

  buildControls() {
    const mount = document.querySelector('#leaderboard-filter');
    if (!mount) return;

    const cats = this.activeCategories();
    if (cats.length < 2) return; // nothing meaningful to switch between

    const options = [
      { id: 'all', label: 'All', count: this.models.length },
      ...cats.map((c) => ({ id: c.id, label: c.label, count: c.count })),
    ];

    mount.innerHTML = options
      .map(
        (o) => `
        <button type="button" class="segment${o.id === this.filter ? ' is-active' : ''}"
                data-filter="${o.id}" aria-pressed="${o.id === this.filter}">
          ${o.label}<span class="segment-count">${o.count}</span>
        </button>`
      )
      .join('');

    mount.addEventListener('click', (event) => {
      const button = event.target.closest('.segment');
      if (!button) return;
      this.filter = button.dataset.filter;
      mount.querySelectorAll('.segment').forEach((b) => {
        const on = b.dataset.filter === this.filter;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      this.render();
    });
  }

  bindSorting() {
    document.querySelectorAll('.table .sortable').forEach((header) => {
      const apply = () => {
        const column = header.dataset.sort;
        // Numbers read best highest-first on the first click.
        const numeric = column === 'distinct' || column === 'utility';
        this.sort =
          this.sort.column === column
            ? {
                column,
                direction: this.sort.direction === 'asc' ? 'desc' : 'asc',
              }
            : { column, direction: numeric ? 'desc' : 'asc' };
        this.render();
      };
      // These are divs, so they need the button affordances spelled out.
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.addEventListener('click', apply);
      header.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          apply();
        }
      });
    });
  }

  sorted(rows) {
    const { column, direction } = this.sort;
    const sign = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[column];
      let bv = b[column];
      if (column === 'open') {
        av = av ? 1 : 0;
        bv = bv ? 1 : 0;
      }
      if (typeof av === 'string') return sign * av.localeCompare(bv);
      return sign * (av - bv);
    });
  }

  updateSortIcons() {
    document.querySelectorAll('.table .sortable').forEach((header) => {
      const icon = header.querySelector('.sort-icon');
      if (!icon) return;
      const active = header.dataset.sort === this.sort.column;
      icon.textContent = active
        ? this.sort.direction === 'asc'
          ? '↑'
          : '↓'
        : '↕';
      header.classList.toggle('is-sorted', active);
    });
  }

  // utility orders the table, so it carries the visual weight.
  // It is a continuous 0-K score, so a continuous bar - not discrete cells.
  bar(value) {
    const pct = (Math.max(0, Math.min(K, value)) / K) * 100;
    return `<span class="bar" role="img" aria-label="${value.toFixed(
      2
    )} of ${K} utility"><i style="width:${pct.toFixed(1)}%"></i></span>`;
  }

  variantCell(model) {
    const meta = model.metadata;
    let name = model.variant;
    if (meta) {
      if (meta.authors) {
        const year = model.date ? model.date.split('-')[0] : '';
        const label = `(${meta.authors}, ${year})`;
        name += meta.paper
          ? ` <a href="${meta.paper}" target="_blank" rel="noopener" class="model-citation">${label}</a>`
          : ` <span class="model-citation">${label}</span>`;
      }
      if (meta.model) {
        name += ` <a href="${meta.model}" target="_blank" rel="noopener" title="Model or system" class="model-link"><i class="fas fa-cube"></i></a>`;
      }
    }
    // A scaffold's score belongs to the pairing, so name the model underneath.
    const base =
      meta && meta.base_model
        ? `<span class="model-base">runs on ${meta.base_model}</span>`
        : '';
    const meta2 = [model.family, model.date].filter(Boolean).join(' · ');
    return `<div class="model-name">${name}</div>${base}${this.badge(model)}<span class="model-meta">${meta2}</span>`;
  }

  // Raw models are the unmarked default; anything else says what it is, so a
  // scaffold is never read as a plain model just because it outranks one.
  badge(model) {
    if (!model.category || model.category === 'raw') return '';
    const label =
      model.category === 'inference-time'
        ? 'inference-time system'
        : 'training-time method';
    return `<span class="cat-badge">${label}</span>`;
  }

  row(model, rank) {
    const openMark = model.open
      ? '<i class="fas fa-check open-yes" title="Open weights"></i>'
      : '<i class="fas fa-minus open-no" title="Closed weights"></i>';
    return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td class="col-variant">${this.variantCell(model)}</td>
        <td class="col-open"><span class="open-status ${model.open}">${openMark}</span></td>
        <td class="col-distinct"><span class="num">${model.distinct.toFixed(
          2
        )}</span></td>
        <td class="col-utility">${this.bar(
          model.utility
        )}<span class="num">${model.utility.toFixed(2)}</span></td>
      </tr>`;
  }

  groupHeader(category, count) {
    const systems = count === 1 ? '1 system' : `${count} systems`;
    return `
      <tr class="group-row">
        <th colspan="5" scope="colgroup">
          <span class="group-name">${category.label}</span>
          <span class="group-blurb">${category.blurb}</span>
          <span class="group-count">${systems}</span>
        </th>
      </tr>`;
  }

  render() {
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;
    this.updateSortIcons();

    let html = '';
    if (this.filter === 'all') {
      // One ranking over every entry, so a header click orders the whole table.
      this.sorted(this.models).forEach((model, i) => {
        html += this.row(model, i + 1);
      });
    } else {
      const category = this.activeCategories().find((c) => c.id === this.filter);
      const rows = this.sorted(
        this.models.filter((m) => m.category === this.filter)
      );
      if (category && rows.length) html += this.groupHeader(category, rows.length);
      rows.forEach((model, i) => {
        html += this.row(model, i + 1);
      });
    }

    tbody.innerHTML =
      html ||
      '<tr><td colspan="5" class="empty-row">No systems in this category yet.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await new LeaderboardManager().init();
});
