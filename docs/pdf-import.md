# PDF import for invoices and purchases

Upload a PDF to fill the invoice or purchase form. The PDF is read in the browser, used to fill the fields, and then discarded. Nothing is uploaded to a server and the file is never stored in the app. With **Save automatically** off, the invoice or purchase is only created when you click the create or record button, so every filled field can be checked first. With it on, see Automatic saving below.

## Limits

- Works only on PDFs that contain text. A scanned image PDF cannot be read, and the page says so.
- Maximum size is 10 MB, and only the first 5 pages are read.
- Reading depends on the layout of the PDF, so unusual layouts may need a few fields corrected by hand.
- Reading uses the PDF.js library, which loads from the internet (cdnjs). It needs a connection the first time.

---

## Automatic saving

Both upload buttons have a **Save automatically** checkbox, on by default. The choice is remembered in this browser.

- **On:** once the PDF is read, the invoice or purchase is created straight away, and a "Saved" message shows what was created. A new customer or supplier is added at the same time.
- **Off:** the form is only filled, and you click Create invoice or Record purchase yourself.

Automatic saving only happens when the data is complete. Otherwise the form stays filled in and a "Not saved automatically" message gives the reasons. It stops when:

- no customer or supplier was found, or a new firm has no GSTIN
- no date was found
- no item rows were found, or an item did not match a product or raw material
- a quantity or rate is missing
- an invoice or purchase with the same customer or supplier, date, items, quantities and rates already exists (this prevents saving the same PDF twice)
- the app rejects it, for example when there is not enough stock for an invoice

Purchases saved automatically are recorded as **Pay later**. Pay them from the Purchases list or Banking. A PDF with several item rows is recorded one purchase per row.

---

## 1. Sales invoice: upload and customer update

Where: Invoices screen, **Upload PDF invoice** button at the top of the new invoice form. It is hidden while editing an existing invoice.

### What gets filled

| Form field | Where it is read from |
|---|---|
| Customer | The block under a label such as `To,(BUYER BILLED ADDRESS)`, `Bill To`, `Buyer`, `Customer`, `Sold To`, `Consignee` or `M/s`. The first line under the label is the firm name. |
| Invoice date | A line labelled invoice date or date. Formats read: `17.10.2024`, `17/10/2024`, `2024-10-17`, `17 Oct 2024`. If none is found, today is used. |
| Supply type | IGST on the PDF means other-state. CGST and SGST means same-state. |
| LR number and date | A line with `LR No`, `L.R.` or `Lorry Receipt`. |
| Transporter | `Name of transport`, `Transporter` or similar. A `Mode of transport` line is ignored. |
| Item rows | Table rows between the header (description, qty) and the totals. Each row is matched to a product by name. Quantity and rate are taken from the numbers in the row, using the rule quantity × rate = taxable value. |

### Customer updates

- **Existing customer.** Matched first by GSTIN, then by name. It is selected as it is and nothing is changed on the customer record.
- **New customer.** A "New customer" box appears in the form with these fields filled in where found:
  - name, from the first line of the buyer block
  - GSTIN, from the buyer block
  - phone, from `ph no`, `phone`, `mob` or similar
  - address, from the lines between the name and the GSTIN line
  - type, which is firm or company when a GSTIN is found, otherwise it is guessed from the name
- You can edit these fields. The customer is added to the Customers list when you click **Create invoice**. If you dismiss the form or never create the invoice, no customer is added.
- A firm or company needs a GSTIN. Creating the invoice is blocked with a message until one is entered. A person (no GST) does not need one.
- A business set up as a firm always uses firm customers.

### Items that do not match

A row whose product is not found keeps its quantity and rate. The note above the form lists these rows, and you choose the product on that row. The rate from the PDF is kept when you pick the product.

### Example

For `Ashok_Engg_inv_66_O.pdf` the form fills:

- Customer: ASHOK ENGINEERING WORKS
- GSTIN: 07AAKPB7527M1ZF
- Address: 1/424/66-A, SHAHDRA FLYOVER, SHAHDRA, NEW DELHI -110032
- Phone: 9810209580
- Date: 17-10-2024
- Supply type: other-state (IGST)
- Transporter: V R L logistics Ltd
- Items: 1000 at 25 and 1000 at 18.5

---

## 2. Purchase: upload and supplier update

Where: Purchases screen, **Upload PDF invoice** button at the top of the Buy raw material form.

On a purchase invoice the supplier is the seller, so it is read from the top of the PDF instead of the buyer block.

### What gets filled

| Form field | Where it is read from |
|---|---|
| Supplier | A `From`, `Supplier`, `Seller`, `Vendor`, `Sold By` or `Billed From` label. With no label, the first line of the PDF that is not a title like `TAX INVOICE` or `Original copy`. |
| Purchase date | Invoice date line. Date of supply lines are skipped. If none is found, today is used. |
| Material | Matched by name against your raw materials. If nothing matches, the material stays on the default and the note asks you to pick one. |
| Quantity and rate | From the item row, as for invoices. The rate is filled as excluding GST. Change **Rate includes** if the supplier's rate includes GST. |

### Supplier updates

- **Existing supplier.** Matched first by GSTIN, then by name, and selected as it is.
- **New supplier.** A "New supplier" box appears with name, GSTIN, phone, address and type filled in where found. You can edit them. The supplier is added to the Suppliers list when you click **Record purchase**.
- A firm or company supplier needs a GSTIN. Recording is blocked with a message until one is entered.

### Several items on one PDF

A purchase holds one material. When the PDF has several item rows, the first loads into the form. After you record it, the supplier stays selected and the next row loads automatically, until all rows are recorded. The note shows which item you are on, for example "item 2 of 3". Dismiss clears the rest of the queue.

### Payment

The PDF does not set payment. Choose the payment account, or Pay later, in the form as usual.

---

## 3. What is not read from PDFs

- Bank details, terms, totals and tax amounts. These are recalculated by the app from quantity, rate and supply type.
- Invoice and bill numbers. The app assigns the next number itself.
- Payment status. Purchases saved from a PDF are recorded as Pay later.
