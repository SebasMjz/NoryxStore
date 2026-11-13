/* global fetch */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import express from 'express'
import { Product } from '../models/index.js'
import router from './index.js'

test('descarga inventario agrupado por categoría en una hoja imprimible', async () => {
  const originalFind = Product.find
  Product.find = (filter) => ({
    populate: () => ({
      sort: () => ({
        lean: async () => {
          assert.deepEqual(filter, { stock: { $gt: 0 } })
          return [
            { nombre: 'Tornillo', stock: 7, categoria_id: { _id: '1', nombre: 'Ferretería' } },
            { nombre: 'Cable', stock: 2, categoria_id: { _id: '2', nombre: 'A/B' } },
            { nombre: 'Enchufe', stock: 3, categoria_id: { _id: '3', nombre: 'AB' } },
            { nombre: 'Otro', stock: 1, categoria_id: null }
          ]
        }
      })
    })
  })

  const app = express()
  app.use('/api', router)
  const server = app.listen(0)

  try {
    await once(server, 'listening')
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/products/export`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-disposition'), /inventario_\d{4}-\d{2}-\d{2}\.xlsx/)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()))
    assert.equal(workbook.worksheets.length, 1)
    const sheet = workbook.getWorksheet('Inventario')
    assert.deepEqual(sheet.getRow(1).values.slice(1), [
      'Nombre', 'Stock', 'Coincide', 'No coincide', 'Comentarios'
    ])
    assert.deepEqual(
      Array.from({ length: sheet.rowCount - 1 }, (_, i) => sheet.getRow(i + 2).getCell(1).value),
      ['A/B', 'Cable', 'AB', 'Enchufe', 'Ferretería', 'Tornillo', 'Sin categoría', 'Otro']
    )
    assert.equal(sheet.getRow(7).getCell(2).value, 7)
    assert.equal(sheet.getRow(7).getCell(5).value, null)
    assert.equal(sheet.getRow(7).getCell(5).border.bottom.style, 'thin')
    assert.equal(sheet.getRow(7).height, 28)
    assert.equal(sheet.getRow(6).getCell(5).isMerged, true)
    assert.equal(sheet.getRow(6).font.bold, true)
    assert.equal(sheet.pageSetup.orientation, 'portrait')
    assert.equal(sheet.pageSetup.fitToWidth, 1)
    assert.equal(sheet.pageSetup.printTitlesRow, '1:1')
  } finally {
    Product.find = originalFind
    server.close()
    await once(server, 'close')
  }
})
