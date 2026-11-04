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
    if (pages.length && height < pageHeight * 0.04) break;
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

function sizePdfPage(page) {
  page.style.height = "1123px";
  page.style.overflow = "hidden";
  page.style.display = "flex";
  page.style.flexDirection = "column";
  const head = page.querySelector(".doc-head");
  const foot = page.querySelector(".doc-foot");
  const body = page.querySelector(".doc-body, .cover-main");
  if (foot) foot.style.marginTop = "0";
  if (!body) return;
  const used = (head?.offsetHeight || 0) + (foot?.offsetHeight || 0);
  const available = Math.max(1123 - used, 640);
  body.style.flex = "none";
  body.style.height = `${available}px`;
  body.style.maxHeight = `${available}px`;
  body.style.overflow = "hidden";
  body.style.minHeight = "0";
}

function fitAnalysisImages(doc) {
  doc.querySelectorAll(".analysis-shot img").forEach((img) => {
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) return;
    const box = img.closest(".doc-body");
    const style = box ? doc.defaultView.getComputedStyle(box) : null;
    const padX = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0;
    const padY = style ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) : 0;
    const maxW = Math.max(240, (box?.clientWidth || 714) - padX);
    const maxH = Math.max(240, (box?.clientHeight || 900) - padY - 28);
    const scale = Math.min(maxW / naturalW, maxH / naturalH);
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));
    img.style.display = "block";
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    img.style.objectFit = "fill";
    img.setAttribute("width", String(width));
    img.setAttribute("height", String(height));
  });
}

function paginateDocument(doc) {
  const flowPage = doc.querySelector(".pdf-content");
  const flow = flowPage?.querySelector(".pdf-flow");
  if (!flowPage || !flow) return;
  doc.querySelectorAll(".pdf-page").forEach(sizePdfPage);
  fitAnalysisImages(doc);
  const blocks = [...flow.children];
  flow.replaceChildren();

  let page = flowPage;
  const boxOf = (target) => target.querySelector(".doc-body");
  const flowOf = (target) => target.querySelector(".pdf-flow");
  const roomFor = (target) => {
    const box = boxOf(target);
    const flow = flowOf(target);
    const style = target.ownerDocument.defaultView.getComputedStyle(box);
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    return box.clientHeight - pad - flow.offsetHeight;
  };
  const overflows = (target) => roomFor(target) < -2;
  const freshPage = () => {
    const clone = flowPage.cloneNode(true);
    clone.querySelector(".pdf-flow").replaceChildren();
    flowPage.parentNode.append(clone);
    sizePdfPage(clone);
    return clone;
  };
  const splitRows = (block, target, childName) => {
    const items = childName === "tbody" ? [...(block.tBodies[0]?.rows || [])] : [...block.children];
    const build = () => {
      const next = block.cloneNode(false);
      next.className = block.className;
      if (childName === "tbody" && block.tHead) next.append(block.tHead.cloneNode(true));
      if (childName === "tbody") next.append(doc.createElement("tbody"));
      return next;
    };
    let current = build();
    const host = () => (childName === "tbody" ? current.tBodies[0] : current);
    const flow = () => flowOf(target);
    if (flow().children.length) {
      flow().append(current);
      if (overflows(target)) {
        flow().removeChild(current);
        target = freshPage();
        current = build();
      }
    }
    flowOf(target).append(current);
    items.forEach((item) => {
      host().append(item);
      if (!overflows(target)) return;
      host().removeChild(item);
      const siblings = [...flowOf(target).children].filter((node) => node !== current);
      if (!host().children.length && siblings.length) flowOf(target).removeChild(current);
      else if (!host().children.length) {
        host().append(item);
        return;
      }
      target = freshPage();
      current = build();
      flowOf(target).append(current);
      host().append(item);
    });
    return target;
  };

  function place(block, target) {
    if (block.classList?.contains("pdf-break")) {
      if (flowOf(target).children.length) target = freshPage();
      [...block.children].forEach((child) => {
        target = place(child, target);
      });
      return target;
    }
    const flow = flowOf(target);
    flow.append(block);
    if (!overflows(target)) {
      if (/^H[1-3]$/.test(block.tagName) && roomFor(target) < 96 && flow.children.length > 1) {
        flow.removeChild(block);
        target = freshPage();
        flowOf(target).append(block);
      }
      return target;
    }
    flow.removeChild(block);
    if (block.tagName === "TABLE") {
      if (flowOf(target).children.length) target = freshPage();
      return splitRows(block, target, "tbody");
    }
    if (block.tagName === "UL" || block.tagName === "OL") {
      if (flowOf(target).children.length) target = freshPage();
      return splitRows(block, target, "list");
    }
    const atomic = block.classList?.contains("pdf-keep")
      || block.classList?.contains("metrics")
      || block.classList?.contains("card")
      || block.classList?.contains("analysis-shot");
    const kids = [...block.children];
    if (!atomic && kids.length && /^(SECTION|DIV|ARTICLE)$/.test(block.tagName)) {
      kids.forEach((kid) => {
        target = place(kid, target);
      });
      return target;
    }
    if (flowOf(target).children.length) target = freshPage();
    flowOf(target).append(block);
    return target;
  }

  blocks.forEach((block) => {
    page = place(block, page);
  });
  [...doc.querySelectorAll(".pdf-page")].forEach((item, index) => {
    item.querySelectorAll(".doc-page").forEach((label) => {
      label.textContent = String(index + 1);
    });
  });
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

async function canvasOf(frame, node, width, height) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, {
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
  });
}

export async function downloadDocumentPdf(name, html) {
  const title = pdfFileName(name);
  const frame = await loadFrame(html);
  try {
    const doc = frame.contentDocument;
    doc.querySelectorAll("button.print").forEach((button) => button.remove());
    frame.style.width = "794px";
    frame.style.height = "8000px";
    paginateDocument(doc);
    const pages = [...doc.querySelectorAll(".pdf-page")];
    const rendered = [];
    if (pages.length) {
      for (const page of pages) {
        pages.forEach((item) => {
          item.style.display = item === page ? "flex" : "none";
        });
        page.style.height = "1123px";
        page.style.overflow = "hidden";
        page.style.margin = "0";
        page.style.boxShadow = "none";
        frame.style.height = "1123px";
        const canvas = await canvasOf(frame, page, 794, 1123);
        rendered.push(...canvasPages(canvas));
      }
    } else {
      const sheet = doc.querySelector(".sheet") || doc.body;
      sheet.style.margin = "0";
      sheet.style.boxShadow = "none";
      sheet.style.minHeight = "0";
      const width = Math.max(sheet.scrollWidth, sheet.offsetWidth, 794);
      const height = Math.max(sheet.scrollHeight, sheet.offsetHeight);
      frame.style.height = `${height}px`;
      const canvas = await canvasOf(frame, sheet, width, height);
      rendered.push(...canvasPages(canvas));
    }
    saveBlob(title, jpegToPdfBlob(rendered));
  } finally {
    frame.remove();
  }
}
