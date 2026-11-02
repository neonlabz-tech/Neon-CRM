import { createPortal } from "react-dom";
import { downloadDocumentPdf } from "./downloadPdf.js";
import { paymentReceiptDocument } from "./sales.js";

export function InvoiceDialog({ invoice, onClose }) {
  if (!invoice) return null;
  const html = paymentReceiptDocument(invoice);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">
        <div className="modal sheet quote-modal">
          <div className="toolbar">
            <h2>{invoice.receiptNo || "Invoice"}</h2>
            <div className="icon-actions">
              <button className="primary" type="button" onClick={() => downloadDocumentPdf(invoice.receiptNo || "invoice", html)}>Download PDF</button>
              <button className="ghost" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
          <iframe className="receipt-frame" title={invoice.receiptNo || "Invoice"} srcDoc={html} />
        </div>
      </div>
    </div>,
    document.body
  );
}
