/**
 * The example print as a canvas, black ink on white, for the developer to bring up. It is copied from the HTML card
 * (print-card.tsx): the card is laid out once more off screen, unturned and at the canvas width, and every bar and
 * letter is drawn where the browser put it, so the WebGL print lands exactly on the HTML one.
 */
export async function drawCard(card: HTMLElement, width: number) {
  await document.fonts.ready;
  const tray = document.createElement("div");
  tray.setAttribute("aria-hidden", "true");
  // the card is 58% of the tray and sized in container units of it
  tray.style.cssText = `position:fixed;left:-99999px;top:0;width:${width / 0.58}px;container-type:inline-size`;
  const clone = card.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, { left: "0", top: "0", translate: "none", rotate: "none", transform: "none" });
  tray.append(clone);
  document.body.append(tray);

  const box = clone.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.width);
  canvas.height = Math.round(box.height);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);

  // dark marks are ink; paper-coloured ones (the labels on the bars) clear it
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const inkOf = (color: string) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = probe.getImageData(0, 0, 1, 1).data;
    const v = r + gr + b > 382 ? 255 : 0;
    return a ? `rgba(${v},${v},${v},${a / 255})` : null;
  };

  for (const el of clone.querySelectorAll<HTMLElement>("*")) {
    const bg = inkOf(getComputedStyle(el).backgroundColor);
    if (!bg) continue;
    const r = el.getBoundingClientRect();
    g.fillStyle = bg;
    g.fillRect(r.left - box.left, r.top - box.top, r.width, r.height);
  }

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const s = getComputedStyle(node.parentElement!);
    const ink = inkOf(s.color);
    if (!ink) continue;
    g.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    g.fillStyle = ink;
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] === " ") continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      const ch = s.textTransform === "uppercase" ? text[i].toUpperCase() : text[i];
      // the range spans the font's content area, so its top plus the font's ascent is the baseline
      g.fillText(ch, r.left - box.left, r.top - box.top + g.measureText(ch).fontBoundingBoxAscent);
    }
  }

  tray.remove();
  return canvas;
}
