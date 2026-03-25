const dataUrl =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000/api/sales'
    : '/api/sales'

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('es-MX')
}

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)} USD`

let currentStatus = 'all'

const SalesDatatable = (() => {
  let dt

  const initDatatable = () => {
    dt = $('#table_sales').DataTable({
      searchDelay: 400,
      processing: true,
      data: [],
      order: [0, 'desc'],
      lengthMenu: [5, 10, 25, 50],
      iDisplayLength: 5,
      columns: [
        {
          data: 'fecha',
          render: function (data) {
            return `<span class="text-muted">${escapeHtml(formatDate(data))}</span>`
          }
        },
        {
          data: 'cliente',
          render: function (data) {
            return `<span class="fw-medium">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'vendedor',
          render: function (data) {
            return `<span>${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'total',
          render: function (data) {
            return `<span class="fw-medium">${escapeHtml(formatCurrency(data))}</span>`
          }
        },
        {
          data: 'estado',
          render: function (data) {
            const isActive = data === 'activa'
            return `<span class="badge bg-${isActive ? 'success' : 'danger'}">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'metodo_pago',
          render: function (data) {
            return `<span class="text-muted">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          targets: -1,
          data: null,
          orderable: false,
          className: 'text-end',
          render: function () {
            return `
                            <div class="dropdown text-end">
                                <button class="btn btn-light btn-active-light-primary dropdown-toggle shadow-none action-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    Actions
                                </button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i class="ri-eye-line"></i> View</a></li>

                                    <li><a class="dropdown-item d-flex align-items-center gap-2" href="#"><i class="ri-pencil-line"></i> Edit</a></li>

                                    <li><hr class="dropdown-divider"></li>

                                    <li><a class="dropdown-item d-flex align-items-center gap-2 text-danger delete-button" href="#"><i class="ri-delete-bin-line"></i> Delete</a></li>
                                </ul>
                            </div>`
          }
        }
      ]
    })

    $.fn.dataTable.ext.search.push((_settings, data) => {
      if (currentStatus === 'all') return true
      const rowStatus = (data[4] || '').toLowerCase()
      return rowStatus.includes(currentStatus)
    })

    $.getJSON(dataUrl, function (json) {
      const normalizedData = Array.isArray(json)
        ? json.map((sale) => ({
            fecha: sale.fecha,
            cliente: sale.cliente_id?.nombre || '-',
            vendedor: sale.vendedor_id?.nombre || '-',
            total: Number(sale.total || 0),
            estado: sale.estado || '-',
            metodo_pago: sale.metodo_pago || '-'
          }))
        : []

      const all = normalizedData.length
      const active = normalizedData.filter((sale) => sale.estado === 'activa').length
      const cancelled = normalizedData.filter((sale) => sale.estado === 'anulada').length

      const allEl = document.getElementById('salesCountAll')
      const activeEl = document.getElementById('salesCountActive')
      const cancelledEl = document.getElementById('salesCountCancelled')

      if (allEl) allEl.textContent = String(all)
      if (activeEl) activeEl.textContent = String(active)
      if (cancelledEl) cancelledEl.textContent = String(cancelled)

      dt.rows.add(normalizedData).draw()
    })
  }

  const initSearch = () => {
    const input = document.getElementById('salesSearchInput')
    if (!input) return

    input.addEventListener('keyup', function () {
      dt.search(this.value).draw()
    })
  }

  const initStatusFilter = () => {
    const links = document.querySelectorAll('[data-sales-filter]')
    if (!links.length) return

    links.forEach((link) => {
      link.addEventListener('click', function () {
        links.forEach((item) =>
          item.classList.remove('active', 'border-bottom', 'border-2', 'border-dark')
        )
        this.classList.add('active', 'border-bottom', 'border-2', 'border-dark')
        currentStatus = this.getAttribute('data-sales-filter') || 'all'
        dt.draw()
      })
    })
  }

  return {
    init: function () {
      initDatatable()
      initSearch()
      initStatusFilter()
    }
  }
})()

window.addEventListener('DOMContentLoaded', () => {
  SalesDatatable.init()
})
