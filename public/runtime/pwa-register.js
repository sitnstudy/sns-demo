// Keep rapid answer taps and pinches from zooming either player. Explicit pan
// actions preserve scrolling, including inside nested question containers.
const touchStyle = document.createElement("style");
touchStyle.textContent = "html, body, body * { touch-action: pan-x pan-y; }";
document.head.appendChild(touchStyle);

const viewport = document.querySelector('meta[name="viewport"]');
if (viewport) {
  viewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
}

// Safari also exposes native gesture events; viewport limits alone are not
// enough there. Do not cancel single touches: buttons, scrolling and text
// selection must retain their normal behavior.
const preventZoomGesture = (event) => {
  if (event.cancelable) event.preventDefault();
};
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, preventZoomGesture, { passive: false });
}
for (const type of ["touchstart", "touchmove"]) {
  document.addEventListener(type, (event) => {
    if (event.touches.length > 1) preventZoomGesture(event);
  }, { passive: false });
}

const isPsat = document.currentScript?.dataset.app === "psat";
const workerScope = document.currentScript?.dataset.scope || (isPsat ? "/psat-player/" : "/");
const workerUrl = `${workerScope}service-worker.js`;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(workerUrl, { scope: workerScope, updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn(`${isPsat ? "PSAT" : "Quode"} app installation is unavailable.`, error);
      });
  });
}
