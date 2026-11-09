import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDocument } from '../../src/lib/pdfimport.js'

const no = (lines) => parseDocument(lines, 'purchase').billNo

test('supplier bill number: same line, next line, slashes', () => {
  assert.equal(no(['TAX INVOICE', 'Gupta Metals Pvt Ltd', 'Invoice No: GM/22', 'Invoice Date: 03/04/2025']), 'GM/22')
  assert.equal(no(['Acme Ltd', 'Bill No. 45/26-27', 'Date: 03/04/2025']), '45/26-27')
  assert.equal(no(['Acme Ltd', 'Invoice No.', '1187', 'Dated 03/04/2025']), '1187')
})

test('supplier bill number: never an e-way bill, order or challan number', () => {
  assert.equal(no(['Acme Ltd', 'e-Way Bill No: 391000123456', 'Buyer Order No: 77']), '')
  assert.equal(no(['Acme Ltd', 'Delivery Challan No: 9', 'Invoice No: 66']), '66')
})
