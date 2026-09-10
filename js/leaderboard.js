// Leaderboard rendering for NoveltyBench.
//
// Every system is measured under two metric versions; the reader picks which one
// orders the table, and the rows show that version's numbers. A system scored
// under only the other version is listed unranked, saying so.
//
// The two metrics are different kinds of number: distinct_10 is a count out of
// ten, so its track is divided into ten units; utility_10 is a continuous score
// over the same range, so its track is undivided.

const K = 10; // generations per prompt; both metrics are scored out of this

class LeaderboardManager {
  constructor() {
    this.models = [];
    this.categories = [];
    this.versions = [];
    this.ranking = null; // metric version that orders the table
    this.filter = 'all';
    this.sort = { column: 'utility', direction: 'desc' };
  }

  async init() {
    await this.loadLeaderboardData();
    this.buildHero();
    this.buildRegimes();
    this.buildFilters();
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
      this.versions = data.versions || [];
    } catch (error) {
      console.error('Could not load leaderboard data:', error);
      this.models = [];
      this.categories = [];
      this.versions = [];
    }
    // A regime with no scored systems yet is announced but cannot order the
    // table, so the newest *populated* regime ranks by default.
    const scored = this.scoredVersions();
    this.ranking = scored.length ? scored[scored.length - 1].id : null;
  }

  scoredVersions() {
    return this.versions.filter((v) => v.count > 0);
  }

  // The two scored regimes being compared, oldest first. The rank-shift column
  // always reads in this direction, whichever regime happens to rank the table,
  // so the column means one fixed thing.
  regimePair() {
    const scored = this.scoredVersions();
    return scored.length > 1
      ? [scored[0].id, scored[scored.length - 1].id]
      : null;
  }

  // The version the reader is not ranking by, for a system missing from theirs.
  otherVersion() {
    const pair = this.regimePair();
    if (!pair) return null;
    return pair.find((id) => id !== this.ranking) || null;
  }

  // Categories that actually have entries, in the order the generator fixed.
  activeCategories() {
    return this.categories.filter((c) =>
      this.models.some((m) => m.category === c.id)
    );
  }

  scoreOf(model, version) {
    const m = model.metrics && version ? model.metrics[version] : null;
    return m || null;
  }

  // Rows in the current category, carrying the ranking regime's numbers.
  // A system not yet scored under that regime keeps its own numbers and is
  // listed unranked rather than dropped.
  pool() {
    const inFilter =
      this.filter === 'all'
        ? this.models
        : this.models.filter((m) => m.category === this.filter);
    return inFilter.map((model) => {
      const scores = this.scoreOf(model, this.ranking);
      return { ...model, ...(scores || {}), scored: Boolean(scores) };
    });
  }

  keyOf(model) {
    return `${model.family}::${model.variant}::${model.sampling || ''}`;
  }

  // The hero is the finding, drawn from the table's own numbers: ten cells per
  // system, violet where an answer was new. Three systems carry the spread -
  // the most diverse raw model, the least, and what asking in context recovers.
  buildHero() {
    const mount = document.querySelector('#hero-samples');
    if (!mount) return;
    const scored = this.models
      .filter((m) => this.scoreOf(m, this.ranking))
      .map((m) => ({ ...m, ...this.scoreOf(m, this.ranking) }));
    const raw = scored
      .filter((m) => m.category === 'raw' && m.sampling !== 'in-context')
      .sort((a, b) => a.distinct - b.distinct);
    const picks = [raw[0], raw[1], raw[raw.length - 1]].filter(Boolean);
    if (!picks.length) return;

    mount.innerHTML = picks
      .map((m, i) => {
        const filled = Math.max(1, Math.round(m.distinct));
        const cells = Array.from({ length: K }, (_, c) => {
          const delay = (i * K + c) * 22;
          const cls = c < filled ? ' class="is-new"' : '';
          return `<span${cls} style="animation-delay:${delay}ms"></span>`;
        }).join('');
        const aside = '';
        return `
        <div class="sample">
          <div class="sample-name">${m.variant}${aside}</div>
          <div class="cells" role="img" aria-label="${m.distinct.toFixed(
            1
          )} distinct of ${K}">${cells}</div>
          <div class="sample-count"><b>${m.distinct.toFixed(1)}</b> of ${K}</div>
        </div>`;
      })
      .join('');

    const note = document.querySelector('#hero-note');
    if (note) {
      note.textContent = `Mean distinct answers${
        this.ranking ? `, v${this.ranking}` : ''
      }.`;
    }
  }

  buildRegimes() {
    const mount = document.querySelector('#leaderboard-regimes');
    if (!mount || this.versions.length < 2) return;

    const paint = () => {
      mount.innerHTML = this.versions
        .map((v) => {
          const active = v.id === this.ranking;
          const usable = v.count > 0;
          const systems = usable
            ? `${v.count} ${v.count === 1 ? 'system' : 'systems'}`
            : 'scoring in progress';
          const spec = [
            ['distinct', v.partition],
            ['utility', v.utility],
          ]
            .filter(([, text]) => text)
            .map(
              ([metric, text]) =>
                `<span class="regime-line"><span class="regime-metric">${metric}<sub>10</sub></span> ${text}</span>`
            )
            .join('');
          return `
        <button type="button" class="regime${active ? ' is-active' : ''}${
            usable ? '' : ' is-pending'
          }" data-version="${v.id}" aria-pressed="${active}"${
            usable ? '' : ' disabled'
          }>
          <span class="regime-id">${v.label}</span>
          <span class="regime-spec">${spec}</span>
          <span class="regime-count">${systems}</span>
        </button>`;
        })
        .join('');
    };

    paint();
    mount.addEventListener('click', (event) => {
      const button = event.target.closest('.regime');
      if (!button || button.disabled) return;
      this.ranking = button.dataset.version;
      paint();
      this.buildHero();
      this.render();
    });
  }

  buildFilters() {
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
      // Systems without a score under this regime sink to the bottom either way.
      if (a.scored !== b.scored) return a.scored ? -1 : 1;
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

  // One track per metric on a 0-K scale. `units` divides the track into K
  // cells, for a metric that counts rather than scores.
  meter(value, label, units) {
    const pct = (Math.max(0, Math.min(K, value)) / K) * 100;
    const cls = `meter${units ? ' meter-units' : ''}`;
    const aria = `${value.toFixed(2)} of ${K} ${label}`;
    return `<span class="${cls}" role="img" aria-label="${aria}"><i style="width:${pct.toFixed(
      1
    )}%"></i></span>`;
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
    const when = model.date
      ? `<span class="model-date">${model.date}</span>`
      : '';
    return `<div class="model-name">${name}</div>${base}${this.tags(
      model
    )}${when}`;
  }

  // Raw models sampled independently are the unmarked default. Anything else
  // says what it is, so a scaffold is never read as a plain model just because
  // it outranks one, and the same model under two protocols is distinguishable.
  tags(model) {
    const tags = [];
    if (model.sampling === 'in-context') {
      tags.push({
        text: 'in-context regeneration',
        title:
          'Each of the ten samples was asked for in the same conversation, after the previous ones',
      });
    }
    if (model.category === 'inference-time' && model.sampling !== 'in-context') {
      tags.push({ text: 'inference-time system', title: '' });
    }
    if (model.category === 'training-time') {
      tags.push({ text: 'training-time method', title: '' });
    }
    return tags
      .map(
        (t) =>
          `<span class="tag"${t.title ? ` title="${t.title}"` : ''}>${
            t.text
          }</span>`
      )
      .join('');
  }

  row(model, rank) {
    const openMark = model.open
      ? '<i class="fas fa-check open-yes" title="Open weights"></i>'
      : '<i class="fas fa-minus open-no" title="Closed weights"></i>';
    const otherV = this.otherVersion();
    const other = this.scoreOf(model, otherV);

    if (!model.scored) {
      const note = other
        ? `<span class="unscored">v${otherV} only: distinct ${other.distinct.toFixed(
            2
          )}, utility ${other.utility.toFixed(2)}</span>`
        : '<span class="unscored">not scored</span>';
      return `
      <tr class="is-unscored">
        <td class="col-rank">—</td>
        <td class="col-variant">${this.variantCell(model)}</td>
        <td class="col-open"><span class="open-status ${model.open}">${openMark}</span></td>
        <td class="col-distinct" colspan="2">${note}</td>
      </tr>`;
    }

    return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td class="col-variant">${this.variantCell(model)}</td>
        <td class="col-open"><span class="open-status ${model.open}">${openMark}</span></td>
        <td class="col-distinct">${this.meter(
          model.distinct,
          'distinct',
          true
        )}<span class="num">${model.distinct.toFixed(2)}</span></td>
        <td class="col-utility">${this.meter(
          model.utility,
          'utility',
          false
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

    const rows = this.pool();

    const category =
      this.filter === 'all'
        ? null
        : this.activeCategories().find((c) => c.id === this.filter);
    const ordered = this.sorted(rows);

    let html = '';
    if (category && ordered.length) html += this.groupHeader(category, ordered.length);
    let rank = 0;
    ordered.forEach((model) => {
      if (model.scored) rank += 1;
      html += this.row(model, rank);
    });

    tbody.innerHTML =
      html ||
      '<tr><td colspan="5" class="empty-row">No systems in this category yet.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await new LeaderboardManager().init();
});

if (typeof module !== 'undefined') module.exports = { LeaderboardManager, K };
