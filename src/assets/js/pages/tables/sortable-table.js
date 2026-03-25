/**
 * sortableTable.js
 * -------------------------------------------------
 * Lightweight sort helper for .astero-table tables.
 * Attaches click handlers to [data-sortable] <th> elements.
 *
 * Usage:
 *   const sorter = initSortableTable({
 *     tableId: 'myTable',          // <table id="...">
 *     getSortValue: (row, key) => row[key], // extractor fn
 *     onSort: (sortedData) => renderTable(sortedData), // callback
 *     getData: () => allRows,      // fn that returns current dataset
 *   })
 *
 * The callback receives sorted data every time a column header is clicked.
 */
function initSortableTable({ tableId, getSortValue, onSort, getData }) {
  const table = document.getElementById(tableId)
  if (!table) return null

  let sortKey = null
  let sortDir = 'asc' // 'asc' | 'desc'

  const headers = table.querySelectorAll('thead th[data-sortable]')

  headers.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey

      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        sortKey = key
        sortDir = 'asc'
      }

      // Update arrow classes
      headers.forEach((h) => {
        h.classList.remove('sort-asc', 'sort-desc')
      })
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc')

      // Sort and callback
      const data = getData()
      const sorted = [...data].sort((a, b) => {
        const av = getSortValue(a, key)
        const bv = getSortValue(b, key)

        if (av === null || av === undefined) return 1
        if (bv === null || bv === undefined) return -1

        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }

        const as = String(av).toLowerCase()
        const bs = String(bv).toLowerCase()
        if (as < bs) return sortDir === 'asc' ? -1 : 1
        if (as > bs) return sortDir === 'asc' ? 1 : -1
        return 0
      })

      onSort(sorted)
    })
  })

  return {
    reset() {
      sortKey = null
      sortDir = 'asc'
      headers.forEach((h) => h.classList.remove('sort-asc', 'sort-desc'))
    }
  }
}
