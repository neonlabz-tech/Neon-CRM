import { createPortal } from "react-dom";
import { downloadLetterhead } from "./letterhead.js";

export function LetterheadDialog({ title, html, fileName, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal sheet quote-modal lh-modal" onClick={(event) => event.stopPropagation()} role="presentation">
        <iframe className="receipt-frame lh-frame" title={title || "Document"} srcDoc={html} />
        <div className="modal-actions">
          <button className="primary" type="button" onClick={() => downloadLetterhead(fileName || title || "document", html)}>Download PDF</button>
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
