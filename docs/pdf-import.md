# PDF import for invoices and purchases

Upload a PDF to fill the invoice or purchase form. The PDF is read in the browser, used to fill the fields, and then discarded. Nothing is uploaded to a server and the file is never stored in the app. With **Save automatically** off, the invoice or purchase is only created when you click the create or record button, so every filled field can be checked first. With it on, see Automatic saving below.

## Limits

- Works on PDFs that contain text. A scanned image PDF is read by text recognition (OCR), see Scanned PDFs below.
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

---

## 4. Importing from Google Drive folders

Each of the Invoices and Purchases screens has a **Google Drive folder** panel with its own folder (invoices and purchases are never mixed).

- Paste a folder link once; it is saved with the business. **Change** replaces it.
- **Connect Google Drive & list PDFs** asks for read-only access and lists the PDFs directly inside the folder, newest first. Google access lasts about an hour.
- Each file shows **New** or **Imported · <number>**. Imported files are remembered with the business, so a file is never imported twice.
- **Import selected / Import all new** (needs Save automatically on) saves every complete PDF using the same rules as section "Automatic saving". Files that are incomplete, duplicates or short of stock stay as "Needs review" with the reason and are not marked imported.
- **Open in form** loads one file into the form for checking (no automatic saving); creating the invoice or purchase from it marks the file imported.
- Files are downloaded into the browser, read, and discarded. Nothing is stored from Drive except the file's id and name in the imported list.

## Scanned PDFs (OCR)

A PDF with no text layer (a photo or scan of an invoice) is read by text recognition in the browser. PDF.js draws each page and Tesseract (tesseract.js, loaded from jsDelivr the first time) reads the picture. Nothing is uploaded, and the page images are dropped as soon as they are read.

- Only the first 3 pages are read, and it takes several seconds a page. The upload button shows the page and percentage while it works. The first scan also downloads the English language data once.
- **A scan is never saved automatically**, even with Save automatically on. Text recognition can misread a digit, so the form is always filled for you to check, with a note saying the PDF was a scan.
- Table lines and stray marks are removed from the recognised text before it is parsed.
- GSTINs are often garbled by text recognition. A GSTIN printed after a "GSTIN" label is rebuilt only when its check character agrees. A GSTIN that cannot be confirmed is left blank (a firm then needs it typed in), never guessed.
- Purchase invoices without a "From" label: the seller is the party above the first GSTIN that is not in a Buyer or Consignee block, so your own business (the buyer) is ignored.
- Sale invoices work the same way: the customer is the Buyer (Bill to) block, not the Consignee, and LR number and transporter are read from "Bill of Lading / LR-RR No." and "Dispatched through" when the value is on the next line.
- Dates written like `5-Jun-26` are read. Small print, such as a street address, may come out incomplete, so check the address.
- If the OCR engine cannot be downloaded (offline), the page says the scan could not be read and to check the connection.
