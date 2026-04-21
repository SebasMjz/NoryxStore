/* global fetch, $ */
const data_url =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000/api/products'
    : '/api/products'

const categories_url =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000/api/categories'
    : '/api/categories'

let pageindex = 0 // Default to first page if not specified

// Class definition
var ProductsDatatable = (function () {
  // Shared variables
  var dt

  // Private functions
  var initDatatable = function () {
    dt = $('#table_products').DataTable({
      searchDelay: 500,
      processing: true,
      dom: 'lrtip',
      data: [],
      order: [], /* Sin orden inicial para mantener cronología del API */
      columnDefs: [{ orderable: false, targets: [0, 1, 6, 'no-sort'] }],
      lengthMenu: [5, 10, 50, 100],
      iDisplayLength: 5,
      select: {
        style: 'multi',
        selector: 'td:first-child input[type="checkbox"]',
        className: 'row-selected'
      },
      columns: [
        {
          data: null,
          orderable: false,
          searchable: false,
          className: 'select-checkbox',
          render: function (_data, _type, row) {
            return `<div class="form-check">
                                    <input class="form-check-input bulk-select" type="checkbox" value="${row.id}">
                                </div>`
          }
        },
        {
          data: null,
          orderable: false,
          searchable: false,
          className: 'text-center text-muted fw-semibold',
          render: function (_data, _type, _row, meta) {
            return meta.settings._iDisplayStart + meta.row + 1;
          }
        },
        {
          data: 'product',
          render: function (data, _type, row) {
            const productName = data || ''
            const productDescription = row.descripcion || ''
            const sku = row.sku || ''
            return `<div class="d-flex flex-column">
                        <span class="text-muted small fw-semibold mb-1"><i class="ri-barcode-line me-1"></i>${sku}</span>
                        <h6 class="mb-0 text-wrap" style="line-height: 1.4;">${productName}</h6>
                        ${productDescription ? `<small class="text-muted text-wrap mt-1" style="display: inline-block;">${productDescription}</small>` : ''}
                    </div>`
          }
        },
        {
          data: 'stock',
          render: function (data, _type, row) {
            const qty = Number(data || 0)
            const min = Number(row.stockMinimo ?? 10)
            const stockClass = qty === 0 ? 'danger' : qty <= min ? 'warning' : 'success'
            const stockLabel = qty === 0 ? 'sin stock' : qty <= min ? 'stock bajo' : 'en stock'
            return `<div class="d-flex align-items-center">
                            <span class="badge text-bg-${stockClass} me-2">${qty}</span>
                            <span class="text-muted">${stockLabel}</span>
                        </div>`
          }
        },
        {
          data: 'price',
          render: function (data) {
            return `<div class="d-flex align-items-center">
                            <span class="fw-medium">$${Number(data || 0).toFixed(2)}</span>
                            <span class="text-muted ms-1">USD</span>
                        </div>`
          }
        },
        {
          data: 'status',
          render: function (data) {
            const statusClasses = {
              Activo: 'success',
              Inactivo: 'secondary'
            }
            return `<span class="badge bg-${statusClasses[data] || 'secondary'}">${data || 'Inactivo'}</span>`
          }
        },
        {
          data: null,
          orderable: false,
          className: 'text-end',
          render: function (_data, _type, row) {
            return `<div class="d-flex gap-1 justify-content-end pe-1">
              <button class="btn btn-sm btn-icon view-button" data-id="${row.id}" title="Ver"><i class="ri-eye-line"></i></button>
              <button class="btn btn-sm btn-icon edit-button" data-id="${row.id}" title="Editar"><i class="ri-pencil-line"></i></button>
              <button class="btn btn-sm btn-icon text-danger delete-button" data-id="${row.id}" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
            </div>`
          }
        }
      ]
    })

    $.getJSON(data_url, function (json) {
      $.getJSON(categories_url)
        .done(function (cats) {
          const catSel = document.getElementById('filter_categoria_producto')
          if (catSel && Array.isArray(cats)) {
            cats
              .filter((c) => c.activo)
              .forEach((c) => {
                const o = document.createElement('option')
                o.value = c._id
                o.textContent = c.nombre
                o.setAttribute('data-title', c.nombre)
                catSel.appendChild(o)
              })
          }
        })
        .always(function () {
          const normalizedData = Array.isArray(json)
            ? json.map((item) => ({
                id: item._id,
                product: item.nombre,
                sku: item.codigo,
                stock: Number(item.stock || 0),
                stockMinimo: Number.isFinite(Number(item.stock_minimo))
                  ? Number(item.stock_minimo)
                  : 10,
                price: Number(item.precio_venta || 0),
                status: item.activo ? 'Activo' : 'Inactivo',
                category: item.activo ? 'activo' : 'inactivo',
                descripcion: item.descripcion || '',
                categoriaId: String(item.categoria_id?._id || item.categoria_id || '')
              }))
            : []

          const total = normalizedData.length
          const active = normalizedData.filter((item) => item.category === 'activo').length
          const inactive = normalizedData.filter((item) => item.category === 'inactivo').length

          const totalEl = document.getElementById('productsCountAll')
          const activeEl = document.getElementById('productsCountActive')
          const inactiveEl = document.getElementById('productsCountInactive')

          if (totalEl) totalEl.textContent = String(total)
          if (activeEl) activeEl.textContent = String(active)
          if (inactiveEl) inactiveEl.textContent = String(inactive)

          dt.rows.add(normalizedData).draw()
        })
    })

    dt.on('init', function () {
      if (!isNaN(pageindex)) {
        const pageInfo = dt.page.info()
        var totalpages = pageInfo.pages
        if (pageindex <= totalpages) {
          dt.page(pageindex).draw(false)
        }
      }
    })

    // Re-init functions on every table re-draw -- more info: https://datatables.net/reference/event/draw
    dt.on('draw', function () {
      initToggleToolbar()
      toggleToolbars()
      triggerFilters()
      handleFilterData()
      initRowDelete()
    })
  }

  // Search Datatable --- official docs reference: https://datatables.net/reference/api/search()
  var handleSearchDatatable = function () {
    const filterSearch = document.querySelector('[data-table-filter="search"]')
    if (!filterSearch) return // Exit if element doesn't exist

    filterSearch.addEventListener('keyup', function () {
      if (this.value != '') {
        $('.search-clear').show()
      } else {
        $('.search-clear').hide()
      }
      dt.search(this.value).draw()
    })

    const filterSearchClear = document.querySelector('.search-clear')
    if (!filterSearchClear) return // Exit if element doesn't exist
    filterSearchClear.addEventListener('click', function () {
      $(this).hide()
      $(this).closest('div').find('[data-table-filter="search"]').val('')
      dt.search('').draw()
    })
  }

  // Filter Datatable
  var handleFilterDatatable = () => {
    const filterButton = document.querySelector('[data-table-filter-btn="filter"]')
    if (!filterButton) return // Exit if element doesn't exist

    // Filter datatable on submit
    filterButton.addEventListener('click', function () {
      $('.dataTables_processing').css('display', 'block')
      $('.dataTables_wrapper').addClass('processing')
      // Trigger the dismiss click on the close button
      document.querySelector('#filterDrawer [data-bs-dismiss="offcanvas"]').click()
      $.fn.dataTable.ext.search = []
      dt.draw()
      handleFilterDataRows()
    })
  }

  // handle filder data
  var handleFilterDataRows = () => {
    // Get all filter values
    let statusFilters = []
    // get active status from navimagion data-type="navbar"
    $('[data-type="navbar"]').each(function () {
      if ($(this).hasClass('active')) {
        if ($(this).attr('data-value') != 'all') {
          statusFilters.push($(this).attr('data-value'))
        }
      }
    })

    let stockFilters = []
    $('input[name="stock"]:checked').each(function () {
      stockFilters.push($(this).val())
    })

    let priceMin = $('#min_price').val()
    let priceMax = $('#max_price').val()
    let category = $('#category').val()
    let productCategoria = $('#filter_categoria_producto').val()

    // Add custom filtering (usa fila completa para umbral de stock bajo por producto)
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      const api = new $.fn.dataTable.Api(settings)
      const rowData = api.row(dataIndex).data() || {}
      const rowMin = Number(rowData.stockMinimo ?? 10)
      const rowStock = Number(
        rowData.stock ?? parseInt(String(data[3]).match(/\d+/)?.[0] || '0', 10)
      )
      let rowPrice = parseFloat(String(data[4] || '').replace(/[^0-9.-]+/g, ''))
      const rowCategory =
        rowData.category ||
        (String(data[5] || '')
          .toLowerCase()
          .includes('inactivo')
          ? 'inactivo'
          : 'activo')

      // Status filter (navbar: activo / inactivo)
      let statusMatch = statusFilters.length === 0 || statusFilters.includes(rowCategory)

      // Stock filter
      let stockMatch =
        stockFilters.length === 0 ||
        (stockFilters.includes('in_stock') && rowStock > rowMin) ||
        (stockFilters.includes('low_stock') && rowStock > 0 && rowStock <= rowMin) ||
        (stockFilters.includes('out_of_stock') && rowStock === 0)

      // Price filter
      let priceMatch =
        (!priceMin || rowPrice >= parseFloat(priceMin)) &&
        (!priceMax || rowPrice <= parseFloat(priceMax))

      // Estado (drawer select id=category)
      let categoryMatch = !category || rowCategory === category

      // Categoría de producto (Mongo id)
      let productCatMatch =
        !productCategoria || String(rowData.categoriaId || '') === String(productCategoria)

      return statusMatch && stockMatch && priceMatch && categoryMatch && productCatMatch
    })

    // Simulate loading delay
    setTimeout(function () {
      dt.draw()
      $('.dataTables_wrapper').removeClass('processing')
      $('.dataTables_processing').css('display', 'none')
    }, 500)
  }

  // Reset Filter
  var handleResetForm = () => {
    // Select reset button
    const resetButton = document.querySelector('[data-table-filter-btn="reset"]')
    if (!resetButton) return // Exit if element doesn't exist

    // Reset datatable
    resetButton.addEventListener('click', function () {
      // Reset datatable --- official docs reference: https://datatables.net/reference/api/search()
      $('.dataTables_wrapper').addClass('processing')
      $('.dataTables_processing').css('display', 'block')
      // Trigger the dismiss click on the close button
      document.querySelector('#filterDrawer [data-bs-dismiss="offcanvas"]').click()

      if ($('.form-check-input:checked').length > 0) {
        $('.form-check-input').prop('checked', false)
      }
      if ($('#filterDrawer .form-select').length > 0) {
        $('#filterDrawer .form-select').val('')
      }
      const prodCatSel = document.getElementById('filter_categoria_producto')
      if (prodCatSel) prodCatSel.value = ''

      $('[data-table-filter="search"]').val('')
      $('.search-clear').hide()

      // dt.draw();
      $.fn.dataTable.ext.search = [] // Remove all custom filters

      // Simulate loading delay
      setTimeout(function () {
        dt.draw()
        $('.dataTables_wrapper').removeClass('processing')
        $('.dataTables_processing').css('display', 'none')
      }, 500)
    })
  }

  var handleFilterData = () => {
    const filterDataView = document.querySelector('[data-filters]')
    const filterData = document.querySelector('[data-filters-data]')
    var search_html = ''

    const filterSearch = document.querySelector('[data-table-filter="search"]')
    var searchval = filterSearch.value
    if (searchval != '') {
      search_html +=
        '<span class="badge text-bg-primary d-flex justify-content-between fs-7 me-2 fw-bold align-items-center">Search: ' +
        searchval +
        ' <span class="ri-close-line cursor-pointer fs-7 fw-bold ms-2 text-inverse clear-filter" data-type="input" data-filter="search"></span></span>'
    }
    var filteroptions = document.querySelectorAll('[data-table-filter]')
    filteroptions.forEach((r) => {
      var fname = r.getAttribute('name')
      var fid = r.getAttribute('id')
      var label = r.getAttribute('data-label')
      var type = r.getAttribute('data-type')
      if (fname != '') {
        var fvalue = $('#' + fid).val()
        if (fvalue != undefined && fvalue != '') {
          var search_value = fvalue
          if (type == 'multiselect') {
            $('#' + fid + ' option:selected').each(function () {
              var tmp_value = $(this).attr('data-title')
              var val = $(this).val()

              search_html +=
                '<span class="badge text-bg-primary d-flex justify-content-between fs-7 mb-1 me-2 fw-bold align-items-center">' +
                label +
                ': ' +
                tmp_value +
                ' <span class="ri-close-line cursor-pointer fs-7 fw-bold ms-2 text-inverse clear-filter" data-val="' +
                val +
                '" data-type="' +
                type +
                '" data-filter="' +
                fname +
                '"></span></span>'
            })
          } else if (type == 'checkbox') {
            if (r.checked) {
              search_value = r.getAttribute('data-title')
              var val = r.value

              search_html +=
                '<span class="badge text-bg-primary d-flex justify-content-between fs-7 mb-1 me-2 fw-bold align-items-center">' +
                label +
                ': ' +
                search_value +
                ' <span class="ri-close-line cursor-pointer fs-7 fw-bold ms-2 text-inverse clear-filter" data-val="' +
                val +
                '" data-type="' +
                type +
                '" data-filter="' +
                fname +
                '"></span></span>'
            }
          } else {
            if (type == 'select') {
              search_value = r.options[r.selectedIndex].getAttribute('data-title')
            }
            search_html +=
              '<span class="badge text-bg-primary d-flex justify-content-between fs-7 mb-1 me-2 fw-bold align-items-center">' +
              label +
              ': ' +
              search_value +
              ' <span class="ri-close-line cursor-pointer fs-7 fw-bold ms-2 text-inverse clear-filter" data-type="' +
              type +
              '" data-filter="' +
              fname +
              '"></span></span>'
          }
        }
      }
    })
    if (search_html != '') {
      // Create clear all button element
      const clearAllButton = document.createElement('span')
      clearAllButton.className =
        'badge text-bg-danger fs-7 mb-1 me-2 d-flex align-items-center fw-semibold cursor-pointer clear-filter'
      clearAllButton.setAttribute('data-filter', 'all')
      clearAllButton.textContent = 'Clear All'

      // Clear existing content
      filterData.textContent = ''

      // Add the search HTML content safely
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = search_html
      while (tempDiv.firstChild) {
        filterData.appendChild(tempDiv.firstChild)
      }

      // Add the clear all button
      filterData.appendChild(clearAllButton)

      filterDataView.classList.remove('d-none')
      filterDataView.classList.add('d-flex')
      clearFilters()
    } else {
      filterDataView.classList.remove('d-flex')
      filterDataView.classList.add('d-none')
    }
  }

  // Init toggle toolbar
  var initToggleToolbar = function () {
    // Toggle selected action toolbar
    const container = document.querySelector('#table_products')
    const checkboxes = container.querySelectorAll('[type="checkbox"]')
    // Select all checkboxes
    const selectAll = document.querySelector('[data-table-select="select_all"]')
    selectAll.addEventListener('change', function (e) {
      const checkboxes = container.querySelectorAll('[type="checkbox"]')
      checkboxes.forEach((c) => {
        c.checked = e.target.checked
      })
      toggleToolbars()
    })

    // Select elements
    const deleteSelected = document.querySelector('[data-table-select="delete_selected"]')

    // Toggle delete selected toolbar
    checkboxes.forEach((c) => {
      // Checkbox on click event
      c.addEventListener('change', function () {
        setTimeout(function () {
          toggleToolbars()
        }, 50)
      })
    })

    // Deleted selected rows
    deleteSelected.addEventListener('click', async function () {
      var selectedcheckboxes = container.querySelectorAll('[type="checkbox"]:checked')
      var selectedIds = []
      selectedcheckboxes.forEach(function (sc) {
        selectedIds.push(sc.value)
      })
      if (!selectedIds.length) return

      var ok = await window.showConfirm({
        title: 'Eliminar ' + selectedIds.length + ' producto(s)',
        message:
          '¿Estás seguro de eliminar los <strong>' +
          selectedIds.length +
          ' productos seleccionados</strong>? Esta acción no se puede deshacer.',
        confirmText: 'Sí, eliminar todo',
        type: 'danger'
      })
      if (!ok) return

      try {
        var apiBase =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:4000'
            : ''
        await Promise.all(
          selectedIds.map(function (id) {
            return fetch(apiBase + '/api/products/' + id, { method: 'DELETE' })
          })
        )
        window.location.reload()
      } catch (err) {
        alert('Error al eliminar los productos')
      }
    })
  }

  // Toggle toolbars
  var toggleToolbars = function () {
    // Define variables
    const container = document.querySelector('#table_products')
    const toolbarBase = document.querySelector('[data-table-toolbar="filter"]')
    const toolbarSelected = document.querySelector('[data-table-toolbar="bulk_selected"]')
    const selectedCount = document.querySelector('[data-table-select="selected_count"]')

    // Select refreshed checkbox DOM elements
    const allCheckboxes = container.querySelectorAll('tbody [type="checkbox"]')

    // Detect checkboxes state & count
    let checkedState = false
    let count = 0

    // Count checked boxes
    allCheckboxes.forEach((c) => {
      if (c.checked) {
        checkedState = true
        count++
      }
    })

    const selectAll = document.querySelector('[data-table-select="select_all"]')
    if (allCheckboxes.length == count) {
      selectAll.checked = true
    } else {
      selectAll.checked = false
    }

    // Toggle toolbars
    if (checkedState) {
      selectedCount.innerHTML = count
      toolbarBase.classList.add('d-none')
      toolbarSelected.classList.remove('d-none')
    } else {
      toolbarBase.classList.remove('d-none')
      toolbarSelected.classList.add('d-none')
    }
  }

  var triggerFilters = function () {
    if ($('.trigger-filter').length > 0) {
      $('.trigger-filter').on('click', function () {
        var filter = $(this).attr('data-filter')
        var value = $(this).attr('data-value')
        var tmpfilter = $('[data-table-filter="' + filter + '"]')
        if (tmpfilter.attr('data-type') == 'multiselect') {
          tmpfilter.find('option[value="' + value + '"]').prop('selected', true)
          var updated_val = tmpfilter.val()
          tmpfilter.val(updated_val)
          tmpfilter.trigger('change')
          dt.draw()
        } else if (tmpfilter.attr('data-type') == 'select') {
          tmpfilter.val(value)
          tmpfilter.trigger('change')
          dt.draw()
        }
      })
    }
  }

  var clearFilters = function () {
    if ($('.clear-filter').length > 0) {
      $('.clear-filter').on('click', function () {
        var filter = $(this).attr('data-filter')
        var type = $(this).attr('data-type')

        if (filter == 'all') {
          $('[data-table-filter="search"]').val('')
          $('[data-table-filter]').each(function () {
            var elementType = $(this).attr('data-type')
            if (elementType == 'checkbox') {
              $(this).prop('checked', false)
            } else {
              $(this).val('')
            }
          })

          $('.search-clear').hide()
        } else {
          if (type == 'checkbox') {
            var val = $(this).attr('data-val')
            var checkboxFilter = $('[data-table-filter="' + filter + '"]:checked')
            checkboxFilter.each(function () {
              if ($(this).val() == val) {
                $(this).prop('checked', false)
              }
            })
          } else {
            var otherFilter = $('[data-table-filter="' + filter + '"]')
            otherFilter.val('')
          }
        }
        // dt.draw();
        $('.dataTables_wrapper').addClass('processing')
        $('.dataTables_processing').css('display', 'block')
        $.fn.dataTable.ext.search = []
        setTimeout(function () {
          handleFilterDataRows()
          dt.draw()
        }, 500)
      })
    }
  }

  // init navbar filter
  var initNavbarFilter = function () {
    if ($('[data-type="navbar"]').length > 0) {
      $('[data-type="navbar"]').on('click', function (e) {
        e.preventDefault()
        $('.dataTables_wrapper').addClass('processing')
        $('.dataTables_processing').css('display', 'block')
        $('[data-type="navbar"]').removeClass('active border-bottom border-2 border-dark')
        $(this).addClass('active border-bottom border-2 border-dark')

        $.fn.dataTable.ext.search = []
        setTimeout(function () {
          dt.draw()
          handleFilterDataRows()
        }, 500)
      })
    }
  }

  // init single delete button
  var initRowDelete = function () {
    $('#table_products')
      .off('click', '.delete-button')
      .on('click', '.delete-button', async function (e) {
        e.preventDefault()
        var productId = $(this).attr('data-id')

        var ok = await window.showConfirm({
          title: 'Eliminar producto',
          message: '¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.',
          confirmText: 'Sí, eliminar',
          type: 'danger'
        })
        if (!ok) return

        try {
          var apiBase =
            window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:4000'
              : ''
          var res = await fetch(apiBase + '/api/products/' + productId, { method: 'DELETE' })
          if (!res.ok) throw new Error()
          window.location.reload()
        } catch (err) {
          alert('Error al eliminar el producto')
        }
      })

    $('#table_products')
      .off('click', '.edit-button')
      .on('click', '.edit-button', async function (e) {
        e.preventDefault()
        const productId = $(this).attr('data-id')
        const apiBase =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:4000'
            : ''

        try {
          const res = await fetch(`${apiBase}/api/products/${productId}`)
          const product = await res.json()

          const modalEl = document.getElementById('createProductModal')
          if (modalEl) {
            modalEl.querySelector('.modal-title').textContent = 'Editar producto'
            const form = document.getElementById('createProductForm')
            form.dataset.editId = product._id

            const catId = product.categoria_id?._id || product.categoria_id || ''
            const catSel = form.querySelector('#productCategoria')
            if (catSel) catSel.value = catId
            const codeInput = form.querySelector('#productCodigo')
            if (codeInput) {
              codeInput.value = product.codigo
              codeInput.readOnly = true
            }
            form.querySelector('#productNombre').value = product.nombre
            form.querySelector('#productDescripcion').value = product.descripcion || ''
            form.querySelector('#productPrecioVenta').value = product.precio_venta
            const sm = form.querySelector('#productStockMinimo')
            if (sm) sm.value = String(product.stock_minimo ?? 10)
            form.querySelector('#productActivo').checked = product.activo

            form.querySelector('button[type="submit"]').textContent = 'Actualizar'

            const modal = new bootstrap.Modal(modalEl)
            modal.show()
          }
        } catch (err) {
          console.error(err)
          alert('Error cargando el producto')
        }
      })

    $('#table_products').off('click', '.view-button').on('click', '.view-button', async function (e) {
      e.preventDefault()
      const productId = $(this).attr('data-id')
      const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : ''
      
      try {
        const res = await fetch(`${apiBase}/api/products/${productId}`)
        const product = await res.json()
        
        const modalEl = document.getElementById('createProductModal')
        if (modalEl) {
          modalEl.querySelector('.modal-title').textContent = 'Detalles del producto'
          const form = document.getElementById('createProductForm')
          form.dataset.editId = '' // No edit id because we are viewing

          const catId = product.categoria_id?._id || product.categoria_id || ''
          const catSel = form.querySelector('#productCategoria')
          if (catSel) { catSel.value = catId; catSel.disabled = true; }
          const codeInput = form.querySelector('#productCodigo')
          if (codeInput) { codeInput.value = product.codigo; codeInput.readOnly = true; }
          
          const nom = form.querySelector('#productNombre')
          if (nom) { nom.value = product.nombre; nom.readOnly = true; }
          
          const desc = form.querySelector('#productDescripcion')
          if (desc) { desc.value = product.descripcion || ''; desc.readOnly = true; }
          
          const prev = form.querySelector('#productPrecioVenta')
          if (prev) { prev.value = product.precio_venta; prev.readOnly = true; }
          
          const sm = form.querySelector('#productStockMinimo')
          if (sm) { sm.value = String(product.stock_minimo ?? 10); sm.readOnly = true; }
          
          const act = form.querySelector('#productActivo')
          if (act) { act.checked = product.activo; act.disabled = true; }

          const btnSubmit = form.querySelector('button[type="submit"]')
          if (btnSubmit) btnSubmit.style.display = 'none'

          // Restore normal mode on close
          modalEl.addEventListener('hidden.bs.modal', function restoreForm() {
            if (catSel) catSel.disabled = false
            if (nom) nom.readOnly = false
            if (desc) desc.readOnly = false
            if (prev) prev.readOnly = false
            if (sm) sm.readOnly = false
            if (act) act.disabled = false
            if (btnSubmit) btnSubmit.style.display = 'block'
            modalEl.removeEventListener('hidden.bs.modal', restoreForm)
          }, { once: true })

          const modal = new window.bootstrap.Modal(modalEl)
          modal.show()
        }
      } catch (err) {
        console.error(err)
        alert('Error cargando el producto')
      }
    })
  }

  var noSortingColumn = function () {
    if ($('.no-sort').length > 0) {
      $('.no-sort').on('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
      })
    }
  }
  // Public methods
  return {
    init: function () {
      initDatatable()
      handleSearchDatatable()
      initToggleToolbar()
      handleFilterDatatable()
      handleResetForm()
      triggerFilters()
      handleFilterData()
      clearFilters()
      initNavbarFilter()
      noSortingColumn()
    }
  }
})()

// On document ready
document.addEventListener('DOMContentLoaded', () => {
  ProductsDatatable.init()
})
