function pdfFileName(name) {
  const base = String(name || "document").replace(/\.html?$/i, "").replace(/\.pdf$/i, "");
  return `${base || "document"}.pdf`;
}

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFileName(name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function encodePdf(parts) {
  const encoder = new TextEncoder();
  const chunks = parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part));
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

function jpegToPdfBlob(pages) {
  const pageW = 595.28;
  const pageH = 841.89;
  const objects = [];
  const kids = pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageNo = 3 + index * 3;
    const imageNo = pageNo + 1;
    const contentNo = pageNo + 2;
    const drawW = pageW;
    const drawH = (page.height * pageW) / page.width;
    const y = pageH - Math.min(drawH, pageH);
    const content = `q\n${drawW.toFixed(2)} 0 0 ${Math.min(drawH, pageH).toFixed(2)} 0 ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    objects[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageNo} 0 R >> >> /Contents ${contentNo} 0 R >>`;
    objects[imageNo] = { image: page.bytes, width: page.width, height: page.height };
    objects[contentNo] = content;
  });

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    const body = objects[i];
    offsets[i] = parts.reduce((sum, part) => sum + (typeof part === "string" ? new TextEncoder().encode(part).length : part.length), 0);
    if (body.image) {
      parts.push(`${i} 0 obj << /Type /XObject /Subtype /Image /Width ${body.width} /Height ${body.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.image.length} >>\nstream\n`);
      parts.push(body.image);
      parts.push("\nendstream\nendobj\n");
    } else if (typeof body === "string" && !body.startsWith("<< /Type")) {
      const bytes = new TextEncoder().encode(body);
      parts.push(`${i} 0 obj << /Length ${bytes.length} >>\nstream\n`);
      parts.push(bytes);
      parts.push("\nendstream\nendobj\n");
    } else {
      parts.push(`${i} 0 obj ${body} endobj\n`);
    }
  }
  const xref = parts.reduce((sum, part) => sum + (typeof part === "string" ? new TextEncoder().encode(part).length : part.length), 0);
  parts.push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < objects.length; i += 1) {
    parts.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob([encodePdf(parts)], { type: "application/pdf" });
}

function dataUrlToBytes(dataUrl) {
  const raw = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function canvasPages(canvas) {
  const pageHeight = Math.round(canvas.width * (297 / 210));
  const pages = [];
  let top = 0;
  while (top < canvas.height) {
    const height = Math.min(pageHeight, canvas.height - top);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = height;
    const ctx = slice.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
    pages.push({
      bytes: dataUrlToBytes(slice.toDataURL("image/jpeg", 0.95)),
      width: slice.width,
      height: slice.height,
    });
    top += height;
  }
  return pages;
}

function waitForImages(root) {
  return Promise.all([...root.querySelectorAll("img")].map((image) => {
    if (image.complete && image.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
      setTimeout(resolve, 1500);
    });
  }));
}

function loadFrame(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("inert", "");
  frame.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0.015;pointer-events:none;background:#fff;";
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  return new Promise((resolve) => {
    const finish = async () => {
      await waitForImages(doc);
      resolve(frame);
    };
    if (doc.readyState === "complete") setTimeout(finish, 80);
    else frame.onload = () => setTimeout(finish, 80);
  });
}

export async function downloadDocumentPdf(name, html) {
  const title = pdfFileName(name);
  const frame = await loadFrame(html);
  try {
    const doc = frame.contentDocument;
    doc.querySelectorAll("button.print").forEach((button) => button.remove());
    const sheet = doc.querySelector(".sheet") || doc.body;
    sheet.style.margin = "0";
    sheet.style.boxShadow = "none";
    const width = Math.max(sheet.scrollWidth, sheet.offsetWidth, 794);
    const height = Math.max(sheet.scrollHeight, sheet.offsetHeight, 1123);
    frame.style.height = `${height}px`;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(sheet, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      onclone: (clone) => {
        clone.querySelectorAll("button.print").forEach((button) => button.remove());
        const copy = clone.querySelector(".sheet") || clone.body;
        copy.style.margin = "0";
        copy.style.boxShadow = "none";
      },
    });
    saveBlob(title, jpegToPdfBlob(canvasPages(canvas)));
  } finally {
    frame.remove();
  }
}
