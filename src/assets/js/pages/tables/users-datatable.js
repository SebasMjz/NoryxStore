const dataUrl =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000/api/users'
    : '/api/users'

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

let currentRole = 'all'

const UsersDatatable = (() => {
  /* global fetch, $, document, window, bootstrap */
  let dt

  const initDatatable = () => {
    dt = $('#table_users_staff').DataTable({
      searchDelay: 400,
      processing: true,
      data: [],
      order: [1, 'asc'],
      lengthMenu: [5, 10, 25, 50],
      iDisplayLength: 5,
      columns: [
        {
          data: null,
          orderable: false,
          searchable: false,
          className: 'checkbox-column',
          render: function (data, type, row) {
            return `<div class="form-check"><input class="form-check-input staff-row-cb" type="checkbox" data-id="${row.id}" aria-label="Seleccionar usuario" /></div>`
          }
        },
        {
          data: 'nombre',
          render: function (data) {
            return `<span class="fw-medium">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'username',
          render: function (data) {
            return `<span class="text-muted">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'celular',
          render: function (data) {
            return `<span>${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'tipo_usuario',
          render: function (data) {
            const roleClass = data === 'admin' ? 'info' : 'success'
            return `<span class="badge bg-${roleClass}">${escapeHtml(data || '-')}</span>`
          }
        },
        {
          data: 'activo',
          render: function (data) {
            const isActive = Boolean(data)
            return `<span class="badge bg-${isActive ? 'success' : 'secondary'}">${isActive ? 'Activo' : 'Inactivo'}</span>`
          }
        },
        {
          data: 'created_at',
          render: function (data) {
            return `<span class="text-muted small">${formatDate(data)}</span>`
          }
        },
        {
          data: null,
          orderable: false,
          searchable: false,
          className: 'text-end',
          render: function (data, type, row) {
            return `<div class="d-flex gap-1 justify-content-end pe-1">
              <button class="btn btn-sm btn-icon edit-button" data-id="${row.id}" title="Editar"><i class="ri-pencil-line"></i></button>
              <button class="btn btn-sm btn-icon text-danger delete-button" data-id="${row.id}" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
            </div>`
          }
        }
      ]
    })

    $.fn.dataTable.ext.search.push((_settings, data) => {
      if (currentRole === 'all') return true
      const rowRole = (data[4] || '').toLowerCase()
      return rowRole.includes(currentRole)
    })

    $.getJSON(dataUrl, function (json) {
      const normalizedData = Array.isArray(json)
        ? json.map((user) => ({
            id: user._id,
            nombre: user.nombre || '-',
            username: user.username || '-',
            celular: user.celular || '-',
            tipo_usuario: user.tipo_usuario || '-',
            activo: Boolean(user.activo),
            created_at: user.created_at
          }))
        : []

      const all = normalizedData.length
      const admins = normalizedData.filter((item) => item.tipo_usuario === 'admin').length
      const sellers = normalizedData.filter((item) => item.tipo_usuario === 'vendedor').length

      const allEl = document.getElementById('usersCountAll')
      const adminEl = document.getElementById('usersCountAdmins')
      const sellerEl = document.getElementById('usersCountSellers')

      if (allEl) allEl.textContent = String(all)
      if (adminEl) adminEl.textContent = String(admins)
      if (sellerEl) sellerEl.textContent = String(sellers)

      dt.clear().rows.add(normalizedData).draw()

      // Wire select-all after data drawn
      $('#table_users_staff').on('draw.dt', function () {
        const selectAll = document.getElementById('staffSelectAll')
        if (selectAll) selectAll.checked = false
        document.querySelectorAll('.staff-row-cb').forEach((cb) =>
          cb.addEventListener('change', updateStaffBulkUI)
        )
      })

      if (document.getElementById('staffSelectAll')) {
        document.getElementById('staffSelectAll').addEventListener('change', function () {
          const checked = this.checked
          document.querySelectorAll('.staff-row-cb').forEach((cb) => { cb.checked = checked })
          updateStaffBulkUI()
        })
      }
    }).fail(function () {
      console.error('Error cargando usuarios')
    })
  }

  const initSearch = () => {
    const input = document.getElementById('usersSearchInput')
    if (!input) return

    input.addEventListener('keyup', function () {
      if (dt) dt.search(this.value).draw()
    })
  }

  const initRoleFilter = () => {
    const links = document.querySelectorAll('[data-users-filter]')
    if (!links.length) return

    links.forEach((link) => {
      link.addEventListener('click', function () {
        links.forEach((item) =>
          item.classList.remove('active', 'border-bottom', 'border-2', 'border-dark')
        )
        this.classList.add('active', 'border-bottom', 'border-2', 'border-dark')
        currentRole = this.getAttribute('data-users-filter') || 'all'
        if (dt) dt.draw()
      })
    })
  }

  const initRowDelete = function () {
    $('#table_users_staff')
      .off('click', '.delete-button')
      .on('click', '.delete-button', async function (e) {
        e.preventDefault()
        const id = $(this).attr('data-id')
        const ok = await window.showConfirm({
          title: 'Eliminar usuario',
          message: '¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.',
          confirmText: 'Sí, eliminar',
          type: 'danger'
        })
        if (!ok) return

        const apiBase =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:4000'
            : ''

        try {
          const res = await fetch(`${apiBase}/api/users/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('No se pudo eliminar')
          window.location.reload()
        } catch (err) {
          console.error(err)
          alert('Error eliminando')
        }
      })

    $('#table_users_staff')
      .off('click', '.edit-button')
      .on('click', '.edit-button', async function (e) {
        e.preventDefault()
        const id = $(this).attr('data-id')
        const apiBase =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:4000'
            : ''

        try {
          const res = await fetch(`${apiBase}/api/users/${id}`)
          if (!res.ok) throw new Error('No se pudo cargar el usuario')

          const user = await res.json()

          const modalEl = document.getElementById('createUserModal')
          const form = document.getElementById('createUserForm')

          if (modalEl && form) {
            modalEl.querySelector('.modal-title').textContent = 'Editar usuario'
            form.dataset.editId = user._id

            form.querySelector('#userNombre').value = user.nombre || ''
            form.querySelector('#userUsername').value = user.username || ''
            form.querySelector('#userCelular').value = user.celular || ''
            form.querySelector('#userTipo').value = user.tipo_usuario || ''
            form.querySelector('#userActivo').checked = Boolean(user.activo)

            const submitButton = form.querySelector('button[type="submit"]')
            if (submitButton) submitButton.textContent = 'Actualizar'

            const modal = new bootstrap.Modal(modalEl)
            modal.show()
          }
        } catch (err) {
          console.error(err)
          alert('Error cargando usuario')
        }
      })
  }

  return {
    init: function () {
      initDatatable()
      initSearch()
      initRoleFilter()
      initRowDelete()
    }
  }
})()

function updateStaffBulkUI() {
  const checked = document.querySelectorAll('.staff-row-cb:checked')
  const bulk = document.getElementById('staffBulkActions')
  const countEl = document.getElementById('staffSelectedCount')
  if (!bulk) return
  if (checked.length > 0) {
    bulk.classList.remove('d-none')
    if (countEl) countEl.textContent = checked.length
  } else {
    bulk.classList.add('d-none')
  }
}

window.addEventListener('DOMContentLoaded', () => {
  UsersDatatable.init()
})